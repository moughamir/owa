# Changelog

## [0.1.7-alpha] - 2026-11-01

Hardening & i18n wave, cut from `develop` at `4e75709` (14 PRs merged after v0.1.6-alpha; all CI-green).

### Security

- **WF-005** (#101): Hardened `safe-next` against tab/newline/backslash bypass variants.
- **WF-031** (#100): Refuse unencrypted nightly backups without `BACKUP_AGE_RECIPIENT`.

### Fixed

- **WF-026** (#104): Redis-backed `FlowStore` + `IIdempotencyStore` with in-memory fallback; OAuth flow state and webhook idempotency no longer in-memory.
- **WF-028** (#106, #110): Replaced "Turn your WhatsApp number into an AI teammate" with "WaFine — WhatsApp gateway for teams" across OG image, metadata, discoverability, blog, video, and marketing assets (EN/FR).
- **WF-024** (#109): OAuth consent screen fully internationalized — no hardcoded English remains.
- **WF-023** (#92): Logical RTL Tailwind classes (`ms-`/`me-` instead of `ml-`/`mr-`) across 9 files; admin/consent copy extracted to i18n.
- **WF-047** (#107): Removed unused BIP39 recovery mnemonic placeholder (unreachable in production).
- **WF-045** (#105): Removed unused oRPC layer (`@orpc/client`, `@orpc/server`) and dead TODO in app.ts.
- **WF-029** (#108): Reconciled "WaaSel" → "WaFine" in agentic BFF plan doc.

### Added

- **WF-060 (partial)** (#111): Webhook filter for native WhatsApp poll messages (`type: 'poll'`) + poll indicator (📊 Poll) in message list. Poll vote tracking and creation UI remain for follow-up.
- **WF-021 (partial)** (#112): Workflow engine test coverage (8 tests covering all ignore reasons: `from_me`, `not_direct_chat`, `poll`, `not_text`, `unknown_session`, `not_allowlisted`, `no_match`, `rule_disabled`, `cooldown`). Signup allowlist, gateway proxy, media presign, MCP client already covered.
- **WF-032** (#102): Uptime alert runbook + `METRICS_TOKEN` observability wiring.

### Changed

- **WF-006** (#90): Security headers for docs host (CSP, HSTS, X-Frame-Options, Referrer-Policy).
- **WF-044** (#96): Product integrations skeleton doc.
- **WF-006** (#91): Stub pages for contacts, agent-builder, MCP marketplace, billing, CRM.

### Release

- 315 BFF tests + 243 web tests pass, TypeScript clean.
- Exporter deny-list verified clean (CHANGELOG v0.1.4 entry still valid).

## [0.1.4-alpha] - 2026-10-24

### Added
- **Issue hygiene automation** (PR #42, #43): nightly triage scripts for issues and PRs, auto-labeling with area/priority/type, stale-issue detection (180d), milestone assignment.
- **Issue transfer**: 17 WF-023 through WF-050 issues migrated from `ai4xedu/openwa-oci-infra`.
- **WaFine-only issue/PR hygiene**: now runs exclusively on `zawia-tech/wafine`.

### Changed
- **Repository transition**: `zawia-tech/wafine` is now the single canonical repo; `ai4xedu/openwa-oci-infra` to be archived.
- **Branch protection**: both `main` and `develop` protected (strict CI + 1 review).
- **Default branch**: `develop` (from `claude/brave-hypatia-wvxmq0`).

### Release
- Synced from `openwa-oci-infra` main `52942c8` (PR #44).
- Exporter deny-list verified: operator-only files (CLAUDE.md, TASKS.md, docs/03-runbook.md) correctly excluded.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.6-alpha] - 2026-10-28

Consent-surface hotfix train, cut from `develop` at `b511885` (PRs merged after v0.1.5, none of them feature/stub content; every commit CI-green).

### Fixed

- **WF-005 follow-up (#87): OAuth consent redirect loop** (PR #93, `fix/consent-307-a11y`): `/oauth/consent` now serves 200 directly (locale via the next-intl cookie, EN fallback) instead of 307-ing to `/en/…` and back — locale-stable for IdP frames, a11y e2e unchanged (21/21).
- **WF-005: OAuth consent 404 for FR/AR users** (#79): the consent fix that unlocked the direct-render above; included in the same consent train.
- **WF-018: waitlist bulk actions atomic** (#88, PR `fix/bulk-atomic-waitlist`): admin bulk ops no longer partial-fail.
- **WF-022: error/loading/not-found boundaries** (#89): user-friendly fallbacks instead of raw error screens.

### Added (repo tooling, no user surface)

- WF-014/015 OpenWA upstream surface tracker + release/GHSA watch (#86, #85): CI gate that fails on engine surface drift; consolidated advisory issue stays open until the OpenWA submodule pin moves.

## [0.1.5-alpha] - 2026-10-24

Built from PRs #74, #75, #76 on `develop`.

### Fixed

- **WF-001: Rate-limit client IP spoofing** (#74, `mo/wf-001-client-ip`): `TRUSTED_PROXY_HOPS` (default 1) and `TRUST_CF_CONNECTING_IP` from env config, wired through all three BFF rate limiters and OAuth endpoints. Prevents spoofed X-Forwarded-For and shared `unknown` bucket across connections.

- **WF-003: False public security/privacy claims** (#75, `mo/wf-003-claims`): corrected i18n strings (EN/FR/AR) — "stored encrypted" → "stored on our own server", gap-paced claims (only auto-replies), per-session key limits (up to 5), and revoke wording (leaked token cannot revoke without valid bearer).

- **WF-004: OAuth revoke authentication** (#76, `mo/wf-004-revoke`): `/oauth/revoke` now requires RFC 6750 bearer auth (RFC 7009+6750). Bearer must differ from the revoked token (403 if same) — a leaked access token cannot revoke itself. Bearer must be a live, unexpired access token of the same grant; unknown/foreign tokens → 200 no-op.

Built from merged PRs #88 through #108 on `main`.

### Added

- **Design system completion** (#95, #92, #89, #83): daisyUI themes `wafine`/`wafine-dark`, `@wafine/*` package scopes, Fredoka 600 headings, Inter body, Noto Sans Arabic, pine/cream/clay palette, three-step elevation, layered depth on landing, white-label aliases.
- **Public docs site** (#94, #91, #90, #88, #83): Fumadocs at `/` with EN/FR/AR i18n, hand-written user pages, sitemap/robots, no auth gate, R2-aligned media wording.
- **Tutorial video** (#104, #102, #103, #107): Remotion pipeline, EN/FR/AR voice-overs (Piper: Jenny, SIWIS), music ducking, SFX, per-locale posters, credits (SIWIS CC BY 4.0, Jenny).
- **Account settings** (#106): profile, email, password, sessions, closure request.
- **Roles and permissions** (#105): deadlock-free last-owner lock, role checks, owner role selector, 403 view for user, permission-driven admin tabs.
- **Admin waitlist management** (#101): manage waitlist leads, audit status, refresh after failed bulk actions.
- **Messages inbox** (#100): signed-in messages page, fresh presigned link per view, attachment-specific error text.
- **i18n auth** (#103): localized auth page and error codes.
- **README brand cover** (#102): one-prompt Claude setup, docs tutorial outline.
- **Go-live operator docs** (on `main` after dc77028): `docs/go-live-2026-10-20.md` (ordered owner runbook, per-step rollback, five-layer rollback), `scripts/go-live-check` (`make go-live-check`).
- **Agent workspace tooling** (on `main`): repomix pack (`make pack`), graft graph (`make graph`/`graph-check`), Serena symbol server, rtk wiring.
- **Blog series posts** (10 draft MDX files): introducing-wafine, problem-whatsapp-automation, solution-wafine-today, iterations-what-we-built-and-threw-away, why-decisions-are-made, design-philosophy, implementation-development, learning-resources-research, questions-exchanges, release-v0.1.2-alpha.
- **Setup guides** (3 draft MDX files): setup-connect-claude, setup-deploy, setup-send-message.

### Changed

- **Media storage**: OCI Object Storage (Always Free 20 GB, same tenancy) replaces Cloudflare R2 as primary; R2 stays supported via env flip. Provider-neutral S3 config, batched idempotent backfill, lifecycle policy. (#96, #93, #91, #90, #89)
- **Gateway stays private** (captain decision 2026-10-11): no public `gw.` record, no Access resources.
- **Production hosts**: `wafine.zawia.tech` (web), `api.wafine.zawia.tech` (BFF), `docs.wafine.zawia.tech` (docs, public and indexable).
- **Sign-up allowlist**: BFF allowlist-gated sign-up, Supabase Auth adapter, admin dashboard, E.164 normalization.
- **API send budget**: BFF per-session budget (Valkey, UTC day + per-minute), charged on `/wa` sends, `/mcp` send tools, auto-replies; refund on engine refusal.
- **Claude connector**: OAuth 2.1 authorization server, opaque tokens, sealed engine keys, refresh rotation, disconnect revokes grant.
- **Linux workstation support** (#2): portable `scripts/bootstrap.sh`, `scripts/tailnet-sidecar` (rootless second tailnet), fixed `scripts/gh-observer` date bug.
- **Terraform AWS dev workspace** (#8, #9): multi-platform lockfiles, `make tf-aws-init/plan/apply` + `sidecar-login`.

### Fixed

- **Crypto hardening** (#97): require full GCM tag and 12-byte IV in SecretBox; length checks for XChaCha nonces and KEKs.
- **CodeRabbit post-merge audit** (9bb9a81): locale-aware footer links, docs disclaimer, no private repo link, accurate media wording, R2 in ops docs.
- **Hydration mismatch** on contact email (c8ffde6).
- **Video credits** (6e7d050): SIWIS CC BY 4.0, Jenny voice.
- **Supabase service role key** handling: removed from required production env vars (re-added for sign-up rollback).
- **CORS default-deny** enforced.

### Security

- **E2E encryption design** (`docs/04-e2e-encryption.md`): XChaCha20-Poly1305, HMAC blind index, Argon2id KDF. (Design as of 2026-10-08; verify implementation status.)
- **RLS on owner tables**: `allowlisted_numbers`, `user_profiles`, `bff_settings`, `wa_session_limits` — RLS enabled, no policies (only owner bypasses).
- **OAuth tokens**: opaque, stored as SHA-256 only, bound to one grant; refresh rotation; reuse revokes connection.
- **API keys**: shown once, stored hashed, scoped to one session, up to 5 active.
- **Disabled users**: clean 403 on `/api`, `/wa`, `/mcp`, keys and connectors included.
- **Rate limits**: register 20/min/IP, token 60/min/IP, MCP 120/min per connection, auth IP-throttled.

---

### Owner action required

`docs/release.md` still says **v1.0.0 at launch** (the original plan). This CHANGELOG reflects v0.1.2-alpha as the current release candidate. Please reconcile `docs/release.md` with this version before the launch PR is merged.

### Verification

- `make check` passes (shellcheck clean)
- BFF: `bun run typecheck` 0 errors, `bun run lint` clean, `bun test` 259/259 pass
- Web: `bun run typecheck` 0 errors, `bun run lint` clean (9 warnings), `bun test` 199 pass / 4 fail (pre-existing e2e config issue), `bun run build` OK
- CI: `.github/workflows/app.yml` (typecheck + lint + test + build for both submodules)
- Nightly health job: `.github/workflows/nightly-health.yml` (02:17 UTC)
- Graft CI job: `graph-check`

---

## [Unreleased]

### Added

- Repo hygiene and release process (SECURITY.md, PR/issue templates, CODEOWNERS, Dependabot, CHANGELOG, docs/release.md).