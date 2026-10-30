import { Hono } from 'hono';
import { z } from 'zod';
import type { IAccountsRepository } from '../../../domain/ports/index.js';
import { normalizeE164 } from '../../../domain/value-objects/phone.js';
import { canOpenAdmin, effectiveUserRole, permissionsForRole } from '../../../domain/user-roles.js';
import { CodedHTTPException } from '../errors.js';
import { zJson } from '../validation.js';

const claimBody = z.object({ phone: z.string().max(40) });

/**
 * The caller's identity (`GET /me`) and the late claim (`POST /me/claim`) that binds a
 * WhatsApp number to an already-authenticated Supabase user, mirroring the allowlist checks of
 * public sign-up: the same codes, the same messages, just behind the bearer middleware because
 * it starts from a verified session instead of a fresh sign-up.
 */
export function meRoutes(accounts: IAccountsRepository): Hono {
  const r = new Hono();
  r.get('/me', async (c) => {
    const auth = c.get('auth');
    const profile = await accounts.findProfileByUserId(auth.userId);
    const role = effectiveUserRole(auth.isAdmin, profile?.role);
    return c.json({
      userId: auth.userId,
      email: auth.email,
      /** Any role above `user`: may open /admin. What it can do there is `permissions`. */
      isAdmin: canOpenAdmin(role),
      role,
      permissions: permissionsForRole(role),
      phone: profile?.phoneE164 ?? null,
      /** Shown instead of the e-mail in the header when set. */
      displayName: profile?.displayName ?? null,
    });
  });

  // Late claim after a magic-link sign-in: the e-mail knew about the invite, the number is
  // what must now show it. Same allowlist discipline as POST /auth/signup, no rollback needed
  // (nothing was created to unwind; bindProfile is the atomic step).
  r.post('/me/claim', zJson(claimBody), async (c) => {
    const phoneE164 = normalizeE164(c.req.valid('json').phone);
    if (!phoneE164) {
      throw new CodedHTTPException(
        400,
        'invalid_phone',
        'Enter the WhatsApp number in international format, e.g. +212612345678',
      );
    }
    if (!(await accounts.isAllowlisted(phoneE164))) {
      throw new CodedHTTPException(
        403,
        'not_invited',
        'This number has not been invited. Ask the admin to add it to the allowlist.',
      );
    }
    if (await accounts.findProfileByPhone(phoneE164)) {
      throw new CodedHTTPException(409, 'phone_taken', 'This number already has an account.');
    }
    const bound = await accounts.bindProfile({
      userId: c.get('auth').userId,
      email: c.get('auth').email,
      phoneE164,
    });
    if (bound !== 'ok') {
      // A race between the pre-check and the bind only ever fails closed on the allowlist.
      throw bound === 'not_allowlisted'
        ? new CodedHTTPException(403, 'not_invited', 'This number has not been invited.')
        : new CodedHTTPException(409, 'phone_taken', 'This number already has an account.');
    }
    return c.json({ ok: true, phone: phoneE164 }, 201);
  });
  return r;
}
