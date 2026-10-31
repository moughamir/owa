import { describe, expect, it } from 'bun:test';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('keeps same-origin paths', () => {
    expect(safeNext('/oauth/consent?request=abc')).toBe('/oauth/consent?request=abc');
  });
  it('keeps percent-encoded same-origin paths (decoded once)', () => {
    expect(safeNext('/oauth/consent?request=%2Fa%20b')).toBe('/oauth/consent?request=/a b');
  });
  it('rejects absolute, protocol-relative and backslash targets (WF-005 baseline)', () => {
    for (const bad of [null, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)']) {
      expect(safeNext(bad)).toBeNull();
    }
  });
  it('rejects tab/newline variants that browsers strip back to // (WF-005)', () => {
    // Browsers remove ASCII tab/LF/CR from URLs anywhere, so each of these resolves
    // as `//evil.example` — a scheme-relative redirect that survives the literal
    // `//` prefix check.
    for (const bad of [
      '/\t/evil.example',
      '/\n//evil.example',
      '/\v/evil.example',
      '/\f/evil.example',
      '/\r/evil.example',
      '/\t/evil.example?x=/y',
    ]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
  it('rejects percent-encoded control-character variants (WF-005)', () => {
    // Same smuggles arriving as escapes (e.g. from a double-encoded link or after a
    // casing change): the decoded form is what the URL parser sees.
    for (const bad of ['/%09/evil.example', '/%0A//evil.example', '/x%0D%0A//evil.example', '/%0B/evil.example']) {
      expect(safeNext(bad)).toBeNull();
    }
  });
  it('rejects backslash variants beyond the leading /\\ pair (WF-005)', () => {
    // `\` normalizes to `/` in special URLs, so any backslash can complete `//`.
    // Escape variants reach the function still-encoded when the caller decoded only once.
    for (const bad of ['/\\t/evil.example', '/x\\evil.example', '/%5C%5Cevil.example', '/\\/\\evil.example', '/%5C/\\evil.example']) {
      expect(safeNext(bad)).toBeNull();
    }
    // But the single-encoded `/%2F` and the double-encoded `/%252F` forms: `/%2F`'s
    // decoded shape is `//` → rejected; the double-encoded `%252F` decodes to a
    // same-origin path only once (`/%2F…` stays literal) and is rejected as `//`.
    expect(safeNext('/%2Fevil.example')).toBeNull();
  });
  it('rejects malformed escapes instead of throwing', () => {
    for (const bad of ['/%', '/a%2B%'] as unknown as (string | null)[]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
});
