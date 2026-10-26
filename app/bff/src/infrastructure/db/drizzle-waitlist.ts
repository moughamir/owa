import { and, asc, count, desc, eq, ilike, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type {
  IWaitlistRepository,
  WaitlistBulkDecideInput,
  WaitlistBulkDecideResult,
  WaitlistEntry,
  WaitlistEntryInput,
  WaitlistEvent,
  WaitlistEventAction,
  WaitlistPage,
  WaitlistQuery,
  WaitlistStatus,
  WaitlistSourceCount,
} from '../../domain/ports/index.js';
import { normalizeE164 } from '../../domain/value-objects/phone.js';
import type { Db } from './client.js';
import { allowlistedNumbers, waitlist, waitlistEvents } from './schema/index.js';

export class DrizzleWaitlistRepository implements IWaitlistRepository {
  constructor(private readonly db: Db) {}

  async add(entry: WaitlistEntryInput): Promise<void> {
    // onConflictDoNothing: a second submission from the same address is not an error and does not
    // overwrite the first (the visitor may have refined their note, and we keep the original).
    await this.db.insert(waitlist).values(entry).onConflictDoNothing({ target: waitlist.email });
  }

  async list(query: WaitlistQuery): Promise<WaitlistPage> {
    const filters = [];
    if (query.status) filters.push(eq(waitlist.status, query.status));
    if (query.search) {
      const escaped = query.search.replace(/[\\%_]/g, '\\$&');
      const pattern = `%${escaped}%`;
      filters.push(or(ilike(waitlist.email, pattern), ilike(waitlist.waNumber, pattern))!);
    }
    const where = filters.length === 0 ? undefined : and(...filters);
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(waitlist)
        .where(where)
        .orderBy(desc(waitlist.createdAt), asc(waitlist.email))
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: count() }).from(waitlist).where(where),
    ]);
    return { entries: rows, total: totals[0]?.total ?? 0 };
  }

  async sourceCounts(): Promise<WaitlistSourceCount[]> {
    const last7Days = sql<number>`count(*) filter (where ${waitlist.createdAt} >= now() - interval '7 days')::int`;
    const total = count();
    const groups = await Promise.all([
      this.db.select({ value: waitlist.sourceRef, total, last7Days }).from(waitlist)
        .where(isNotNull(waitlist.sourceRef)).groupBy(waitlist.sourceRef)
        .orderBy(desc(total), asc(waitlist.sourceRef)).limit(20),
      this.db.select({ value: waitlist.utmCampaign, total, last7Days }).from(waitlist)
        .where(isNotNull(waitlist.utmCampaign)).groupBy(waitlist.utmCampaign)
        .orderBy(desc(total), asc(waitlist.utmCampaign)).limit(20),
      this.db.select({ value: waitlist.utmSource, total, last7Days }).from(waitlist)
        .where(isNotNull(waitlist.utmSource)).groupBy(waitlist.utmSource)
        .orderBy(desc(total), asc(waitlist.utmSource)).limit(20),
    ]);
    const fields = ['ref', 'utm_campaign', 'utm_source'] as const;
    return groups.flatMap((rows, i) => rows.map((row) => ({
      field: fields[i]!,
      value: row.value!,
      total: row.total,
      last7Days: row.last7Days,
    })));
  }

  async get(id: string): Promise<WaitlistEntry | null> {
    const rows = await this.db.select().from(waitlist).where(eq(waitlist.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async events(id: string): Promise<WaitlistEvent[]> {
    return this.db
      .select()
      .from(waitlistEvents)
      .where(eq(waitlistEvents.waitlistId, id))
      .orderBy(asc(waitlistEvents.createdAt), asc(waitlistEvents.id));
  }

  private async transition(
    id: string,
    adminId: string,
    action: WaitlistEventAction,
    allowedFrom: readonly WaitlistStatus[],
    toStatus: WaitlistStatus,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select({ status: waitlist.status }).from(waitlist).where(eq(waitlist.id, id)).for('update');
      const fromStatus = current?.status;
      if (!fromStatus || !allowedFrom.includes(fromStatus)) return false;

      const now = new Date();
      const rows = await tx
        .update(waitlist)
        .set({
          status: toStatus,
          ...(action === 'invited' ? { invitedAt: now } : {}),
          ...(action === 'removed' ? { removedAt: now } : {}),
        })
        .where(and(eq(waitlist.id, id), eq(waitlist.status, fromStatus)))
        .returning({ id: waitlist.id });
      if (rows.length === 0) return false;

      await tx.insert(waitlistEvents).values({
        waitlistId: id,
        adminId,
        action,
        fromStatus,
        toStatus,
      });
      return true;
    });
  }

  markInvited(id: string, adminId: string): Promise<boolean> {
    return this.transition(id, adminId, 'invited', ['pending'], 'invited');
  }

  reject(id: string, adminId: string): Promise<boolean> {
    return this.transition(id, adminId, 'rejected', ['pending'], 'rejected');
  }

  remove(id: string, adminId: string): Promise<boolean> {
    return this.transition(id, adminId, 'removed', ['pending', 'invited', 'rejected'], 'removed');
  }

  reopen(id: string, adminId: string): Promise<boolean> {
    return this.transition(id, adminId, 'reopened', ['rejected'], 'pending');
  }

  async bulkDecide(input: WaitlistBulkDecideInput): Promise<WaitlistBulkDecideResult> {
    const { ids, adminId, adminEmail, action } = input;
    const toStatus: WaitlistStatus = action === 'invite' ? 'invited' : 'rejected';
    const eventAction: WaitlistEventAction = action === 'invite' ? 'invited' : 'rejected';
    return this.db.transaction(async (tx) => {
      // Lock every row up front, all-or-nothing: a concurrent single invite on any of the
      // ids blocks until this commits, so mid-batch validation cannot be raced.
      const rows = await tx
        .select({ id: waitlist.id, status: waitlist.status, waNumber: waitlist.waNumber })
        .from(waitlist)
        .where(inArray(waitlist.id, [...ids]))
        .for('update');
      const byId = new Map(rows.map((row) => [row.id, row]));
      const phones: { id: string; phone: string }[] = [];
      for (const id of ids) {
        const row = byId.get(id);
        if (!row) return { ok: false, reason: 'not_found' as const, id };
        if (row.status !== 'pending') return { ok: false, reason: 'conflict' as const, id };
        if (action === 'invite') {
          const phone = normalizeE164(row.waNumber ?? '');
          if (!phone) return { ok: false, reason: 'missing_number' as const, id };
          phones.push({ id, phone });
        }
      }

      if (action === 'invite') {
        // The allowlist is what sign-up checks; it moves in the same transaction as the
        // statuses (accounts.addAllowlisted commits independently and cannot be part of
        // one unit of work from the route, so this write lives here — WF-018).
        await tx
          .insert(allowlistedNumbers)
          .values(phones.map(({ phone }) => ({ phoneE164: phone, addedBy: adminEmail })))
          .onConflictDoNothing();
      }

      await tx
        .update(waitlist)
        .set({ status: toStatus, ...(action === 'invite' ? { invitedAt: new Date() } : {}) })
        .where(inArray(waitlist.id, [...ids]));

      await tx.insert(waitlistEvents).values(
        ids.map((id) => ({
          waitlistId: id,
          adminId,
          action: eventAction,
          fromStatus: 'pending' as WaitlistStatus,
          toStatus,
        })),
      );

      return { ok: true, results: ids.map((id) => ({ id, status: toStatus as 'invited' | 'rejected' })) };
    });
  }
}
