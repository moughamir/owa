import { describe, expect, it } from 'bun:test';
import { InMemoryAccountsRepository } from './in-memory-accounts.js';
import { InMemoryWaitlistRepository } from './in-memory-waitlist.js';

const ENTRY = { useCase: null, locale: 'en' } as const;

describe('InMemoryWaitlistRepository.bulkDecide (WF-018 atomicity)', () => {
  it('writes the allowlist through the paired accounts repository', async () => {
    const accounts = new InMemoryAccountsRepository();
    const waitlist = new InMemoryWaitlistRepository(accounts);
    await waitlist.add({ ...ENTRY, email: 'twin@a.example.com', waNumber: '+212610000091' });
    await waitlist.add({ ...ENTRY, email: 'twin-b@a.example.com', waNumber: ' +212610000092 ' });
    const ids = waitlist.all().map((entry) => entry.id);

    const result = await waitlist.bulkDecide({ ids, adminId: 'admin-1', adminEmail: 'admin@example.com', action: 'invite' });
    expect(result).toEqual({ ok: true, results: ids.map((id) => ({ id, status: 'invited' })) });
    expect(await accounts.isAllowlisted('+212610000091')).toBe(true);
    expect(await accounts.isAllowlisted('+212610000092')).toBe(true);
    expect(waitlist.all().every((entry) => entry.status === 'invited')).toBe(true);
  });

  it('moves nothing when one lead changed: statuses, allowlist and events stay untouched', async () => {
    const accounts = new InMemoryAccountsRepository();
    const waitlist = new InMemoryWaitlistRepository(accounts);
    await waitlist.add({ ...ENTRY, email: 'atomic@a.example.com', waNumber: '+212610000093' });
    await waitlist.add({ ...ENTRY, email: 'atomic-b@a.example.com', waNumber: '+212610000094' });
    const [changedId, pendingId] = waitlist.all().map((entry) => entry.id);

    // One lead is decided outside the batch before the bulk call runs.
    await waitlist.markInvited(changedId!, 'admin-1');

    const result = await waitlist.bulkDecide({
      ids: [changedId!, pendingId!],
      adminId: 'admin-1',
      adminEmail: 'admin@example.com',
      action: 'invite',
    });
    expect(result).toEqual({ ok: false, reason: 'conflict', id: changedId! });
    expect(await accounts.listAllowlist()).toHaveLength(0);
    expect((await waitlist.get(pendingId!))?.status).toBe('pending');
    expect(await waitlist.events(pendingId!)).toHaveLength(0);
  });

  it('fails the batch on an unknown id, still having invited nobody', async () => {
    const accounts = new InMemoryAccountsRepository();
    const waitlist = new InMemoryWaitlistRepository(accounts);
    await waitlist.add({ ...ENTRY, email: 'unknown@a.example.com', waNumber: '+212610000095' });
    const id = waitlist.all()[0]!.id;

    const result = await waitlist.bulkDecide({
      ids: [id, '00000000-0000-4000-8000-000000000009'],
      adminId: 'admin-1',
      adminEmail: 'admin@example.com',
      action: 'invite',
    });
    expect(result).toEqual({ ok: false, reason: 'not_found', id: '00000000-0000-4000-8000-000000000009' });
    expect(await accounts.listAllowlist()).toHaveLength(0);
    expect((await waitlist.get(id))?.status).toBe('pending');
  });
});
