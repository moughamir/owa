import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

// WF-006: security headers for the docs host, applied to every response (including static
// `/_next/*` assets and `public/` files) via Next's `headers()`, so they cover paths that
// never reach React or the i18n middleware in `proxy.ts`.
//
// The CSP was matched to what the docs site actually loads (not guessed):
// - scripts: only bundled, same-origin files plus Next's inline bootstrap/hydration snippets
//   (`self.__next_f.push`, the theme-init script from `RootProvider`) → `'self' 'unsafe-inline'`;
//   `'unsafe-inline'` is required by the App Router and cannot be narrowed to a nonce without
//   middleware-generated nonces on every code path, which is out of scope here.
// - styles: bundled CSS, React's inline style attributes, and the Google Fonts stylesheet
//   `@import`ed from `app/global.css` → `'self' 'unsafe-inline' fonts.googleapis.com`.
// - fonts: the same Google Fonts families ship from `fonts.gstatic.com` → `'self' fonts.gstatic.com`.
// - images: own files (`/og.png`, icons) → `'self' data:`.
// - docs prose links (`github.com`, `api.example.com` placeholders) are plain hyperlinks, not
//   subresources, so they need no CSP allow and are absent on purpose.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

/** @type {import('next').NextConfig} */
export default withMDX({
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          // Browsers honouring `frame-ancestors` above already refuse embedding; this covers old ones.
          { key: 'X-Frame-Options', value: 'DENY' },
          // No sniffing: the docs host serves only generated/static files with correct types.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Cross-origin requests keep the least-referrer default modern browsers use; nothing on
          // the docs site depends on receiving full URLs.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  async redirects() {
    // The docs used to live under `/docs/*`; the whole site is the docs now. Permanent = 308.
    return [
      { source: '/docs', destination: '/', permanent: true },
      { source: '/docs/:path*', destination: '/:path*', permanent: true },
    ];
  },
});
