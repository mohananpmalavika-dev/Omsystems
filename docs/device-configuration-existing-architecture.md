# Existing Architecture Audit: DVR / NVR / IP Camera Configuration Center

> **Document Version:** 1.0.0  
> **Status:** Phase 0 Discovery Complete (Read-Only Audit)  
> **Audit Date:** 2026-09-04  
> **Target Subsystem:** Centralized Production-Grade Device Configuration Center

---

## 1. Executive Summary

This audit assesses the existing device management, protocol adapters, ONVIF client libraries, recorder frameworks, capability registries, configuration jobs, configuration drift tracking, and UI components in the Sentinel Grid codebase.

### Primary Audit Findings:
1. **Core Data Models & Migrations Exist**: The repository possesses production-ready PostgreSQL schemas in `backend/migrations/0120_device_management.sql` defining `device_credentials`, `device_configuration_jobs`, `device_job_steps`, `branch_networks` (IPAM), `ip_address_assignments`, `device_templates`, `device_template_assignments`, and `device_configuration_drift`.
2. **Authoritative Reliable PTZ is Fully Implemented**: Migration `072_authoritative_reliable_ptz.sql`, `src/ptz/` services, `src/onvif/services/ptz-service.ts`, and `src/database/ptz-repository.ts` provide battle-tested priority locks, presets, guard tours, and patterns (100% unit tests passing).
3. **ONVIF Services are Well-Developed but Missing Options Introspection**: `src/onvif/services/` implements `DeviceService`, `MediaService`, `ImagingService`, `PtzService`, and `EventsService`. However, `GetVideoEncoderConfigurationOptions` (Media) and `GetOptions` (Imaging) are currently missing, which prevents discovery of hardware min/max ranges and supported resolution/framerate matrices.
4. **Recorder Adapters are Currently Read-Only**: Concrete adapters exist in `backend/src/recorders/adapters/` (Base, Generic, Hikvision, Dahua, ONVIF) and `edge-agent/src/recorders/adapters/` (Dahua, Hikvision, ONVIF, RTSP). However, the `RecorderAdapter` interface is strictly focused on health telemetry (`getChannels`, `getStreamStatus`, `getRecordingStatus`, `getStorageStatus`, `getDeviceTime`). Zero configuration write methods (`setVideoEncoding`, `setRecordingSchedule`, `setNetwork`, `setTime`) are currently defined on recorder adapters.
5. **Critical Implementation Gaps / Stubs**:
   - `src/services/device-template-service.ts` line 295 (`fetchDeviceConfiguration`): Contains `// TODO: Implement actual device config fetching` and returns `{}`.
   - `src/workers/device-job-worker.ts`: Contains placeholder TODOs for connecting to physical devices and applying password/network/template changes through the adapters.

---

## 2. Subsystem Classification Matrix

| Subsystem / Area | Status | Authoritative Implementation Path | Notes & Gaps |
| :--- | :---: | :--- | :--- |
| **Camera Entity** | `EXISTING` | `src/domain/models.ts`, `src/database/camera-repository.ts` | Complete multi-protocol camera representation with `connectionSecretRef` and `profiles`. |
| **Recorder Entity** | `PARTIAL` | `database/migrations/064_recorder_device_profiles.sql`, `backend/src/recorders/types/index.ts` | Exists in DB and recorder types; represented in `cameras` via `source_type = 'recorder-channel'`. |
| **Device Inventory** | `EXISTING` | `database/migrations/036_device_inventory.sql`, `src/routes/device-inventory.routes.ts` | Unified inventory for cameras, NVRs, DVRs, switches, and gateways. |
| **Credential Vault** | `EXISTING` | `src/security/vault/device-credential-vault.service.ts` | Banking-grade AES-256-GCM with PBKDF2 200k iterations and SHA-256 fingerprinting. |
| **Device Credential Rotation** | `PARTIAL` | `src/services/device-credential-service.ts`, `0120_device_management.sql` | Rotation table & job creation exist; physical device password write is stubbed in worker. |
| **WS-Discovery (ONVIF)** | `EXISTING` | `src/onvif/discovery/ws-discovery.ts` | UDP multicast discovery probe with XML envelope parsing. |
| **ONVIF Device Service** | `EXISTING` | `src/onvif/services/device-service.ts` | `GetDeviceInformation`, `GetSystemDateAndTime`, `SetSystemDateAndTime`, `GetCapabilities`, `GetUsers`, `SystemReboot`. |
| **ONVIF Media Service** | `PARTIAL` | `src/onvif/services/media-service.ts` | `GetProfiles`, `GetStreamUri`, `GetSnapshotUri`, `SetVideoEncoderConfiguration`. **Missing:** `GetVideoEncoderConfigurationOptions`. |
| **ONVIF Imaging Service** | `PARTIAL` | `src/onvif/services/imaging-service.ts` | `GetImagingSettings`, `SetImagingSettings`, `Move` (Focus), `Stop`. **Missing:** `GetOptions`. |
| **ONVIF PTZ Service** | `EXISTING` | `src/onvif/services/ptz-service.ts` | `ContinuousMove`, `AbsoluteMove`, `RelativeMove`, `Stop`, `GetStatus`, `GetPresets`, `SetPreset`, `RemovePreset`, `GotoPreset`. |
| **Reliable PTZ Subsystem** | `EXISTING` | `src/ptz/`, `072_authoritative_reliable_ptz.sql`, `src/database/ptz-repository.ts` | Full priority locks, operator preemption, tours, patterns, home configurations. Tested & passing. |
| **Security Device Adapter Registry** | `EXISTING` | `backend/src/adapters/security-device/adapter-registry.ts` | Singleton routing ONVIF, SNMP, REST, MQTT, and Hikvision AX PRO ISAPI. |
| **Recorder Adapter Registry** | `PARTIAL` | `backend/src/recorders/recorder-adapter.factory.ts`, `edge-agent/src/recorders/` | Dispatches Hikvision, Dahua, ONVIF, Generic. Telemetry read-only; no config write methods. |
| **Hardware Capability Registry** | `EXISTING` | `src/device-capabilities/capability-registry.service.ts` | Evidence-based capability model (`SUPPORTED`, `UNSUPPORTED`, `UNKNOWN`, `UNAVAILABLE`, `DEGRADED`, `MISCONFIGURED`). Tested & passing. |
| **AI Capability Registry** | `EXISTING` | `backend/src/services/capability-registry.service.ts` | Dedicated to AI analytics detector states (`PRODUCTION`, `INTEGRATED`, `FRAMEWORK`). |
| **Configuration Job Queue** | `PARTIAL` | `0120_device_management.sql`, `src/workers/device-job-worker.ts` | Job state machine and DB polling queue exist; adapter execution steps have TODO stubs. |
| **Configuration Drift Engine** | `PARTIAL` | `src/services/device-template-service.ts`, `0120_device_management.sql` | Recursive comparator & DB tables exist; read-back function (`fetchDeviceConfiguration`) returns `{}`. |
| **Configuration Templates** | `EXISTING` | `src/services/device-template-service.ts`, `0120_device_management.sql` | Template CRUD, versioning, publish lifecycle, variable substitution (`{{branch-gateway}}`, etc.). |
| **IPAM / Network Assignment** | `EXISTING` | `src/services/ipam-service.ts`, `0120_device_management.sql` | Subnet CIDR reservation, IP assignment, IP conflict checking via SQL helper. |
| **Dashboard Capability UI** | `EXISTING` | `dashboard/components/capability/` | `CapabilityBadge`, `CapabilityGate`, `DeviceCapabilitiesPanel`, `PlatformCapabilityGate`. |
| **Dashboard Device Mgmt UI** | `PARTIAL` | `dashboard/components/device-management/` | `credential-rotation-form`, `job-monitor`, `device-selector`. Missing video/imaging/recorder tabs. |
| **RBAC / ABAC Permissions** | `EXISTING` | `0120_device_management.sql`, `src/security/authorization/abac-policy-engine.ts` | Permissions: `device:view`, `device:configure`, `device:credentials:rotate`, `device:network:change`, etc. |
| **Audit Logging** | `EXISTING` | `src/database/audit-repository.ts`, `postgres-store.ts` (`writeAudit`) | Structured JSON audit logging to `audit_logs` with actor, tenant, node, action, and details. |
| **Event Bus & Messaging** | `EXISTING` | `src/infrastructure/event-bus/event-bus.ts` | Redis Streams / PubSub backed with Dead Letter Queue, retry policies, and in-memory fallback. |

---

## 3. Detailed Repository Audit (27 Analysis Questions)

### Q1: Where are Camera entities defined?
- **Domain Interface:** [`src/domain/models.ts`](file:///c:/Omsystems/Omsystems/src/domain/models.ts#L126) defines `Camera` (id, deviceIdentityId, name, nodeId, branchId, vendor, model, channel, protocol, status, profiles, capabilities, connectionSecretRef, sourceType, recorderId, recorderChannel, recorderSerialNumber).
- **Database Table:** `cameras` table created in `database/migrations/001_initial_schema.sql` and enhanced in `050_analog_dvr_channels.sql` and `056_device_digital_identity.sql`.
- **Database Repository:** [`src/database/camera-repository.ts`](file:///c:/Omsystems/Omsystems/src/database/camera-repository.ts).

### Q2: Where are DVR/NVR/Recorder entities defined?
- **Database Schemas:**
  - `database/migrations/064_recorder_device_profiles.sql` (`recorder_device_profiles` table).
  - `database/migrations/036_device_inventory.sql` (`device_inventory` table with `device_type IN ('camera', 'nvr', 'dvr', 'edge-gateway', 'switch')`).
  - `database/migrations/050_analog_dvr_channels.sql` (Recorder-backed channels).
- **Backend Types:** [`backend/src/recorders/types/index.ts`](file:///c:/Omsystems/Omsystems/backend/src/recorders/types/index.ts) defines `Recorder` (id, branchId, name, vendor, model, serialNumber, ipAddress, port, channels, firmwareVersion, storage).
- **Edge Agent Types:** [`edge-agent/src/recorders/types/recorder-profile.types.ts`](file:///c:/Omsystems/Omsystems/edge-agent/src/recorders/types/recorder-profile.types.ts) defines `RecorderDeviceProfile`.

### Q3: Where are device credentials stored?
- In `device_credentials` table (migration `backend/migrations/0120_device_management.sql`):
  `id`, `tenant_id`, `device_id`, `credential_version`, `username`, `encrypted_secret`, `encryption_key_version`, `status` (`active`, `rotating`, `superseded`, `revoked`).
- Camera records never contain passwords; they store `connectionSecretRef` referencing secrets (e.g. `vault://branches/{branchId}/cameras/{cameraId}`).

### Q4: How are credentials encrypted?
- **Vault Service:** [`src/security/vault/device-credential-vault.service.ts`](file:///c:/Omsystems/Omsystems/src/security/vault/device-credential-vault.service.ts).
- **Algorithm:** AES-256-GCM.
- **Key Derivation:** PBKDF2 over `VAULT_MASTER_PASSWORD` and `VAULT_SALT` with 200,000 iterations producing a 32-byte master key.
- **Storage Format:** Base64-encoded payload: `[16 bytes IV] + [16 bytes AuthTag] + [N bytes Ciphertext]`, accompanied by a SHA-256 fingerprint for integrity verification without decryption.

### Q5: How are ONVIF devices discovered?
- **WS-Discovery:** [`src/onvif/discovery/ws-discovery.ts`](file:///c:/Omsystems/Omsystems/src/onvif/discovery/ws-discovery.ts) sends UDP multicast probes to `239.255.255.250:3702` (SOAP Probe `dn:NetworkVideoTransmitter`).
- **Edge Agent Discovery:** Network scanner (`edge-agent/src/discovery/`) runs scheduled IP/port sweeps with ONVIF probing.
- **Targeted Discovery:** [`src/routes/camera-discovery.routes.ts`](file:///c:/Omsystems/Omsystems/src/routes/camera-discovery.routes.ts) (`POST /v1/cameras/probe-direct/range`).

### Q6: Which ONVIF operations are already implemented?
In [`src/onvif/services/`](file:///c:/Omsystems/Omsystems/src/onvif/services/):
- **Device Service:**
  - `GetDeviceInformation` (Manufacturer, Model, Firmware, Serial, HardwareId)
  - `GetSystemDateAndTime` (Manual/NTP, DaylightSavings, TimeZone, UTCDateTime, ClockDrift)
  - `SetSystemDateAndTime` (Time sync)
  - `GetCapabilities` (Resolves URLs for Media, Media2, PTZ, Imaging, Events)
  - `GetUsers` (Lists accounts & roles)
  - `SystemReboot` (Remote restart)
- **Media Service:**
  - `GetProfiles` (Main/sub streams, encoding tokens)
  - `GetStreamUri` (RTSP URI extraction with auth injection)
  - `GetSnapshotUri` & `GetSnapshotBuffer` (JPEG snapshots)
  - `SetVideoEncoderConfiguration` (Token, encoding, width, height, quality, framerate, bitrate, GovLength)
- **Imaging Service:**
  - `GetImagingSettings` (Brightness, saturation, contrast, sharpness, exposure, focus, WDR, white balance, IR cut)
  - `SetImagingSettings`
  - `Move` (Focus absolute, relative, continuous)
  - `Stop` (Focus stop)
- **PTZ Service:**
  - `ContinuousMove`, `AbsoluteMove`, `RelativeMove`, `Stop`, `GetStatus`, `GetPresets`, `SetPreset`, `RemovePreset`, `GotoPreset`.

### Q7: Which camera settings can already be read?
- **Video:** Resolution (width × height), Codec (H.264, H.265, JPEG, MPEG4), Quality, Frame Rate Limit (FPS), Bitrate Limit (kbps), GOV Length / I-Frame interval, H.264 Profile.
- **Imaging:** Brightness (0–100), Contrast (0–100), Saturation (0–100), Sharpness (0–100), IR Cut Filter (ON/OFF/AUTO), Exposure (Mode, Time, Gain, Iris), Focus (Mode, Speed), WDR (Mode, Level), White Balance (Mode, CrGain, CbGain).
- **Device Info:** Vendor, Model, Serial Number, Firmware Version, Hardware ID.
- **Time/Clock:** DateTimeType, TimeZone, UTC Date/Time, Clock Drift in ms relative to server.
- **PTZ:** Current pan/tilt/zoom vector coordinates, move status, preset list.

### Q8: Which camera settings can already be modified?
- **Video:** Encoding codec, width, height, quality factor, framerate limit, bitrate limit kbps, GovLength.
- **Imaging:** Brightness, contrast, saturation, sharpness, IR cut filter, exposure mode/time/gain/iris, focus mode, WDR mode/level, white balance mode/gains.
- **Time:** System time mode (Manual/NTP), Timezone, UTC datetime.
- **Maintenance:** Remote device reboot.
- **PTZ:** Pan, tilt, zoom velocity/positions, presets create/update/delete/goto.

### Q9: Which recorder settings can already be read?
In [`backend/src/recorders/recorder-adapter.interface.ts`](file:///c:/Omsystems/Omsystems/backend/src/recorders/recorder-adapter.interface.ts):
- Channel count, channel status, and channel camera mappings.
- Video stream signal presence (`healthy`, `unhealthy`, `unknown`).
- Internal recording activity status.
- Oldest and latest archive timestamps for retention verification.
- Storage disk list, operational status, capacity, used bytes, free bytes.
- Device clock time.
- Device vendor, model, and firmware version.

### Q10: Which recorder settings can already be modified?
- **Currently ZERO.** All existing recorder adapter interfaces (`RecorderAdapter`) only contain telemetry and health check methods. No configuration mutation methods (`setChannelEncoding`, `setRecordingSchedule`, `setNetworkConfig`, `setTimeConfig`) exist in any recorder adapter.

### Q11: What recorder adapters already exist?
- `backend/src/recorders/adapters/`:
  - `BaseRecorderAdapter` (HTTP client, timeout, retry, error normalization)
  - `GenericRecorderAdapter` (Conservative fallback enforcing UNKNOWN semantics)
  - `HikvisionRecorderAdapter` (ISAPI-based channel, recording, and storage inspection)
  - `DahuaRecorderAdapter` (CGI/RPC-based channel, stream, and disk inspection)
  - `OnvifRecorderAdapter` (ONVIF Profile G/S recorder inspection)
- `edge-agent/src/recorders/adapters/`:
  - `RtspRecorderAdapter`, `HikvisionRecorderAdapter`, `DahuaRecorderAdapter`, `OnvifRecorderAdapter`, `AdapterFallbackExecutor`.

### Q12: Which vendors already have adapters?
- **Hikvision:** Implemented via ISAPI HTTP REST and AX PRO integration.
- **Dahua:** Implemented via Dahua RPC/CGI protocol.
- **ONVIF:** Implemented via ONVIF SOAP client across Profile S, T, and G.
- **Generic:** Implemented via standard HTTP / RTSP.
- **CP Plus:** Not a dedicated class; handled as Dahua derivative or Generic RTSP/ONVIF.
- **Uniview:** Not yet implemented (falls back to generic).

### Q13: How does adapter selection currently work?
- In [`backend/src/adapters/security-device/adapter-registry.ts`](file:///c:/Omsystems/Omsystems/backend/src/adapters/security-device/adapter-registry.ts): Checks `device.metadata?.adapterName`, then matches `device.protocol` (`ONVIF`, `RTSP`, `SNMP`, `REST`, `HTTP_API`, `HTTPS_API`, `MQTT`, `AX_PRO`, `ISAPI`).
- In [`backend/src/recorders/recorder-adapter.factory.ts`](file:///c:/Omsystems/Omsystems/backend/src/recorders/recorder-adapter.factory.ts): Inspects `recorder.vendor` (`hikvision` -> `HikvisionRecorderAdapter`, `dahua` -> `DahuaRecorderAdapter`, `onvif` -> `OnvifRecorderAdapter`, else `GenericRecorderAdapter`).
- In [`edge-agent/src/recorders/fingerprint/recorder-fingerprint.service.ts`](file:///c:/Omsystems/Omsystems/edge-agent/src/recorders/fingerprint/recorder-fingerprint.service.ts): Multi-probe fingerprinting scores confidence across Dahua CGI, Hikvision ISAPI, ONVIF, RTSP, and HTTP Server headers to pick the primary and fallback adapters.

### Q14: What capability registry already exists?
- **Authoritative Device Capability Registry:** [`src/device-capabilities/capability-registry.service.ts`](file:///c:/Omsystems/Omsystems/src/device-capabilities/capability-registry.service.ts) and [`capability.types.ts`](file:///c:/Omsystems/Omsystems/src/device-capabilities/capability.types.ts).
  - Models capabilities as states: `SUPPORTED`, `UNSUPPORTED`, `UNKNOWN`, `UNAVAILABLE`, `DEGRADED`, `MISCONFIGURED`.
  - Distinguishes verification levels: `DECLARED`, `DISCOVERED`, `VERIFIED`.
  - Attaches verifiable `CapabilityEvidence` with timestamps, confidence scores, and raw references.
- **Edge Recorder Capability Registry:** [`edge-agent/src/recorders/capabilities/capability-registry.ts`](file:///c:/Omsystems/Omsystems/edge-agent/src/recorders/capabilities/capability-registry.ts).
- **Analytics Capability Registry:** [`backend/src/services/capability-registry.service.ts`](file:///c:/Omsystems/Omsystems/backend/src/services/capability-registry.service.ts) (specialized for AI models).

### Q15: How is PTZ implemented?
- **Authoritative Subsystem:** Located in [`src/ptz/`](file:///c:/Omsystems/Omsystems/src/ptz/).
- **Database Schema:** `database/migrations/072_authoritative_reliable_ptz.sql`.
- **Database Repository:** `src/database/ptz-repository.ts`.
- **Concurrency & Locks:** `ptz-priority-manager.service.ts` provides token-based priority locks with automatic expiration and preemption (e.g. SUPER_ADMIN preempts OPERATOR).
- **Optics Control:** `ptz-optics-controller.service.ts` normalizes pan/tilt/zoom speeds and clamps coordinates.
- **Tours & Patrols:** `ptz-preset-tour-manager.service.ts` coordinates preset dwell times and loops.
- **Hardware Driver:** `src/onvif/services/ptz-service.ts` sends standard ONVIF SOAP requests.

### Q16: How are device configuration jobs processed?
- **Schema:** `device_configuration_jobs` and `device_job_steps` in `0120_device_management.sql`.
- **Queueing:** `DeviceTemplateService` and `DeviceCredentialService` create jobs with `status = 'queued'`.
- **Worker:** [`src/workers/device-job-worker.ts`](file:///c:/Omsystems/Omsystems/src/workers/device-job-worker.ts) runs a continuous polling loop claiming queued jobs atomically using `store.claimDeviceConfigurationJobs({ limit: 10, now })`.
- **State Machine:** `queued` → `claimed` → `precheck` → `connecting` → `applying` → `waiting-reboot` → `verifying` → `completed` (or `failed` → `rolling-back` → `manual-intervention`).
- **Current Limitation:** In `device-job-worker.ts`, step functions contain `// TODO` stubs for physical adapter calls.

### Q17: What desired/actual configuration model exists?
- **Tables:** `device_templates` stores desired settings as `JSONB`; `device_template_assignments` links desired templates to devices.
- **Drift Table:** `device_configuration_drift` stores `drift_type`, `desired_value JSONB`, `actual_value JSONB`, `detected_at`, `acknowledged`.
- **Comparator:** `DeviceTemplateService.compareConfigurations(desired, actual)` performs recursive JSON comparison.

### Q18: What configuration-drift implementation exists?
- `src/services/device-template-service.ts` implements `detectDrift(deviceId, templateId)` and `getDeviceDrift(deviceId)`.
- Route: `GET /v1/device-management/devices/:deviceId/drift` returns detected drifts.
- Gap: Line 295 of `device-template-service.ts` (`fetchDeviceConfiguration`) returns `{}` instead of querying the physical device through adapters.

### Q19: What database tables/migrations already exist?
- `device_credentials` (`0120_device_management.sql`)
- `device_configuration_jobs` (`0120_device_management.sql`)
- `device_job_steps` (`0120_device_management.sql`)
- `branch_networks` (`0120_device_management.sql`)
- `ip_address_assignments` (`0120_device_management.sql`)
- `device_templates` (`0120_device_management.sql`)
- `device_template_assignments` (`0120_device_management.sql`)
- `device_configuration_drift` (`0120_device_management.sql`)
- `ptz_priority_locks`, `ptz_presets`, `ptz_patterns`, `ptz_guard_tours`, `ptz_home_configurations` (`072_authoritative_reliable_ptz.sql`)
- `remote_ops_incidents`, `remote_remediation_actions`, `surgical_work_orders`, `fleet_roi_snapshots` (`074_remote_infrastructure_operations.sql`)
- `device_inventory` (`036_device_inventory.sql`)
- `recorder_device_profiles` (`064_recorder_device_profiles.sql`)

### Q20: Which dashboard components can be reused?
- [`dashboard/components/capability/CapabilityBadge.tsx`](file:///c:/Omsystems/Omsystems/dashboard/components/capability/CapabilityBadge.tsx)
- [`dashboard/components/capability/CapabilityGate.tsx`](file:///c:/Omsystems/Omsystems/dashboard/components/capability/CapabilityGate.tsx)
- [`dashboard/components/capability/DeviceCapabilitiesPanel.tsx`](file:///c:/Omsystems/Omsystems/dashboard/components/capability/DeviceCapabilitiesPanel.tsx)
- [`dashboard/components/capability/PlatformCapabilityGate.tsx`](file:///c:/Omsystems/Omsystems/dashboard/components/capability/PlatformCapabilityGate.tsx)
- [`dashboard/components/device-management/credential-rotation-form.tsx`](file:///c:/Omsystems/Omsystems/dashboard/components/device-management/credential-rotation-form.tsx)
- [`dashboard/components/device-management/device-selector.tsx`](file:///c:/Omsystems/Omsystems/dashboard/components/device-management/device-selector.tsx)
- [`dashboard/components/device-management/job-monitor.tsx`](file:///c:/Omsystems/Omsystems/dashboard/components/device-management/job-monitor.tsx)
- [`dashboard/components/branch-command-center/recorder-health-panel.tsx`](file:///c:/Omsystems/Omsystems/dashboard/components/branch-command-center/recorder-health-panel.tsx)
- [`dashboard/components/maintenance/RecorderProfileInspector.tsx`](file:///c:/Omsystems/Omsystems/dashboard/components/maintenance/RecorderProfileInspector.tsx)

### Q21: Which RBAC/ABAC permissions already exist?
- **Seeded in `0120_device_management.sql`:**
  - `device:view`, `device:list`, `device:credentials:rotate`, `device:network:change`
  - `device:template:create`, `device:template:publish`, `device:template:apply`
  - `device:configuration:apply`, `device:configuration:rollback`, `device:bulk:configure`
  - `device:firmware:upgrade`, `device:factory-reset`
- **Core Platform Actions:** `device:configure`, `live:view`, `recording:view`, `audit:view`.
- **ABAC Policy Engine:** [`src/security/authorization/abac-policy-engine.ts`](file:///c:/Omsystems/Omsystems/src/security/authorization/abac-policy-engine.ts) enforces roles (`SUPER_ADMIN`, `TENANT_ADMIN`, `CHIEF_SECURITY_OFFICER`, etc.), shift time windows, and branch scopes.

### Q22: How are tenant/branch/device scopes enforced?
- **Multi-Tenancy:** Every table contains `tenant_id UUID NOT NULL REFERENCES tenants(id)`. Every store query enforces `tenantId`.
- **Hierarchical Path Scoping:** Table `resource_nodes` uses PostgreSQL `ltree` paths (`tenant.organization.region.branch.camera`).
- **Access Check:** `store.checkAccess(user, action, resourceNodeId)` validates that the operator has an authorized role grant for the branch or any parent ancestor node.

### Q23: What audit mechanism exists?
- **Method:** `store.writeAudit(event: AuditEventInput)` implemented in [`src/database/postgres-store.ts`](file:///c:/Omsystems/Omsystems/src/database/postgres-store.ts#L570).
- **Target Table:** `audit_logs` storing: `tenantId`, `actorUserId`, `action`, `resourceNodeId`, `outcome` (`success` | `failure`), `sourceIp`, and `details` (`JSONB`). Plaintext credentials are strictly forbidden.

### Q24: What queue/job-worker infrastructure exists?
- **Database Job Queue:** `device_configuration_jobs` processed via atomic row-locking (`SELECT ... FOR UPDATE SKIP LOCKED`).
- **Worker Process:** [`src/workers/device-job-worker.ts`](file:///c:/Omsystems/Omsystems/src/workers/device-job-worker.ts) with concurrency controls, retry limits (`max_attempts = 3`), exponential backoff (`next_attempt_at`), and individual step logging in `device_job_steps`.

### Q25: What event bus is used?
- **Primary Platform Event Bus:** [`src/infrastructure/event-bus/event-bus.ts`](file:///c:/Omsystems/Omsystems/src/infrastructure/event-bus/event-bus.ts) uses Redis Streams and Pub/Sub with persistent channels, retry handling, and local EventEmitter fallback.
- **Incident Event Bus:** `src/security-commander/event-bus/` uses NATS for security incident streaming.

### Q26: What Redis infrastructure exists?
- Central Redis connection managed via `REDIS_URL`.
- Utilized for:
  1. Distributed stream leases and fencing locks (`src/media/cluster/camera-lease.types.ts`).
  2. Rate limiting (`src/security/middleware/rate-limiter.ts`).
  3. Distributed event bus (`src/infrastructure/event-bus/event-bus.ts`).

### Q27: What duplicate implementations exist?
1. **Device Credential Encryption:**
   - [`src/security/vault/device-credential-vault.service.ts`](file:///c:/Omsystems/Omsystems/src/security/vault/device-credential-vault.service.ts) (`AesGcmCredentialVault` with PBKDF2).
   - [`src/services/device-credential-service.ts`](file:///c:/Omsystems/Omsystems/src/services/device-credential-service.ts) (Duplicate inline `crypto.createCipheriv`).
   - *Decision:* Consolidate on `AesGcmCredentialVault`.
2. **Capability Registries:**
   - [`src/device-capabilities/capability-registry.service.ts`](file:///c:/Omsystems/Omsystems/src/device-capabilities/capability-registry.service.ts) (Physical hardware capabilities - Authoritative).
   - [`backend/src/services/capability-registry.service.ts`](file:///c:/Omsystems/Omsystems/backend/src/services/capability-registry.service.ts) (AI Model analytics status).
   - *Decision:* Retain both as distinct domain responsibilities; standardize hardware configuration on `src/device-capabilities/`.
3. **Recorder Adapters:**
   - `backend/src/recorders/adapters/` vs `edge-agent/src/recorders/adapters/`.
   - *Decision:* Keep `backend/src/recorders/` as the cloud control-plane interface and `edge-agent/src/recorders/` for LAN execution.

---

## 4. Analysis of Risky TODO / Mock / Placeholder Implementations

| Location | Code Snippet / Finding | Risk Level | Required Remediation in Phase 1-4 |
| :--- | :--- | :---: | :--- |
| `src/services/device-template-service.ts:214, 295` | `// TODO: Implement actual device config fetching... return {};` | **CRITICAL** | Drift detection currently compares desired template settings against an empty object `{}`. Must connect to `DeviceConfigurationService` to query real hardware. |
| `src/workers/device-job-worker.ts:248-251` | `// TODO: Implement actual device connection via vendor adapter` | **CRITICAL** | Worker claims jobs but never establishes physical device connections. Must dispatch to adapter registry. |
| `src/workers/device-job-worker.ts:271-278` | `// TODO: Implement actual password change via vendor adapter` | **HIGH** | Password rotation updates the DB but never reconfigures the physical camera. Must execute vendor password modification. |
| `src/workers/device-job-worker.ts:299-310` | `// TODO: Test ONVIF authentication with new credential` | **HIGH** | Verification step is faked as `{ verified: true }` without testing physical authentication. |
| `src/onvif/services/imaging-service.ts` | Missing `GetOptions` (`timg:GetOptions`) | **HIGH** | UI cannot discover device-supported min/max brightness, contrast, exposure ranges. |
| `src/onvif/services/media-service.ts` | Missing `GetVideoEncoderConfigurationOptions` (`trt:GetVideoEncoderConfigurationOptions`) | **HIGH** | UI cannot discover valid resolution options, FPS range, and bitrate limits from device. |
| `backend/src/recorders/recorder-adapter.interface.ts` | Missing all configuration write methods | **HIGH** | Recorder adapters can only read telemetry; cannot update channels, recording schedule, or clock. |

---

## 5. Verification Status of Existing Subsystems

All relevant existing test suites and typechecks were executed during this Phase 0 audit:

| Test Suite / Subsystem | Command | Status | Result Summary |
| :--- | :--- | :---: | :--- |
| **Capability Registry Contracts** | `npx vitest run test/capabilities/capability-registry.contract.test.ts` | `PASS` | 5/5 tests passed in 73ms. |
| **Device Management Contracts** | `npx vitest run src/device-management.test.ts` | `PASS` | 3/3 tests passed in 12ms. |
| **Reliable PTZ Subsystem** | `npx vitest run test/reliable-ptz-subsystem.test.ts` | `PASS` | 6/6 tests passed in 20ms. |
| **Recorder Adapters Integration** | `npx vitest run backend/src/recorders/__tests__/recorder-adapters-integration.test.ts` | `PASS` | 14/14 tests passed in 77ms. |
| **Generic Recorder Adapter** | `npx vitest run backend/src/recorders/__tests__/generic-recorder.adapter.test.ts` | `PASS` | 7/7 tests passed in 28ms (strict UNKNOWN semantics verified). |
| **Recorder Health Checker** | `npx vitest run backend/src/recorders/__tests__/recorder-health-checker.test.ts` | `PASS` | 8/8 tests passed in 37ms. |
| **Device Inventory Routes** | `npx vitest run test/device-inventory.routes.test.ts` | `PASS` | 1/1 integration test passed. |
| **Root Control Plane Typecheck** | `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) | `PASS` | Clean compile, 0 errors. |
| **Edge Agent Typecheck** | `npm run typecheck --workspace @sentinel/edge-agent` | `PASS` | Clean compile, 0 errors. |
| **Dashboard Typecheck** | `npm run typecheck --workspace @sentinel/dashboard` | `PASS` | Clean compile, 0 errors. |
