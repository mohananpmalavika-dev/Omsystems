# Sentinel Grid / OMSystems Production Hardening Baseline

**Generated Date:** 27 Aug 2026  
**Target Scope:** Phase 0 Baseline & Readiness Map  
**Authority:** Production Hardening & Consolidation Release

---

## 1. Authoritative Architecture Authority Map

To eliminate parallel code paths and architectural drift, the single authoritative implementation for every major subsystem is defined below. All parallel/legacy files will be migrated to delegate directly to these authoritative modules and then decommissioned.

| Subsystem Domain | Authoritative Implementation | Legacy / Duplicate Locations to Decommission | Caller Migration Path |
|---|---|---|---|
| **Identity & Authentication** | `packages/identity` + `src/security/oidc-provider.ts` | `backend/src/identity/oidc-provider.ts`, `backend/src/services/identity.service.ts` | Fastify auth plugins import from `packages/identity` & `src/security/*` |
| **Authorization (RBAC/ABAC)** | `packages/authorization` | `src/auth/` scattered inline checks | Use central policy engine in `packages/authorization` |
| **Alert Deduplication** | `src/distributed-state/services/alert-deduplication.service.ts` (Redis `SET NX EX` + Lua) | `backend/src/alerts/services/alert-deduplication.service.ts`, `backend/src/services/redis-alert-deduplication.service.ts`, `src/alerts/services/ai-alert-deduplication.service.ts` | Route all alerts through distributed Redis deduplicator |
| **Media Orchestration & Viewer Capacity** | `src/media/services/media-orchestrator.ts` + `dashboard/lib/video-wall/*` | `backend/src/media/media-orchestrator.ts`, `dashboard/hooks/use-media-orchestrator.ts` | Backend uses single media orchestrator; UI uses unified hook |
| **Camera Ownership & Fencing** | `src/ha/services/camera-lease-manager.service.ts` (Epoch/TTL Lua) | Process-local `Map` locks in `backend/src/media/*` | Require `(cameraId, ownerNodeId, leaseEpoch)` on every media/recording write |
| **Recording Index** | `src/recording-index/recording-index.service.ts` | `src/media/pipeline/recording-index.service.ts`, `backend/src/recording/recording-index.service.ts` | Standardized PostgreSQL + NVMe recording index |
| **Evidence Capture Pipeline** | `recording-engine/src/alert-evidence-capture.ts` | `src/alerts/evidence-capture.ts`, `src/evidence/services/evidence-capture-pipeline.service.ts` | Control plane dispatches evidence capture job to `recording-engine` |
| **Retention & Legal Hold** | `src/retention/` | Ad-hoc retention scripts in `backend/` | Unified daily sweep with Legal Hold override |
| **Recorder Drivers** | `packages/recorder-sdk` (Hikvision, Dahua, Uniview, Generic RTSP) | Old bespoke scrapers in `src/devices/` | Use `RecorderManager` with circuit breakers |

---

## 2. Duplicate Implementation Inventory

The following parallel implementations were inventoried across `src/`, `backend/src/`, and workspace packages:

### 2.1 Alert Deduplication (5 implementations)
1. `backend/src/alerts/services/alert-deduplication.service.ts`
2. `backend/src/services/redis-alert-deduplication.service.ts`
3. `src/alerts/services/ai-alert-deduplication.service.ts`
4. `src/alerts/services/alert-deduplication.service.ts`
5. `src/distributed-state/services/alert-deduplication.service.ts` *(Authoritative)*

**Consolidation Plan:** Unify into `src/distributed-state/services/alert-deduplication.service.ts` with key format `alert:dedupe:{tenantId}:{branchId}:{cameraId}:{detector}:{objectTrackId}`. Deprecate and remove the other 4.

### 2.2 OIDC / Identity Providers (2 implementations)
1. `backend/src/identity/oidc-provider.ts`
2. `src/security/oidc-provider.ts` *(Authoritative)*

**Consolidation Plan:** Standardize on `src/security/oidc-provider.ts` (with multi-instance Redis state store and PKCE support).

### 2.3 Media Orchestration (3 implementations)
1. `backend/src/media/media-orchestrator.ts`
2. `src/media/services/media-orchestrator.ts` *(Authoritative)*
3. `dashboard/hooks/use-media-orchestrator.ts`

**Consolidation Plan:** Remove process-local global state from `backend/src/media/media-orchestrator.ts` and use `src/media/services/media-orchestrator.ts` backed by Redis epochs.

### 2.4 Evidence Capture (3 implementations)
1. `recording-engine/src/alert-evidence-capture.ts` *(Authoritative for media processing)*
2. `src/alerts/evidence-capture.ts`
3. `src/evidence/services/evidence-capture-pipeline.service.ts`

**Consolidation Plan:** Control plane delegates evidence extraction to `recording-engine` and acts as the cryptographic metadata/manifest store (`manifest.sig` + SHA-256 chain of custody).

---

## 3. Dead / Legacy / In-Memory Mock Code Inventory

1. **Stale Route Files:** `src/routes/*.disabled`, `src/maintenance/*.disabled`
2. **Mock Decoders in Backend:** In-memory maps in `backend/src/media/media-orchestrator.ts` (`decoderManagers`, `schedulers`, `cameraCapabilities`)
3. **Simulated AI Confidence Scores:** Detectors returning synthetic confidence without verified weights. Status must be updated to `MODEL_UNAVAILABLE` or `EXPERIMENTAL` when model weights are not loaded.

---

## 4. CI Workflow Discrepancy & Truthfulness Audit

### 4.1 Findings in `.github/workflows/full-test-suite.yml`
- Declares Node matrix `[18.x, 20.x]`, while root `package.json` specifies `"engines": { "node": ">=22" }`.
- References non-existent root npm scripts:
  - `npm run db:migrate` (Actual script: `npm run migrate`)
  - `npm run test:unit` (Not defined)
  - `npm run test:integration` (Not defined)
  - `npm run test:e2e` (Actual script: `npm run test:branch:e2e`)
  - `npm run test:security` (Actual scripts: `security:audit`, `security:secret-scan`)
  - `npm run test:performance` (Actual script: `test:perf:capacity`)

### 4.2 Authoritative CI Pipeline Definition (to replace outdated workflows)
A unified single-pipeline `.github/workflows/ci.yml` targeting Node 22 with deterministic stages:
```
checkout -> Node 22 -> npm ci -> secret scan -> dependency audit -> strict typecheck (all workspaces) -> build all workspaces -> smoke tests -> phase test suites -> artifact SBOM
```

---

## 5. Strict Typecheck Diagnostic Results

### 5.1 Individual Workspaces
- `@sentinel/dashboard`: **0 errors (PASS)**
- `@sentinel/edge-agent`: **0 errors (PASS)**
- `@sentinel/media-gateway`: **0 errors (PASS)**
- `@sentinel/recording-engine`: **0 errors (PASS)**
- `@sentinel/analytics-engine`: **0 errors (PASS)**
- Root `tsconfig.json`: **0 errors (PASS)**

### 5.2 Test TypeScript Suite (`tsconfig.test.json`)
Found 6 type inconsistencies to be resolved:
1. `src/config-management/routes/signed-config.routes.ts(309,89)`: TS2345 optional status in `{ error?: string; status?: "OFFLINE" | "FAILED" | "VERIFIED" }`
2. `src/config-management/routes/signed-config.routes.ts(347,7)`: TS2322 missing required `schemaVersion` in `BranchConfiguration`
3. `src/routes/integrations.routes.ts(148,55)`: TS2345 optional properties in `retryConfig`
4. `src/routes/integrations.routes.ts(177,65)`: TS2345 optional properties in `retryConfig`
5. `test/sentinel-grid-integration.test.ts(195,71)`: TS2345 missing `branchIds` in rollout configuration
6. `test/zero-touch-provisioning.test.ts(235,16)`: TS2741 missing `lastSeenAt` in `EdgeAgent` object

---

## 6. Current Test Suite Status (Smoke Test Baseline)

Ran `npm run test:smoke` against 15 test suites:
- **Test Files Passed:** 12 / 15
- **Test Files Failed:** 3 / 15 (`test/app.test.ts`, `test/enterprise-infrastructure.test.ts`, `test/operational-health.test.ts`)
- **Total Tests Passed:** 77 tests
- **Total Tests Failed:** 12 tests
- **Total Tests Skipped:** 1 test

### Key Failure Analysis:
- `test/app.test.ts`: Permission assertion mismatch (received 403 where test expected branch manager permission; domain summary count expectation 15 vs actual 16).
- `test/enterprise-infrastructure.test.ts`: Header authentication requirements and dependency path node expectations.
- `test/operational-health.test.ts`: Telemetry endpoint permissions and pagination branch count assertions.

---

## 7. P0 Blocker Status with Code Evidence

| Blocker ID | Domain | Issue Description | Direct Code Evidence | Resolution Required |
|---|---|---|---|---|
| **P0.1** | CI Truthfulness | Outdated Node versions & missing npm scripts in workflow | `.github/workflows/full-test-suite.yml:20,35,89` | Standardize CI to Node 22 with existing package scripts |
| **P0.2** | Architecture Duplication | Parallel implementations in alerts, OIDC, media, recording | `backend/src/` vs `src/` parallel service trees | Establish `ARCHITECTURE_AUTHORITY.md` and deprecate duplicates |
| **P0.3** | Distributed Deduplication | Alert deduplication across multi-instance API | `backend/src/alerts/services/alert-deduplication.service.ts` | Atomic Redis `SET NX EX` key format with Lua scripts |
| **P0.4** | Global Media State | Process-local in-memory maps for decoders & streams | `backend/src/media/media-orchestrator.ts:35-42` | Move stream leases and owner states to Redis |
| **P0.5** | Camera Ownership Fencing | Stale nodes continuing writes after lease expiration | `src/ha/services/camera-lease-manager.service.ts` | Require `(cameraId, ownerNodeId, leaseEpoch)` on all media/recording writes |
| **P0.6** | Identity Consolidation | Two parallel OIDC/auth state implementations | `backend/src/identity/` vs `src/security/` | Consolidate onto single `packages/identity` pipeline |
| **P0.7** | Storage Contract | Simulated S3 capacity and incomplete storage failover | `recording-engine/src/` storage adapters | Strict `StorageAdapter` interface with health & write probes |
| **P0.8** | Recording Correctness | Segment repair, checksums, and continuity gaps | `src/recording-index/` | 10–60s immutable segments with SHA-256 and gap tracking |
| **P0.9** | Evidence Pipeline | Fragmented evidence capture logic | `src/evidence/` vs `recording-engine/` | Forensic evidence packages with `manifest.sig` and SHA-256 |
| **P0.10** | AI Truthfulness | Synthetic confidence scores on uninitialized models | `analytics-engine/src/` | Return `MODEL_UNAVAILABLE` when weights not present |

---

## 8. Proposed Phase 1 File-by-File Change List

### 8.1 CI & Script Alignment
- `package.json`: Add unified test aliases (`test:unit`, `test:integration`, `test:e2e`, `test:security`, `test:performance`) pointing to existing vitest/tsx runners.
- `.github/workflows/ci.yml`: Update to include full multi-stage validation on Node 22.
- `.github/workflows/full-test-suite.yml`: Replace with consolidated production pipeline.

### 8.2 Typecheck Fixes
- `src/config-management/routes/signed-config.routes.ts`: Fix status and schemaVersion type bindings.
- `src/routes/integrations.routes.ts`: Make retryConfig fields complete.
- `test/sentinel-grid-integration.test.ts`: Add required `branchIds`.
- `test/zero-touch-provisioning.test.ts`: Add required `lastSeenAt`.

### 8.3 Architecture Authority Document
- `ARCHITECTURE_AUTHORITY.md`: Formalize authoritative subsystem owners and deprecation schedules.

