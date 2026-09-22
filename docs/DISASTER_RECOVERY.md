# Sentinel Grid: Disaster Recovery & High-Availability Plan

**Document Version:** 1.0.0-PROD  
**Target Recovery Service Levels:** BFSI Tier-1 Critical  
**Target RPO / RTO:** RPO < 1 min (Metadata), RPO < 15 min (Video) | RTO < 5 min (Failover)  

---

## 1. RPO & RTO Objectives

| Data / Service Tier | Maximum Allowable RPO | Target RTO | Redundancy Mechanism |
| :--- | :--- | :--- | :--- |
| **Audit Logs & Chain of Custody** | **Zero Loss (RPO = 0)** | < 1 Minute | Synchronous Write + HSM Hashing |
| **Active Incidents & Alerts** | < 10 Seconds | < 2 Minutes | PostgreSQL Streaming Replication |
| **Camera Configurations & RBAC**| < 1 Minute | < 5 Minutes | Distributed Raft Leases & Daily Backups |
| **Live Video Streaming** | Transient Reconnect | < 15 Seconds | Media Gateway N+1 Pool Failover |
| **Recorded Video Segments** | < 15 Minutes | < 30 Minutes | S3 Cross-Region Storage Replication |
| **Branch Edge Operations** | **Zero Loss (RPO = 0)** | Zero Disruption | Local SQLite Ring Buffer During WAN Outage |

---

## 2. Backup & Restoration Procedures

### 2.1 Automated PostgreSQL Backup
```bash
# Automated nightly physical backup with WAL archiving
pg_dump -U sentinel_prod -Fc -f /backups/sentinel_db_$(date +%Y%m%d_%H%M%S).dump sentinel_db
```

### 2.2 Restoration Drill
```bash
# Emergency database restore command
pg_restore -U sentinel_prod -d sentinel_db -c /backups/sentinel_db_target.dump
npm run migrate
```

### 2.3 Edge Agent Disaster Recovery & Re-Provisioning
1. If a branch edge gateway suffers complete hardware failure, install a replacement unit.
2. Run `START_SCANNER.bat` with the pre-assigned branch activation token.
3. The Control Plane transmits the cryptographically signed `signed_branch_config` to the agent.
4. Edge Agent automatically reconnects to all branch cameras without manual IP re-entry.
