import type {
  IAccountsRepository,
  IWaitlistRepository,
  WaitlistBulkDecideInput,
  WaitlistBulkDecideResult,
  WaitlistEntry,
  WaitlistEntryInput,
  WaitlistEvent,
  WaitlistEventAction,
  WaitlistPage,
  WaitlistQuery,
  WaitlistSourceCount,
} from '../../domain/ports/index.js';
import { normalizeE164 } from '../../domain/value-objects/phone.js';

/** Non-persistent waitlist: tests, and local dev without DATABASE_URL. */
export class InMemoryWaitlistRepository implements IWaitlistRepository {
  private entries = new Map<string, WaitlistEntry>();
  private byEmail = new Map<string, string>();
  private seq = 0;
  private eventSeq = 0;
  private eventRows: WaitlistEvent[] = [];

  /**
   * Bulk decisions write the allowlist through the paired accounts store (their in-memory
   * stand-in for the shared Postgres transaction), so the same WF-018 invariant holds:
   * allowlist and statuses never disagree after a call returns.
   */
  constructor(private readonly accounts?: IAccountsRepository) {}

  /** Not on the port: lets tests assert what was stored. */
  all(): WaitlistEntry[] {
    return [...this.entries.values()];
  }

  async add(entry: WaitlistEntryInput): Promise<void> {
    // Keep the first submission: an address that is already on the list is not rewritten.
    if (this.byEmail.has(entry.email)) return;
    const id = `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`;
    this.entries.set(id, { ...entry, id, status: 'pending', createdAt: new Date(), invitedAt: null, removedAt: null });
    this.byEmail.set(entry.email, id);
  }

  async list(query: WaitlistQuery): Promise<WaitlistPage> {
    const all = [...this.entries.values()]
      .filter((e) => !query.status || e.status === query.status)
      .filter((e) => !query.search || `${e.email} ${e.waNumber ?? ''}`.toLowerCase().includes(query.search.toLowerCase()))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.email.localeCompare(b.email));
    return { entries: all.slice(query.offset, query.offset + query.limit), total: all.length };
  }

  async sourceCounts(): Promise<WaitlistSourceCount[]> {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const groups = new Map<string, WaitlistSourceCount>();
    const fields = [
      ['ref', 'sourceRef'],
      ['utm_source', 'utmSource'],
      ['utm_campaign', 'utmCampaign'],
    ] as const;
    for (const entry of this.entries.values()) {
      for (const [field, property] of fields) {
        const value = entry[property];
        if (!value) continue;
        const key = `${field}:${value}`;
        const count = groups.get(key) ?? { field, value, total: 0, last7Days: 0 };
        count.total++;
        if (entry.createdAt.getTime() >= cutoff) count.last7Days++;
        groups.set(key, count);
      }
    }
    const fieldOrder = ['ref', 'utm_campaign', 'utm_source'] as const;
    return fieldOrder.flatMap((field) =>
      [...groups.values()]
        .filter((item) => item.field === field)
        .sort((a, b) => b.total - a.total || a.value.localeCompare(b.value))
        .slice(0, 20),
    );
  }

  async get(id: string): Promise<WaitlistEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async events(id: string): Promise<WaitlistEvent[]> {
    return this.eventRows
      .filter((event) => event.waitlistId === id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  private recordEvent(id: string, adminId: string, action: WaitlistEventAction, fromStatus: WaitlistEntry['status'], toStatus: WaitlistEntry['status']) {
    this.eventRows.push({
      id: `00000000-0000-4000-8000-${String(++this.eventSeq).padStart(12, '0')}`,
      waitlistId: id,
      adminId,
      action,
      createdAt: new Date(),
      fromStatus,
      toStatus,
    });
  }

  async markInvited(id: string, adminId: string): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry || entry.status !== 'pending') return false;
    entry.status = 'invited';
    entry.invitedAt = new Date();
    this.recordEvent(id, adminId, 'invited', 'pending', 'invited');
    return true;
  }

  async reject(id: string, adminId: string): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry || entry.status !== 'pending') return false;
    entry.status = 'rejected';
    this.recordEvent(id, adminId, 'rejected', 'pending', 'rejected');
    return true;
  }

  async remove(id: string, adminId: string): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry || entry.status === 'removed') return false;
    const previous = entry.status;
    entry.status = 'removed';
    entry.removedAt = new Date();
    this.recordEvent(id, adminId, 'removed', previous, 'removed');
    return true;
  }

  async reopen(id: string, adminId: string): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry || entry.status !== 'rejected') return false;
    entry.status = 'pending';
    this.recordEvent(id, adminId, 'reopened', 'rejected', 'pending');
    return true;
  }

  async bulkDecide(input: WaitlistBulkDecideInput): Promise<WaitlistBulkDecideResult> {
    const { ids, adminId, adminEmail, action } = input;
    if (action === 'invite' && !this.accounts) {
      throw new Error('bulk invite needs the paired accounts repository for the allowlist');
    }
    // Validation pass first (the transaction stand-in): if anything fails, nothing mutates.
    const batch = ids.map((id) => {
      const entry = this.entries.get(id);
      if (!entry) return { id, entry: null, phone: null, failure: 'not_found' as const };
      if (entry.status !== 'pending') return { id, entry: null, phone: null, failure: 'conflict' as const };
      const phone = entry.waNumber ? normalizeE164(entry.waNumber) : null;
      if (action === 'invite' && !phone) return { id, entry: null, phone: null, failure: 'missing_number' as const };
      return { id, entry, phone, failure: null };
    });
    const failed = batch.find((item) => item.failure);
    if (failed) return { ok: false, reason: failed.failure!, id: failed.id };

    // Post-validation, mutations cannot fail, so the atomicity claim holds in memory too.
    const now = new Date();
    const toStatus = action === 'invite' ? ('invited' as const) : ('rejected' as const);
    if (action === 'invite') {
      for (const item of batch) await this.accounts!.addAllowlisted(item.phone!, adminEmail);
    }
    for (const item of batch) {
      item.entry!.status = toStatus;
      if (action === 'invite') item.entry!.invitedAt = now;
      this.recordEvent(item.id, adminId, toStatus, 'pending', toStatus);
    }
    return { ok: true, results: batch.map((item) => ({ id: item.id, status: toStatus })) };
  }
}
