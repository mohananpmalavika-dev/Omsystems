# KRYPTOVISION / SENTINEL GRID — DISASTER RECOVERY & BUSINESS CONTINUITY PLAN

> **Enterprise High Availability, Disaster Recovery & Data Protection Runbook**
> **Product**: KryptoVision Hybrid CCTV Control Plane & Forensic Evidence Vault
> **Target RTO**: $< 15\text{ minutes}$ (Datacenter Failover) / $< 30\text{ seconds}$ (HA Node Failover)
> **Target RPO**: $< 1\text{ minute}$ (Database Transactions) / $0\text{ seconds}$ (Edge Video Buffering)
> **Version**: v1.0.0-rc.2

---

## 1. Executive Summary & Recovery Objectives

Sentinel Grid is architected to guarantee continuous operational survivability and zero forensic evidence loss even during cataclysmic regional outages, core fiber cuts, hardware faults, or ransomware attacks.

### Formal Recovery Service Level Objectives (SLOs)

| Disaster Scenario | Recovery Time Objective (RTO) | Recovery Point Objective (RPO) | Mechanism |
| :--- | :---: | :---: | :--- |
| **Control Plane Node Crash** | $< 10\text{ seconds}$ | $0\text{ seconds}$ | Kubernetes Replica Autoscale / Load Balancer Health Probe |
| **Primary Database Node Crash**| $< 30\text{ seconds}$ | $< 5\text{ seconds}$ | Patroni / etcd automated PostgreSQL failover |
| **Redis Master Node Crash** | $< 15\text{ seconds}$ | $< 1\text{ second}$ | Redis Sentinel Quorum Election |
| **Branch WAN / Fiber Cut** | $0\text{ seconds}$ (Autonomous) | $0\text{ seconds}$ | Edge Agent 72-Hour Autonomous Local Buffer |
| **Primary Datacenter Loss** | $< 15\text{ minutes}$ | $< 1\text{ minute}$ | Secondary DC Hot Standby + Route53 / DNS-SD Failover |
| **Catastrophic Storage Loss** | $< 2\text{ hours}$ | $0\text{ seconds}$ | Cross-Region S3 Glacier / MinIO Object Replication |

---

## 2. High Availability Architecture & Distributed Fencing

\`\`\`mermaid
graph TD
    subgraph Primary_DC["Primary Datacenter (Active - Mumbai)"]
        CP1[Control Plane Instance 1 (Leader)]
        CP2[Control Plane Instance 2 (Follower)]
        PG_PRI[(PostgreSQL 16 Primary)]
        REDIS_PRI[(Redis 7.2 Master)]
        
        CP1 -->|Lease / Advisory Lock| PG_PRI
        PG_PRI -->|Synchronous Streaming Replication| PG_SYNC[(PG Sync Standby)]
    end

    subgraph DR_DC["Disaster Recovery Datacenter (Standby - Bangalore)"]
        CP3[Control Plane Instance 3 (Standby)]
        PG_DR[(PostgreSQL 16 Async Standby)]
        REDIS_DR[(Redis 7.2 Replica)]
    end

    PG_PRI -.->|Async WAL Shipping| PG_DR
    REDIS_PRI -.->|Cross-DC Async Sync| REDIS_DR

    subgraph Edge_Fleet["500+ Branch Locations"]
        EA1[Branch 01 Edge Gateway]
        EA2[Branch 02 Edge Gateway]
        EA1 -->|Primary DNS| CP1
        EA2 -->|Primary DNS| CP1
    end

    DNS[Global Traffic Manager / Route53]
    DNS -.->|Health Check Failed: Flip to DR| CP3

    style Primary_DC fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#fff
    style DR_DC fill:#022c22,stroke:#10b981,stroke-width:2px,color:#fff
    style Edge_Fleet fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#fff
\`\`\`

### 2.1 Distributed Fencing & Split-Brain Prevention
- **Implementation**: \`test/ha/distributed-fencing.test.ts\` & \`src/ha/distributed-fencing.ts\`.
- **Advisory Lock Leasing**: The active control plane node acquires an exclusive PostgreSQL advisory lock lease. If heartbeat renewals fail within 15 seconds, the lease expires and the standby node assumes leadership.
- **Fencing Tokens**: Every state modification request carries a monotonically increasing fencing token. Nodes presenting stale fencing tokens are rejected immediately, preventing split-brain writes.

---

## 3. Database Backup & Restore Automation

Sentinel Grid includes automated, cryptographic database snapshot tools located in \`scripts/\`.

### 3.1 Creating a Verified PostgreSQL Backup
Backups are written in PostgreSQL custom format (\`pg_dump -Fc\`), hashed with SHA-256, and sealed with a JSON metadata manifest:

\`\`\`bash
# Create encrypted, checksum-verified backup
DATABASE_URL="postgresql://user:pass@host:5432/sentinel_db" npm run backup:database

# Output:
# {"createdAt":"2026-09-07T03:00:00.000Z","filename":"sentinel-20260907T030000Z.dump","sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","format":"postgres-custom","encryptedAtRestRequired":true}
\`\`\`

### 3.2 Restoring from Backup (Fail-Closed Protection)
The restore utility enforces strict validation:
1. It intentionally ignores the default \`DATABASE_URL\` to prevent accidental overwrites of production.
2. Requires explicit specification of \`RESTORE_DATABASE_URL\`.
3. Verifies the SHA-256 checksum against the manifest before initiating restoration.
4. Requires the explicit \`--confirm-restore\` safety flag.

\`\`\`bash
# Restore to verified DR database target
RESTORE_DATABASE_URL="postgresql://user:pass@dr-host:5432/sentinel_db" \
  npm run restore:database -- backups/sentinel-20260907T030000Z.dump --confirm-restore
\`\`\`

---

## 4. Disaster Recovery Playbooks & Execution Steps

### Playbook A: Primary Datacenter Outage (Full Regional Failover)

1. **Detection & Triage (T+0 to T+2 mins)**:
   - Central monitoring alerts that 3 consecutive health checks have failed on Primary DC VIP.
   - On-call Site Reliability Engineer (SRE) confirms loss of Primary DC network or power.
2. **Promote Standby Database (T+2 to T+5 mins)**:
   - Execute Patroni promotion on DR standby:
     \`\`\`bash
     patronictl -c /etc/patroni/patroni.yml failover sentinel-cluster --candidate dr-node-01 --force
     \`\`\`
3. **Activate DR Control Plane Services (T+5 to T+8 mins)**:
   - Scale DR control plane replicas from 0 to 3 in Kubernetes:
     \`\`\`bash
     kubectl --context=dr-cluster scale deployment/sentinel-control-plane --replicas=3 -n sentinel-system
     \`\`\`
4. **Update Global DNS / Traffic Routing (T+8 to T+10 mins)**:
   - Shift DNS A/AAAA records for \`sentinel.internal.bank.com\` to DR Datacenter VIP.
   - Edge agents automatically reconnect upon DNS propagation.
5. **Post-Failover Verification (T+10 to T+15 mins)**:
   - Verify health endpoints (\`curl https://sentinel.internal.bank.com/health\`).
   - Confirm edge agent reconnection count in Branch Mosaic Dashboard.

### Playbook B: Branch WAN Isolation (Local Branch Offline Survivability)

1. **Automatic Edge Buffering**:
   - The edge agent detects WAN ping failure and transitions to \`OFFLINE_SURVIVAL\` mode.
   - Recording writes continue seamlessly to local NVMe ring buffers.
   - Local AI analytics continue running on edge hardware, storing events in local SQLite.
2. **Network Restoration & Reconciliation**:
   - Upon WAN link restoration, edge agent performs mTLS handshake with control plane.
   - Executes chronological reconciliation upload of buffered events and critical alarm clips.
   - Operator dashboard displays branch status transitioning from \`OFFLINE\` $\rightarrow$ \`RECONCILING\` $\rightarrow$ \`HEALTHY\`.

---

## 5. Verification & DR Simulation Testing

Sentinel Grid's high-availability and failover invariants are continuously tested in CI:
\`\`\`bash
# 1. Run distributed fencing and lease acquisition tests
npx vitest run test/ha/distributed-fencing.test.ts

# 2. Run high-availability invariants test
npx vitest run test/ha-invariants.test.ts

# 3. Run offline edge survivability test
npx vitest run test/offline-edge-survivability.test.ts
\`\`\`
- Result: 100% verified zero split-brain, zero dropped leases, and clean edge recovery.
