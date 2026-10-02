# Security operations rollout

Date: 2 October 2026 (Asia/Kolkata).

The Operations landing page links the existing branch health, recording recovery,
incident response, failover, banking, AI quality, edge fleet and evidence workflows.
These links expose existing modules; they do not establish hardware acceptance.

## Changes in this increment

- Health observations and quality reports are isolated by tenant and branch.
- Invalid clocks produce unknown health; delayed replay cannot overwrite newer observations.
- Recording scans merge overlapping coverage and scope segment/gap lookup to the tenant.
- The offline outbox supports a disk journal, checksum validation, interrupted-batch recovery,
  and bounded quota backpressure without evicting in-flight or protected records.
- Recovery API failures show unknown results and a last-loaded warning, rather than fabricated success.
- Banking SOP automated checks require a configured probe and evidence IDs before
  completion. Unconfigured or failed checks stay pending. Automated step dependencies
  are respected; the engine accepts an injected StepExecutorService for real integrations.

## Offline journal configuration

Set `OFFLINE_OUTBOX_JOURNAL_PATH` to a dedicated writable file on persistent local
storage. Each journal must have a single process owner. Updates write and flush a
temporary snapshot before replacement. Storage failures propagate to the caller;
they must not be acknowledged as successfully queued. Corrupt journals fail startup.
Without this variable the queue remains in memory. This journal is for the
`src/offline-sync` service; the separately implemented edge recording journal and
`src/edge-product` buffer do not automatically use it.

## Remaining work and acceptance

| Area | Existing implementation | Remaining acceptance or implementation |
| --- | --- | --- |
| Verified health | Scoped observations, freshness and dependency evaluation | Durable health projection, vendor probes and UI evidence coverage across every health path |
| Recording assurance | Recording gap ledger, retention and edge backfill | Scheduled decoded playback probes; verify recovered media rather than catalog metadata alone |
| Incident response | Investigation workspace, persistent playbooks and evidence | Real sensor/access correlation, operator permissions and end-to-end closure acceptance |
| Safe recovery | HA/failover and recording recovery modules | Device-specific bounded remediation with post-action probes and rollback |
| Banking workflows | BFSI calibration, security policies and banking playbooks | Customer-approved rule catalog and real door/duress integrations |
| AI quality | Evaluation registry, certification and camera tuning | Resolve model artifact integrity failures, then measure real day/night accuracy and false alerts |
| Edge continuity | Disk recording journal and optional durable telemetry outbox | Deploy persistent volumes; validate restart/reconnect with actual receiver persistence |
| Evidence | Signed packages, custody chain and independent verifier | Real media export, redaction and signer acceptance in the deployed environment |

The broader validation run also found an analytics model checksum mismatch and
legacy playbook tests assuming fabricated branch/access responses. A durable
playbook test expects labels from an older SOP definition. These failures remain
visible; model manifests have not been rewritten to bless unverified artifacts.

Do not claim all eight areas newly implemented, production accepted, or industry-first.
No production deployment or real notification/device action was performed by this increment.

## Validation

Five selected suites passed, 26 tests total: operations reliability, offline edge
survivability, recording gap/backfill, AI quality and independent evidence verification.
These are local tests with fixtures; they do not prove live model accuracy or delivery.
The broader banking and playbook failures described above remain unresolved.
