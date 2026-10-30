/**
 * Client-side checks for the settings, forgot-password and reset forms. They mirror the BFF
 * (app/bff/src/adapters/http/routes/account.ts and auth.ts), which validates again: these only
 * give an instant, translated message. Each returns a key under `settingsPage.errors`, or null.
 */

/** Same rule as sign-up (BFF `newPassword`): 8 to 128 characters. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const DISPLAY_NAME_MAX = 80;

export type AccountFieldError =
  | 'nameTooLong'
  | 'nameInvalid'
  | 'emailInvalid'
  | 'emailSame'
  | 'passwordTooShort'
  | 'passwordTooLong'
  | 'passwordMismatch'
  | 'passwordSame'
  | 'currentRequired';

/** What the BFF stores: inner whitespace collapsed and trimmed; empty means "no name". */
export function normalizeDisplayName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  return name === '' ? null : name;
}

export function displayNameError(raw: string): AccountFieldError | null {
  const name = normalizeDisplayName(raw);
  if (name === null) return null;
  if (name.length > DISPLAY_NAME_MAX) return 'nameTooLong';
  if (/[\u0000-\u001f\u007f]/.test(name)) return 'nameInvalid';
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailError(raw: string, current?: string): AccountFieldError | null {
  const email = raw.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return 'emailInvalid';
  if (current && email === current.trim().toLowerCase()) return 'emailSame';
  return null;
}

export function newPasswordError(
  password: string,
  confirm: string,
  current?: string,
): AccountFieldError | null {
  if (password.length < PASSWORD_MIN) return 'passwordTooShort';
  if (password.length > PASSWORD_MAX) return 'passwordTooLong';
  if (password !== confirm) return 'passwordMismatch';
  if (current !== undefined && password === current) return 'passwordSame';
  return null;
}

/**
 * The recovery token from a Supabase reset link. GoTrue redirects to
 * `/auth/reset#access_token=…&type=recovery…` (implicit flow); an error comes back as
 * `#error=…&error_description=…`. Returns null when the link carries no usable token.
 */
export function recoveryTokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.get('error')) return null;
  const token = params.get('access_token');
  const type = params.get('type');
  return token && (type === null || type === 'recovery') ? token : null;
}

const MAGIC_TYPES = ['magiclink', 'invite', 'signup'] as const;
export type MagicLinkType = (typeof MAGIC_TYPES)[number];

export type MagicLinkToken =
  | { kind: 'fragment'; refreshToken: string; type: MagicLinkType }
  | { kind: 'token_hash'; tokenHash: string; type: MagicLinkType };

/**
 * The known `type` values of a magic/invite/signup link: null for `recovery` (the reset
 * page's territory) and other kinds (`email_change`…) this page must not consume.
 */
function magicType(raw: string | null): MagicLinkType | null {
  if (raw === null) return 'magiclink'; // older configs omit the type
  return (MAGIC_TYPES as readonly string[]).includes(raw) ? (raw as MagicLinkType) : null;
}

/**
 * Parse a Supabase magic/invite/signup landing URL into whichever token shape it carries.
 * `/auth/magic#access_token=…&refresh_token=…&type=…` (implicit flow) or
 * `/auth/magic?token_hash=…&type=…` (PKCE flow). The fragment wins when both are present;
 * a link we cannot identify (no token, an `error` redirect, or a type belonging to another
 * page, e.g. `recovery`) returns null.
 */
export function magicLinkFromUrl(url: { hash: string; search: string }): MagicLinkToken | null {
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  const refreshToken = fragment.get('refresh_token');
  if (refreshToken) {
    const type = magicType(fragment.get('type'));
    return type ? { kind: 'fragment', refreshToken, type } : null;
  }
  const query = new URLSearchParams(url.search);
  const tokenHash = query.get('token_hash');
  if (tokenHash) {
    const type = magicType(query.get('type'));
    return type ? { kind: 'token_hash', tokenHash, type } : null;
  }
  return null;
}
