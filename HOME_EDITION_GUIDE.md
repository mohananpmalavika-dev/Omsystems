# Omsystems Home Edition (TrueCloud-style Consumer VMS)

## Overview
Omsystems Home Edition transforms the enterprise SentinelGrid VMS into a consumer-friendly, TrueCloud/Ezviz-style home security app while retaining the underlying multi-tenant security architecture.

---

## 1. Organization Model for Home Users
Instead of rewriting the core database schema, the **Organization** model maps directly to a **Home / Family Account**:

| Enterprise Concept | Home Edition Equivalent | Behavior in Home Edition |
| :--- | :--- | :--- |
| **Organization** | **My Home (e.g., "Rahul's Home")** | Auto-created upon user registration. Completely isolated. |
| **Branch / Site** | **Zones / Rooms (Living Room, Gate, Backyard)** | Groups cameras by physical home location. |
| **Org Members** | **Family Members** | Simple roles: Owner (Full Access) vs Family (View-only or Playback). |
| **Edge Gateway** | **Home Cloud Gateway / Micro Edge** | Silent background bridge; no enterprise setup required. |
| **Industrial AI** | **Home Smart Alerts** | Motion Detection, Human/Person Detection, Pet, Doorstep Intruder. |

---

## 2. Dual Edge Architecture (How Both Camera Types Work)

### Type A: Smart Wi-Fi Cameras (Trueview, Tapo, Tuya, Imou)
- **Zero Edge Hardware Required**: Cameras connect directly via home Wi-Fi.
- Connects to **Media Gateway** via RTSP/WebRTC ingest.
- Stream is packaged into low-latency WebRTC and HLS for mobile/web viewing.
- AI detection runs server-side on the Cloud AI Engine.

### Type B: Traditional IP Cameras & NVRs (CP Plus, Hikvision, Dahua)
- **Zero-Config Micro Home Edge**:
  - Run `home-edge-connect.mjs` (or single-click executable) on any home computer, laptop, or Raspberry Pi on the same Wi-Fi.
  - Automatically discovers all ONVIF/RTSP cameras across the local subnet.
  - One-click pair with user credentials.
  - Establishes an outbound encrypted WebRTC / Cloudflare tunnel to the Media Gateway without requiring router port-forwarding.

---

## 3. Simplified Home UI Navigation
- 🏠 **Home / Live**: Clean multi-cam grid with full-screen expand, snapshot, and two-way audio.
- ⏪ **Playback**: Intuitive 24-hour timeline scrubber with color-coded motion event flags.
- 🔔 **Activity**: Event clips for Human & Motion detection.
- ➕ **Add Device**: 
  1. Add Wi-Fi Smart Camera (Direct RTSP/Cloud stream)
  2. Scan Local Network (Hikvision/CP Plus/Dahua auto-detect)
- 👨‍👩‍👧 **Family Sharing**: Invite spouse, parents, or kids via email with toggleable access rights.
- ⚙️ **Settings**: Wi-Fi info, recording schedule, cloud storage subscription.

---

## 4. Quick Start
1. Configure environment variables in `.env`:
   ```bash
   APP_EDITION=home
   DATABASE_URL=postgresql://...
   PORT=8080
   ```
2. Start Control Plane Backend:
   ```bash
   npm run dev
   ```
3. Start Dashboard:
   ```bash
   cd dashboard && npm run dev
   ```
4. Run Home Micro-Edge Scanner (optional, for local IP/NVR cameras):
   ```bash
   node scripts/home-edge-connect.mjs
   ```
