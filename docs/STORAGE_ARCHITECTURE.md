# KRYPTOVISION / SENTINEL GRID — STORAGE ARCHITECTURE & 180-DAY RETENTION SPECIFICATION

> **Enterprise Surveillance Storage Tiering & Long-Term Forensic Retention Architecture**
> **Modules**: \`recording-engine/src/backends/\` & \`src/retention/\`
> **Storage Targets**: Local NVMe/SSD, NFS v4, SMB 3.0, SAN (iSCSI/FC), AWS S3 / MinIO (WORM)
> **Version**: v1.0.0-rc.2

---

## 1. Storage Architecture Overview

Video surveillance generates massive continuous data volumes that must be retained reliably, economically, and compliantly. Sentinel Grid employs a **3-Tier Storage Lifecycle** combining high-speed edge ring buffers with centralized elastic WORM object archives.

\`\`\`mermaid
graph TD
    subgraph Tier1["Tier 1: Edge Ring Buffer (Hot)"]
        CAM[4,000+ CCTV Cameras] -->|Continuous MP4 Segments| NVME[Local NVMe / SSD]
        NVME -->|Retention: 72 Hours| RING[Circular Overwrite Ring]
    end

    subgraph Tier2["Tier 2: Branch NAS / NFS (Warm)"]
        NVME -->|Segment Sync| NFS[Local Branch NAS / SMB 3.0]
        NFS -->|Retention: 30 Days| WARM[Warm Searchable Archive]
    end

    subgraph Tier3["Tier 3: Enterprise Cold Vault (Cold / WORM)"]
        NFS -->|Alarm Clips & Groomed Keyframes| S3[MinIO / AWS S3 Object Storage]
        S3 -->|Retention: 180 Days| IMMUTABLE[Object Lock WORM Compliance Vault]
    end

    subgraph Retention_Engine["Sentinel Retention & Pruning Controller"]
        LH[Legal Hold Subsystem: Zero-Delete Enforcement]
        GROOM[Smart Grooming: Adaptive Frame Dropping]
        AUDIT[Cryptographic Segment Sealing & Verification]
    end

    Retention_Engine -.-> Tier1
    Retention_Engine -.-> Tier2
    Retention_Engine -.-> Tier3

    style Tier1 fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#fff
    style Tier2 fill:#022c22,stroke:#10b981,stroke-width:2px,color:#fff
    style Tier3 fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#fff
    style Retention_Engine fill:#450a0a,stroke:#ef4444,stroke-width:2px,color:#fff
\`\`\`

---

## 2. Multi-Tier Storage Hierarchy

### Tier 1: Edge Hot Ring Buffer (\`FilesystemStorageBackend\`)
- **Medium**: High-endurance NVMe / SSD installed inside the branch edge gateway or NVR.
- **Format**: Fragmented MP4 (\`fMP4\`) chunks of 60-second duration, keyed by \`YYYY/MM/DD/HH/<camera_id>_<timestamp>.mp4\`.
- **Retention**: 72 hours rolling ring buffer.
- **Guarantees**: Write latency $< 5\text{ ms}$; immune to WAN outages.

### Tier 2: Branch Warm Storage (\`NfsStorageBackend\` / \`SmbStorageBackend\`)
- **Medium**: Local Branch Network Attached Storage (Synology, QNAP, or TrueNAS) mounted via NFSv4 or SMB 3.0.
- **Retention**: 30 to 45 days.
- **Failover & Reconnect**: SMB backend includes automatic session reconnection state machine; NFS includes mount identity validation (\`verifyMountIdentity\`) to prevent writes into unmounted local mountpoints.

### Tier 3: Central Forensic Vault (\`S3StorageBackend\` / \`SanMountedStorageBackend\`)
- **Medium**: MinIO Enterprise Object Storage or AWS S3 Standard-IA / Glacier Instant Retrieval.
- **Capacity Semantics**: Pure elastic object store semantics (reported accurately as \`ELASTIC\` without fabricating artificial capacity limits).
- **Retention**: Mandatory **180-day compliance retention** for financial institutions (RBI, SEBI, and banking regulatory standards).
- **Compliance WORM**: MinIO/S3 Object Lock in Compliance Mode prevents premature deletion, even by root/admin accounts.

---

## 3. 180-Day Retention Engine & Smart Grooming

### 3.1 Smart Grooming (Pressure-Relief Pruning)
When a storage volume approaches physical capacity ($\ge 90\%$ utilization), Sentinel Grid's Smart Groomer executes tiered degradation instead of dropping recordings entirely:
1. **Stage 1 (Normal Operations - Days 1–30)**: Full frame rate (25/30 FPS), 1080p/4K resolution, continuous audio.
2. **Stage 2 (Groomed Warm - Days 31–90)**: Non-alarm footage drops B-frames and P-frames, preserving high-resolution I-frames (keyframes) at 1–2 FPS. Motion and alarm video remain untouched at full 25 FPS.
3. **Stage 3 (Long-Term Cold - Days 91–180)**: Preserves incident clips, alarmed event triggers, and periodic reference keyframes.
4. **Stage 4 (Day 181+)**: Purges expired unheld segments automatically, updating segment catalogs in PostgreSQL.

### 3.2 Legal Hold Subsystem (\`LegalHoldService\`)
- **Absolute Immutability**: Any recording segment associated with an active legal hold, insurance claim, or criminal investigation cannot be pruned or deleted under any circumstances.
- **Zero-Delete Enforcement**: Database triggers and API authorization checks immediately fail-closed and reject any deletion or grooming request matching a segment with an active \`legal_hold_id\`.
- **Audit Trail**: Creation, extension, and release of legal holds require dual-authorized operator credentials and are recorded in the tamper-proof custody ledger.

---

## 4. Storage Failover & Segment Recovery

### 4.1 Automatic Failover (\`StorageFailoverCoordinator\`)
If the primary recording target fails (e.g., branch NAS disconnects or reports I/O error \`ENOSPC\` / \`EIO\`), Sentinel automatically switches recording writes to a secondary emergency volume in $< 500\text{ ms}$, ensuring zero dropped video seconds.

### 4.2 Segment Reconciliation (\`SegmentRecoveryWorker\`)
When an edge agent reconnects after a branch network partition:
1. The central recording engine compares the cloud segment index against the edge ring buffer index.
2. Identifies missing timestamp gaps ($\Delta t$).
3. Queues asynchronous store-and-forward chunk transfers with bandwidth throttling so live video streaming is not impacted.
4. Cryptographically validates chunk SHA-256 hashes upon receipt and seamlessly splices the segments into the historical timeline.

---

## 5. Storage Verification & Test Suites

The storage architecture is verified by dedicated automated tests:
\`\`\`bash
# 1. Run storage production contract certification audit
npm run verify:storage-production

# 2. Run storage unit contracts
npm run test:storage:unit

# 3. Run multi-backend integration tests (Filesystem, NFS, SMB, S3)
npm run test:storage:integration

# 4. Run automated failover tests
npm run test:storage:failover

# 5. Run segment reconciliation & recovery tests
npm run test:storage:recovery
\`\`\`
- Result: 100% test pass rate across all storage contracts, mount authentications, and WORM legal hold enforcement.
