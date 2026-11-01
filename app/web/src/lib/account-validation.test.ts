import { describe, expect, it } from 'bun:test';
import {
  displayNameError,
  emailError,
  magicLinkFromUrl,
  newPasswordError,
  normalizeDisplayName,
  recoveryTokenFromHash,
} from './account-validation';

describe('display name', () => {
  it('normalises like the BFF and treats blank as no name', () => {
    expect(normalizeDisplayName('  Amal   Example ')).toBe('Amal Example');
    expect(normalizeDisplayName('   ')).toBeNull();
    expect(displayNameError('')).toBeNull();
  });

  it('rejects names over 80 characters and control characters', () => {
    expect(displayNameError('x'.repeat(80))).toBeNull();
    expect(displayNameError('x'.repeat(81))).toBe('nameTooLong');
    expect(displayNameError('bad\u0007name')).toBe('nameInvalid');
  });
});

describe('email', () => {
  it('needs a valid address different from the current one', () => {
    expect(emailError('not-an-email')).toBe('emailInvalid');
    expect(emailError('User@Example.com', 'user@example.com')).toBe('emailSame');
    expect(emailError('new@example.com', 'user@example.com')).toBeNull();
  });
});

describe('new password', () => {
  it('uses the sign-up rule (8 to 128 characters)', () => {
    expect(newPasswordError('short', 'short')).toBe('passwordTooShort');
    expect(newPasswordError('x'.repeat(129), 'x'.repeat(129))).toBe('passwordTooLong');
    expect(newPasswordError('long-enough', 'long-enough')).toBeNull();
  });

  it('needs a matching confirmation and a change from the current password', () => {
    expect(newPasswordError('long-enough', 'long-enougH')).toBe('passwordMismatch');
    expect(newPasswordError('long-enough', 'long-enough', 'long-enough')).toBe('passwordSame');
  });
});

describe('recovery link', () => {
  it('reads the access token of a recovery redirect', () => {
    expect(recoveryTokenFromHash('#access_token=abc&refresh_token=r&type=recovery')).toBe('abc');
  });

  it('returns null for an error or a non-recovery link', () => {
    expect(recoveryTokenFromHash('#error=access_denied&error_description=expired')).toBeNull();
    expect(recoveryTokenFromHash('#access_token=abc&type=signup')).toBeNull();
    expect(recoveryTokenFromHash('')).toBeNull();
  });
});

describe('magic link', () => {
  it('reads the refresh token of an implicit-flow redirect', () => {
    expect(
      magicLinkFromUrl({ hash: '#access_token=abc&refresh_token=r&type=invite', search: '' }),
    ).toEqual({ kind: 'fragment', refreshToken: 'r', type: 'invite' });
  });

  it('reads the token hash of a PKCE-flow query string', () => {
    expect(
      magicLinkFromUrl({ hash: '', search: '?token_hash=XYZ&type=signup' }),
    ).toEqual({ kind: 'token_hash', tokenHash: 'XYZ', type: 'signup' });
  });

  it('defaults the type to magiclink when the link omits it', () => {
    expect(magicLinkFromUrl({ hash: '#refresh_token=r', search: '' })).toEqual({
      kind: 'fragment',
      refreshToken: 'r',
      type: 'magiclink',
    });
    expect(magicLinkFromUrl({ hash: '', search: '?token_hash=XYZ' })).toEqual({
      kind: 'token_hash',
      tokenHash: 'XYZ',
      type: 'magiclink',
    });
  });

  it('prefers the fragment over a token hash when both are present', () => {
    expect(magicLinkFromUrl({ hash: '#refresh_token=r&type=invite', search: '?token_hash=XYZ' })).toEqual({
      kind: 'fragment',
      refreshToken: 'r',
      type: 'invite',
    });
  });

  it('rejects a recovery link, other pages’ link kinds and an error redirect', () => {
    expect(magicLinkFromUrl({ hash: '#refresh_token=r&type=recovery', search: '' })).toBeNull();
    expect(magicLinkFromUrl({ hash: '#refresh_token=r&type=email_change', search: '' })).toBeNull();
    expect(magicLinkFromUrl({ hash: '#error=access_denied&error_description=expired', search: '' })).toBeNull();
  });

  it('returns null when the link carries neither token shape', () => {
    expect(magicLinkFromUrl({ hash: '', search: '' })).toBeNull();
    expect(magicLinkFromUrl({ hash: '', search: '?next=/whatsapp' })).toBeNull();
  });
});
