---
title: Operational cadence
description: "When the agent does scheduled work: daily briefings, end-of-day dossier maintenance, weekly audits. If you also use GBrain, note its sync/dream cadence here."
---

# Heartbeat

## Daily

- **Morning briefing** (ad-hoc agent prompt, or `gbrain briefing` if you run GBrain): today's calendar + per-attendee dossier context.
- **End of day**: ingest the day's meeting notes; ask an agent to extract entity mentions and update dossiers.

## Nightly (optional GBrain automation)

- If you run Garry Tan's `gbrain`, note the `sync` / `dream` cadence here so OK users know when the engine re-indexes this Markdown vault.

## Weekly

- Audit: dossiers untouched in 30+ days, contradictions between compiled-truth and recent timeline entries.

## Monthly

- Run OK's `links({ kind: "dead" })` across the vault. Triage redlinks into new entities (agents create dossiers through OK), typo fixes (OK edits in place), or removal (drop the link; a tracked task captures any future-doc intent).

