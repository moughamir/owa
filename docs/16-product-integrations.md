# 16 — Product integrations (WF-044): khls CRM/Billing, contacts, notifications, webhooks, agents

Status: **skeleton — owner decisions recorded 2026-10-28, sections to be filled before wave 3 (24 Nov).**
Decision source: brain `Decisions/2026-10-28-product-track-decisions.md`; roadmap: `Decisions/2026-10-28-roadmap-reconciliation.md` (wave 3 = 24 Nov).

## 0. Owner decisions this doc implements (2026-10-28)

1. **Single-tenant** through current phases/quarters; multitenancy + B2B model → dedicated strategy track, **Q1 2027**. No org-schema work in wave 3.
2. **CRM & Billing = Owner/Admin surface only**, powered by **khls.app** — no CRM/billing backend inside WaFine. Khls is the system of record for customers/invoices/collections.
3. **Contacts groups/channels/labels = end-user feature** + **vCard (.vcf)/CSV import-export**. Groups/channels = WhatsApp-side (engine-synced); labels = WaFine-side metadata.
4. **Branding = WaFine gadget only**; white-label → Q1 2027 multitenancy track.
5. **TabTree.app = embed-as-workflow-editor** (upsell TabTree.app to WaFine users); no proprietary flow editor in WaFine.
6. **Agents: A2A + MCP**, trust model = OAuth-scoped agent clients (dynamic client registration, scoped budget-limited tokens), plus a **WaFine Master Orchestrator Agent with a second brain**. Sequenced after WF-058 (durable OAuth store) and audit logging.

## 1. Khls integration contract (WF-044 core)

**Direction (working read, to confirm):** khls consumes WaFine's gateway API; WaFine admin links/embeds khls for the money side.

- [ ] **API surface khls needs** (from WaFine BFF): send text/image/template, contact sync (read + label write), delivery/read status webhooks, session health.
- [ ] **Auth for khls as API client**: API key with scopes vs OAuth client-credentials; rate limits; key rotation.
- [ ] **Webhook contract**: event envelope (message.received, message.status, session.state), signing (HMAC), retry policy, at-least-once semantics + idempotency keys.
- [ ] **Admin surface in WaFine**: khls deep-links vs embedded view — decide after khls exposes its embed/auth story.
- [ ] **Data boundary**: contact PII stays in WaFine (engine truth); customer/invoice data stays in khls. Only identifiers + labels cross the boundary. Loi 09-08: consent and opt-out flags must round-trip.
- [ ] **Non-goals**: no invoicing, no customer records, no dunning logic inside WaFine.

## 2. Contacts: groups, channels, labels, import/export (end-user)

- [ ] **Address-book endpoint** (closes lane D API gap): list/search contacts, label CRUD, label assignment, contact↔WhatsApp-JID mapping.
- [ ] **Groups/channels**: read-only sync from engine first (names, members, avatars); write operations (create/manage) later — engine surface permitting (check `scripts/upstream-watch` surface tracker before committing).
- [ ] **Labels**: WaFine-owned, tenant-unique names, colors; used later by automations (TabTree) and segments.
- [ ] **vCard/CSV import**: field mapping UI, dedupe by JID/phone (E.164 normalization), label mapping on import, dry-run preview, error report.
- [ ] **vCard/CSV export**: scoped to labels/filters; excludes engine-internal fields.
- [ ] **Privacy**: import consent field mapping (Loi 09-08 alignment with khls), opt-out flag respected by all send paths.

## 3. Notifications v1

- [ ] Single `notifications` table + fan-out: channels = in-app, email (Brevo, pending ops item #47: SMTP + `mailer_autoconfirm=false`).
- [ ] System events first: engine disconnected, session limit hit, key limit, approval/waitlist events.
- [ ] Business events (message received, campaign done) ride the same table — consumers subscribe.
- [ ] Preferences surface in settings; per-event opt-out.

## 4. Webhooks out (n8n layer 1+2)

- [ ] Webhook endpoints CRUD in admin (URL, secret, event filter).
- [ ] Same event envelope as §1 (one contract, two consumers: khls + n8n).
- [ ] API completeness for n8n: scoped API keys, pagination, idempotency keys on mutations.
- [ ] Community n8n node package: post-beta.

## 5. Agents: A2A + MCP, trust model, Master Orchestrator

- [ ] **Prerequisite**: WF-058 — OAuth flow store out of in-memory Maps (`app/bff/src/adapters/http/routes/oauth.ts:104-105`) into durable storage. Blocks everything here.
- [ ] **Agent = OAuth client**: dynamic registration (`/oauth/register`), scoped tokens, send-budget limits (BFF already recognizes `MessageSendText`/`MessageSendImage`).
- [ ] **A2A**: agent card endpoint, task lifecycle mapping to engine tools.
- [ ] **MCP**: engine tools (51: 25 read / 26 write) exposed via the existing MCP surface; marketplace stub (lane D) becomes the discovery UI.
- [ ] **Audit**: agent actions attributed to the client id; audit log before any third-party agent onboarding.
- [ ] **Master Orchestrator Agent**: sketch only this wave — orchestrates sub-agents via A2A/MCP; memory/state via a second brain (design TBD: OpenViking-style store vs local). No implementation before post-beta.

## 6. TabTree embed (workflow editor)

- [ ] **Build-vs-embed resolved: embed.** WaFine automations = TabTree boards.
- [ ] Embed mechanics: auth handshake (WaFine user → TabTree session), deep-link per workflow, event bridge (WaFine webhooks → TabTree triggers).
- [ ] Upsell path: WaFine users get a TabTree workspace; commercial terms TBD (owner + TabTree side).
- [ ] Fallback: if embed auth is not ready by wave 3, ship webhooks (§4) first — they are TabTree-agnostic.

## 7. Explicitly out of scope (this doc's horizon)

- Multitenancy, org schema, white-label, B2B pricing → Q1 2027 strategy track (tracking issue created 2026-10-28).
- E2E encryption (WF-047/#67, WF-048/#68) — deferred post-beta; key-management seam to be designed so no message-table migration later.
- Referral program (#66) — deferred post-beta.

## 8. Open questions for owner

1. Khls embed story: does khls have (or plan) an embeddable/authenticated view WaFine admin can iframe/link?
2. Khls auth preference: scoped API key (simplest) vs OAuth client-credentials?
3. Master Orchestrator second brain: OpenViking as the store, or WaFine-local?
