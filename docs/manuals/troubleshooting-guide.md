# Sentinel Grid — Troubleshooting & Diagnostic Guide

**Product Version:** Sentinel Grid 0.1.0  
**Document Version:** 1.0.0  
**Last Updated:** September 5, 2026  
**Audience:** SOC Operators, Level 1–3 Support Engineers, Systems Administrators, Field Technicians  

---

## Table of Contents

1. [Quick Diagnostic Checklist](#1-quick-diagnostic-checklist)
2. [Symptom 1: Camera Offline or Unreachable](#symptom-1-camera-offline-or-unreachable)
3. [Symptom 2: Live View Fails to Load or Buffers Continuously](#symptom-2-live-view-fails-to-load-or-buffers-continuously)
4. [Symptom 3: Missing Video Recordings or Recording Gaps](#symptom-3-missing-video-recordings-or-recording-gaps)
5. [Symptom 4: AI Detectors Not Triggering Rules](#symptom-4-ai-detectors-not-triggering-rules)
6. [Symptom 5: Excessive False Alarms & Alert Storms](#symptom-5-excessive-false-alarms--alert-storms)
7. [Symptom 6: Storage Volume Mount Failures & Protection Trips](#symptom-6-storage-volume-mount-failures--protection-trips)
8. [Symptom 7: Authentication, Session & Login Errors](#symptom-7-authentication-session--login-errors)
9. [Symptom 8: Camera Clock Drift & NTP Divergence](#symptom-8-camera-clock-drift--ntp-divergence)
10. [Diagnostic Endpoints & CLI Commands Reference](#10-diagnostic-endpoints--cli-commands-reference)

---

## 1. Quick Diagnostic Checklist

When encountering any platform issue, perform this 60-second triage:

```text
Step 1: Check Core Health  ──► curl -k https://<server-ip>/health
Step 2: Check Dashboard    ──► curl -k https://<server-ip>/api/health
Step 3: Check Containers   ──► docker compose -f deploy/aws/docker-compose.aws.yml ps
Step 4: Check Disk Space   ──► df -h /var/lib/sentinel
Step 5: Check NTP Time     ──► chronyc tracking
```

---

## 2. Symptom 1: Camera Offline or Unreachable

### Visual Indicator
* Camera tile shows red status badge: `OFFLINE`.
* Camera 7-Layer health score drops to 0%.

### Root Cause Analysis Tree

```mermaid
graph TD
    Start[Camera Offline] --> Ping[Ping Camera IP]
    Ping -->|Fails| Net[Network / Physical Fault]
    Ping -->|Succeeds| RTSP[Probe RTSP Port 554]
    
    Net --> CheckPoE[Check PoE Switch & Cable]
    Net --> CheckVLAN[Check Branch VLAN Routing]
    
    RTSP -->|Connection Refused| CamReboot[Camera Firmware Hung / Needs Power Cycle]
    RTSP -->|Auth Failed / 401| Creds[Camera Credentials Changed]
    RTSP -->|Stream 404| Path[RTSP Stream Path Mismatch]
```

### Remediation Actions
1. **Verify Physical & PoE Power:**
   * Log into branch PoE switch management interface.
   * Verify link light status and power consumption on the camera port (typical 802.3af camera consumes 4W–8W).
   * If power is 0W, perform a remote PoE port power-cycle.
2. **Execute RTSP Command Line Probe:**
   ```bash
   # Test RTSP stream decodability directly using FFmpeg
   ffprobe -rtsp_transport tcp -v error -show_entries stream=codec_name,width,height "rtsp://admin:password@192.168.10.45:554/h264Preview_01_main"
   ```
3. **Verify Camera Credentials in Sentinel Grid:**
   * Navigate to **Device Configuration** (`/maintenance/device-configuration`).
   * Select the camera, click **Edit Credentials**, and input verified administrative password.
   * Click **Test Connection**.

---

## 3. Symptom 2: Live View Fails to Load or Buffers Continuously

### Visual Indicator
* Live view tile spins with loading wheel or displays `RECONNECTING`.
* Error notification: `WebRTC connection failed; fallback to HLS`.

### Root Cause & Verification Steps

| Checkpoint | What to Look For | Diagnostic Action | Fix |
| :--- | :--- | :--- | :--- |
| **WebRTC UDP 8189 Blocked** | Browser fails ICE candidate gathering. | Open Browser DevTools (`F12`) -> Network -> WS. Look for ICE failure. | Ensure firewall allows **UDP 8189** inbound from client networks. |
| **H.265 / HEVC Decode** | Browser black screen on Main Stream; audio works. | Inspect video codec using FFprobe. | Many browsers cannot decode H.265. Switch camera to **H.264** in camera web UI or select **Sub Stream**. |
| **Viewer Budget Exhaustion** | Error: `Stream lease limit reached for camera`. | Check Redis key `stream:leases:{cameraId}`. | Sentinel Grid budgets concurrent viewers per stream to protect network. Close unused video tabs. |
| **Media Gateway Overload** | CPU utilization > 90% on media-gateway container. | Run `docker stats sentinel-aws-media-gateway`. | Allocate additional CPU cores or decrease camera framerate from 30 FPS to 15 FPS. |

---

## 4. Symptom 3: Missing Video Recordings or Recording Gaps

### Visual Indicator
* Timeline in Playback (`/playback/synced`) displays solid gray blocks or missing intervals.
* Recording continuity audit indicates compliance drop below 99.5%.

### Diagnostic Procedure
1. **Check Recording Engine Process Health:**
   ```bash
   docker logs --tail 100 sentinel-aws-recording-engine
   ```
2. **Verify Recording Disk Mount State:**
   * If using local storage: verify `/var/lib/sentinel/recordings` is mounted and has write permissions (`chmod 755`).
   * Verify disk utilization:
     ```bash
     df -h /var/lib/sentinel/recordings
     ```
     *(If utilization > **95%**, the recording engine suspends writes to prevent host OS crashes).*
3. **Inspect PostgreSQL Recording Index:**
   ```bash
   docker exec -it sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid -c "
     SELECT camera_id, start_time, end_time, file_path, segment_status 
     FROM recording_segments 
     ORDER BY start_time DESC LIMIT 10;
   "
   ```
4. **Inspect Edge Store-and-Forward Buffer:**
   * If recording dropped during a branch WAN outage, verify that the edge gateway buffered footage locally.
   * Check edge agent sync backlog in **Edge Gateways** (`/operations/edge-agents`).

---

## 5. Symptom 4: AI Detectors Not Triggering Rules

### Visual Indicator
* People enter detection zones but no alert is generated in `/operations/alerts`.
* AI Rules workspace displays `Rule Status: ACTIVE`, but trigger count is 0.

### Step-by-Step Triage
1. **Verify Operating Schedule:**
   * Rules configured with `AFTER_HOURS` will **never trigger during the day** (08:30–17:30 IST).
   * Verify current server time zone:
     ```bash
     date
     ```
     Ensure timezone is configured to `Asia/Kolkata` (+05:30).
2. **Inspect Persistence Duration (`durationMs`):**
   * If a rule has `durationMs: 10000` (10 seconds), a person walking through the zone in 4 seconds will intentionally **not** trigger an alarm.
   * Lower the persistence duration to `2000 ms` for testing.
3. **Check Rule Execution State:**
   * If the rule is in `SHADOW` mode, it logs silently to `nbfc_rule_test_results` without dispatching alerts.
   * Navigate to `/analytics/rules` and toggle rule to `ACTIVE`.
4. **Validate Normalized Zone Coordinates:**
   * Open the Zone Designer and ensure polygon vertices accurately enclose the camera target area.
   * Ensure point-in-polygon coordinates are strictly bounded between `0.0` and `1.0`.

---

## 6. Symptom 5: Excessive False Alarms & Alert Storms

### Visual Indicator
* Operator console is flooded with tens of alerts per minute from the same camera.
* Operators report false alarms from spiders, vehicle headlights, or trees swaying.

### Remediation Actions
1. **Increase Persistence Duration (`durationMs`):**
   * Increase duration from `500 ms` to `3000 ms` or `5000 ms`. Sustained duration filters out brief insect fly-bys and headlight glare.
2. **Increase Cooldown Suppression Window (`cooldownMs`):**
   * Increase rule cooldown from `30s` to `180s` or `300s`. Once an alert fires, subsequent detections on the same track will be suppressed.
3. **Refine Zone Geometry:**
   * Ensure the polygon does not overlap public streets, sidewalks, or adjacent reflective glass windows.
4. **Activate Shadow Mode for Calibration:**
   * Switch the rule to `SHADOW` mode. Review trigger patterns over 24 hours in the historical simulation lab before re-activating.

---

## 7. Symptom 6: Storage Volume Mount Failures & Protection Trips

### Symptom: `MountDisappearedError`
* **Trigger:** An NFS or SMB volume unmounts unexpectedly due to network failure.
* **Sentinel Grid Behavior:** The `MountIdentityVerifier` halts all video writes immediately.
* **Why this happens:** If Sentinel Grid continued writing when the network share dropped, it would write gigabytes of video directly to the Linux host `/` root partition, crashing the server within hours.

### Recovery Steps
1. Reconnect or remount the storage share:
   ```bash
   sudo mount -a
   ```
2. Verify share presence in `/proc/mounts`:
   ```bash
   grep -i nfs /proc/mounts
   ```
3. Restart recording engine to resume writes:
   ```bash
   docker restart sentinel-aws-recording-engine
   ```

---

## 8. Symptom 7: Authentication, Session & Login Errors

| Error Message | Cause | Resolution |
| :--- | :--- | :--- |
| `Invalid username or password` | Incorrect credentials or account disabled. | Reset password via admin CLI or verify username case sensitivity. |
| `Your session has expired` | Session idle timeout (30m) or concurrent login. | Sign in again. Avoid sharing operator credentials across workstations. |
| `Unable to access the camera` | Browser camera permissions denied for Face Scan. | Click the padlock icon in the browser address bar -> Permissions -> Allow Camera. |
| `Passwords do not match` / `< 8 chars` | Mandatory password reset validation failure. | Choose a password with at least 8 characters containing upper, lower, and numbers. |

---

## 9. Symptom 8: Camera Clock Drift & NTP Divergence

### Visual Indicator
* Forensic export package warning: `Clock drift exceeds threshold (> 1000ms)`.
* Event markers on timeline appear out of order.

### Fix Procedure
1. Verify system host NTP synchronization:
   ```bash
   chronyc tracking
   ```
2. If host offset is > 50ms, force an immediate step update:
   ```bash
   sudo chronyc makestep
   ```
3. Synchronize camera clock via ONVIF:
   * Open **Device Configuration** (`/maintenance/device-configuration`).
   * Select the camera -> **Actions** -> **Synchronize Device Time with Server**.

---

## 10. Diagnostic Endpoints & CLI Commands Reference

### Built-in HTTP Health Probes

```bash
# 1. Platform Core Health
curl -s https://<server-ip>/health
# Output: {"status":"ok","service":"sentinel-control-plane"}

# 2. Dashboard Health
curl -s https://<server-ip>/api/health
# Output: {"status":"ok","service":"sentinel-grid-dashboard"}

# 3. AI Analytics & Rule Engine Health
curl -s https://<server-ip>/api/ai/health
# Output: {"status":"HEALTHY","activeRules":12,"zones":24,"engineUptimeMs":3482100}

# 4. Storage Subsystem Health
curl -s https://<server-ip>/api/storage/health
```

### Essential Docker Maintenance Commands

```bash
# View real-time logs for all Sentinel Grid microservices
docker compose -f deploy/aws/docker-compose.aws.yml logs -f --tail 50

# Restart the Media Gateway without stopping recording
docker restart sentinel-aws-media-gateway

# Inspect database connection pool status
docker exec -it sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid -c "
  SELECT count(*), state FROM pg_stat_activity GROUP BY state;
"
```
