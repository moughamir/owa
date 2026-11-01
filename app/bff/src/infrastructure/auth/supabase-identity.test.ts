import { describe, it, expect } from 'bun:test';
import { SupabaseIdentityProvider } from './supabase-identity.js';

function provider(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  const p = new SupabaseIdentityProvider({
    url: 'https://x.supabase.co/',
    anonKey: 'anon',
    serviceRoleKey: 'service',
    fetchImpl,
  });
  return { p, calls };
}

describe('SupabaseIdentityProvider', () => {
  it('treats an obfuscated user with no identities as an existing email', async () => {
    const { p } = provider(200, { id: 'u1', email: 'a@b.c', identities: [] });
    expect(await p.signUp('a@b.c', 'password1', {})).toEqual({ status: 'exists' });
  });

  it('reports email confirmation as required when the user is unconfirmed', async () => {
    const { p, calls } = provider(200, { id: 'u1', email: 'a@b.c', identities: [{}], email_confirmed_at: null });
    expect(await p.signUp('a@b.c', 'password1', { phone_e164: '+212600000042' })).toEqual({
      status: 'created',
      userId: 'u1',
      emailConfirmationRequired: true,
    });
    expect(calls[0]?.url).toBe('https://x.supabase.co/auth/v1/signup');
    expect((calls[0]?.init.headers as Record<string, string>)['apikey']).toBe('anon');
  });

  it('maps sign-in failures', async () => {
    expect(await provider(400, { error_code: 'invalid_credentials' }).p.signIn('a@b.c', 'x')).toEqual({
      status: 'invalid_credentials',
    });
    expect(await provider(400, { error_code: 'email_not_confirmed' }).p.signIn('a@b.c', 'x')).toEqual({
      status: 'email_not_confirmed',
    });
  });

  it('uses the service-role key only to delete users', async () => {
    const { p, calls } = provider(200, {});
    await p.deleteUser('u1');
    expect(calls[0]?.url).toBe('https://x.supabase.co/auth/v1/admin/users/u1');
    expect((calls[0]?.init.headers as Record<string, string>)['apikey']).toBe('service');
  });

  it('returns null for an invalid access token', async () => {
    expect(await provider(401, {}).p.getUser('bad')).toBeNull();
  });

  it('changes e-mail and password with the user token, never the service key', async () => {
    const { p, calls } = provider(200, {});
    expect(await p.updateEmail('user-token', 'new@example.com', 'https://app.example.com/settings')).toBe('sent');
    expect(calls[0]?.url).toBe('https://x.supabase.co/auth/v1/user?redirect_to=https%3A%2F%2Fapp.example.com%2Fsettings');
    expect(calls[0]?.init.method).toBe('PUT');
    expect((calls[0]?.init.headers as Record<string, string>)['Authorization']).toBe('Bearer user-token');
    expect((calls[0]?.init.headers as Record<string, string>)['apikey']).toBe('anon');
    expect(await p.updatePassword('user-token', 'new-password')).toEqual({ status: 'ok' });
  });

  it('maps e-mail and password errors', async () => {
    expect(await provider(422, { error_code: 'email_exists' }).p.updateEmail('t', 'a@b.c', 'https://x')).toBe('email_taken');
    expect(await provider(429, {}).p.updateEmail('t', 'a@b.c', 'https://x')).toBe('rate_limited');
    expect(await provider(422, { error_code: 'same_password' }).p.updatePassword('t', 'x')).toEqual({ status: 'same_password' });
    expect(await provider(422, { error_code: 'weak_password', msg: 'too weak' }).p.updatePassword('t', 'x')).toEqual({
      status: 'weak_password',
      message: 'too weak',
    });
  });

  it('reports a reset as sent whatever GoTrue says, except rate limits', async () => {
    const { p, calls } = provider(200, {});
    expect(await p.sendPasswordReset('a@b.c', 'https://app.example.com/auth/reset')).toBe('sent');
    expect(calls[0]?.url).toBe('https://x.supabase.co/auth/v1/recover?redirect_to=https%3A%2F%2Fapp.example.com%2Fauth%2Freset');
    expect(await provider(429, {}).p.sendPasswordReset('a@b.c', 'https://x')).toBe('rate_limited');
  });

  it('sends a magic link to /otp without creating the account, with the anon key', async () => {
    const { p, calls } = provider(200, {});
    expect(await p.sendMagicLink('A@B.c', 'https://app.example.com/auth/magic?next=x')).toBe('sent');
    expect(calls[0]?.url).toBe(
      'https://x.supabase.co/auth/v1/otp?redirect_to=' + encodeURIComponent('https://app.example.com/auth/magic?next=x'),
    );
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ email: 'A@B.c', create_user: false });
    expect((calls[0]?.init.headers as Record<string, string>)['apikey']).toBe('anon');
  });

  it('maps only rate limits on the magic link and never reveals whether the address exists', async () => {
    expect(await provider(429, {}).p.sendMagicLink('a@b.c', 'https://x')).toBe('rate_limited');
    expect(
      await provider(422, { error_code: 'over_email_send_rate_limit' }).p.sendMagicLink('a@b.c', 'https://x'),
    ).toBe('rate_limited');
    // Unknown address (GoTrue answers 400) still reads as sent.
    expect(await provider(400, { error_code: 'user_not_found' }).p.sendMagicLink('a@b.c', 'https://x')).toBe('sent');
  });

  it('sends admin invites over the service-role key with the metadata', async () => {
    const { p, calls } = provider(200, { id: 'u1' });
    expect(await p.sendInvite('lead@example.com', 'https://app.example.com/auth/magic', { phone_e164: '+2126' })).toBe('sent');
    expect(calls[0]?.url).toBe('https://x.supabase.co/auth/v1/invite?redirect_to=https%3A%2F%2Fapp.example.com%2Fauth%2Fmagic');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ email: 'lead@example.com', data: { phone_e164: '+2126' } });
    expect((calls[0]?.init.headers as Record<string, string>)['apikey']).toBe('service');
  });

  it('maps invite outcomes: rate limit, already subscribed, and unexpected failures', async () => {
    expect(await provider(429, {}).p.sendInvite('a@b.c', 'https://x', {})).toBe('rate_limited');
    expect(
      await provider(422, { error_code: 'user_already_exists' }).p.sendInvite('a@b.c', 'https://x', {}),
    ).toBe('exists');
    expect(await provider(422, { error_code: 'email_exists' }).p.sendInvite('a@b.c', 'https://x', {})).toBe('exists');
    await expect(provider(500, { error_code: 'smtp_error' }).p.sendInvite('a@b.c', 'https://x', {})).rejects.toThrow(
      'Supabase invite failed: 500 smtp_error',
    );
  });

  it('exchanges a link token hash for a session, or returns null on an expired link', async () => {
    const { p, calls } = provider(200, {
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 3600,
      user: { id: 'u1', email: 'A@b.c', email_confirmed_at: '2026-01-01' },
    });
    const result = await p.verifyTokenHash('hash-of-the-link', 'magiclink');
    expect(result).toEqual({
      tokens: { accessToken: 'at', refreshToken: 'rt', expiresIn: 3600 },
      user: { userId: 'u1', email: 'a@b.c', emailConfirmed: true },
    });
    expect(calls[0]?.url).toBe('https://x.supabase.co/auth/v1/verify?token_hash=hash-of-the-link&type=magiclink');
    expect(calls[0]?.init.method).toBe('POST');

    expect(await provider(400, {}).p.verifyTokenHash('gone', 'magiclink')).toBeNull();
    expect(await provider(401, {}).p.verifyTokenHash('gone', 'invite')).toBeNull();
    await expect(provider(500, {}).p.verifyTokenHash('gone', 'signup')).rejects.toThrow('Supabase verify failed: 500');
  });

  it('signs out globally with the user token', async () => {

    const { p, calls } = provider(204, {});
    await p.signOutAll('user-token');
    expect(calls[0]?.url).toBe('https://x.supabase.co/auth/v1/logout?scope=global');
    await provider(401, {}).p.signOutAll('gone');
  });
});
