# KRYPTOVISION / SENTINEL GRID — VENDOR COMPATIBILITY MATRIX & DRIVER GUIDE

> **Authoritative Multi-Vendor Hardware Interoperability Specification**
> **Component**: \`src/recorder-drivers/\` & \`backend/src/recorders/adapters/\`
> **Supported Protocols**: ONVIF (Profile S/G/T), Hikvision ISAPI, Dahua CGI, CP PLUS HTTP/CGI, Generic RTSP
> **Version**: v1.0.0-rc.2

---

## 1. Executive Summary

Sentinel Grid features a modular, canonical device driver architecture that interfaces seamlessly with major enterprise CCTV manufacturers, analog DVRs, IP cameras, and multi-channel hybrid encoders.

All drivers implement the canonical \`IRecorderAdapter\` and \`BaseRecorderDriver\` contracts, providing unified capabilities across live streaming, PTZ control, edge recording playback, health diagnostics, and alarm telemetry.

---

## 2. Vendor Interoperability Matrix

| Manufacturer / Standard | Protocol Family | Live Stream (Main/Sub) | PTZ Telemetry | Historical Playback | Audio Backchannel | SMART HDD Diag | Video Loss Alarms | Production Driver File |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Hikvision** | ISAPI / RTSP | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | \`backend/src/recorders/adapters/hikvision-recorder.adapter.ts\` |
| **Dahua** | CGI / RPC / RTSP | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | \`backend/src/recorders/adapters/dahua-recorder.adapter.ts\` |
| **CP PLUS** | Indigo/Orange CGI | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | \`src/recorder-drivers/drivers/cpplus-recorder-driver.ts\` |
| **ONVIF Profile S** | SOAP / XML / RTSP | ✅ Full | ✅ Full | ⚠️ N/A | ⚠️ N/A | ⚠️ N/A | ✅ Motion | \`backend/src/recorders/adapters/onvif-recorder.adapter.ts\` |
| **ONVIF Profile G** | SOAP / XML | ✅ Full | ⚠️ N/A | ✅ Full | ⚠️ N/A | ⚠️ N/A | ⚠️ N/A | \`backend/src/recorders/adapters/onvif-recorder.adapter.ts\` |
| **ONVIF Profile T** | SOAP / HTTPS / H.265| ✅ Full | ✅ Full | ✅ Full | ✅ Full | ⚠️ N/A | ✅ Tamper | \`backend/src/recorders/adapters/onvif-recorder.adapter.ts\` |
| **Generic RTSP** | RFC 2326 / 7826 | ✅ Full | ❌ N/A | ❌ N/A | ❌ N/A | ❌ N/A | ⚠️ Timeout | \`backend/src/recorders/adapters/generic-recorder.adapter.ts\` |
| **Analog Multi-DVR** | BNC / Sub-Stream | ✅ Full | ✅ Pelco-D | ✅ Full | ⚠️ 1-way | ✅ Full | ✅ Noise/Snow | \`backend/src/recorders/adapters/dahua-recorder.adapter.ts\` |

---

## 3. Detailed Driver Implementations

### 3.1 Hikvision ISAPI Driver (\`HikvisionRecorderAdapter\`)
- **Protocol**: HTTP/HTTPS REST using XML and JSON schemas.
- **Authentication**: HTTP Digest Authentication with nonce-based replay protection.
- **Stream Paths**:
  - Main Stream (High Resolution): \`rtsp://<user>:<pass>@<ip>:554/Streaming/Channels/<channel>01\`
  - Sub Stream (Mosaic / Video Wall): \`rtsp://<user>:<pass>@<ip>:554/Streaming/Channels/<channel>02\`
- **Health & Telemetry**:
  - System Status: \`GET /ISAPI/System/status\`
  - Storage & HDD SMART: \`GET /ISAPI/ContentMgmt/Storage/storageDetails\`
  - Real-Time Event Stream: \`GET /ISAPI/Event/notification/alertStream\` (multipart/mixed boundary subscription for motion, tamper, and video loss).

### 3.2 Dahua CGI & RPC Driver (\`DahuaRecorderAdapter\`)
- **Protocol**: HTTP/HTTPS CGI and JSON-RPC over TCP port \`37777\` / \`80\`.
- **Authentication**: HTTP Digest Authentication.
- **Stream Paths**:
  - Main Stream: \`rtsp://<user>:<pass>@<ip>:554/cam/realmonitor?channel=<channel>&subtype=0\`
  - Sub Stream: \`rtsp://<user>:<pass>@<ip>:554/cam/realmonitor?channel=<channel>&subtype=1\`
- **Health & Telemetry**:
  - Hardware Query: \`GET /cgi-bin/configManager.cgi?action=getConfig&name=Hardware\`
  - Hard Disk Health: \`GET /cgi-bin/storageServer.cgi?action=getDeviceAllInfo\`
  - Real-Time Alarms: \`GET /cgi-bin/eventManager.cgi?action=attach&codes=[All]\`

### 3.3 CP PLUS Driver (\`CpPlusRecorderDriver\`)
- **Protocol**: Indigo & Orange series HTTP CGI APIs.
- **Authentication**: HTTP Digest & Basic with challenge-response.
- **Stream Paths**:
  - Main Stream: \`rtsp://<user>:<pass>@<ip>:554/cam/realmonitor?channel=<channel>&subtype=0\`
  - Alternative Path: \`rtsp://<user>:<pass>@<ip>:554/Streaming/Channels/<channel>01\`
- **Health & Diagnostics**:
  - Device info, serial number, firmware, and video loss state verified via \`src/recorder-drivers/drivers/cpplus-recorder-driver.ts\`.

### 3.4 ONVIF Conformance (Profiles S, G, T)
- **Profile S**: Standard video streaming over RTSP, PTZ control (continuous move, absolute move, preset recall), and motion alarm subscription.
- **Profile G**: Edge storage search and playback. Allows Sentinel to query the onboard SD card of an IP camera or NVR and retrieve missing segments after network outages.
- **Profile T**: Next-generation profile supporting H.265 compression, advanced analytics metadata (bounding boxes, polygon tripwires), two-way audio talkback, and HTTPS streaming.

### 3.5 Analog DVR & BNC Channel Workflows
- **Analog Signal Quality Analysis**: The edge agent assesses composite analog signals for:
  - Video loss / cable disconnect.
  - Analog noise and high-frequency "snow".
  - Ground-loop rolling bars (50Hz / 60Hz hum bars).
- **PTZ over RS-485**: Supports Pelco-D and Pelco-P protocols over serial RS-485 interfaces on older DVR units.

---

## 4. Multi-Vendor Driver Testing & Automated Proof

All vendor drivers are backed by automated unit and contract test suites:
\`\`\`bash
# 1. Run canonical recorder driver suite
npm run test:recorder:canonical

# 2. Run multi-vendor compatibility lab suite
npm run test:recorder:compatibility

# 3. Run formal driver adapter contract tests
npm run test:recorder:formal
\`\`\`
