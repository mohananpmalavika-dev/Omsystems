# Phase 5 field support runbook

## First response

1. Confirm `/health` and `/ready`; compare `/metrics` request errors, p95/p99 and backpressure rejections.
2. Identify affected tenant, region and branch. Never request camera passwords or expose secret references in a ticket.
3. Check edge-agent freshness, WAN status, recorder/HDD state, recording retention and notification delivery attempts.
4. Preserve alert IDs, correlation IDs, timestamps and artifact checksums before changing state.

## Branch offline

- Verify power/UPS, router reachability and edge-agent process locally.
- Do not repeatedly re-register an existing agent. Restore connectivity and allow its idempotent replay queue to drain.
- Escalate when the branch remains offline past the agreed SLA or replay acceptance is below 99%.

## Platform saturation

- If backpressure rejections rise, stop nonessential exports and enrollment, retain alert/telemetry ingestion, and verify HPA plus database pool saturation.
- Scale only within the tested HPA range. Do not bypass query timeouts or raise pool size without checking database connection capacity.

## Security incident

- Revoke affected sessions/keys, preserve append-only audit evidence, rotate the secret through the configured secret manager and restart workloads gradually.
- Do not edit audit rows. Validate the audit hash chain and open an evidence case.

## Handoff record

Capture incident commander, start/end time, affected scope, observed metrics, actions, image/database versions, recovery validation, RPO/RTO and follow-up owner.
