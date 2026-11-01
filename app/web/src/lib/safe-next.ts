/** Same-origin path to return to after login (e.g. the OAuth consent page). Never an absolute URL. */
export function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/')) return null;
  // URLSearchParams above already percent-decoded once; raw may still carry escaped
  // characters (`?next=/%5C%5Cevil.example` arrives as `/%5C%5Cevil.example`). Decide on the
  // decoded form, because that is what a URL parser will act on.
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  // Browsers strip ASCII tab/LF/CR from URLs anywhere they appear, so `/\t/evil.com`
  // or `/\n/evil.com` resolves as `//evil.com` (scheme-relative), and `\` normalizes to
  // `/`, so both `/\evil.com` and `/\t\evil.com` do too. Reject anything the parser
  // would silently rewrite instead of trying to canonicalize it back by hand.
  if (/[\u0000-\u001f\u007f]/.test(decoded)) return null;
  if (decoded.includes('\\')) return null;
  if (decoded.startsWith('//')) return null;
  return decoded;
}
