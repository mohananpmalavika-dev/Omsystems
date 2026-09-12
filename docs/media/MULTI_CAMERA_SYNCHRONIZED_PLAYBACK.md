# Multi-Camera Synchronized Playback (`video.synchronized_playback`)

**Authoritative Production Technical Specification**  
**Classification:** Production Standard  
**Maturity Level:** `CapabilityMaturity.PRODUCTION`  
**Subsystem Domain:** Video Management & Forensic Investigation  
**Owner:** Media Team & Forensic Control Plane  

---

## 1. Executive Summary

Sentinel Grid Multi-Camera Synchronized Playback (`video.synchronized_playback`) coordinates multi-angle historical video playback with millisecond-precision timeline drift compensation across up to 16 camera channels simultaneously.

In enterprise surveillance environments (e.g. bank branches, cash handling counters, strong rooms, vault perimeters), hardware IP camera internal clocks inherently experience thermal and oscillator drift relative to true UTC. When scrubbing multi-camera footage during forensic reviews, uncompensated drift causes visual desynchronization—events appearing seconds apart on adjacent angles.

This subsystem provides:
1. **Authoritative Master Clock Timeline**: A unified UTC investigation timeline with barrier synchronization across all active video streams.
2. **Dynamic Timeline Drift Compensation**: Ingestion of authoritative telemetry (`clock_drift_telemetry`, segment header offsets, and calibration data) to adjust device seek offsets in real-time.
3. **Sub-Second IDR Keyframe Snapping**: Index-driven resolution of nearest earlier IDR keyframes to achieve instantaneous, zero-latency seeking without buffer stalls.
4. **Sub-Second Frame Stepping**: Precise frame-by-frame stepping (25fps = 40ms) forwards and backwards synchronously across all video feeds.
5. **Multi-Angle Forensic Bookmarks**: Operator tagging of timestamps with automated state snapshots of all camera channels, drift metrics, and evidentiary audit persistence.
6. **Zero Mock Data & Enterprise Persistence**: Persistent storage backed by PostgreSQL migration `133_synchronized_playback_production.sql`.

---

## 2. Mathematical Timeline Drift Compensation Model

### Coordinate Reference & Offset Formulation
Let $T_{\text{master}}$ denote the authoritative UTC investigation timestamp requested by the operator.  
For each camera channel $i \in \{1, \dots, N\}$, let $\Delta t_i$ denote the measured clock offset (in milliseconds) of the camera relative to reference NTP time:
- $\Delta t_i > 0$: The camera's internal clock was running **fast** (ahead of UTC).
- $\Delta t_i < 0$: The camera's internal clock was running **slow** (behind UTC).
- $\Delta t_i = 0$: The camera was strictly synchronized with NTP.

The corresponding device timestamp recorded on camera $i$'s local media is:
$$T_{\text{device}, i} = T_{\text{master}} + \Delta t_i$$

### Video Element Seek Position Formula
When playing video segment $S_{i}$ having start time $T_{\text{seg\_start}, i}$, the player seek position (in seconds) is calculated as:
$$\text{offsetSeconds}_i = \frac{(T_{\text{master}} + \Delta t_i) - T_{\text{seg\_start}, i}}{1000}$$

When drift compensation is toggled off by an operator, $\Delta t_i$ is treated as $0$, allowing inspection of unadjusted raw device timestamps.

### Banking Drift Health Classification
In accordance with strict banking surveillance standards and regulatory mandates:
$$\text{Drift Status}(\Delta t) = \begin{cases}
\text{SYNCHRONIZED} & \text{if } |\Delta t| \le 5\,000\text{ ms} \\
\text{DRIFT\_WARNING} & \text{if } 5\,000\text{ ms} < |\Delta t| \le 30\,000\text{ ms} \\
\text{DRIFT\_CRITICAL} & \text{if } |\Delta t| > 30\,000\text{ ms}
\end{cases}$$

---

## 3. Sub-Second Barrier Seek & Keyframe Snapping

When scrubbing or seeking across multiple streams:
1. The service looks up `recording_segments` covering $T_{\text{device}, i}$.
2. If available, `recordingIndexService.findNearestKeyframe(cameraId, targetTime)` queries index tables (`recording_keyframes`) for the closest IDR keyframe preceding $T_{\text{device}, i}$.
3. The response provides `keyframeOffsetBytes`, `keyframePts`, and `keyframeWallClock`.
4. Browser `<video>` elements seek synchronously to the calculated offset, preventing audio-video stutter or frame decode latency.

---

## 4. Database Schema (`133_synchronized_playback_production.sql`)

### Tables
1. **`synchronized_playback_sessions`**:
   - `id`: Session UUID or alphanumeric ID (`sync-sess-...`).
   - `tenant_id`, `branch_id`, `title`, `description`.
   - `start_time`, `end_time`: Session timeline bounds.
   - `current_master_time`: Active playback timeline position.
   - `master_camera_id`: Reference camera for authoritative timeline.
   - `layout`: Display grid (`1x1`, `2x2`, `3x3`, `2x3`, `4x4`).
   - `playback_speed`: Speed multiplier (0.25x to 32x).
   - `state`: `PLAYING` | `PAUSED` | `BUFFERING` | `STOPPED`.
   - `drift_compensation_enabled`: Boolean flag.
   - `created_at`, `updated_at`.

2. **`synchronized_playback_tracks`**:
   - `session_id`: References session.
   - `camera_id`, `camera_name`, `channel_index`, `has_coverage`.
   - `measured_drift_ms`, `compensation_offset_ms`, `drift_status`.
   - `active_segment_id`, `active_segment_uri`, `active_segment_start`, `active_segment_end`.
   - `current_aligned_timestamp`, `current_device_timestamp`.
   - `keyframe_offset_bytes`, `keyframe_pts`, `keyframe_wall_clock`.
   - `is_in_gap`: Flag indicating absence of recorded footage.

3. **`synchronized_playback_bookmarks`**:
   - `id`: Bookmark ID (`bm-...`).
   - `session_id`, `timestamp`, `label`, `notes`, `created_by`.
   - `camera_snapshots`: JSONB array capturing all camera track states at bookmark time.

4. **`playback_drift_compensation_events`**:
   - Immutable audit ledger recording drift measurements, calibrations, and applied compensations.

---

## 5. REST API Reference

All routes are mounted under `/v1/playback/sync/`:

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/playback/sync/sessions` | Create a synchronized session across 1-16 cameras |
| `GET` | `/v1/playback/sync/sessions` | List active sessions filtered by branch/tenant |
| `GET` | `/v1/playback/sync/sessions/:id` | Get session state with all camera tracks & drift metrics |
| `POST` | `/v1/playback/sync/sessions/:id/seek` | Seek master timeline with drift compensation |
| `POST` | `/v1/playback/sync/sessions/:id/step` | Frame step (forward/backward at specified fps) |
| `POST` | `/v1/playback/sync/sessions/:id/state` | Update playback state (`PLAYING`, `PAUSED`) and speed |
| `POST` | `/v1/playback/sync/sessions/:id/drift-toggle` | Toggle timeline drift compensation on/off |
| `POST` | `/v1/playback/sync/sessions/:id/bookmarks` | Add synchronized investigation bookmark |
| `GET` | `/v1/playback/sync/sessions/:id/bookmarks` | List all bookmarks for session |
| `POST` | `/v1/playback/sync/sessions/:id/calibrate` | Manually calibrate camera clock offset |
| `DELETE` | `/v1/playback/sync/sessions/:id` | Terminate session |

---

## 6. Frontend Operator Interface

The dashboard interface (`SyncedPlaybackView` & `/playback/synced` page) provides:
- **Real-Time Clock Drift Badges**: Displays `✓ SYNC` (green $\le 5\text{s}$), `⚠ +1.8s` (amber 5–30s), or `⛔ +32.4s` (red $>30\text{s}$) on each camera tile.
- **Drift Compensation Mode Selector**: Single-click toggle between UTC Aligned time and Raw Device time.
- **Micro-Step Controls**: 40ms frame-step buttons (`-40ms`, `+40ms`) for sub-second incident inspection.
- **Speed Multipliers**: Seamless 0.5x, 1x, 2x, 4x rate switching across all concurrent HTML5 video players.
- **Forensic Investigation Bookmarks**: Modal capturing snapshot of all camera timestamps, drift offsets, and operator notes.
