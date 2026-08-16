# Canonical Recorder Adapters & Compatibility Integration Guide

This guide provides a comprehensive technical reference for the production recorder integration layer in OmSystems Sentinel Grid. It details the architecture, authentication, protocol implementations (ONVIF, Dahua / CP PLUS, and Hikvision ISAPI), error normalization, and evidence-based verification models.

---

## 1. Architectural Overview

```
                      +-----------------------------+
                      |   Branch Command Center /   |
                      |   Compliance Health Engine  |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |   Recorder Health Checker   |
                      +--------------+--------------+
                                     |
                      +--------------v--------------+
                      |   Recorder Adapter Factory  |
                      +--------------+--------------+
                                     |
         +---------------------------+---------------------------+
         |                           |                           |
         v                           v                           v
+------------------+       +-------------------+       +--------------------+
|  ONVIF Adapter   |       |   Dahua Adapter   |       | Hikvision Adapter  |
|  (SOAP 1.2 / WS) |       |   (CGI / CP PLUS) |       |  (ISAPI 2.0 XML)   |
+--------+---------+       +---------+---------+       +---------+----------+
         |                           |                           |
         +---------------------------+---------------------------+
                                     |
                                     v
                      +-----------------------------+
                      |   BaseRecorderAdapter       |
                      |   - Axios HTTP Client       |
                      |   - Timeout & Retry Engine  |
                      |   - Error Normalizer        |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |   Physical Recorder / NVR   |
                      +-----------------------------+
```

### Core Principles
1. **Never Route Solely by Config Label**: Device capabilities, firmware dialects, and OEM relationships (e.g. CP PLUS powered by Dahua CGI) are dynamically detected and profiled.
2. **Strict Three-State Semantics**:
   - `HEALTHY`: Positive evidence confirms proper operation.
   - `UNHEALTHY`: Evidence confirms failure, video loss, or non-compliance.
   - `UNKNOWN`: Cannot verify (unreachable endpoint, unsupported feature, or timeout). **`UNKNOWN ≠ HEALTHY`**.
3. **No Timestamp Fabrication**: Archive verification queries actual media index segments on disk. Current wall-clock time is never returned as proof of recording.
4. **Lockout Protection**: Consecutive 401/403 responses immediately halt retry execution to prevent NVR account lockout.

---

## 2. Protocol Implementations

### 2.1 ONVIF Adapter (`OnvifRecorderAdapter`)

The ONVIF adapter implements standard ONVIF Core, Media, Device Management, Recording, and Search services using SOAP 1.2.

- **Endpoints**:
  - Device Management: `/onvif/device_service`
  - Media Service: `/onvif/media_service`
  - Recording Service: `/onvif/recording_service`
  - Search Service: `/onvif/search_service`

- **WS-Security Authentication**:
  Constructs a standard WS-Security `UsernameToken` with `PasswordDigest`:
  $$\text{PasswordDigest} = \text{Base64}\Big(\text{SHA-1}\big(\text{Nonce} + \text{Created} + \text{Password}\big)\Big)$$
  where `Nonce` is 16 cryptographically random bytes and `Created` is the UTC ISO 8601 timestamp.

- **Key Operations**:
  - `testConnection`: Posts `<GetSystemDateAndTime>` to `/onvif/device_service`.
  - `authenticate`: Posts `<GetDeviceInformation>` with WS-Security header.
  - `getChannels`: Posts `<GetProfiles>` to `/onvif/media_service`, enumerating profile tokens, names, and video source tokens.
  - `getStreamStatus`: Posts `<GetStreamUri>` (RTP-Unicast over RTSP) and extracts `MediaUri.Uri`.
  - `getRecordingStatus`: Posts `<GetRecordings>` to `/onvif/recording_service`, matching channel profile token to recording item status.
  - `getLatestRecording` / `getOldestRecording`: Posts `<FindRecordings>` to `/onvif/search_service` with time range boundaries and parses start/end segment bounds.
  - `getStorageStatus`: Posts `<GetStorageConfigurations>` to `/onvif/device_service`, extracting `TotalBytes` and `UsedBytes`.
  - `getDeviceTime`: Posts `<GetSystemDateAndTime>` and converts `UTCDateTime` into JavaScript `Date`.

---

### 2.2 Dahua & CP PLUS Adapter (`DahuaRecorderAdapter`)

The Dahua adapter communicates via Dahua's proprietary CGI API over HTTP with HTTP Digest Authentication. It transparently handles Dahua OEM variants including CP PLUS.

- **Endpoints & Operations**:
  - `getDeviceInfo`: `GET /cgi-bin/magicBox.cgi?action=getSystemInfo`
    - Parses `vendor`, `model`, `serialNumber`, `version`, and `deviceType`.
    - Auto-detects CP PLUS OEM identity when manufacturer/model headers match CP PLUS signatures.
  - `getChannels`: `GET /cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle`
    - Parses `ChannelTitle[n].Name` array.
    - Correlates with `GET /cgi-bin/eventManager.cgi?action=getEventIndexes&code=VideoLoss` to flag channels experiencing video loss.
  - `getRecordingStatus`: Executes a 15-minute window search via `/cgi-bin/mediaFileFind.cgi`. If segments were written within the last 300 seconds, channel is confirmed `recording`.
  - `getLatestRecording` / `getOldestRecording`: Executes Dahua multi-step search pipeline:
    1. `factory.create`: Obtains unique search session handle (`object`).
    2. `findFile`: Sets `condition.Channel`, `condition.StartTime`, `condition.EndTime`, `condition.Types[0]=dav`.
    3. `findNextFile`: Paginates search results.
    4. `close`: Always closes search handle in a `finally` block to prevent recorder resource leaks.
  - `getStorageStatus`: `GET /cgi-bin/storageDevice.cgi?action=getDeviceAllInfo`
    - Parses disk volumes (`info[n].TotalBytes`, `info[n].UsedBytes`, `info[n].Status`).
    - Translates vendor disk states (`ok`, `normal`, `working` -> `normal`; `warning` -> `warning`; `failed`, `error` -> `failed`).
  - `getDeviceTime`: `GET /cgi-bin/global.cgi?action=getCurrentTime`
    - Parses `YYYY-MM-DD HH:mm:ss` timestamp to detect clock drift.

---

### 2.3 Hikvision Adapter (`HikvisionRecorderAdapter`)

The Hikvision adapter integrates with Hikvision ISAPI 2.0 (REST/XML over HTTP) with HTTP Digest Authentication.

- **Endpoints & Operations**:
  - `getDeviceInfo`: `GET /ISAPI/System/deviceInfo`
    - Extracts `<deviceName>`, `<model>`, `<serialNumber>`, `<firmwareVersion>`, `<macAddress>`.
  - `getChannels`: `GET /ISAPI/System/Video/inputs/channels` & `GET /ISAPI/ContentMgmt/InputProxy/channels/status`
    - Parses `<VideoInputChannel>` entries (`<id>`, `<name>`, `<enabled>`).
    - Maps `<InputProxyChannelStatus>` to identify offline channels or video loss.
  - `getRecordingStatus`: `GET /ISAPI/ContentMgmt/record/status/trackID/${trackId}`
    - Track ID calculation: $\text{trackId} = \text{channelNumber} \times 100 + 1$ (e.g., Channel 1 -> 101, Channel 2 -> 201).
    - Checks recording track state (`<status>recording</status>`).
  - `getLatestRecording` / `getOldestRecording`: `POST /ISAPI/ContentMgmt/search`
    - Constructs valid `CMSearchDescription` XML:
      ```xml
      <?xml version="1.0" encoding="UTF-8"?>
      <CMSearchDescription>
        <searchID>search-123</searchID>
        <trackList><trackID>101</trackID></trackList>
        <timeSpanList>
          <timeSpan>
            <startTime>2026-08-16T00:00:00.000Z</startTime>
            <endTime>2026-08-16T10:00:00.000Z</endTime>
          </timeSpan>
        </timeSpanList>
        <maxResults>100</maxResults>
        <searchResultPosition>0</searchResultPosition>
      </CMSearchDescription>
      ```
    - Parses `<searchMatchItem>` blocks (`<startTime>`, `<endTime>`, `<fileSize>`).
  - `getStorageStatus`: `GET /ISAPI/ContentMgmt/Storage`
    - Parses `<hdd>` nodes (`<id>`, `<name>`, `<status>`, `<capacity>`, `<freeSpace>`).
  - `getDeviceTime`: `GET /ISAPI/System/time`
    - Parses `<localTime>` XML node.

---

## 3. Integration with RecorderHealthChecker

The `RecorderHealthChecker` executes the dependency-aware evaluation graph:

```
                  1. Reachable (testConnection)
                               │
                               ▼
                 2. Authenticated (authenticate)
                               │
                               ▼
                 3. Channel Exists (getChannel)
                               │
                 +-------------+-------------+
                 |                           |
                 v                           v
     4. Stream Available           5. Recording Status
      (getStreamStatus)            (getRecordingStatus)
                                             │
                                             v
                                   6. Archive Verification
                                    (getLatestRecording /
                                     getOldestRecording)
```

Parallel Recorder Checks:
- **Storage Health**: `getStorageStatus()` -> Evaluates total/used/free bytes and individual disk failure or SMART degradation.
- **Clock Drift**: `getDeviceTime()` -> Compares device timestamp against server NTP time; flags drift exceeding policy tolerance (e.g., >60 seconds).

---

## 4. Test Verification Suite

All adapters are thoroughly tested with Vitest:

| Test Suite | File | Tests | Status |
|---|---|---|---|
| Adapter Integration | `backend/src/recorders/__tests__/recorder-adapters-integration.test.ts` | 14 | Passed |
| Health Checker | `backend/src/recorders/__tests__/recorder-health-checker.test.ts` | 8 | Passed |
| Generic Adapter | `backend/src/recorders/__tests__/generic-recorder.adapter.test.ts` | 7 | Passed |
| Compatibility Layer | `test/recorder-compatibility/test-runner.ts` | 22 | Passed |
| Branch Command Center | `test/branch-command-center/test-runner.ts` | 21 | Passed |

---

## 5. Summary Matrix

| Capability | ONVIF | Dahua / CP PLUS | Hikvision ISAPI |
|---|---|---|---|
| **Protocol** | SOAP 1.2 / HTTP | CGI / HTTP | ISAPI 2.0 XML / HTTP |
| **Auth Mechanism** | WS-Security Digest | HTTP Digest | HTTP Digest |
| **Channel Discovery** | `GetProfiles` | `ChannelTitle` CGI | `VideoInputChannel` XML |
| **Video Loss Detection** | Profile Inspection | `VideoLoss` Event Index | `InputProxyChannelStatus` |
| **Archive Search** | `FindRecordings` | `mediaFileFind.cgi` | `CMSearchDescription` |
| **Disk Telemetry** | `GetStorageConfigurations` | `storageDevice.cgi` | `/ISAPI/ContentMgmt/Storage` |
| **Device Clock** | `GetSystemDateAndTime` | `getCurrentTime` | `/ISAPI/System/time` |
