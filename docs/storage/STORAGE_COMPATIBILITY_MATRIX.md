# Sentinel Grid — Storage Compatibility & Certification Matrix

**Document Version**: 1.0.0  
**Last Updated**: September 2, 2026  
**Evaluation Standard**: Sentinel Grid High-Assurance VMS Storage Contract  

---

## 1. Authoritative Storage Compatibility Matrix

| Provider / Tier | Protocol / API | OS Support | Write | Read | Recovery | Failover | Legal Hold | Certification Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Local Disk (ext4)** | POSIX / Direct I/O | Linux (Ubuntu, RHEL) | ✅ | ✅ | ✅ | ✅ | ✅ | **PRODUCTION** |
| **Local Disk (NTFS)** | Win32 / Direct I/O | Windows Server 2022+ | ✅ | ✅ | ✅ | ✅ | ✅ | **PRODUCTION** |
| **Local Disk (XFS)** | POSIX / Direct I/O | Linux (RHEL 9+) | ✅ | ✅ | ✅ | ✅ | ✅ | **PRODUCTION** |
| **NFS v4.1 / v4.2** | NFSv4 Mount | Linux | ✅ | ✅ | ✅ | ✅ | ✅ | **PRODUCTION** |
| **NFS v3** | NFSv3 Mount | Linux | ✅ | ✅ | ✅ | ✅ | ✅ | **PRODUCTION** |
| **SMB 3.x (Linux Mount)** | CIFS / SMB3 | Linux | ✅ | ✅ | ✅ | ✅ | ✅ | **PRODUCTION** |
| **SMB 3.x (Windows UNC)** | Win32 UNC (`\\host\share`) | Windows Server | ✅ | ✅ | ✅ | ✅ | ✅ | **PRODUCTION** |
| **AWS S3** | REST / AWS SDK v3 | Cross-Platform | ✅ | ✅ | ✅ | ✅ | ✅ | **PRODUCTION** |
| **MinIO** | S3-Compatible API | Cross-Platform | ✅ | ✅ | ✅ | ✅ | ✅ | **PRODUCTION** |
| **S3 Glacier / Deep Archive** | S3 Tiered Lifecycle | Cross-Platform | ✅ | ✅ | ✅ | ✅ | ✅ | **PRODUCTION** |
| **iSCSI / FC SAN** | Mounted Block Device | Linux / Windows | ✅ | ✅ | ✅ | ✅ | ✅ | **BETA** *(Hardware lab certification pending)* |

---

## 2. Invariants & Storage Durability Guarantees

### A. Crash-Safe Atomic Writes
All filesystem-based writes follow the deterministic sequence:
1. Write to `.partial` / `.tmp` staging file.
2. `fsync` file descriptor to commit dirty disk pages.
3. Compute and verify SHA-256 hash against expected checksum.
4. Atomic `rename` to target destination path.
5. `fsync` parent directory.

### B. NFS Mount Disappearance Protection (`MountIdentityVerifier`)
Prior to accepting writes or probes, the `NfsStorageBackend` verifies `/proc/mounts` to confirm:
- The mount point is an active mount.
- The filesystem type matches NFS (`nfs`, `nfs4`).
- The remote source host matches configuration.

If the NFS share unmounts or drops, writes fail closed immediately (`STORAGE_OFFLINE` / `MountDisappearedError`) to prevent catastrophic local root disk overflow.

### C. SMB Reconnect State Machine
SMB connections transition through `CONNECTED -> DEGRADED -> DISCONNECTED -> RECONNECTING -> VERIFYING -> CONNECTED` with exponential backoff (1s, 2s, 5s, 10s, 20s, 30s max) and write-probe + read-back verification before restoring healthy status.

### D. S3 Integrity & Multipart Recovery
- Pre-upload SHA-256 is computed and stored in object metadata (`x-amz-meta-sha256`).
- Uploads are verified via `HeadObject` checking both byte length and SHA-256 checksum.
- `MultipartUploadRecoveryService` scans and aborts orphaned multipart uploads following crashes.
- Elastic capacity semantics: S3 reports `capacity: { type: 'ELASTIC', totalBytes: null, usedBytes, availableBytes: null }`.

### E. Legal Hold Protection
`LegalHoldService.isProtected(segmentId)` strictly overrides all retention policies, storage pressure relief, and archive expirations. Physical deletion is prohibited until an authorized legal hold release workflow is completed.
