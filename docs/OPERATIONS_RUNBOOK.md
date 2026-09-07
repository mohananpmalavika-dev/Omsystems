# KRYPTOVISION / SENTINEL GRID — DAY-2 OPERATIONS & SRE RUNBOOK

> **Site Reliability Engineering (SRE) Runbook, Telemetry & Triage Guide**
> **Product**: KryptoVision Hybrid CCTV Control Plane & Forensic Evidence Vault
> **Port Reference**: \`3000\` (API), \`8443\` (mTLS), \`9464\` (Prometheus Metrics), \`8554\` (RTSP), \`8889\` (WebRTC)
> **Version**: v1.0.0-rc.2

---

## 1. System Health Checks & Telemetry Endpoints

Sentinel Grid exposes standardized health and telemetry probes for container orchestrators (Kubernetes/ECS) and external monitoring agents (Datadog, Grafana, Zabbix):

| Endpoint | Protocol | Purpose | Expected Response | Failure Action |
| :--- | :---: | :--- | :---: | :--- |
| \`GET /live\` | HTTP | Process liveness probe | \`200 OK {"status":"alive"}\` | Restart container |
| \`GET /ready\` | HTTP | Database & Redis connectivity | \`200 OK {"status":"ready"}\` | Remove node from load balancer pool |
| \`GET /health\` | HTTP | Comprehensive subsystem health | \`200 OK {"status":"ok", ...}\` | Triage degraded subcomponent |
| \`GET /metrics\` | HTTP (Port 9464) | Prometheus OpenTelemetry metrics | Prometheus exposition format | Alert SRE on-call |
| \`GET /api/v1/benchmarks/latest\` | HTTPS | Verified capacity & SLO stats | \`200 OK {"overallPassed":true}\`| Review SLO margin headroom |

---

## 2. Metrics & Observability Architecture

### Key Prometheus Metrics Scraped on Port \`9464\`

\`\`\`text
# Ingestion throughput & latency
sentinel_health_ingest_events_total{tenant_id="...", status="success"}
sentinel_health_ingest_duration_seconds_bucket{le="0.15"}

# Stream & camera fleet health
sentinel_camera_status_gauge{status="ONLINE|DEGRADED|OFFLINE", branch_id="..."}
sentinel_stream_bitrate_bytes{camera_id="...", stream_type="main|sub"}

# Incident & alert pipeline
sentinel_alerts_received_total{severity="P1|P2|P3|P4"}
sentinel_alert_storm_suppression_ratio_gauge
sentinel_incident_resolution_time_seconds{category="..."}

# Storage & 180-day retention
sentinel_storage_volume_bytes_used{volume_id="...", tier="hot|warm|cold"}
sentinel_storage_volume_bytes_total{volume_id="..."}
sentinel_retention_segments_held_total{tenant_id="..."}
\`\`\`

---

## 3. Incident Triage Playbooks

### Triage 1: Camera Stream Disconnect / RTSP 404/Timeout

- **Symptoms**: Camera tile in video wall shows black screen with \`STREAM_DISCONNECTED\` badge.
- **Root Causes**: Camera PoE switch port failure, duplicate IP address, changed password, or damaged physical cable.
- **Resolution Steps**:
  1. Inspect branch mosaic: Are other cameras on the same switch online?
     - If all cameras on the switch are down $\rightarrow$ check PoE switch power / uplink.
     - If only one camera is down $\rightarrow$ continue below.
  2. Execute remote diagnostic probe via API:
     \`\`\`bash
     curl -X POST "http://localhost:3000/api/v1/cameras/:cameraId/probe" \
       -H "Authorization: Bearer <TOKEN>"
     \`\`\`
  3. Verify RTSP stream authentication credentials:
     \`\`\`bash
     ffprobe -rtsp_transport tcp -v error -show_streams \
       "rtsp://admin:CurrentPass@<camera-ip>:554/Streaming/Channels/101"
     \`\`\`
  4. If credentials drifted, update credentials in the Device Inventory console; Sentinel will atomically test and reconnect without restarting the edge agent.

---

### Triage 2: Storage Volume High Watermark ($\ge 90\%$ Utilization)

- **Symptoms**: SRE alert \`StorageVolumePressureHigh\` triggered; disk usage exceeds 90%.
- **Automated Behavior**: Sentinel Grid's Smart Groomer automatically engages Stage 2 frame dropping (preserving keyframes while dropping non-incident P-frames).
- **Resolution Steps**:
  1. Verify active legal holds:
     \`\`\`bash
     curl -X GET "http://localhost:3000/api/v1/evidence/legal-holds/active" \
       -H "Authorization: Bearer <TOKEN>"
     \`\`\`
  2. Ensure legal holds are not holding expired test footage.
  3. Verify NFS/SMB mount connectivity and execute on-demand segment migration to cold S3 tier:
     \`\`\`bash
     curl -X POST "http://localhost:3000/api/v1/storage/volumes/:volumeId/migrate-cold" \
       -H "Authorization: Bearer <TOKEN>"
     \`\`\`

---

### Triage 3: Edge Agent Heartbeat Loss / Branch WAN Flap

- **Symptoms**: Dashboard displays branch status as \`OFFLINE\` with router warning badge.
- **System Defense**: Edge agent automatically engages **72-hour offline survivability**, storing recordings on local NVMe disk.
- **Resolution Steps**:
  1. Check ISP uplink connectivity: Ping branch router external IP.
  2. If broadband is down, verify if 4G backup failover link engaged.
  3. Once network recovers, monitor branch status transitioning from \`RECONCILING\` $\rightarrow$ \`HEALTHY\`. Check local buffer reconciliation progress:
     \`\`\`bash
     curl -X GET "http://localhost:3000/api/v1/branches/:branchId/reconciliation-status" \
       -H "Authorization: Bearer <TOKEN>"
     \`\`\`

---

### Triage 4: Clock Drift Warning ($> 2,000\text{ ms}$)

- **Symptoms**: Camera health evaluator emits \`CLOCK_DRIFT\` alert.
- **Risk**: Clock drift invalidates evidentiary timestamps in legal proceedings.
- **Resolution Steps**:
  1. Query branch NTP sync:
     \`\`\`bash
     curl -X GET "http://localhost:3000/api/v1/branches/:branchId/clock-drift" \
       -H "Authorization: Bearer <TOKEN>"
     \`\`\`
  2. Trigger automated NTP time synchronization command to the camera/NVR via ONVIF:
     \`\`\`bash
     curl -X POST "http://localhost:3000/api/v1/cameras/:cameraId/sync-clock" \
       -H "Authorization: Bearer <TOKEN>"
     \`\`\`

---

## 4. Routine Maintenance Procedures

### 4.1 Safe Camera Decommissioning
Never delete cameras directly from the database using SQL \`DELETE\`! Deleting records directly breaks foreign key constraints and orphans historical evidence files.

Always execute safe decommissioning via the verified script:
\`\`\`bash
# Preview deletion without applying changes
npm run cameras:delete:dry-run -- --branch="branch-aluva-178"

# Execute safe deletion (preserves archived evidence and audit logs)
npm run cameras:delete:branch -- --branch="branch-aluva-178" --confirm
\`\`\`

### 4.2 Applying Database Schema Migrations in Production
\`\`\`bash
# 1. Take a verified pre-migration backup
npm run backup:database

# 2. Check pending migrations
npm run migrate:status

# 3. Apply migrations in transactional lock
npm run migrate

# 4. Verify system readiness
curl http://localhost:3000/ready
\`\`\`
