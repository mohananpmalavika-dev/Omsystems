# KryptoVision / OMSystems Architecture Authority

**Effective Date:** 27 Aug 2026  
**Status:** Authoritative Standard  
**Mandate:** Every domain must have exactly one production codepath. Parallel implementations are strictly prohibited. In production (`NODE_ENV=production`), all authoritative state must reside in durable PostgreSQL and Redis. Local in-memory maps or fallbacks are strictly prohibited.

---

## 1. Authoritative Domain Ownership Map

| Subsystem Domain | Authoritative Package / File | Subsystem Owner | Deprecated / Disallowed Parallel Paths | Migration Policy |
|---|---|---|---|---|
| **Media Orchestration & Viewer Budgeting** | `src/media/` (`services/media-orchestrator.ts`) | Media Orchestration Team | `backend/src/media/`, `dashboard/hooks/use-media-orchestrator.ts` | State lives in Redis leases and epochs; UI hooks use unified stream manager |
| **Recording Engine & Index** | `src/recording/` + `src/recording-index/` | Recording Team | `src/media/pipeline/recording-index.service.ts`, `backend/src/recording/` | Unified PostgreSQL + NVMe recording index with gap and continuity tracking |
| **Evidence & Chain of Custody** | `src/evidence/` + `packages/evidence-verifier/` | Forensic Evidence Team | `src/alerts/evidence-capture.ts`, `backend/src/evidence/` | Control plane dispatches capture jobs; durable PostgreSQL records; Ed25519/RSA digital signatures with tamper-evident verifier |
| **Incident & SOP Engine** | `src/incidents/` | Security Operations Team | In-memory playbook repositories, `backend/src/incidents/` | Durable PostgreSQL playbook definitions, instances, and audit logs with scheduled escalation |
| **Identity & Authentication** | `src/identity/` + `packages/identity` | Identity & Platform Security Team | `backend/src/identity/`, `backend/src/services/identity.service.ts` | All auth flows use `@node-saml/passport-saml`, OIDC, mTLS, and RBAC/ABAC policy engines |
| **AI Quality Control Plane** | `src/ai-quality/` | AI Governance Team | Unpersisted AI quality facades, `backend/src/ai/` | All detectors, models, evaluations, certifications, and audits backed by PostgreSQL |
| **Notification Engine** | `src/notifications/` | Operations & Alerting Team | Legacy FCM server key, simulated dispatch in `src/mobile/` | OAuth2 FCM HTTP v1, APNs HTTP/2 JWT, RFC 8291 Web Push, durable retry queues |
| **Privacy Governance & Redaction** | `src/privacy/` | Compliance & Data Privacy Team | In-memory privacy stores, unpersisted override singletons | Fail-closed PostgreSQL audit store; zero unmasked video/export without immutable audit logging |
| **Device Integration & Certification** | `src/recorders/` + `packages/recorder-sdk` | Edge & Hardware Team | Legacy mock scrapers in `src/devices/`, fake device certifications | Real protocol drivers (ISAPI, Dahua CGI, Uniview API, ONVIF); evidence-based hardware lab certifications |

---

## 2. Core Architectural Invariants

1. **Zero Process-Local State for Global Truth**: Camera ownership, viewer counts, stream leases, and recording locks must reside in Redis with lease epochs. In-memory `Map` is strictly prohibited for authoritative state in production (`NODE_ENV=production`).
2. **Strict Fencing on Media/Recording Writes**: A node with an expired epoch (`currentEpoch < activeEpoch`) is immediately rejected by the storage and media layers.
3. **Fail-Closed Privacy Governance**: Privileged live unmasking or unredacted evidence exports must write to an immutable audit store prior to granting access. If the audit store is unavailable, access is unconditionally denied.
4. **Cryptographic Forensic Evidence**: Every evidence manifest must be signed using real asymmetric keys (Ed25519 or RSA-PSS). Fake or mock signatures (such as `sig-mock-*`) are forbidden.
5. **No Synthetic / Fabricated Runtime Data**: AI detectors without loaded weights must return `status: "MODEL_UNAVAILABLE", confidence: null`. Recorder adapters without device connectivity must report `UNKNOWN` or `NOT_CONNECTED`, never manufactured `HEALTHY` or fake SMART passes.
6. **Immutable Recording Segments**: Video segments must be sealed with SHA-256 checksums upon creation and verified before indexing.
7. **Single Authoritative Composition Root**: All application services, repositories, and adapters must be instantiated via `src/bootstrap/index.ts` (`applicationBootstrap()`) and injected into `buildApp()`.
8. **Transactional Outbox & Consumer Idempotency**: All critical domain events must be published via PostgreSQL transactional outbox and consumed through deduplicating inbox patterns (`consumer_name + event_id`).
9. **Node.js 22 Runtime Standard**: All production containers, local scripts, and CI pipelines run exclusively on Node.js 22.x.


