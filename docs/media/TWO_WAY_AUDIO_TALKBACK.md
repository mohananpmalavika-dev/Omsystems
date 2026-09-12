# Two-Way Audio Talkback (`video.talkback`)

**Authoritative Production Technical Specification**  
**Classification:** Production Standard  
**Maturity Level:** `CapabilityMaturity.PRODUCTION`  
**Subsystem Domain:** Media & Device Telephony  
**Owner:** Media Team  

---

## 1. Executive Summary

Sentinel Grid Two-Way Audio Talkback (`video.talkback`) enables push-to-talk (PTT) bidirectional voice communication from operator workstations to remote camera and intercom speakers. The implementation supports multi-vendor IP cameras, analog audio backchannels on hybrid recorders, and direct WebRTC browser sessions.

The subsystem operates under strict production-hardening invariants:
1. **Single-Talker Mutual Exclusion**: Exactly one operator may broadcast to a given camera speaker at a time. Attempts by concurrent operators are rejected with HTTP 409 `talkback_busy` to prevent acoustic feedback and audio collisions.
2. **Deterministic Capability Verification**: Cameras without speaker hardware or unadvertised backchannels fail closed before network resources are committed (`talkback_not_supported`).
3. **No Mock / Synthetic Data**: Real-time G.711 PCMA/PCMU audio transcoding, Web Audio API resampling to 8kHz Linear PCM, cryptographic one-time session tokens, and authoritative PostgreSQL audit persistence.

---

## 2. System Architecture & Signal Flow

```
+--------------------------+
|    Operator Console      |
|  (Web Audio API / PTT)   |
+------------+-------------+
             |
             | 1. POST /v1/cameras/:id/talk-sessions
             v
+--------------------------+
|      Control Plane       |
|    (TalkbackService)     | <--- Enforces RBAC ('audio:talk') & Single-Talker Lease
+------------+-------------+
             |
             | 2. Issues one-time cryptographic token & media endpoint
             v
+--------------------------+
|  Media Gateway / Edge    |
|   (RTSP Backchannel)     |
+------------+-------------+
             |
             | 3. Interleaved RTP (G.711 PCMA/PCMU)
             v
+--------------------------+
|  Camera / Intercom Unit  |
|  (Profile T / Private3)  |
+--------------------------+
```

### Signal Pipeline
1. **Operator Mic Capture**: Browser invokes `navigator.mediaDevices.getUserMedia` with echo cancellation, noise suppression, and auto-gain control.
2. **Audio Resampling**: Linear interpolation downsamples microphone audio (typically 44.1kHz or 48kHz) to 8000Hz 16-bit signed Linear PCM (L16).
3. **Audio Ingestion**: Binary PCM chunks are streamed via HTTP POST `/v1/talk/:id/audio` (or WebRTC audio transceiver) authenticated via short-lived bearer tokens.
4. **Camera Backchannel Delivery**:
   - **ONVIF Profile T**: RTSP DESCRIBE with `Require: www.onvif.org/ver20/backchannel`, negotiating `a=sendonly` audio track and sending interleaved RTP packets over TCP.
   - **Dahua / CP PLUS Private3**: Protocol fallback connecting to `/live/talk.xav?channel=X&proto=Private3`, packaging audio into DHAV frames.
   - **Hikvision ISAPI**: HTTP TwoWayAudio channel communication via `/ISAPI/System/TwoWayAudio/channels/1/audioData`.
   - **WebRTC WHEP/WHIP**: Direct peer connection audio backchannel.

---

## 3. Concurrency & Mutual Exclusion Model

To guarantee audio clarity and prevent operators from talking over each other or creating acoustic echo:
- A distributed mutex lease table (`talkback_active_leases`) tracks active talkers per camera.
- Leases are bounded by a configurable TTL (default: 30 seconds).
- Active operators send periodic heartbeats (`POST /v1/cameras/:id/talk-sessions/:sessionId/heartbeat`) every 10 seconds while holding the PTT button.
- Releasing the PTT button immediately deletes the lease and logs session duration, packet count, and bytes sent to `talkback_sessions`.
- If an operator tab crashes or disconnects, the lease automatically expires via timestamp index checks.
- Supervisors possess a force-terminate endpoint (`POST /v1/cameras/:id/talk-sessions/:sessionId/terminate`) to clear stuck channels.

---

## 4. REST API Specification

| Endpoint | Method | Role Required | Description |
|---|---|---|---|
| `/v1/cameras/:id/talk-sessions` | `POST` | `audio:talk` | Initiates push-to-talk session and returns session token |
| `/v1/cameras/:id/talk-sessions/active` | `GET` | `live:view` | Returns active talker and lease information |
| `/v1/cameras/:id/talk-sessions/:sessionId/heartbeat` | `POST` | `audio:talk` | Extends active lease during sustained broadcast |
| `/v1/cameras/:id/talk-sessions/:sessionId` | `DELETE` | `audio:talk` | Normal release of push-to-talk session |
| `/v1/cameras/:id/talk-sessions/:sessionId/terminate` | `POST` | `supervisor` | Emergency termination of active talk session |
| `/v1/talk-sessions/history` | `GET` | `audit:view` | Query historical talkback sessions with pagination |
| `/v1/talk-sessions/stats` | `GET` | `audit:view` | Aggregated talkback operational metrics |
| `/v1/cameras/:id/talkback/capability` | `GET` | `device:configure` | Probe and return camera speaker & backchannel support |
| `/v1/cameras/:id/talkback/test` | `POST` | `device:configure` | Diagnostic backchannel connection test |

---

## 5. Security, TLS & Audit Compliance

- **Authentication**: Bearer tokens are cryptographically generated (32 bytes entropy, SHA-256 hash stored in DB) and valid only for the specific camera and session ID.
- **Role-Based Access Control**: Scoped via `audio:talk` grant across organizational hierarchy.
- **Audit Logging**: Every session creation, release, termination, and completion is recorded in `talkback_sessions` and emitted to the central audit pipeline (`talk_session.created`, `talk_session.completed`, `talk_session.terminated`).
- **Transport Security**: TLS 1.3 enforced for control plane and browser communication; camera RTSPS connections validated against device certificate trust managers.

---

## 6. Performance Targets

- **Audio Latency**: End-to-end mouth-to-ear latency < 250ms under typical branch WAN conditions.
- **Bandwidth Usage**: G.711 PCMA/PCMU at 8kHz 8-bit mono requires ~64 kbps per active talker.
- **Fail-Closed Guarantee**: Missing audio track or rejection immediately returns structured error (`talkback_not_supported` or `talkback_busy`).
