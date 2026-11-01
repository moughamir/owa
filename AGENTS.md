# WaFine: notes for coding agents

WaFine is an open-core WhatsApp gateway built on OpenWA. Repo map: BFF (`app/bff`, Bun + Hono, hexagonal: `adapters/` `domain/` `infrastructure/`), web app (`app/web`, Next.js 16 — read `app/web/AGENTS.md` before touching it), docs site (`app/docs`, Fumadocs), API edge (`app/api-edge`, tiny Vercel proxy), VM compose stack (`stack/`), IaC (`terraform/`, OpenTofu). The engine is the pinned upstream submodule `OpenWA/` (fork `rmyndharis/OpenWA`, not `open-wa/wa-automate`) — never edited here.

## Start here
- Read `README.md`, `CONTRIBUTING.md`, `docs/00-setup.md`, `docs/02-architecture.md`; agent conventions live in `docs/knowledge/conventions.md`.
- Fresh clone: `git submodule update --init OpenWA` (the stack and upstream-surface checks fail without it), then `./bootstrap.sh` (`bootstrap.ps1` on Windows); `make doctor` reports missing tools (`docs/11-bootstrap.md`).
- Verify before a PR: `make check` (shell lint + `tofu fmt` check + bootstrap tests). Per app — `app/bff`: `bun run typecheck && bun run lint && bun test && bun run build`; `app/web`: `bun run typecheck && bun run test`; `app/docs`: `bun run typecheck && bun run test`.
- Local ports: web 3000, BFF 4000, docs 3001, engine 2785. Free local Docker stack: `make local-up` (project `owa-local`, engine `whatsapp-web.js` on 127.0.0.1:2785), inspect with `make local-ps`.

## Rules
- Flow: `make hooks` once per clone, then `scripts/flow start feature|fix|support|release|hotfix <slug>` (`feature/fix/support` branch off `develop`, PR back into `develop`). Never commit or push on `main`/`develop`; commit subjects are `type(scope): summary` under 100 chars (types include the non-obvious `scripts` and `release`). One task per branch, draft PR; the owner merges (squash into `develop`; merge commit for `release/*`/`hotfix/*`). Stuck? `scripts/flow status` shows branch, expected PR base, hooks state.
- Never edit `OpenWA/`; layer config through `stack/`. Upstream compose forwards an explicit env list (no `env_file`): check `OpenWA/docker-compose.yml` before adding a var to `stack/.env.example` (full reference: `OpenWA/.env.example`). After touching `stack/`, run `scripts/stack-check` (also a CI job; needs the submodule, docker and jq) — it catches the compose wiring that broke before.
- OpenWA is not `open-wa/wa-automate`: port 2785, header `X-API-Key`, `message.received`-style events. Read `OpenWA/README.md` and `OpenWA/docs/` instead of guessing (`scripts/check-upstream-surface.mjs` verifies the surface in CI).
- Schema has two layers. BFF schema is Drizzle (`app/bff/src/infrastructure/db/schema/`): generate checks with `bun run db:generate`; the generated `app/bff/drizzle/*.sql` is for local dev and the PGlite test replay, not the remote. The remote ledger is `supabase/migrations/*.sql`, applied with `supabase db push` (owner approval). Never run `bun run db:migrate`/`drizzle-kit migrate` against the remote — it would create a second, competing migration ledger.
- No hardcoded hosts, URLs or emails in code, config or examples: use env vars, placeholders or localhost.
- Run IaC only through `scripts/tf <oci|aws|cloudflare> …`, never bare `tofu`: the wrapper keeps `.terraform/` out of the repo tree, where macOS Finder `Icon` files break provider checksums. If `git fetch` fails with `bad object refs/Icon?`, run `scripts/git-deicon`.
- No secrets in git, issues, PRs or logs: `stack/.env` (VM only), `*.tfvars`, API keys, tokens, passwords, QR codes, WhatsApp session data.
- Container images must support linux/arm64; never publish a port on 0.0.0.0 — only the BFF is public (Cloudflare Tunnel, or `app/api-edge` on Vercel via Tailscale Funnel); the gateway stays private.
- WhatsApp: test with a dedicated number only, keep send pacing on, no bulk or cold sends. Public copy must match the code — verify pacing, encryption and revocation claims in source before writing them.

## Testing notes
- Web E2E (`bun run test:e2e`, Playwright `journey` project) runs against a Vercel preview URL in CI and silently skips itself when secrets or the URL are missing — a green no-op is not proof. A11y checks (`bun run test:a11y`) need Playwright Chromium.
- CI also builds the `graft` graph: after structural changes run `make graph` (`graft check` is a CI job and fails when the graph is stale).

## Ask a maintainer first
Anything billed, DNS changes, `tofu apply`/`destroy`, `supabase db push` (confirm the project ref in `supabase/.temp/project-ref`), deploys to the VM or hosts (`make deploy`, `make deploy-env`), deleting a WhatsApp session or the engine data volume.
