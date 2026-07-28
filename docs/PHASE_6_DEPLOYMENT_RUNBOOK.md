# Phase 6 production deployment

## Preflight

1. Pin the tested container as `IMAGE_DIGEST=sha256:...`; mutable tags are rejected.
2. Supply `SCALE_EVIDENCE_FILE`, `UAT_SIGNOFF_FILE`, `SECURITY_SIGNOFF_FILE` and a backup manifest created in the last 24 hours.
3. Run `npm run release:preflight`. This performs no cluster mutation.
4. Confirm Kubernetes context, namespace `sentinel`, secret-manager synchronization, RWX report storage, backup storage, Prometheus Operator and ingress certificate.
5. Verify the previous image digest and on-call incident commander are recorded.

## Promotion

After change approval, run `npm run release:production`. The guarded command applies the manifests, sets the immutable image digest and waits up to ten minutes for rollout health. Observe readiness, 5xx rate, p95/p99, backpressure, database connections, notification queue and health freshness through the agreed soak window.

## Rollback

Set `INCIDENT_ID`, pause branch enrollment and nonessential exports, then run `npm run release:rollback`. The command requires explicit confirmation, rolls back only `deployment/control-plane`, and waits for health. Preserve queues and evidence. Database restoration is a separate incident-commander decision and must use the Phase 5 restore drill.

## Completion record

Capture digest, migration version, change/incident IDs, approvers, timestamps, dashboard snapshot, smoke/UAT results, rollback decision and deviations. Production deployment itself remains an external controlled action and is never executed by CI.
