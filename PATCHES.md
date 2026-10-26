# WaFine patch set over upstream OpenWA

Fork: `zawia-tech/OpenWA` (upstream `rmyndharis/OpenWA`). Each upstream release gets a branch
`wafine/vX.Y.Z` that starts exactly at the upstream tag and carries the patch commits beneath it.
Tracking for new releases/advisories lives in `zawia-tech/wafine` (WF-015 `scripts/upstream-watch`).

## Why a thin fork

Option A of the fork proposal (`auxdocs/research/openwa-fork/fork-proposal.md` in the wafine hub):
keep all upstream tools so rebase stays mechanical, carry only the few commits WaFine needs on
top of each release. Every patch below is written so a future `git rebase --onto vX.Y.Z` /
`git range-diff` re-verification is a near-mechanical task (which also keeps the no-patch
`main` mirror usable for fresh rebases).

## Patch set on `wafine/v0.25.0`

### Patch 1 — drop unused feature modules (commit `d11e85d`)

- `app.module.ts`: TemplateModule, AutomationModule, TakeoverModule, IntegrationModule no longer
  registered; the `QUEUE_ENABLED` conditional inlined against the runtime state WaFine ships
  (queue disabled).
- Conditional QueueModule requires removed from webhook, metrics and infra modules. Metrics'
  queue reporting and infra JOB counts were `@Optional`/derived, so the loss is a missing metric,
  not a missing feature.
- Message module: `POST /sessions/{id}/messages/send-template` removed with its DTO and service
  method. The bulk send keeps the shared `{{var}}` interpolation (`common/utils/template-render`),
  but rendering a *stored* template is gone.
- Session module: AutomationModule import and the optional autoreply evaluation hook in
  `MessageProjector` removed.
- Agent tools: automation tool family removed (`MessageAutomation*` tools disappear from the
  tool registry).
- Deleted from the tree: `src/modules/template`, `src/modules/automation`,
  `src/modules/takeover`.

**Kept on disk but not mounted** (still referenced by `core/plugins`, which is upstream-
maintained and only inert when no plugins run):
`src/modules/integration` (conversation-mapping entity/service/constants),
`src/modules/queue` (`IngressJobData` type import). A later patch may slim `core/plugins`
itself once the plugin runtime is confirmed unnecessary for WaFine.

### Consequences for API consumers

- The engine's `/api/templates` CRUD and `/sessions/{id}/messages/send-template` are gone from
  this fork. The WaFine BFF never called either (verified against
  `app/bff/src/infrastructure/gateway/openwa-http-client.ts`); only a `/wa/`-passthrough tenant
  calling them directly would notice. Surface drift is policed by WF-014
  (`scripts/check-upstream-surface.mjs`), so a later accidental drop of a BFF-consumed route
  fails CI.
- `QUEUE_ENABLED=true` no longer activates the durable webhook queues: correctness mode returns
  to the in-process at-most-once path (which is what the compose stack was shipping already).
- Autoreply rules and takeover-behavior (peer crash adoption) come back only by rebasing onto a
  non-patch upstream build.

## Rebase process (per upstream release, e.g. v0.26.0)

```bash
git fetch origin --tags
git branch wafine/v0.26.0 v0.26.0            # start new patch branch at the tag
git checkout wafine/v0.26.0
git rebase --onto v0.26.0 v0.25.0 wafine/v0.25.0   # replay patch commits
git range-diff v0.25.0...wafine/v0.25.0 v0.26.0...wafine/v0.26.0
```

Mechanical checklist upstream each release (same shape as WF- procedures):
1. `scripts/check-upstream-surface.mjs` against the fresh submodule tag (manifest is the BFF's
   consumed routes; failing output names exactly the route-level changes to vet).
2. `git range-diff` per patch to prove the series still covers what upstream moved.
3. `npm install && npx nest build` from the patch branch; then the compose-stack journey in
   `zawia-tech/wafine` against the rebuilt engine image.
4. Tag-tracking issue is the receipt: close the WF-015 issue for that release once the pin in
   `wafine` moves and the image ships.

## Deferred patches (tracked in WF-013 comment thread)

2. Docker/Infra module slimming — heavy infra surgery, deferred.
3. Dashboard build skip (affects images only, not compile).
4. Single engine (Baileys-only?). Intended but requires runtime session journeys to vet.
5. Keys-in-data-DB (moves api-key rows out of main.sqlite into the pluggable data store).
