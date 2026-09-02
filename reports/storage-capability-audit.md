# SENTINEL GRID — STORAGE CAPABILITY AUDIT REPORT

**Audit Date**: September 2, 2026  
**Auditor**: Sentinel Grid Architecture Governance  
**Scope**: Recording Engine & Platform Storage Layer (`recording-engine/`, `src/retention/`, `src/evidence/`, `config/capabilities/`)  
**Status**: `AUDITED & CLASSIFIED`

---

## Executive Summary

This audit evaluated all storage providers and mechanisms across Sentinel Grid to verify real read/write capabilities, checksum verification, failover durability, mount verification, disk-full protections, retention/legal hold enforcement, and integration test coverage.

No provider is marked `PRODUCTION` merely because a class or stub exists. Every provider status is derived from verified automated tests and real runtime behavioral contracts.

---

## 16-Column Storage Capability Audit Matrix

| Provider | Implementation exists | Real read | Real write | Delete | Capacity metrics | Write probe | Checksum verification | Reconnect | Failover tested | Disk-full tested | Retention tested | Legal hold tested | Integration tested | Current maturity | Production blockers |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Local Disk (ext4 / NTFS / XFS)** | ✅ | ✅ | ✅ | ✅ | ✅ (statfs) | ✅ (atomic) | ✅ (SHA-256) | N/A (Local) | ✅ | ✅ | ✅ | ✅ | ✅ | `PRODUCTION` | None. Crash-safe atomic write, fsync, and watermark reservation enforced. |
| **NFS / NAS (v4 / v3)** | ✅ | ✅ | ✅ | ✅ | ✅ (statfs) | ✅ (atomic) | ✅ (SHA-256) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `PRODUCTION` | None. Mount identity verification (`MountIdentityVerifier`) prevents root-disk leakage on unmount. |
| **SMB / CIFS (Windows UNC / Mounted)** | ✅ | ✅ | ✅ | ✅ | ✅ (statfs) | ✅ (atomic) | ✅ (SHA-256) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `PRODUCTION` | None. Exponential backoff reconnect state machine and write-probe verification active. |
| **SAN (iSCSI / Fibre Channel / Multipath)** | ✅ | ✅ | ✅ | ✅ | ✅ (statfs) | ✅ (atomic) | ✅ (SHA-256) | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ (Emulated/Unit) | `BETA` | Hardware FC/iSCSI target lab certification required before enterprise sign-off. |
| **S3 Object Storage (AWS S3 / MinIO)** | ✅ | ✅ | ✅ | ✅ | ✅ (Elastic) | ✅ (S3 API) | ✅ (Pre-upload SHA-256 + HEAD) | ✅ | ✅ | ✅ (Store & Forward) | ✅ | ✅ (Object Lock / Tagging) | ✅ | `PRODUCTION` | None. AWS SDK v3 client, multipart recovery, and store-and-forward active. |
| **Cloud Archive (Glacier / Deep Archive Tier)** | ✅ | ✅ | ✅ | ✅ | ✅ (Tiered) | N/A (Lifecycle) | ✅ (SHA-256) | ✅ | ✅ | N/A (Tiered) | ✅ | ✅ | ✅ | `PRODUCTION` | Reclassified as S3 storage tier with lifecycle policies and archive state tracking. |

---

## Key Invariants & Remediation Directives

1. **Storage Backend Kind Separation**:
   - `FILESYSTEM`: Local Disk, NFS, SMB, and SAN operate through filesystem semantics with atomic staging, `fsync`, and directory sync.
   - `OBJECT_STORE`: S3 operates through key-based object semantics with pre-upload SHA-256 and multipart lifecycle recovery.

2. **Canonical Storage Locators**:
   - Filesystem locators: `{ kind: 'FILESYSTEM', path: '/mnt/recordings/...' }`
   - S3 locators: `{ kind: 'S3', bucket: 'sentinel-recordings', key: 'recordings/...', versionId?: '...' }`

3. **Elastic Capacity Truth**:
   - S3 storage never reports fake 5 PB numbers. Capacity is typed as `type: 'ELASTIC'`, `totalBytes: null`, `availableBytes: null`, `usedBytes: number | null`.

4. **NFS Mount Identity Verification**:
   - `MountIdentityVerifier` verifies that the target mount point is an active mount with the expected filesystem type and remote host before any write. Fails closed with `STORAGE_OFFLINE` if the remote share disappears.

5. **SMB Reconnect State Machine**:
   - Reconnection progresses through `DISCONNECTED -> RECONNECTING -> VERIFYING -> CONNECTED` with exponential backoff (1s, 2s, 5s, 10s, 20s, 30s max) and write-probe + read-back verification.

6. **Legal Hold Overrides Retention**:
   - `LegalHoldService.isProtected(segmentId)` overrides camera retention, branch retention, storage pressure, and archive expiration. All deletions are audited.
