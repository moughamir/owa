import { describe, it, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq, inArray } from 'drizzle-orm';
import * as schema from './schema/index.js';
import { allowlistedNumbers as allowlistedTable, waitlist as waitlistTable } from './schema/index.js';
import { DrizzleWaitlistRepository } from './drizzle-waitlist.js';
import type { WaitlistBulkDecideResult } from '../../domain/ports/index.js';

// Runs the real migration SQL against an in-process Postgres.
const MIGRATIONS = [
  '0001_last_scrambler.sql',
  '0002_wa_sessions_keys.sql',
  '0003_oauth_connectors.sql',
  '0004_admin_backoffice.sql',
  '0005_waitlist.sql',
  '0006_waitlist_status.sql',
  '0007_waitlist_campaign_tags.sql',
  '0008_waitlist_admin.sql',
  '0009_user_roles.sql',
  '0010_account_settings.sql',
].map((f) => new URL(`../../../drizzle/${f}`, import.meta.url));

const ADMIN_ID = '00000000-0000-4000-8000-000000000111';

let db: ReturnType<typeof drizzle<typeof schema>>;
let repo: DrizzleWaitlistRepository;

beforeAll(async () => {
  const pg = new PGlite();
  for (const m of MIGRATIONS) await pg.exec(readFileSync(m, 'utf8').replaceAll('--> statement-breakpoint', ''));
  db = drizzle(pg, { schema });
  repo = new DrizzleWaitlistRepository(db);
}, 30_000);

describe('DrizzleWaitlistRepository (Postgres semantics)', () => {
  it('stores a lead with its defaults', async () => {
    await repo.add({ email: 'a@example.com', waNumber: '+212600000042', useCase: null, locale: 'en' });
    const [row] = await db.select().from(waitlistTable).where(eq(waitlistTable.email, 'a@example.com'));
    expect(row).toMatchObject({ email: 'a@example.com', waNumber: '+212600000042', useCase: null, locale: 'en' });
    expect(row!.id).toBeTruthy();
    expect(row!.createdAt).toBeInstanceOf(Date);
  });

  it('stores campaign tags and returns aggregate counts without lead details', async () => {
    await repo.add({
      email: 'tagged@example.com', waNumber: null, useCase: null, locale: 'en',
      sourceRef: 'zawia', utmSource: 'community', utmCampaign: 'launch',
    });
    const counts = await repo.sourceCounts();
    expect(counts).toEqual([
      { field: 'ref', value: 'zawia', total: 1, last7Days: 1 },
      { field: 'utm_campaign', value: 'launch', total: 1, last7Days: 1 },
      { field: 'utm_source', value: 'community', total: 1, last7Days: 1 },
    ]);
    expect(JSON.stringify(counts)).not.toContain('tagged@example.com');
  });

  it('returns at most the top 20 values per field, ordered by total descending', async () => {
    const rows: Array<{ email: string; createdAt?: Date; sourceRef?: string; utmSource?: string; utmCampaign?: string }> = [];
    const fields = [
      ['ref', 'sourceRef'],
      ['source', 'utmSource'],
      ['campaign', 'utmCampaign'],
    ] as const;
    for (const [prefix, field] of fields) {
      for (let total = 2; total <= 22; total++) {
        for (let i = 0; i < total; i++) {
          rows.push({
            email: `${prefix}-${total}-${i}@example.com`,
            createdAt: new Date('2020-01-01T00:00:00Z'),
            ...(field === 'sourceRef' ? { sourceRef: `${prefix}-${total}` } : {}),
            ...(field === 'utmSource' ? { utmSource: `${prefix}-${total}` } : {}),
            ...(field === 'utmCampaign' ? { utmCampaign: `${prefix}-${total}` } : {}),
          });
        }
      }
    }
    await db.insert(waitlistTable).values(rows);
    try {
      const counts = await repo.sourceCounts();
      for (const field of ['ref', 'utm_source', 'utm_campaign']) {
        const values = counts.filter((count) => count.field === field);
        expect(values).toHaveLength(20);
        expect(values.map((item) => item.total)).toEqual(Array.from({ length: 20 }, (_, i) => 22 - i));
      }
    } finally {
      await db.delete(waitlistTable).where(inArray(waitlistTable.email, rows.map((row) => row.email)));
    }
  });

  it('is idempotent on the address and keeps the first submission', async () => {
    await repo.add({ email: 'dup@example.com', waNumber: null, useCase: 'first', locale: 'en' });
    await repo.add({ email: 'dup@example.com', waNumber: '+212600000042', useCase: 'second', locale: 'fr' });
    const rows = await db.select().from(waitlistTable).where(eq(waitlistTable.email, 'dup@example.com'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ useCase: 'first', locale: 'en', waNumber: null });
  });

  it('starts every lead as pending and flips an entry to invited exactly once', async () => {
    await repo.add({ email: 'c@example.com', waNumber: null, useCase: null, locale: 'en' });
    const [entry] = await db.select().from(waitlistTable).where(eq(waitlistTable.email, 'c@example.com'));
    expect(entry!.status).toBe('pending');

    expect(await repo.markInvited(entry!.id, ADMIN_ID)).toBe(true);
    expect(await repo.markInvited(entry!.id, ADMIN_ID)).toBe(false);
    expect((await repo.get(entry!.id))!.status).toBe('invited');
    expect((await repo.events(entry!.id)).map((event) => event.action)).toEqual(['invited']);
    expect(await repo.get('00000000-0000-4000-8000-000000000009')).toBeNull();
  });

  it('lists newest first, filtered by status and paginated', async () => {
    await db.insert(waitlistTable).values([
      { email: 'old@example.com', createdAt: new Date('2026-10-01T10:00:00Z') },
      { email: 'new@example.com', createdAt: new Date('2026-10-02T10:00:00Z') },
    ]);

    const page = await repo.list({ limit: 100, offset: 0 });
    const emails = page.entries.map((e) => e.email);
    expect(emails.indexOf('new@example.com')).toBeLessThan(emails.indexOf('old@example.com'));
    expect(page.total).toBe(emails.length);

    const first = await repo.list({ limit: 1, offset: 0 });
    expect(first.entries).toHaveLength(1);
    expect(first.total).toBe(page.total);

    const newId = page.entries.find((e) => e.email === 'new@example.com')!.id;
    const pendingBefore = (await repo.list({ status: 'pending', limit: 100, offset: 0 })).total;
    await repo.markInvited(newId, ADMIN_ID);

    // Exactly one entry left the pending page, and it is the one the filter now returns.
    expect((await repo.list({ status: 'pending', limit: 100, offset: 0 })).total).toBe(pendingBefore - 1);
    const invited = await repo.list({ status: 'invited', limit: 100, offset: 0 });
    expect(invited.total).toBe(invited.entries.length);
    expect(invited.entries.map((e) => e.email)).toContain('new@example.com');
    expect(invited.entries.every((e) => e.status === 'invited')).toBe(true);
  });

  it('searches by email or number while retaining status filtering', async () => {
    await repo.add({ email: 'search@example.com', waNumber: '+212600000042', useCase: 'Test', locale: 'en' });
    await repo.add({ email: 'other@example.com', waNumber: '+212600000099', useCase: null, locale: 'en' });
    expect((await repo.list({ search: 'SEARCH@', limit: 20, offset: 0 })).entries.map((e) => e.email)).toEqual([
      'search@example.com',
    ]);
    expect((await repo.list({ search: '000099', status: 'pending', limit: 20, offset: 0 })).entries.map((e) => e.email)).toEqual([
      'other@example.com',
    ]);
  });

  it('rejects and reopens a lead with an audit event for each transition', async () => {
    await repo.add({ email: 'reopen@example.com', waNumber: null, useCase: null, locale: 'en' });
    const entry = (await repo.list({ limit: 20, offset: 0 })).entries.find((row) => row.email === 'reopen@example.com')!;

    expect(await repo.reject(entry.id, ADMIN_ID)).toBe(true);
    expect(await repo.reopen(entry.id, ADMIN_ID)).toBe(true);
    expect((await repo.get(entry.id))?.status).toBe('pending');
    expect((await repo.events(entry.id)).map((event) => [event.adminId, event.action, event.fromStatus, event.toStatus])).toEqual([
      [ADMIN_ID, 'rejected', 'pending', 'rejected'],
      [ADMIN_ID, 'reopened', 'rejected', 'pending'],
    ]);
  });

  it('soft removes a lead and keeps its original data and history', async () => {
    await repo.add({ email: 'retain@example.com', waNumber: '+212600000042', useCase: 'Keep this', locale: 'fr' });
    const entry = (await repo.list({ limit: 20, offset: 0 })).entries.find((row) => row.email === 'retain@example.com')!;

    expect(await repo.remove(entry.id, ADMIN_ID)).toBe(true);
    expect(await repo.remove(entry.id, ADMIN_ID)).toBe(false);
    const kept = await repo.get(entry.id);
    expect(kept).toMatchObject({ email: 'retain@example.com', waNumber: '+212600000042', useCase: 'Keep this', status: 'removed' });
    expect(kept?.removedAt).toBeInstanceOf(Date);
    expect(await repo.events(entry.id)).toMatchObject([{ adminId: ADMIN_ID, action: 'removed', fromStatus: 'pending', toStatus: 'removed' }]);
  });

  describe('bulkDecide (WF-018 atomicity)', () => {
    const BULK_NUMBER = '+212610000091';
    const BULK_NUMBER_2 = '+212610000092';

    const idsOf = async (emails: string[]) => {
      const page = await repo.list({ limit: 100, offset: 0 });
      return emails.map((email) => page.entries.find((row) => row.email === email)!.id);
    };
    const allowlistPhones = async () =>
      (await db.select().from(allowlistedTable)).map((row) => row.phoneE164).sort();

    // Keep each case independent: the bulk tests write allowlist rows that this suite never
    // cleans up implicitly.
    const resetAllowlist = async () => {
      await db.delete(allowlistedTable).where(inArray(allowlistedTable.phoneE164, [BULK_NUMBER, BULK_NUMBER_2]));
    };

    it('invites every pending lead and allowlists the numbers in one transaction', async () => {
      await resetAllowlist();
      await repo.add({ email: 'bulk-ok-a@example.com', waNumber: BULK_NUMBER, useCase: null, locale: 'en' });
      await repo.add({ email: 'bulk-ok-b@example.com', waNumber: '  ' + BULK_NUMBER_2 + ' ', useCase: null, locale: 'en' });
      const ids = await idsOf(['bulk-ok-a@example.com', 'bulk-ok-b@example.com']);

      const result = await repo.bulkDecide({ ids, adminId: ADMIN_ID, adminEmail: 'admin@example.com', action: 'invite' });
      expect(result).toEqual({ ok: true, results: ids.map((id) => ({ id, status: 'invited' })) });
      expect((await repo.get(ids[0]!))?.status).toBe('invited');
      expect((await repo.get(ids[1]!))?.invitedAt).toBeInstanceOf(Date);
      expect(await allowlistPhones()).toEqual([BULK_NUMBER, BULK_NUMBER_2]);
      expect((await repo.events(ids[0]!)).map((event) => [event.adminId, event.action])).toEqual([
        [ADMIN_ID, 'invited'],
      ]);
    });

    it('moves nothing when one lead is missing, not pending, or lacks a number', async () => {
      await resetAllowlist();
      await repo.add({ email: 'bulk-hold-a@example.com', waNumber: null, useCase: null, locale: 'en' });
      await repo.add({ email: 'bulk-hold-b@example.com', waNumber: BULK_NUMBER, useCase: null, locale: 'en' });
      const ids = await idsOf(['bulk-hold-a@example.com', 'bulk-hold-b@example.com']);

      // Inviting a lead without a number fails the whole batch.
      let result: WaitlistBulkDecideResult = await repo.bulkDecide({ ids, adminId: ADMIN_ID, adminEmail: 'a@example.com', action: 'invite' });
      expect(result).toEqual({ ok: false, reason: 'missing_number', id: ids[0]! });
      expect(await allowlistPhones()).not.toContain(BULK_NUMBER);
      expect((await repo.get(ids[1]!))?.status).toBe('pending');

      // Rejecting works without numbers even though inviting them would not.
      result = await repo.bulkDecide({ ids, adminId: ADMIN_ID, adminEmail: 'a@example.com', action: 'reject' });
      expect(result).toEqual({ ok: true, results: ids.map((id) => ({ id, status: 'rejected' })) });

      // Once decided, a second attempt fails as a conflict and nothing changes again.
      result = await repo.bulkDecide({ ids, adminId: ADMIN_ID, adminEmail: 'a@example.com', action: 'reject' });
      expect(result).toEqual({ ok: false, reason: 'conflict', id: ids[0]! });
      // Validation follows the input order, so the not-pending id is reported before the
      // appended unknown one; on its own the unknown id is missing.
      result = await repo.bulkDecide({
        ids: [...ids, '00000000-0000-4000-8000-000000000009'],
        adminId: ADMIN_ID,
        adminEmail: 'a@example.com',
        action: 'reject',
      });
      expect(result).toEqual({ ok: false, reason: 'conflict', id: ids[0]! });
      result = await repo.bulkDecide({
        ids: ['00000000-0000-4000-8000-000000000009'],
        adminId: ADMIN_ID,
        adminEmail: 'a@example.com',
        action: 'reject',
      });
      expect(result).toEqual({ ok: false, reason: 'not_found', id: '00000000-0000-4000-8000-000000000009' });
      expect((await repo.events(ids[0]!)).map((event) => event.toStatus)).toEqual(['rejected']);
    });
  });
});
