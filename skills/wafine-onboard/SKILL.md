---
name: wafine-onboard
description: Walk through WAFINE onboarding journey J1–J7. Use when helping someone sign up, connect their WhatsApp number, build a workflow, mint an API key, test the API, or connect Claude.
---

# WAFINE Onboard

Step-by-step assistant to guide a user through journey J1 to J7.

## Prerequisites
- Access to WAFINE web app (e.g. `https://<your-domain>`)
- WhatsApp number that has been invited (invite-only) — dedicated test number only, never a personal or production number
- scrcpy and adb installed on the recording machine (`which scrcpy adb`)
- For Claude connector: `OAUTH_ENC_KEY` configured on BFF; public MCP URL known

## J1 — Sign up (invite-only)
- **Action**: Go to sign-up/waitlist on web app. Create account.
- **Check before moving on**: Account created and can sign in.
- **If fails**: Number may not be on allowlist (`docs/08-signup-allowlist.md`). Contact admin.

## J2 — Connect number by QR
- **Action**: Sign in → go to WhatsApp sessions page (`/whatsapp`). Create a session (name `u-<userId>`). Then scan the displayed QR with WhatsApp mobile (Linked Devices).
  - For tutorial capture: mirror the owner phone to the recording machine with `scrcpy --record wafine-j2-qr-scan.mp4 --no-window --max-size 1024 --video-bit-rate 2M`, open WhatsApp → Linked Devices → Link a device on the phone, and scan the QR shown by WaFine. Stop recording after the scan. Splice the footage into the Remotion tutorial (`app/video/`).
- **Check before moving on**: Session status becomes ready and linked phone matches the invited number.
- **If fails**: If phone mismatch, BFF logs out device (phone_mismatch). Retry QR; ensure using the correct invited number.

### ⚠️ Sensitivity — WhatsApp QR codes are session secrets
- Never commit, log, or paste a WhatsApp Linked Devices QR code — it authenticates the phone to the gateway. Anyone with the QR can link the phone to their own gateway instance.
- scrcpy captures the full phone screen. Close personal messages, contacts, and notifications before recording so nothing personal ends up in the output file.
- Use a dedicated WhatsApp test number only. No bulk or cold sends; keep send pacing on (300/day UTC, 10/min default).

## J3 — Build a paced workflow
- **Action**: In web app, create a paced auto-reply workflow (PacedReplySender). Configure triggers and pacing per needs.
- **Check before moving on**: Workflow saved and enabled as intended.
- **If fails**: Review pacing/anti-ban rules (`docs/08-workflows.md`). Test with non-spammy content.

## J4 — Mint API key
- **Action**: Go to API keys page; mint a new key. Copy plaintext immediately (shown only once).
- **Check before moving on**: Key copied and stored (only hash kept server-side). Can see it listed as active (max 5).
- **If fails**: If you missed plaintext, revoke and mint new key.

## J5 — First REST call
- **Action**: Use the key to call REST API. Example: `GET <PUBLIC_API_URL>/wa/sessions` with header `X-API-Key: <key>`.
- **Check before moving on**: Returns your session(s). Only own session accessible (scoped).
- **If fails**: Verify URL and header name. Check 429 Retry-After if over budget. See `docs/09-sessions-keys-mcp.md`.

## J6 — Add WAFINE to Claude
- **Action**: Add custom connector with MCP URL `<WAFINE_MCP_URL>/mcp`. Complete OAuth consent in browser (sign in, allow). See `wafine-connect-claude` skill.
- **Check before moving on**: Connector shows connected; can see WhatsApp tools/resources.
- **If fails**: Ensure WhatsApp session ready, OAuth key set, redirect allowed. Troubleshoot per connector skill.

## J7 — Verify end-to-end
- **Action**: Send a test message via Claude (or REST `POST /wa/sessions/:id/messages/send-text`) and verify delivery/read.
- **Check before moving on**: Message delivered successfully; no 429/budget errors.
- **If fails**: Check send budget (300/day UTC, 10/min default), pacing, number status.

## References
- `docs/08-signup-allowlist.md`, `docs/08-workflows.md`, `docs/09-sessions-keys-mcp.md`, `docs/10-claude-connector.md`
