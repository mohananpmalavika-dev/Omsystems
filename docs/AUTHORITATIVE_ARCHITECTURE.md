# Sentinel Grid / KryptoVision — Authoritative Architecture Specification

> **Status**: MANDATORY ARCHITECTURAL STANDARD  
> **Effective Date**: September 2026 | **Target**: 100/100 Production Readiness  
> **Inviolable Rule**: Exactly ONE Authoritative Implementation per Production Domain. Parallel implementations, duplicate business logic, and in-memory mocks in production are strictly forbidden.

---

## 1. Domain Ownership & Single Authoritative Implementation Matrix

| Domain | Authoritative Implementation | Primary Consumers | Deprecated / Disallowed Parallel Paths | Migration Status | Removal / Deprecation Criteria |
|---|---|---|---|---|---|
| **Identity & Authentication** | `src/identity/` + `packages/identity` | API Gateway, WebSocket server, Control Plane routes | `backend/src/identity/`, `backend/src/services/identity.service.ts` | **MIGRATED** | All auth flows strictly use SAML 2.0 (`@node-saml/passport-saml`), OIDC (`openid-client`), mTLS, and durable RBAC/ABAC policy engine. |
| **Users & Multi-Tenancy** | `src/domain/`, `src/database/tenant-isolation.ts`, `packages/authorization` | Control Plane store, route middleware | Custom ad-hoc tenant filter functions in legacy routes | **MIGRATED** | Enforced via PostgreSQL Row-Level Security (RLS) policies and tenant context injection in `src/app.ts`. |
| **Devices & Recorders** | `src/recorders/` + `packages/recorder-sdk` | Edge agent, device inventory routes, video wall | `src/devices/` (legacy mock scrapers), `backend/src/services/security-device*.service.ts` | **CONSOLIDATED** | Native protocol drivers (Hikvision ISAPI, Dahua CGI/RPC, CP PLUS Indigo/Orange, ONVIF Profile S/G/T, Generic RTSP). Zero mock device state. |
| **Cameras & Inventory** | `src/services/device-configuration.service.ts`, `src/database/` | Branch command center, mosaic, live streaming | Unpersisted camera maps | **MIGRATED** | Persistent PostgreSQL camera catalog with channel mapping, capability tagging, and credential vault. |
| **Media Orchestration & Budgeting** | `src/media/` (`services/media-orchestrator.ts`) | Fastify media routes, WebRTC/HLS stream manager | `backend/src/media/`, `dashboard/hooks/use-media-orchestrator.ts` | **MIGRATED** | All stream leases, viewer counts, and node epochs reside in Redis with lease epochs (`currentEpoch >= activeEpoch`). Process-local `Map` forbidden in production. |
| **Recording Engine & Continuity** | `src/recording/` + `src/recording-index/` | Video playback, recording continuity ledger, audit vault | `src/media/pipeline/recording-index.service.ts`, `backend/src/recording/` | **MIGRATED** | Unified PostgreSQL + NVMe/S3 recording index with millisecond-accurate gap tracking, retention legal holds, and SHA-256 segment sealing. |
| **Video Playback & Export** | `src/playback/`, `packages/offline-player` | Operator investigation UI, evidence export | Ad-hoc stream replay scripts | **MIGRATED** | Multi-camera synchronized playback with NTP drift compensation and tamper-evident container export. |
| **Evidence & Chain of Custody** | `src/evidence/` + `packages/evidence-verifier/` | Forensic evidence vault, court export, audit compliance | `src/alerts/evidence-capture.ts`, `backend/src/evidence/` | **MIGRATED** | Asymmetric digital signing (Ed25519 / RSA-PSS). Tamper detection fails closed emitting `INTEGRITY_FAILURE`. Standalone CLI verifier. |
| **Incidents & SOP Playbooks** | `src/incidents/` | Security operations command center, escalation worker | In-memory playbook repositories, `backend/src/incidents/` | **MIGRATED** | Durable PostgreSQL playbooks, step timers, audit trail, and multi-stage escalation policies. |
| **Alert Engine & Deduplication** | `src/alerts/` (`AlertOperationsService`, `AlertNormalizerService`, `AlertDeduplicationService`) | Alert command center, notification outbox | `backend/src/alerts/`, `backend/src/services/alert-*.service.ts` | **MIGRATED** | Deterministic P1-P4 classification, contextual severity (e.g. vault camera down is P1), deduplication, cooldown, and >95% alert storm suppression. |
| **Notification Engine** | `src/notifications/` | Alert operations, SMS gateway, voice synthesizer | `backend/src/notifications/`, legacy FCM server key, simulated mobile dispatch | **MIGRATED** | OAuth2 FCM HTTP v1, APNs HTTP/2 JWT, RFC 8291 Web Push, transactional outbox retry queue with exponential backoff. |
| **Privacy Governance & Redaction** | `src/privacy/` | Video export, live stream masking, audit log | In-memory privacy stores, unpersisted override singletons | **MIGRATED** | Fail-closed PostgreSQL audit store (`PRIVACY_AUDIT_STORE_UNAVAILABLE`). Zero unmasked playback without audit logging. |
| **AI Quality Control Plane** | `src/ai-quality/` + `src/ai/` | AI evaluation engine, model manager, inference pipeline | `backend/src/ai/`, unpersisted AI quality facades | **MIGRATED** | Truthful runtime status (`AVAILABLE`, `DEGRADED`, `MODEL_UNAVAILABLE`, `NOT_CONFIGURED`, `INFERENCE_FAILED`, `DISABLED`). Zero synthetic detections. |
| **Analytics Engine** | `analytics-engine/` (ONNX Runtime Node.js) | Edge frame analysis, camera worker threads | Ad-hoc Python scripts, mock classifiers | **MIGRATED** | YOLOX Tiny, YuNet, SFace, LPD-YuNet, CRNN, PULC Safety Helmet run locally via ONNX Runtime without cloud dependencies. |
| **Digital Twin & Floor Plan** | `src/digital-twin/` | 3D visual command center, branch health mosaic | `backend/src/services/digital-twin*.service.ts` | **MIGRATED** | Spatial sensor bindings, camera FOV cones, and multi-floor state management backed by PostgreSQL. |
| **Branch Health Scoring** | `src/operational-health/`, `src/branch-mosaic/` | Executive dashboard, branch operational snapshot | `backend/src/services/branch-health-scoring.service.ts` | **MIGRATED** | Mathematical scoring (0-100) derived from measured camera health, DVR status, network latency, and retention compliance. |
| **Predictive Health & Failure Risk** | `src/services/predictive-health/` | Maintenance scheduling, morning health digest | `backend/src/services/failure-prediction-engine.service.ts` | **MIGRATED** | Failure prediction for HDD smart telemetry, camera degradation, and packet loss with explainable contributing signals. |
| **Natural Language Video Search** | `src/services/ai-video-search.ts`, `src/services/video-search-integration.ts` | Operator investigation search bar | Mock keyword regex searchers | **MIGRATED** | Deterministic translation of natural language queries to metadata and temporal filters over verified detections. |
| **AI Investigation & Incident Summary**| `src/services/ai-investigation-report.ts`, `src/services/ai-incident-summary.ts` | Incident post-mortem, executive audit reports | Generic template string interpolators | **MIGRATED** | Deterministic timeline synthesis linking correlated cameras, sensor events, evidence clips, and risk scores. |

---

## 2. Architectural Boundary Rules

The system strictly enforces a layered architecture:

```text
       UI / Presentation Layer (Dashboard, Mobile, Video Wall)
                                  ↓ [HTTP / WebSocket / TLS]
       Application / API Gateway Layer (Fastify, Authentication, Route Handlers)
                                  ↓ [DTOs / Validated Contracts]
       Domain Services Layer (Alerts, Evidence, Recording, Media, AI, Privacy)
                                  ↓ [Interfaces / Repositories]
       Infrastructure Layer (PostgreSQL, Redis Leases, S3 / NVMe Storage, MediaMTX)
```

### Prohibited Architectural Violations (Automated in CI):
1. **No UI-to-Database Direct Access**: Next.js dashboard code must never import `pg`, database pools, or internal database repositories directly. All access must proceed through authorized API routes.
2. **No Domain-to-UI Inversion**: Core domain services in `src/` must never import from UI packages or Next.js components.
3. **No Legacy Backend Contamination**: No production module in `src/` may import from `backend/src/`.
4. **No Process-Local State for Global Truth**: Camera leases, stream allocations, active viewers, and distributed locks must reside in Redis with lease epochs.
5. **No Synthetic Runtime Data**: Detectors without model weights report `MODEL_UNAVAILABLE`, not fabricated detections. Recorders without connection report `NOT_CONNECTED`, never synthetic `HEALTHY`.

---

## 3. Authoritative Composition Root

All application services, repositories, database connection pools, and protocol adapters are assembled through a single authoritative composition root:

```text
src/bootstrap/index.ts (ApplicationBootstrap.bootstrap())
       ├── databaseModule (PostgreSQL connection pool with TLS)
       ├── redisModule (Redis client for distributed state & stream leasing)
       ├── identityModule (Central audit & authentication)
       ├── mediaModule (MediaOrchestrator)
       ├── recordingModule (Continuous recording ledger & recovery)
       ├── evidenceModule (Cryptographic forensic evidence pipeline)
       ├── incidentModule (Playbook engine & alert escalation)
       ├── analyticsModule (AI Quality platform facade)
       └── privacyModule (Fail-closed privacy override governance)
```

In production (`NODE_ENV=production`), if any critical infrastructure dependency fails (e.g. PostgreSQL pool unavailable), the application immediately fails fast at startup rather than falling back to in-memory mocks.
