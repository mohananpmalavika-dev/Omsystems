# Sentinel Grid / KryptoVision — Comprehensive Troubleshooting & Root Cause Analysis Guide

> **Enterprise Incident Diagnostic & Remediation Guide**  
> **Audience**: Level 2/3 SOC Engineers, SREs, Systems Administrators, Field Technicians  
> **Platform**: Sentinel Grid Enterprise Hybrid VMS (500+ Branches, 5,000+ Cameras)  
> **Status**: Production Authoritative Runbook

---

## 1. Quick Diagnostic Triage (60-Second Health Check)

Run this sequence on the primary control plane or affected edge appliance:

```bash
# 1. Check system container status
docker compose ps
# or systemd services:
sudo systemctl status sentinel-api sentinel-media sentinel-edge

# 2. Check HTTP deep readiness probe
curl -s http://127.0.0.1:3000/health/readiness | jq .

# 3. Check storage volume space and inodes
df -hT /var/lib/sentinel/recordings
df -i /var/lib/sentinel/recordings

# 4. Check system clock synchronization (NTP)
chronyc tracking

# 5. Check edge-to-cloud mTLS connectivity
openssl s_client -connect central.vms.internal:8443 \
  -cert /etc/sentinel/certs/client.crt \
  -key /etc/sentinel/certs/client.key \
  -CAfile /etc/sentinel/certs/ca.crt -quiet
```

---

## 2. Issue Categories & Remediation Procedures

### 2.1 Camera Offline / Stream Disconnects & Reconnect Storms

#### Symptoms
- Camera tile shows `OFFLINE` or `DEGRADED`.
- Repeated `RTSP_SOCKET_TIMEOUT` or `ECONNREFUSED` entries in edge agent logs.
- Spikes in CPU and network usage during branch-wide reconnect storms.

#### Diagnostic Flow
```
                 [Camera Shows Offline]
                           │
                 Ping Camera IP address
                 ├── Fails ──► Check PoE Switch, patch cable, or branch camera VLAN.
                 └── OK ─────► Probe RTSP port 554: nc -zv <cam_ip> 554
                               ├── Port closed ──► Reboot camera / firmware crashed.
                               └── Port open ────► Test stream with ffprobe:
```
```bash
ffprobe -rtsp_transport tcp "rtsp://admin:Password123@192.168.1.100:554/Streaming/Channels/101"
```

#### Remediation Steps
1. **Credentials Changed**: If `ffprobe` returns `401 Unauthorized`, verify camera credentials in `Camera Verification Registry` via UI or API:
   ```bash
   curl -X POST http://localhost:3000/api/v1/devices/<camera_id>/verify-credentials
   ```
2. **Packet Loss & MTU Fragmentation**: If stream stutters, check if MTU is dropping packets:
   ```bash
   ping -s 1472 -M do 192.168.1.100
   ```
   If fragmented, switch the RTSP transport setting from UDP to TCP Interleaved in device configuration.
3. **Throttling Reconnect Storms**: Ensure exponential backoff circuit breaker is active in `edge-agent.conf`:
   ```json
   { "reconnect": { "baseMs": 1000, "maxMs": 30000, "jitter": 0.25, "maxConcurrent": 5 } }
   ```

---

### 2.2 Recording Continuity Gaps & Disk-Full Events

#### Symptoms
- Playback scrubber displays red gap bars in timeline.
- Alert: `RECORDING_CONTINUITY_VIOLATION` or `STORAGE_PROTECTION_TRIPPED`.

#### Root Causes & Diagnostics
1. **Local NVMe Buffer Exhaustion**:
   Check disk usage on the recording node:
   ```bash
   df -h /mnt/recordings
   ```
   *If disk usage $>95\%$*: The emergency disk cleanup protection will automatically trip to prevent filesystem corruption.
2. **Stuck S3 Upload Worker**:
   Check BullMQ background queue for delayed uploads:
   ```bash
   redis-cli -u $REDIS_URL LLEN "bull:recording-vault-upload:wait"
   ```
3. **Database Write Bottlenecks**:
   Examine unindexed queries or deadlocks on the `recording_segments` table:
   ```sql
   SELECT pid, age(clock_timestamp(), query_start), query 
   FROM pg_stat_activity 
   WHERE state != 'idle' AND query LIKE '%recording_segments%';
   ```

#### Remediation
- Run manual retention pruner to evict segments beyond retention SLA:
  ```bash
  npm run retention:prune -- --dryRun=false --minDays=30
  ```
- Restart the recording engine worker process:
  ```bash
  sudo systemctl restart sentinel-recording-engine
  ```

---

### 2.3 AI Model Unavailability & Inference Latency Spikes

#### Symptoms
- Capability status in AI Control Center shows `MODEL_UNAVAILABLE` or `INFERENCE_FAILED`.
- Video analytics latency exceeds 200ms budget per frame.

#### Root Causes & Diagnostics
1. **Missing Model Weights**:
   Check if required ONNX model weights exist on disk:
   ```bash
   ls -la /opt/sentinel/models/
   # Required files:
   # yolox_tiny.onnx
   # yunet.onnx
   # sface.onnx
   # lpd_yunet.onnx
   # crnn_anpr.onnx
   # pulc_helmet.onnx
   ```
   If any file is missing, the AI Capability Registry truth state correctly reports `MODEL_UNAVAILABLE`. Download verified models:
   ```bash
   npm run models:fetch-verified
   ```
2. **GPU Memory (VRAM) Starvation**:
   On GPU-accelerated edge nodes, check VRAM consumption:
   ```bash
   nvidia-smi
   ```
   If GPU out-of-memory errors occur, reduce batch size or enable dynamic frame skipping:
   ```bash
   export AI_MAX_BATCH_SIZE=4
   export AI_FRAME_SAMPLE_RATE=5  # sample every 5th frame
   ```
3. **CPU Execution Fallback**:
   If CUDA is not initialized, ONNX Runtime falls back to CPU execution, which may cause latency spikes. Check execution provider in logs:
   ```bash
   grep "ONNX Execution Provider" /var/log/sentinel/analytics.log
   ```

---

### 2.4 Mutual TLS (mTLS) Handshake & Clock Drift Errors

#### Symptoms
- Edge agent cannot register with central control plane.
- Error in logs: `CERT_HAS_EXPIRED`, `ERR_TLS_CERT_ALTNAME_INVALID`, or `TOKEN_TIMESTAMP_SKEW`.

#### Diagnostics
1. **Verify Certificate Expiration & SAN**:
   ```bash
   openssl x509 -in /etc/sentinel/certs/client.crt -noout -dates -subject -issuer
   ```
2. **Clock Drift Analysis**:
   JWT authentication and signed edge configuration verification reject tokens with clock drift $>60$ seconds.
   Check system clock against reference NTP pool:
   ```bash
   chronyc tracking
   ```
   *Expected*: `System time : 0.000000000 +/- 0.005 seconds`

#### Remediation
- Synchronize system clock immediately:
  ```bash
  sudo chronyc makestep
  ```
- Re-issue expiring edge client certificates:
  ```bash
  npm run pki:rotate-cert -- --edgeId=branch-142
  ```

---

### 2.5 PostgreSQL Connection Pool Saturation

#### Symptoms
- API endpoints return HTTP `500 Internal Server Error` with `TimeoutError: ResourceRequest timed out`.
- Application latency degrades across all dashboard routes.

#### Diagnostics
Check active connections and pool exhaustion:
```sql
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
```
Check for long-running transactions blocking tables:
```sql
SELECT pid, now() - xact_start AS duration, query 
FROM pg_stat_activity 
WHERE (now() - xact_start) > interval '10 seconds';
```

#### Remediation
1. Terminate orphaned queries:
   ```sql
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE state = 'idle in transaction' AND (now() - state_change) > interval '30 seconds';
   ```
2. Adjust connection pool limits in `.env`:
   ```bash
   DB_POOL_MAX=60
   DB_STATEMENT_TIMEOUT_MS=15000
   ```
3. Restart Central API service gracefully.

---

### 2.6 Evidence Integrity Validation Failure (`INTEGRITY_FAILURE`)

#### Symptoms
- Evidence Vault marks recording clip with red badge: `INTEGRITY_FAILURE`.
- Export is cryptographically locked to prevent compromised evidence presentation in court.

#### Root Causes
- Recording file on S3 or local disk has been modified, partially truncated, or corrupted.
- Disk bitrot or interrupted write during unexpected server power outage.
- Digital signature verification failed against stored Ed25519 public key.

#### Forensics & Recovery
1. Run evidence audit verification CLI:
   ```bash
   npm run evidence:verify -- --evidenceId=EV-20260913-0042
   ```
2. Output displays exact byte difference:
   ```text
   Stored SHA-256:  e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
   Computed SHA-256: 8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4
   Result: INTEGRITY_FAILURE (Tamper detected or file truncated)
   ```
3. Retrieve immutable replica from WORM S3 Object Lock vault or local edge retention buffer.
