# 16 — Uptime, health probes and METRICS_TOKEN (WF-032)

Three layers, each with its own job:

1. **Container healthchecks** (already running): openwa-api, cloudflared, caddy, redis and the
   BFF image all define Docker healthchecks; compose restarts or unhealthy status show in
   `docker ps`.
2. **Nightly probes** (already running): the `nightly-health` GitHub workflow keeps the free
   Supabase project awake, records a snapshot in `ops.health_snapshots` and fails the run when a
   probe fails — GitHub's own failure notification is the alert.
3. **External uptime monitor** (owner step): a hosted HTTPS checker pinging the public URLs every
   1–5 minutes, alerting the owner's phone/email within minutes. Provider is the owner's
   choice (Better Stack / UptimeRobot / Pingdom / Grafana Cloud / self-hosted — anything that can
   check a URL and send a push or email), the setup below is provider-agnostic.

## Probe matrix

| Surface | URL | Auth | Exists when |
| --- | --- | --- | --- |
| BFF liveness | `https://api.<zone>/health` + on-VM `http://127.0.0.1:4000/health` | public by design | always (tunnel rule publishes only the BFF) |
| BFF readiness | `https://api.<zone>/health/ready` + on-VM `http://127.0.0.1:4000/health/ready` | public by design | always; 200/503, 503 lists the down deps |
| Web | `https://app.<zone>/` | public | always (Vercel) |
| Gateway health | `http://127.0.0.1:2785/api/health/ready` | public (no credential) | on VM; `gateway.<zone>` exists only while the tunnel's `var.gateway_public` is true |
| Prometheus metrics | `GET /api/metrics` (gateway or loopback) | `Authorization: Bearer <METRICS_TOKEN>`; **404 while the token is unset** | disabled = safe default; enable only once the token is stored |

What `/health/ready` checks (app/bff): the **required** probe is the gateway (`openwa` — reachable
and the API key valid). Queue/MCP/skills probes are reported but not required, so a degraded queue
does not page — it shows in the 503 body.

## 1. Nightly workflow (owner step, variables only)

`HEALTH_URL_*` are **repository variables** (Settings → Secrets and variables → Actions →
Variables): unset targets are skipped, so until these are set the nightly only keeps Supabase
awake and writes snapshots.

```bash
# NEXT-ACTION (owner): repo variables — one per public surface, exactly as below
gh variable set HEALTH_URL_WEB    --repo zawia-tech/wafine --body "https://app.example.com/"
gh variable set HEALTH_URL_API    --repo zawia-tech/wafine --body "https://api.example.com/health"
# set GATEWAY only if the gateway host is actually public (gateway_public terraform var)
gh variable set HEALTH_URL_GATEWAY --repo zawia-tech/wafine --body "https://gateway.example.com/api/health"

# NEXT-ACTION (owner): watch the first 3 nights — the WF-032 deliverable is 3 green nights in a row
gh run list --repo zawia-tech/wafine --workflow nightly-health --limit 10

# NEXT-ACTION (owner): confirm the alert actually reaches you — GitHub Actions failure
# notifications (default on) are the alert channel for this workflow; check
# github.com/settings/notifications has "Actions" updates on.
```

A failed probe marks the run failed AFTER the Supabase snapshot row is written, so the snapshot
history always shows which target failed and with which HTTP code.

## 2. External monitor (owner step)

Configure generic HTTP(S) checks against the **public api host** (this exercises the whole chain:
Cloudflare edge → tunnel → BFF → gateway, so it is the check that pages):

| Check | Expect | Interval | Alert |
| --- | --- | --- | --- |
| `https://api.<zone>/health` | HTTP 200 | 1–5 min | on 2‑consecutive failures |
| `https://app.<zone>/` | HTTP 200 | 1–5 min | on 2‑consecutive failures |
| `https://api.<zone>/health/ready` | HTTP 200 | 1–5 min | warn only (a dead gateway makes it 503 with `openwa: down`) |

The loopback check `/health/ready` on `127.0.0.1:4000` via SSH adds the "is the BFF itself up
when the edge/tunnel is down?" distinction; hosted checkers that support SSH/exec can run:

```bash
ssh <vm-host> 'curl -fsS http://127.0.0.1:4000/health/ready'
curl -fsS http://127.0.0.1:2785/api/health/ready   # gateway loopback, no host port involved
```

If the chosen provider cannot exec commands, the same distinction is available from a small VM
cron (same pattern as the backup cron in `scripts/deploy.sh`); it is a local signal filed next to
the backup log for the owner's spot-check, not a replacement for the hosted pager:

```cron
# NEXT-ACTION (owner, VM): optional — record loopback failures with a cron MAILTO or logger
*/5 * * * * ubuntu curl -fsS http://127.0.0.1:4000/health/ready || logger -t wafine-health "BFF loopback check FAILED"
```

Target: the issue's 99% availability — budget ≈ 438 min of downtime per month; a 2-minute monitor
interval keeps detected-downtime inside that budget even with pagers asleep.

## 3. METRICS_TOKEN (owner step; the in-repo part is already done)

`METRICS_TOKEN` gates only the Prometheus scrape `GET /api/metrics` of the **OpenWA engine** (the
BFF exposes no metrics endpoint of its own — its status surface is `/health` and
`/health/ready`). With the token unset the endpoint is disabled (404) — that is the intended
default; do not enable it until a scraper exists and stores the token as a secret.

```bash
# NEXT-ACTION (owner): generate a long-random token and store the VALUE once, in pass
#   (entry name convention, not the value:  wafine/ops/metrics-token — adjust to the pass tree)
openssl rand -hex 32 | pass add -m wafine/ops/metrics-token
# NEXT-ACTION (owner, VM): enable the scrape
echo "METRICS_TOKEN=$(pass show wafine/ops/metrics-token)" >> /opt/wa/stack/.env  # value lives in pass, never printed elsewhere
./stack/wa up -d openwa-api
# NEXT-ACTION (owner): verify the three states — unset=404, set-without-bearer=401, with-bearer=200
curl -s -o /dev/null -w '%{http_code}\n' https://gateway.example.com/api/metrics                      # 404 …102…
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer wrong"  https://gateway.example.com/api/metrics   # 401
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $(pass show wafine/ops/metrics-token)" https://gateway.example.com/api/metrics  # 200
```

The gateway endpoint is reachable publicly only while `var.gateway_public` is true; otherwise
scrape over the tailnet or from loopback (`http://127.0.0.1:2785/api/metrics` from the VM or a
Tailscale-only node). Failed token attempts are rate-limited by the engine (10/min per client).

## Scope note

This PR is docs + `stack/.env.example` only: `METRICS_TOKEN` is already forwarded to
`openwa-api` by the upstream `OpenWA/docker-compose.yml`, the token gating lives upstream in
OpenWA (constant-time compare, disabled-when-unset), and the BFF is untouched.
