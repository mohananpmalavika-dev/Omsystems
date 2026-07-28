# Phase 3 HO Alert Command Center

## Delivered

- `/v1/alerts/command-center` provides one authorized HO-wide queue enriched
  with branch, camera, detection, evidence, SLA and notification delivery data.
- `/v1/alerts/events` streams tenant-isolated alert creation, transition and
  delivery events. The dashboard retains a 30-second resynchronization fallback.
- The command-center UI provides priority counts, an urgent P1/P2 popup,
  operator-enabled sound with repeating P1 audio, snapshot/clip links, protected
  live-view startup, SLA countdown and acknowledge/assign/escalate actions.
- Analytics cooldown and source-event idempotency control duplicate storms.
  Alert versions and row locks ensure only one acknowledgement wins.
- Migration 028 adds assignment, SLA and version state plus a durable provider
  outbox with retry schedule, attempts, provider IDs, receipts and errors.
- The fixed client matrix is enforced server-side:
  - P1: dashboard, SMS, email and voice;
  - P2: dashboard and email;
  - P3: dashboard only;
  - P4: system log only.
- Recipient groups, on-call schedules, quiet-hour metadata, rate limits and
  escalation timers are tenant-persistent. P1 is never removed from the fixed
  channel matrix.
- SMS, email and voice use real configurable HTTP provider boundaries via
  `ALERT_SMS_WEBHOOK_URL`, `ALERT_EMAIL_WEBHOOK_URL` and
  `ALERT_VOICE_WEBHOOK_URL`. `ALERT_PROVIDER_TOKEN` is sent as a bearer token.
  Providers can post delivery state to the protected receipt endpoint.

## Operations

The built-in worker drains pending/failed outbox records every five seconds.
An external worker can also call `/internal/alerts/notifications/drain` using
`x-alert-worker-key`; configure `ALERT_WORKER_SHARED_KEY`. Retries use bounded
exponential backoff and become dead after five attempts.

Snapshots and clip references supplied by the analytics/recording adapters are
displayed alongside live video. Protect-window rules continue to create a legal
hold-backed incident when the detection is ingested.

## Verification and field acceptance

`npm run ci:phase3` runs the complete Phase 0-2 gate plus matrix, delivery audit,
tenant isolation, enriched queue, notification policy and acknowledgement race
tests.

Provider credentials, client recipient groups and the final alert catalog are
deployment inputs. The contractual p95 alert latency, P1 notification under 30
seconds, real snapshot/clip generation, provider delivery receipts, duplicate
burst limits and multi-replica event propagation must be measured in the pilot.
The in-process SSE fan-out should be replaced with the deployment message bus
when more than one control-plane replica is enabled.
