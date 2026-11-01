/**
 * Magic-link sign-in and the late number claim, over the real app: the link request hides whether
 * the address is registered, the token hash consumes once into a session, and /api/me/claim
 * applies the same allowlist discipline as public sign-up (same codes, behind a bearer token).
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import type {
  IIdentityProvider,
  IdentityUser,
  ISelfServiceIdentity,
  MagicLinkResult,
  PasswordUpdateResult,
  SendInviteResult,
  SignInResult,
  SignUpResult,
  TokenSet,
} from '../../../domain/ports/index.js';
import { HealthAggregator } from '../../../infrastructure/health/health-aggregator.js';
import { InMemoryAccountsRepository } from '../../persistence/in-memory-accounts.js';
import { createApp } from '../app.js';

const USER = '11111111-0000-4000-8000-000000000001';
const OWNER = '11111111-0000-4000-8000-000000000002';
const EMAIL = 'user@example.com';
const NUMBER = '+212600000042';
const WEB_URL = 'https://app.example.com/';

interface LinkRequest {
  email: string;
  redirectTo: string;
}

/** Supabase Auth stand-in: a magic link is minted by the test, the hash consumes into a session. */
class FakeIdentity implements IIdentityProvider, ISelfServiceIdentity {
  users = new Map<string, IdentityUser>();
  /** tokenHash → user id; gone after one verify, like a real one-time link. */
  hashes = new Map<string, string>();
  magicCalls: LinkRequest[] = [];
  magicResult: MagicLinkResult = 'sent';
  inviteResult: SendInviteResult = 'sent';

  async signUp(_email: string, _password: string): Promise<SignUpResult> {
    const userId = `22222222-0000-4000-8000-${this.users.size}`.padEnd(36, '0');
    this.users.set(userId, { userId, email: _email, emailConfirmed: false });
    return { status: 'created', userId, emailConfirmationRequired: true };
  }
  async signIn(): Promise<SignInResult> {
    throw new Error('unused');
  }
  async refresh(): Promise<null> {
    return null;
  }
  async getUser(token: string) {
    return this.users.get(token.replace(/^tok:/, '')) ?? null;
  }
  async deleteUser() {}
  async sendMagicLink(email: string, redirectTo: string): Promise<MagicLinkResult> {
    this.magicCalls.push({ email, redirectTo });
    return this.magicResult;
  }
  async sendInvite(): Promise<SendInviteResult> {
    return this.inviteResult;
  }
  async verifyTokenHash(tokenHash: string): Promise<{ tokens: TokenSet; user: IdentityUser } | null> {
    const userId = this.hashes.get(tokenHash);
    if (!userId) return null;
    this.hashes.delete(tokenHash);
    const user = this.users.get(userId)!;
    return { tokens: { accessToken: `tok:${userId}`, refreshToken: `ref:${userId}`, expiresIn: 3600 }, user };
  }

  // Self-service: not under test here, only wired so createApp passes webUrl to the auth routes.
  async updateEmail(): Promise<'sent'> {
    return 'sent';
  }
  async updatePassword(): Promise<PasswordUpdateResult> {
    return { status: 'ok' };
  }
  async sendPasswordReset(): Promise<'sent'> {
    return 'sent';
  }
  async signOutAll(): Promise<void> {}
}

let app: ReturnType<typeof createApp>;
let accounts: InMemoryAccountsRepository;
let identity: FakeIdentity;

const post = (path: string, body: unknown, token: string | null = null) =>
  app.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer tok:${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  accounts = new InMemoryAccountsRepository();
  identity = new FakeIdentity();
  identity.users.set(USER, { userId: USER, email: EMAIL, emailConfirmed: true });
  identity.users.set(OWNER, { userId: OWNER, email: 'owner@example.com', emailConfirmed: true });
  app = createApp({
    health: new HealthAggregator([]),
    accounts,
    identity,
    adminEmails: ['owner@example.com'],
    corsOrigins: [],
    webUrl: WEB_URL,
    selfService: identity,
  });
});

describe('POST /auth/magic', () => {
  it('e-mails the link to the magic page with the requested next page encoded in it', async () => {
    const res = await post('/auth/magic', { email: 'User@Example.com', next: '/orders' });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: 'check_inbox' });
    expect(identity.magicCalls).toEqual([
      { email: 'user@example.com', redirectTo: `${WEB_URL}auth/magic?next=%2Forders` },
    ]);
  });

  it('links to the bare magic page without a next', async () => {
    await post('/auth/magic', { email: EMAIL });
    expect(identity.magicCalls[0]?.redirectTo).toBe(`${WEB_URL}auth/magic`);
  });

  it('answers the same whatever the address does, except for rate limits', async () => {
    const known = await post('/auth/magic', { email: EMAIL });
    const unknown = await post('/auth/magic', { email: 'nobody@example.com' });
    expect([known.status, unknown.status]).toEqual([202, 202]);
    expect(await known.json()).toEqual(await unknown.json());

    identity.magicResult = 'rate_limited';
    const throttled = await post('/auth/magic', { email: EMAIL });
    expect(throttled.status).toBe(429);
    expect(await throttled.json()).toEqual({
      error: 'Too many e-mails sent, try again later.',
      code: 'rate_limited',
    });
  });

  it('refuses a next that is not a relative in-app path', async () => {
    expect(identity.magicCalls).toHaveLength(0);
    for (const next of ['//evil.com', '/\\evil.com', 'https://evil.com', '/orders x', '/a\nb', '/\u0000z']) {
      const res = await post('/auth/magic', { email: EMAIL, next });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { code: string }).code).toBe('invalid_input');
    }
    expect((await post('/auth/magic', { email: EMAIL, next: 'x'.repeat(513) })).status).toBe(400);
    expect(identity.magicCalls).toHaveLength(0);
  });
});

describe('POST /auth/magic/verify', () => {
  it('exchanges a one-time link hash for a session like login does', async () => {
    identity.hashes.set('hash-from-the-email', USER);
    const res = await post('/auth/magic/verify', { tokenHash: 'hash-from-the-email' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      accessToken: `tok:${USER}`,
      refreshToken: `ref:${USER}`,
      expiresIn: 3600,
      email: EMAIL,
      isAdmin: false,
    });
    // The link is dead after its first use.
    const again = await post('/auth/magic/verify', { tokenHash: 'hash-from-the-email' });
    expect(again.status).toBe(400);
    expect(await again.json()).toEqual({
      error: 'This link has expired or was already used. Send yourself a new one.',
      code: 'magic_link_invalid',
    });
  });

  it('tells an ADMIN_EMAILS owner with the same shape', async () => {
    identity.hashes.set('owner-hash', OWNER);
    const res = await post('/auth/magic/verify', { tokenHash: 'owner-hash' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { isAdmin: boolean }).isAdmin).toBe(true);
  });

  it('rejects a strict body, an unknown sign-in type and a recovery token', async () => {
    expect((await post('/auth/magic/verify', { tokenHash: 'hash-from-the-email', extra: 1 })).status).toBe(400);
    expect((await post('/auth/magic/verify', { tokenHash: 'ab' })).status).toBe(400);
    // The reset flow owns 'recovery': its links may never sign anyone in here.
    expect((await post('/auth/magic/verify', { tokenHash: 'hash-from-the-email', type: 'recovery' })).status).toBe(400);
  });
});

describe('POST /api/me/claim', () => {
  const claim = (body: unknown, token: string | null = USER) => post('/api/me/claim', body, token);

  it('binds an allowlisted number to the signed-in user', async () => {
    await accounts.addAllowlisted(NUMBER, 'admin');
    const res = await claim({ phone: '+212 600-000-042' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, phone: NUMBER });
    expect(await accounts.findProfileByPhone(NUMBER)).toMatchObject({ userId: USER, email: EMAIL });
  });

  it('mirrors the public sign-up refusals with the same codes', async () => {
    const invalid = await post('/api/me/claim', { phone: '0600000042' }, USER);
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { code: string }).code).toBe('invalid_phone');

    const uninvited = await post('/api/me/claim', { phone: NUMBER }, USER);
    expect(uninvited.status).toBe(403);
    expect(((await uninvited.json()) as { code: string }).code).toBe('not_invited');

    await accounts.addAllowlisted(NUMBER, 'admin');
    expect((await claim({ phone: NUMBER })).status).toBe(201);

    const taken = await post('/api/me/claim', { phone: NUMBER }, OWNER);
    expect(taken.status).toBe(409);
    expect(((await taken.json()) as { code: string }).code).toBe('phone_taken');
  });

  it('needs a session, like every /api route', async () => {
    expect((await claim({ phone: NUMBER }, null)).status).toBe(401);
  });
});
