# Phase 0 Runtime Baseline

## Decision

The authoritative production API is the Fastify control plane built from `src/index.ts` and `src/app.ts`.

- API framework: Fastify
- Canonical data contract: `ControlPlaneStore`
- Canonical persistent implementation: PostgreSQL repositories under `src/database/`
- Canonical migrations: ordered SQL under `database/migrations/`
- Browser boundary: Next.js BFF under `dashboard/app/api/control/[...path]/route.ts`
- Media: `media-gateway/`
- Branch process: `edge-agent/`
- Analytics adapter: `analytics-engine/`

New production routes must be registered by `buildApp`, represented in the OpenAPI baseline, accessed by the dashboard through `/api/control/*`, and covered by a smoke or integration test.

## Quarantined code

`backend/` is an unbootstrapped Express-era implementation tree. It has no package manifest or server entry point and is not deployed. Its code is reference material only until ported to the Fastify/runtime conventions above. The incomplete Operational Health navigation entry is hidden until its APIs are ported; existing pages remain available to support that later port.

Do not import `backend/` code from production workspaces and do not add migrations under `backend/prisma/migrations/` to a release. Port each feature and its tests into the canonical paths instead.

## Backend disposition inventory

| Disconnected artifact | Disposition |
|---|---|
| `branch-health.routes.ts`, `branch-health-scoring.service.ts` | Port in Phase 1 into Fastify routes and canonical repositories |
| `branch-comparison.routes.ts`, `branch-comparison.service.ts` | Defer until the Phase 1 health projection is authoritative |
| `bulk-config.routes.ts`, `bulk-branch-config.service.ts` | Port after branch/device policy contracts stabilize |
| `camera-status-api.ts`, `camera-monitor.service.ts`, `camera-recovery.service.ts`, `stream-health-analyzer.service.ts` | Reconcile with edge heartbeat and active camera APIs; port tested logic only |
| `central-monitoring.routes.ts`, `central-monitoring-station.service.ts` | Port in Phase 3 against active analytics alerts/incidents |
| `dashboard.routes.ts`, `dashboard.service.ts` | Replace with canonical summary projections; do not add a second dashboard model |
| `external-notifications.routes.ts`, `external-notification.service.ts` | Replace stubs with the durable Phase 3 notification outbox/provider workers |
| `geospatial-map.routes.ts`, `geospatial-map.service.ts` | Defer until branch coordinates and health projection are canonical |
| `integration*.routes.ts`, `integration-gateway.service.ts`, `integration-rules-engine.service.ts`, connector services | Defer and port connector-by-connector with security tests |
| `operational-health.routes.ts`, `operational-health.service.ts` | Port in Phases 1-2; this is the source of the currently quarantined Operations UI contract |
| `recording-verification-api.ts`, `recording-verification.service.ts` | Reconcile with active recording engine and repositories; port in Phase 1 |
| `reports.routes.ts`, `reports.service.ts` | Replace/merge into active `src/routes/reports.routes.ts`; no duplicate reporting API |
| `retention-verification-api.ts`, `retention-verification.service.ts` | Unreviewed worktree addition; integrate only after canonical migration/API review |
| `storage-monitoring.service.ts` | Reconcile with active recording storage nodes before porting |
| `realtime-event-publisher.service.ts`, `websocket-manager.service.ts` | Port the event contract after authentication is implemented; dashboard adapter already expects authenticated Socket.IO |
| `zero-touch-provisioning.service.ts` | Defer; replace simulated steps with edge-agent workflow before porting |

## Release gates

`npm run ci:phase0` is the local and CI baseline:

1. Typecheck the root and every production workspace.
2. Build the root and every buildable production workspace.
3. Run the active-contract smoke suite for authentication, authorization, inventory, maintenance, live media, analytics ingestion, and dashboard proxies.
4. In CI, apply and validate canonical database migrations against PostgreSQL 16.

The historical full `npm test` suite is retained as a debt signal. It is not the release gate until outdated recording API tests are reconciled with the current implementations; failures must not be silently skipped or deleted.

## Current limitations retained intentionally

- Missing analytics model artifacts and optional AI-search dependencies are reported as degraded/unavailable. Optional modules no longer prevent the core normalized frame pipeline from starting.
- Simulation-mode detectors are not production inference claims.
- Realtime operational health is not active until the WebSocket publisher is ported into Fastify.
- `backend/` migrations are not part of the migration runner.

