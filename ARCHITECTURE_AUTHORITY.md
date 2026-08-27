# Sentinel Grid / OMSystems Architecture Authority

**Effective Date:** 27 Aug 2026  
**Status:** Authoritative Standard  
**Mandate:** Every domain must have exactly one production codepath. Parallel implementations are strictly prohibited.

---

## 1. Authoritative Domain Ownership Map

| Subsystem Domain | Authoritative Package / File | Deprecated / Disallowed Parallel Paths | Migration Policy |
|---|---|---|---|
| **Identity & Authentication** | `packages/identity` & `src/security/oidc-provider.ts` | `backend/src/identity/oidc-provider.ts`, `backend/src/services/identity.service.ts` | All auth flows import directly from `packages/identity` & `src/security/*` |
| **Authorization (RBAC / ABAC)** | `packages/authorization` | Scattered inline role checks in `src/auth/*` | All route handlers enforce policy via `packages/authorization` |
| **Alert Deduplication** | `src/distributed-state/services/alert-deduplication.service.ts` | `backend/src/alerts/services/alert-deduplication.service.ts`, `backend/src/services/redis-alert-deduplication.service.ts`, `src/alerts/services/ai-alert-deduplication.service.ts`, `src/alerts/services/alert-deduplication.service.ts` | All detectors and APIs publish to distributed Redis deduplicator with format `alert:dedupe:{tenantId}:{branchId}:{cameraId}:{detector}:{objectTrackId}` |
| **Media Orchestration & Viewer Budgeting** | `src/media/services/media-orchestrator.ts` + `dashboard/lib/video-wall/*` | `backend/src/media/media-orchestrator.ts`, `dashboard/hooks/use-media-orchestrator.ts` | State lives in Redis leases and epochs; UI hooks use unified stream manager |
| **Camera Ownership & Fencing** | `src/ha/services/camera-lease-manager.service.ts` | In-memory process `Map` locks | Every media/recording write operation must supply `(cameraId, ownerNodeId, leaseEpoch)` |
| **Recording Index** | `src/recording-index/recording-index.service.ts` | `src/media/pipeline/recording-index.service.ts`, `backend/src/recording/recording-index.service.ts` | Unified PostgreSQL + NVMe recording index with gap and continuity tracking |
| **Evidence Capture** | `recording-engine/src/alert-evidence-capture.ts` (Media) + `src/evidence/` (Metadata) | `src/alerts/evidence-capture.ts` | Control plane dispatches capture jobs; recording-engine produces signed forensic packages (`manifest.sig` + SHA-256) |
| **Retention & Legal Hold** | `src/retention/` | Ad-hoc cleanup scripts | Hierarchy enforced: `Legal Hold > Camera Policy > Branch Policy > Org Policy` |
| **Recorder Drivers** | `packages/recorder-sdk` | Legacy scrapers in `src/devices/` | Use `RecorderManager` with protocol drivers (Hikvision, Dahua, Uniview, ONVIF, RTSP) |
| **Digital Twin & Topology** | `src/digital-twin/` | `backend/src/digital-twin/` | Unified device, branch, and network dependency graph |

---

## 2. Core Architectural Invariants

1. **Zero Process-Local State for Global Truth**: Camera ownership, viewer counts, stream leases, and recording locks must reside in Redis with lease epochs. In-memory `Map` is strictly permitted only for browser-local UI or short-lived per-process socket instances.
2. **Strict Fencing on Media/Recording Writes**: A node with an expired epoch (`currentEpoch < activeEpoch`) is immediately rejected by the storage and media layers.
3. **No Synthetic / Fabricated Runtime Data**: AI detectors without loaded weights must return `status: "MODEL_UNAVAILABLE", confidence: null`. Never manufacture confidence scores or fake S3 capacity metrics.
4. **Immutable Recording Segments**: Video segments (10–60s) must be sealed with SHA-256 checksums upon creation and verified before indexing.
5. **Node.js 22 Runtime Standard**: All production containers, local scripts, and CI pipelines run exclusively on Node.js 22.x.

