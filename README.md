# owa — WaFine's fork of OpenWA

A thin, patched fork of [`rmyndharis/OpenWA`](https://github.com/rmyndharis/OpenWA) maintained by
[WaFine](https://github.com/zawia-tech/wafine), kept as a public mirror for review.

- `main` — a mirror of upstream `main` at the time of publication (v0.25.0 era).
- `wafine/v0.25.0` (default) — **upstream tag v0.25.0 + the WaFine patch set**. Start reading at
  [`PATCHES.md`](./PATCHES.md): what is dropped, why, the API consequences, and the per-release
  rebase process (`git rebase --onto` + `git range-diff`).

## Why a thin fork

WaFine (the WaFine gateway BFF/cloud product) operates the OpenWA engine with a specific runtime
shape (queue off, no plugins deployed, no stored-template flows, single-tenant-per-engine). Rather
than carrying a parallel tree, the fork tracks upstream tags and carries only a handful of
commits per release:

1. **Patch 1 (on `wafine/v0.25.0`)** — drop template/automation/takeover modules; uncouple the
   optional durable-queue wiring; remove the `send-template` route and the automation tool family.
2. Later patches (tracked in `zawia-tech/wafine` WF-013): plugin/ingress slimming, infra-module
   drop, dashboard build skip, single engine, keys-in-data-DB.

Upstream drift that touches the routes the BFF calls fails CI in the wafine repo
(`scripts/check-upstream-surface.mjs`), and new upstream releases/security advisories are watched
by `scripts/upstream-watch`.

## License

MIT — identical to upstream (`LICENSE` retained verbatim, © Yudhi Armyndharis and OpenWA
Contributors). This fork adds no additional licensing terms.
