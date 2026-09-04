# Implementation Plan: Centralized DVR / NVR / IP Camera Configuration Center

> **Document Version:** 1.8.0  
> **Status:** Phases 0 through 8 Complete (Ready for Phase 9: Golden Configuration Templates)  
> **Date:** 2026-09-04  
> **Progress:** Phases 0–8 (100% COMPLETE — 75/75 automated tests passing, 0 TypeScript errors). Ready for Phase 9 upon user request.

---

## 1. Architectural Principles & Mandates

1. **Zero Duplicate Subsystems**: Reuse existing `src/device-capabilities/`, `backend/src/adapters/security-device/`, `src/onvif/`, `src/ptz/`, `0120_device_management.sql`, and `src/security/vault/device-credential-vault.service.ts`.
2. **Single Authoritative Orchestration Layer**: All configuration requests (whether from API, templates, or workers) flow through a single `DeviceConfigurationService`.
3. **Capability-Truth First**: Never assume settings are supported. Normalized capabilities must be queried and verified before any UI control is enabled or command dispatched.
4. **Mandatory Read-After-Write Verification**: An operation is NEVER marked `VERIFIED` simply because a device returned HTTP 200 / SOAP Success. The system must re-read the configuration from physical hardware and confirm the new values match the desired state.
5. **No Plaintext Secrets**: Vault reference tokens (`vault://...`) are used throughout; plaintext passwords are never logged, stored in audit records, or emitted over APIs.
6. **Safety Feature Flags**: Dangerous operations remain behind environment flags (`DEVICE_NETWORK_CONFIGURATION=false`, `DEVICE_STORAGE_FORMAT=false`, `DEVICE_FACTORY_RESET=false`) until explicitly verified on physical test hardware.

---

## 2. Proposed Authoritative Architecture

```
                                  Client Request
            (Dashboard UI / Template Apply / Bulk Orchestrator)
                                        │
                                        ▼
                         [ DeviceConfigurationService ]
        ┌───────────────────────────────┴───────────────────────────────┐
        │ 1. Verify RBAC/ABAC Permissions (checkAccess)                  │
        │ 2. Query DeviceCapabilityRegistry (src/device-capabilities/)   │
        │ 3. Read Previous Actual Config (Snapshot for Rollback)        │
        │ 4. Queue / Execute DeviceConfigurationJob (State Machine)     │
        └───────────────────────────────┬───────────────────────────────┘
                                        │
                                        ▼
                   [ SecurityDeviceAdapterRegistry / Factory ]
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
     [ Camera Path ]                                       [ Recorder Path ]
   (src/onvif/services/)                         (backend/src/recorders/adapters/)
   ├── DeviceService                                     ├── HikvisionRecorderAdapter
   ├── MediaService (with Options)                       ├── DahuaRecorderAdapter
   ├── ImagingService (with Options)                     ├── OnvifRecorderAdapter
   ├── PtzService (via src/ptz/)                         └── GenericRecorderAdapter
   └── Vendor Adapters (ISAPI/CGI)
             │                                                     │
             └──────────────────────────┬──────────────────────────┘
                                        ▼
                            [ Physical Edge Device ]
                                        │
                                        ▼
                        [ Read-Back Actual Config ]
                                        │
                                        ▼
                  [ Compare Desired vs Actual Configuration ]
                   ├── MATCH    ─► Status: VERIFIED
                   └── MISMATCH ─► Status: FAILED / DRIFT
                                        │
                                        ▼
               [ Auto-Rollback Snapshot (if Failed & Safe) ]
                                        │
                                        ▼
               [ Audit Event to DB + Metric to Observability ]
```

---

## 3. Phased Implementation Roadmap

### PHASE 1: Consolidation & Authoritative Contracts
*Goal: Consolidate duplicate types, establish the authoritative `DeviceConfigurationService` skeleton, and extend existing adapter interfaces.*

1. **Extend Adapter Contracts for Configuration**:
   - Update `backend/src/recorders/recorder-adapter.interface.ts` with typed configuration methods:
     - `getChannelEncoding(channelId: string)`
     - `setChannelEncoding(channelId: string, config: ChannelVideoConfig)`
     - `getRecordingSchedule(channelId: string)`
     - `setRecordingSchedule(channelId: string, schedule: RecordingSchedule)`
     - `setTimeConfiguration(timeConfig: DeviceTimeConfig)`
   - Implement `NotSupported` defaults on `BaseRecorderAdapter` and `GenericRecorderAdapter` to maintain strict "UNKNOWN / NOT_SUPPORTED" semantics.
2. **Complete Missing ONVIF Introspection**:
   - In [`src/onvif/services/media-service.ts`](file:///c:/Omsystems/Omsystems/src/onvif/services/media-service.ts): Add `GetVideoEncoderConfigurationOptions` (`trt:GetVideoEncoderConfigurationOptions`) to query valid resolutions, framerate limits, and bitrate ranges.
   - In [`src/onvif/services/imaging-service.ts`](file:///c:/Omsystems/Omsystems/src/onvif/services/imaging-service.ts): Add `GetOptions` (`timg:GetOptions`) to query valid min/max ranges for brightness, contrast, saturation, sharpness, and exposure.
3. **Establish `DeviceConfigurationService`**:
   - Create `src/services/device-configuration.service.ts` unifying:
     - Access validation via `store.checkAccess`
     - Hardware capability checks via `DeviceCapabilityRegistry`
     - Snapshot generation before write
     - Read-after-write verification
     - Structured audit logging via `store.writeAudit`
4. **Consolidate Credential Encryption**:
   - Refactor `src/services/device-credential-service.ts` to delegate encryption and decryption directly to `src/security/vault/device-credential-vault.service.ts` (`AesGcmCredentialVault`).

---

### PHASE 2: Read-Only Device Configuration
*Goal: Provide complete, truthful reading of all device and recorder configuration without any mutation risk.*

1. **Camera Read Pipeline**:
   - Read video profiles (resolutions, codecs, framerate, bitrate).
   - Read image settings (brightness, contrast, saturation, sharpness, exposure mode, WDR, white balance).
   - Read system clock and offset from server.
   - Read network parameters (IP, subnet, gateway, DNS, ports).
2. **Recorder Read Pipeline**:
   - Read channel enumeration and camera bindings.
   - Read channel-specific stream states and recording states.
   - Read internal recording schedules (7-day grid).
   - Read storage health and SMART attributes.
3. **Expose Unified Read Endpoints**:
   - `GET /v1/devices/:id/configuration/video`
   - `GET /v1/devices/:id/configuration/imaging`
   - `GET /v1/devices/:id/configuration/network`
   - `GET /v1/devices/:id/configuration/time`
   - `GET /v1/recorders/:id/configuration/channels`
   - `GET /v1/recorders/:id/configuration/recording`
   - `GET /v1/recorders/:id/configuration/storage`

---

### PHASE 3: Safe Camera Configuration (Video, Imaging, Time)
*Goal: Allow modifying camera settings with pre-flight capability checks, rollback snapshots, and read-after-write verification.*

1. **Pre-Flight Capability Verification**:
   - Verify requested codec, resolution, and FPS are present in `GetVideoEncoderConfigurationOptions`.
   - Verify image values are within range bounds from `GetOptions`.
2. **Atomic Rollback Snapshot**:
   - Persist previous config state to `device_configuration_jobs.payload.previousConfig`.
3. **Apply & Verify Workflow**:
   - Execute adapter write command (`SetVideoEncoderConfiguration` / `SetImagingSettings` / `SetSystemDateAndTime`).
   - Query device actual configuration again.
   - Assert all desired parameters match physical reality.
   - Emit audit record and update `verified_at` timestamp.

---

### PHASE 4: DVR / NVR Configuration
*Goal: Provide channel, schedule, and clock configuration for recorders across supported vendors.*

1. **Channel Video Configuration**:
   - Configure channel codec, resolution, FPS, bitrate for recorder channels.
2. **Recording Schedule Configuration**:
   - Support 7-day 24-hour schedule matrices (Continuous, Motion, Alarm, Off).
   - Strict separation between internal recorder storage schedules and central VMS recording policies.
3. **Storage Health (Safe Read-Only)**:
   - Surface disk number, status, capacity, free space, and error indicators.
   - Destructive formatting remains disabled behind `DEVICE_STORAGE_FORMAT=false`.

---

### PHASE 5: Time Synchronization, Versioning & Drift Mitigation (COMPLETE ✅)
*Goal: Detect when physical device state drifts from desired template/clock, and support one-click rollback.*

1. **Camera Time & NTP Synchronization**:
   - Implemented `POST /v1/devices/:id/configuration/time` with automated snapshot pre-flight capture.
   - Dispatches `SetNTP` and `SetSystemDateAndTime` with manual and NTP server options.
   - Enforces banking evidentiary clock compliance: `<= 5s` SYNCHRONIZED, `5s - 30s` DRIFT_WARNING, `> 30s` DRIFT_CRITICAL.
   - Physical read-after-write verification on hardware.
2. **Recorder Time Management**:
   - Implemented `GET /v1/recorders/:id/configuration/time` and `POST /v1/recorders/:id/configuration/time`.
   - Dispatches time synchronization to recorder adapters with read-after-write verification.
3. **Real Device Read in Drift Engine**:
   - Replaced placeholder stub in `DeviceTemplateService.fetchDeviceConfiguration` with live calls to `DeviceConfigurationService.readDeviceConfiguration()`.
   - Aggregates video, imaging, time, and network components for physical drift verification.
4. **Rollback Restoration**:
   - Rollback engine restores `timeConfig` alongside video and imaging parameters.
   - 40/40 tests passing; 0 TypeScript errors across workspace.

---

### PHASE 6: Channel Management & Recording Schedules (DVR/NVR) (COMPLETE ✅)
*Goal: Provide authoritative channel encoding, 7-day recording schedule grid configuration, pre/post-record bounds verification, and automated rollback for DVR/NVR recorders.*

1. **Channel Video Encoding Configuration**:
   - Implemented `GET /v1/recorders/:id/configuration/channels/:channelId/encoding` and `PUT` / `POST` endpoints.
   - Allows configuring channel codec, resolution, FPS, and bitrate on recorder channels.
   - Pre-mutation snapshot capture enables automated rollback.
   - Hardware read-after-write verification flags drift if hardware returns unexpected values.
2. **7-Day Recording Schedule Grid Configuration**:
   - Implemented `GET /v1/recorders/:id/configuration/channels/:channelId/schedule` and `PUT` / `POST` endpoints.
   - Supports 7-day schedule matrices across `CONTINUOUS`, `MOTION`, `ALARM`, and `OFF` recording modes.
   - Zod schema validates time period integrity: `startHour * 60 + startMinute <= endHour * 60 + endMinute`.
   - Pre-record time strictly bounded $[0, 30]\text{s}$ (`INVALID_PRE_RECORD_TIME`).
   - Post-record time strictly bounded $[5, 300]\text{s}$ (`INVALID_POST_RECORD_TIME`).
   - Pre-mutation snapshot persisted to rollback store.
   - Read-after-write verification asserts enabled state and daily schedule periods match physical hardware.
3. **Rollback Restoration Engine**:
   - Enhanced `rollback()` engine to restore `snapshot.recordingSchedule` to the recorder channel.
   - Full audit trail logging for all recorder channel configuration changes.
4. **Automated Verification**:
   - 52/52 tests passing (19 service tests + 33 route tests).
   - 0 TypeScript errors across root, `@sentinel/edge-agent`, and `@sentinel/dashboard`.

---

### PHASE 7: Network Configuration (Safe & Guarded) (COMPLETE ✅)
*Goal: Safe inspection and modification of IP, subnet, gateway, DNS, and service ports with strict anti-lockout fail-safes and store synchronization.*

1. **Anti-Lockout Mathematical Subnet Reachability Validation**:
   - `validateSubnetReachability(ip, netmask, gateway)` converts IPv4 addresses to unsigned 32-bit integers.
   - Validates that the default gateway is in the exact same subnet domain: `(ipInt & maskInt) === (gwInt & maskInt)`, rejecting unreachable gateways with `400 INVALID_GATEWAY_SUBNET`.
   - Validates contiguous netmask using bitwise `(inverted & (inverted + 1)) === 0` and calculates prefix length via `Math.clz32(inverted)`.
   - Rejects IP assignments equal to network address (`INVALID_IP_ADDRESS`) or broadcast address (`INVALID_IP_ADDRESS`).
   - Rejects IP address colliding with the default gateway (`400 IP_COLLISION_WITH_GATEWAY`).

2. **Explicit Opt-in Confirmation & Safety Guard**:
   - Mutation requests MUST include `confirmNetworkChange: true`, preventing unintended disconnection of cameras/recorders. Missing or false flag returns `400 NETWORK_CONFIRMATION_REQUIRED`.
   - Respects environment flag `DEVICE_NETWORK_MUTATION_ENABLED` (returns `403 NETWORK_MUTATION_DISABLED` when disabled).

3. **Store Entity Synchronization**:
   - When network parameters are successfully mutated on physical hardware, the camera entity in `store` (`ipAddress`, `onvifPort`, `rtspPort`) is automatically synchronized so all VMS pipelines and background pollers seamlessly route to the new IP/port endpoint.

4. **ONVIF Device Service & Recorder Adapter Integration**:
   - Added `getNetworkInterfaces()`, `setNetworkInterfaces(token, config)`, `getNetworkDefaultGateway()`, `setNetworkDefaultGateway(gateways)`, `getDNS()`, and `setDNS(options)` to [`src/onvif/services/device-service.ts`](file:///c:/Omsystems/Omsystems/src/onvif/services/device-service.ts).
   - Added `getNetworkConfiguration?` and `setNetworkConfiguration?` to [`backend/src/recorders/recorder-adapter.interface.ts`](file:///c:/Omsystems/Omsystems/backend/src/recorders/recorder-adapter.interface.ts) with safe defaults in [`BaseRecorderAdapter`](file:///c:/Omsystems/Omsystems/backend/src/recorders/adapters/base-recorder.adapter.ts).

5. **Rollback Snapshot Restoration**:
   - Automatic pre-flight snapshot captures `networkConfig` before dispatching mutations.
   - `rollback()` restores IP, subnet, gateway, and DNS on both hardware and the database store.

6. **Automated Verification**:
   - **69/69 tests passing** (27 service tests + 42 route tests).
   - `npm run typecheck`, `npm run typecheck:test`, `@sentinel/edge-agent`, and `@sentinel/dashboard` all pass with **0 TypeScript errors**.
   - `npm run test:smoke` passes 16/16 test files (109 tests passed).

---

### PHASE 8: Device Configuration Center UI Integration
*Goal: Build a high-performance, banking-grade configuration center into the existing Dashboard.*

1. **Navigation & Breadcrumb Hierarchy**:
   - Head Office → State → Region → Branch → DVR/NVR → Channel → Camera.
2. **Camera Configuration View**:
   - Tabs: `General`, `Video`, `Image`, `Audio`, `PTZ`, `Events`, `Network`, `Time`, `Audit`.
   - Side-by-side comparison: `Current Value` vs `Desired Value` vs `Supported Range`.
3. **Recorder Configuration View**:
   - Tabs: `General`, `Network`, `Channels`, `Recording`, `Storage`, `Time`, `Users`, `Maintenance`.
   - Visual 7-day schedule grid with continuous and motion colored bands.
4. **Drift Warning Badges**:
   - Visual amber indicators for drifted parameters with `Reapply` and `Accept Actual` actions.

---

### PHASE 9: Configuration Templates Lifecycle
*Goal: Enterprise-wide golden configuration standards.*

1. **Template Authoring**:
   - Define baseline standards (e.g. `BANK_VAULT_1080P_H265`, `ATM_LOBBY_720P`).
   - Parameter variable substitution (`{{branch-gateway}}`, `{{branch-dns}}`, `{{assigned}}`).
2. **Assignment & Staged Activation**:
   - Assign templates to individual devices, entire branches, or camera classifications.
   - Track compliance percentages across the fleet.

---

### PHASE 10: Safe Bulk Rollout with Health Gates
*Goal: Mass configuration updates across multiple branches without risk of fleet-wide outages.*

1. **Compatibility Pre-Check**:
   - Evaluate selected fleet against hardware capabilities before applying changes (e.g. 437 compatible, 48 partially compatible, 15 unsupported).
2. **Staged Canary Rollout**:
   - Rollout phases: 5% → 25% → 50% → 100%.
   - Automated health gates: Abort immediately if device offline rate or stream failure rate increases.

---

### PHASE 11: Vendor Hardening
*Goal: Fine-tune vendor-specific ISAPI/CGI idiosyncrasies.*

1. **Hikvision ISAPI Hardening**:
   - Two-way digest authentication and channel URI normalization.
2. **Dahua / CP Plus CGI Hardening**:
   - Channel index mapping and Dahua RPC JSON protocol handling.
3. **Uniview Adapter Implementation**:
   - Dedicated Uniview REST/CGI adapter.

---

### PHASE 12: Real Hardware Certification Matrix
*Goal: Physical device testing and formal certification.*

1. **Certification Levels**:
   - `SIMULATED` → `PROTOCOL_TESTED` → `HARDWARE_TESTED` → `PILOT_VERIFIED`.
2. **Hardware Matrix Publishing**:
   - Document verified firmware releases for CP Plus, Hikvision, Dahua, and Uniview.

---

## 4. Exact Files Proposed for Phase 1

When authorized to begin Phase 1, only the following targeted files will be created or modified:

| Action | File Path | Scope of Work |
| :---: | :--- | :--- |
| **NEW** | `src/services/device-configuration.service.ts` | Authoritative configuration orchestrator (Permissions → Capabilities → Snapshot → Apply → Verify → Audit). |
| **NEW** | `src/types/device-configuration.types.ts` | Normalized domain types for video, image, network, time, and recorder settings. |
| **MODIFY** | `backend/src/recorders/recorder-adapter.interface.ts` | Add configuration method signatures to `RecorderAdapter`. |
| **MODIFY** | `backend/src/recorders/adapters/base-recorder.adapter.ts` | Add default `NotSupported` implementations for new configuration methods. |
| **MODIFY** | `src/onvif/services/media-service.ts` | Add `GetVideoEncoderConfigurationOptions` method. |
| **MODIFY** | `src/onvif/services/imaging-service.ts` | Add `GetOptions` method. |
| **MODIFY** | `src/services/device-credential-service.ts` | Refactor to use `AesGcmCredentialVault`. |
| **NEW** | `test/device-configuration.service.test.ts` | Unit tests for configuration validation, capability check, and read-after-write verification. |

---

## 5. Definition of Done for Future Phases

Any future implementation phase is only considered complete when:
- All new and modified code compiles with 0 TypeScript errors (`npm run typecheck`).
- Unit tests, integration tests, and failure-path tests are written and passing.
- No fake fallbacks, mock values, or dummy configurations are returned.
- Read-after-write verification is proven by automated tests.
- All modifications emit structured, redacted audit events to `audit_logs`.
