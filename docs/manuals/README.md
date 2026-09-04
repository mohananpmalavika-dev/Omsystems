# Sentinel Grid — Official Platform Manuals & Operational Documentation

**Product Release Version:** Sentinel Grid 0.1.0  
**Release Date:** September 2026  
**Evaluation Standard:** High-Assurance Banking & NBFC Surveillance Baseline  

Welcome to the authoritative technical and operational manuals for **Sentinel Grid (OMSystems)**. This documentation suite is built strictly from the current codebase and verified against production deployments. Features in this documentation reflect actual routes, database migrations, cryptographic ledgers, and running services.

---

## 📚 Manuals Directory

| Manual | Primary Audience | Key Topics Covered |
| :--- | :--- | :--- |
| **[Operator User Manual](operator-user-manual.md)** | SOC Operators, Branch Security, Field Staff | Sign-in & sessions, Live Video Wall, Synced Playback, Alert triage & deduplication, Incident playbooks, Court-admissible evidence export, Device health checks. |
| **[Administrator Manual](administrator-manual.md)** | System Admins, NBFC Security Officers, IT Ops | Multi-tenant hierarchy, RBAC/ABAC permissions, Camera/DVR/NVR onboarding, Storage backends, Visual rule engine, Audit trail immutability, Hardware maintenance & AMC. |
| **[Installation & Deployment Manual](installation-deployment-manual.md)** | DevOps, Cloud & Infrastructure Engineers | Node 22 runtime, PostgreSQL 16 + pgvector, Redis 7, Docker Compose, Bare metal systemd, Network ports, Production `.env` parameters, Production hardening checklist. |
| **[AI Analytics & Visual Rule Engine Manual](ai-analytics-rules-manual.md)** | Surveillance Directors, Risk Officers, SOC Leads | Visual Zone Designer (normalized canvas), Compound boolean conditions, 36 NBFC regulatory rule templates, IST banking schedules, Shadow mode testing, Model registry. |
| **[Troubleshooting & Diagnostic Guide](troubleshooting-guide.md)** | Support Engineers, Field Techs, Admins | Camera offline triage tree, WebRTC / HLS playback debugging, Recording continuity gaps, AI detector false positive tuning, Storage mount disappearance, Health probes. |

---

## 🏷️ Package & Component Version Matrix

The following component versions are currently deployed in the repository:

```text
├── sentinel-grid (Root)       : 0.1.0
├── @sentinel/dashboard         : 0.1.0
├── @sentinel/edge-agent        : 0.1.18
├── @sentinel/recording-engine  : 0.1.0
└── @sentinel/analytics-engine  : 0.1.0
```

---

## 🔍 Feature Status Appendix & Truth Matrix

Sentinel Grid enforces strict truthfulness in platform capabilities. Incomplete, prototype, or simulated capabilities are never misrepresented as production-ready:

| Feature / Domain | Current Status | UI Route | Primary Backend Service | Production Ready? | Known Limitations / Operating Constraints |
| :--- | :---: | :--- | :--- | :---: | :--- |
| **Local Authentication** | Implemented | `/login` | `src/routes/auth.routes.ts` | **YES** | Local username/password with bcrypt hashing and session cookies. |
| **Facial Verification Login** | Implemented | `/login` | `dashboard/components/login-form.tsx` | **YES** | Browser webcam capture via `getUserMedia`; optional visual verification step. |
| **Enterprise SSO (SAML 2.0)** | Config Required | `/v1/auth/saml/*` | `src/security/saml-provider.ts` | **YES (Config)** | Supported by backend; requires enterprise IdP XML metadata and certificate configuration. |
| **Enterprise SSO (OIDC / Azure AD)**| Config Required | `/v1/auth/oidc/*` | `src/security/oidc-provider.ts` | **YES (Config)** | Authorization code grant with PKCE via `openid-client`; requires tenant configuration. |
| **Live Video Wall (WebRTC / HLS)**| Implemented | `/control-room` | `media-gateway` (:8090, :8888) | **YES** | WebRTC requires UDP port 8189 inbound; automatic fallback to HLS on firewall block. |
| **PTZ Camera Control** | Implemented | `/control-room` | `src/routes/onvif.routes.ts` | **YES** | Requires cameras with ONVIF Profile S/T PTZ support. |
| **Synchronized Playback** | Implemented | `/playback/synced` | `src/routes/on-demand-media.routes.ts`| **YES (Pilot)** | Multi-camera timeline playback; scrub latency dependent on storage speed. |
| **24x7 Ring Buffer Recording** | Implemented | `/recordings` | `recording-engine` (:8091) | **YES** | Atomic segmented MP4/TS writes with SHA-256 seal; 10-60s chunks. |
| **Recording Index & Gap Detection**| Implemented | `/operations/recording`| `src/recording-index/` | **YES** | Tracks every recorded second in PostgreSQL; background gap auditor runs every 5m. |
| **Local Disk Storage (POSIX)** | Implemented | `/operations/storage` | `LocalDiskStorageProvider` | **YES** | Direct I/O with crash-safe rename pattern (`.partial` -> `rename`). |
| **NFS / SMB Network Storage** | Implemented | `/operations/storage` | `NfsStorageBackend`, `SmbStorageBackend`| **YES** | Protected by `MountIdentityVerifier`; fails closed if share unmounts. |
| **AWS S3 / MinIO Cloud Storage**| Implemented | `/operations/storage` | `S3StorageProvider` | **YES** | Elastic capacity model (`type: 'ELASTIC'`); pre-upload SHA-256 validation. |
| **Forensic Evidence ZIP Package** | Implemented | `/evidence` | `ForensicEvidencePackageService` | **YES** | Ed25519 signed manifest (`manifest.sig`), SHA-256 media hashes, standalone HTML player. |
| **Append-Only Chain of Custody** | Implemented | `/evidence` | `ChainOfCustodyService` | **YES** | Cryptographic hash chaining (`eventHash = SHA256(eventData + prevHash)`). |
| **Legal Hold Lock** | Implemented | `/evidence` | `LegalHoldService` | **YES** | Strictly overrides retention rules; prohibits file deletion until released. |
| **AI Visual Rule Engine** | Implemented | `/analytics/rules` | `NbfcRuleEngineService` | **YES** | Zero-code rule builder; compound `AND`/`OR`/`NOT` conditions; persistence timer. |
| **Visual Zone Designer** | Implemented | `/analytics/rules` | `dashboard/.../nbfc-rules-workspace` | **YES** | HTML5 canvas tool; normalized coordinates (`0.0`–`1.0`) for polygons and tripwires. |
| **36 NBFC Regulatory Templates** | Implemented | `/analytics/rules` | `database/migrations/095_...sql` | **YES** | Pre-seeded in PostgreSQL; 1-click instantiation across vault, cash, queue, and tamper. |
| **IST Banking Schedules** | Implemented | `/analytics/rules` | `NbfcRuleEngineService` | **YES** | Evaluated strictly in `Asia/Kolkata` (`BUSINESS_HOURS`, `AFTER_HOURS`, `24X7`). |
| **Anti-Storm Deduplication** | Implemented | `/operations/alerts` | `src/distributed-state/` | **YES** | State machine with cooldown suppression windows prevents redundant alerts. |
| **Shadow Mode & Simulation Lab** | Implemented | `/analytics/rules` | `NbfcRuleEngineService` | **YES** | Real-time silent evaluation and historical video re-evaluation for safe tuning. |
| **Immutable Audit Logging** | Implemented | `/compliance` | `ImmutableAuditService` | **YES** | SHA-256 Merkle-chained tamper-evident audit ledger for all mutations. |
| **In-App Dashboard Alerts** | Implemented | `/operations/alerts` | `notificationOutbox` | **YES** | Real-time alert feed delivered via WebSockets and outbox queue. |
| **External Email / SMS / Voice** | Partial / Config | `/operations/alert-notification-policy` | `src/notifications/infrastructure/`| **PARTIAL** | Outbox queue is fully functional; external carrier gateway setup required. |
| **Camera 7-Layer Health** | Implemented | `/operations/cameras` | `src/routes/device-health.routes.ts` | **YES** | Probes ping, RTSP decodability, framerate, bitrate, clock drift, and image quality. |
| **Hardware Work Orders & AMC** | Implemented | `/maintenance/workorders`| `src/routes/maintenance.routes.ts` | **YES** | Asset registry, repair ticketing, vendor management, and SLA tracking. |
| **Face Recognition (1:N Search)**| Prototype | `/analytics/face-recognition` | `analytics-engine` | **EXPERIMENTAL** | Prototype model; gated behind experimental feature flag. Not for legal enforcement. |
| **Hardware TPM 2.0 Attestation** | Planned Stub | N/A | N/A | **NOT_IMPLEMENTED**| Fail-closed stub in capability registry; no production hardware execution path. |

---

## 📸 Master Screenshot Catalog (All 17 Screens Captured Live)

All screenshots in this documentation suite were captured directly from the running production deployment (`https://3-7-216-169.sslip.io`):

| ID | Title | Route | File Path |
| :--- | :--- | :--- | :--- |
| **SS-001** | Operator Login & Facial Verification | `/login` | `screenshots/SS-001-login.png` |
| **SS-002** | Fleet Command Center Overview | `/` | `screenshots/SS-002-command-center.png` |
| **SS-003** | Live Video Wall & PTZ Controls | `/control-room` | `screenshots/SS-003-live-video-wall.png` |
| **SS-004** | Multi-Camera Synced Playback | `/playback/synced` | `screenshots/SS-004-synced-playback.png` |
| **SS-005** | Recordings Vault & Archive Browser | `/recordings` | `screenshots/SS-005-recordings-vault.png` |
| **SS-006** | Real-Time Alert Operations Center | `/operations/alerts` | `screenshots/SS-006-alert-operations.png` |
| **SS-007** | Incident Response & Playbook Workspace | `/incidents` | `screenshots/SS-007-incident-response.png` |
| **SS-008** | Forensic Evidence Vault & Chain of Custody | `/evidence` | `screenshots/SS-008-evidence-vault.png` |
| **SS-009** | AI Command Center & Fleet Analytics | `/operations/ai-command-center` | `screenshots/SS-009-ai-command-center.png` |
| **SS-010** | AI Rules & Visual Automation Workspace | `/analytics/rules` | `screenshots/SS-010-ai-rules-automation.png` |
| **SS-011** | Camera 7-Layer Health Diagnostics | `/operations/cameras` | `screenshots/SS-011-camera-health.png` |
| **SS-012** | Storage Volumes & Retention Management | `/operations/storage` | `screenshots/SS-012-storage-management.png` |
| **SS-013** | Organization & Location Hierarchy Admin | `/admin/organization` | `screenshots/SS-013-organization-admin.png` |
| **SS-014** | Device Configuration & Ingestion Center | `/maintenance/device-configuration` | `screenshots/SS-014-device-configuration.png` |
| **SS-015** | Maintenance Work Orders & SLA Records | `/maintenance/workorders` | `screenshots/SS-015-maintenance-workorders.png` |
| **SS-016** | Assurance & Regulatory Compliance Portal| `/compliance` | `screenshots/SS-016-compliance-framework.png` |
| **SS-017** | Platform Capability Matrix (Truth Audit) | `/admin/platform/capabilities` | `screenshots/SS-017-capability-matrix.png` |

---

## 🛠️ Automated Screenshot Capture Tooling

To re-capture all documentation screenshots from any live environment:

```bash
# Execute the Playwright automated capture script
node scripts/capture-manual-screenshots.mjs
```

The script automatically launches a headless Chromium instance, performs authenticated session negotiation, navigates sequentially through all 17 routes, waits for full DOM rendering, and saves high-resolution PNG assets into `docs/manuals/screenshots/`.
