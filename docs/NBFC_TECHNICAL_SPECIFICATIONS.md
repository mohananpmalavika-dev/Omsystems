# NBFC AI Security - Technical Specifications

## Document Overview

This document provides detailed technical specifications for the AI-powered security system designed for Non-Banking Financial Companies (NBFCs). It serves as the technical reference for architects, engineers, and IT teams.

**Purpose:** Technical design reference, procurement specifications, integration planning  
**Audience:** System architects, network engineers, IT managers, security engineers  
**Version:** 1.0  
**Last Updated:** September 16, 2026

---

## 1. System Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Branch Location                          │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Cameras    │  │ Panic Buttons│  │   Sensors    │    │
│  │ (IP/ONVIF)   │  │   (MQTT)     │  │  (SNMP/REST) │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                  │                  │             │
│         └──────────────────┴──────────────────┘             │
│                            │                                │
│                            ↓                                │
│              ┌─────────────────────────┐                   │
│              │   PoE Network Switch    │                   │
│              │   (Management VLAN)     │                   │
│              └────────────┬────────────┘                   │
│                           │                                │
│                           ↓                                │
│              ┌─────────────────────────┐                   │
│              │  Analytics Server       │                   │
│              │  - GPU Processing       │                   │
│              │  - AI Engine            │                   │
│              │  - Event Correlation    │                   │
│              │  - Storage (Hot+Cold)   │                   │
│              └────────────┬────────────┘                   │
│                           │                                │
└───────────────────────────┼────────────────────────────────┘
                            │
                            │ (Encrypted WAN/VPN)
                            │
┌───────────────────────────┼────────────────────────────────┐
│                 Central SOC / Headquarters                  │
│                           │                                │
│              ┌────────────┴────────────┐                   │
│              │  Central Management     │                   │
│              │  - Multi-Branch View    │                   │
│              │  - Executive Dashboard  │                   │
│              │  - Reporting Engine     │                   │
│              │  - Backup Repository    │                   │
│              └─────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Software Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Analytics Engine (Per Branch)             │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │               Presentation Layer                      │ │
│  │  [Web UI] [Mobile App] [REST API] [WebSocket API]    │ │
│  └──────────────────────┬────────────────────────────────┘ │
│                         │                                   │
│  ┌──────────────────────┴────────────────────────────────┐ │
│  │               Business Logic Layer                    │ │
│  │  [Alert Manager] [Workflow Engine] [Rule Engine]     │ │
│  │  [Evidence Manager] [Report Generator]               │ │
│  └──────────────────────┬────────────────────────────────┘ │
│                         │                                   │
│  ┌──────────────────────┴────────────────────────────────┐ │
│  │               AI Processing Layer                     │ │
│  │  [Frame Pipeline] [Model Inference] [Tracker]        │ │
│  │  [Multi-Device Correlator] [Confidence Scorer]       │ │
│  └──────────────────────┬────────────────────────────────┘ │
│                         │                                   │
│  ┌──────────────────────┴────────────────────────────────┐ │
│  │               Device Integration Layer                │ │
│  │  [ONVIF] [RTSP] [MQTT] [SNMP] [REST] [WebHook]      │ │
│  └──────────────────────┬────────────────────────────────┘ │
│                         │                                   │
│  ┌──────────────────────┴────────────────────────────────┐ │
│  │               Data Layer                              │ │
│  │  [PostgreSQL] [TimescaleDB] [MinIO/S3] [Redis]      │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Hardware Specifications

### 2.1 Analytics Server (Per Branch - 50 Cameras)

#### Configuration A: High-Performance (Recommended)

| Component | Specification | Rationale |
|-----------|---------------|-----------|
| **GPU** | NVIDIA RTX 4500 Ada (24GB GDDR6) | AI inference, 30+ FPS per stream |
| **CPU** | Intel Xeon Silver 4410Y (12C/24T, 2.0GHz) | Multi-stream processing |
| **RAM** | 64GB DDR5 ECC (4x 16GB) | Frame buffer, model cache |
| **Storage (OS)** | 256GB NVMe SSD (PCIe 4.0) | System drive |
| **Storage (Hot)** | 2x 2TB NVMe SSD (RAID 1) | 30-day recording, events |
| **Storage (Archive)** | 4x 20TB HDD (RAID 6) | 60-90 day archive |
| **Network** | Dual 10GbE (Intel X550) | Camera ingest, redundancy |
| **Power Supply** | 1200W Redundant PSU (80+ Platinum) | Redundancy, efficiency |
| **Chassis** | 4U Rackmount with redundant fans | Datacenter-grade cooling |
| **Remote Management** | IPMI/iLO/iDRAC | Out-of-band management |

**Power Consumption:** ~450W average, ~800W peak  
**Cooling Requirement:** 1500 BTU/hr  
**Rack Space:** 4U (7 inches)

#### Configuration B: Standard (Cost-Optimized)

| Component | Specification |
|-----------|---------------|
| **GPU** | NVIDIA RTX 4060 Ti (16GB) |
| **CPU** | Intel i7-13700K (16C/24T) |
| **RAM** | 32GB DDR5 (2x 16GB) |
| **Storage (Hot)** | 1TB NVMe SSD |
| **Storage (Archive)** | 2x 10TB HDD (RAID 1) |
| **Network** | Dual 1GbE |
| **Power Supply** | 850W PSU (80+ Gold) |

**Suitable For:** <30 cameras per branch

### 2.2 Network Infrastructure

#### Core Network Switch

**Specification:**
- **Model Type:** Managed PoE+ Gigabit Switch
- **Port Count:** 48x 1GbE PoE+ ports
- **PoE Budget:** 740W total (30W per port)
- **Uplink:** 4x 10GbE SFP+ ports
- **Throughput:** 176 Gbps non-blocking
- **VLAN Support:** 802.1Q (4096 VLANs)
- **QoS:** 8 priority queues, rate limiting
- **Security:** 802.1X, port security, ACLs
- **Management:** SNMP v3, SSH, HTTPS
- **Redundancy:** Ring topology support (RSTP/MSTP)

**Recommended Models:**
- Cisco Catalyst 9300-48P
- HPE Aruba 2930F 48G PoE+
- Juniper EX3400-48P

#### Distribution Switch (Optional, Large Branch)

**Specification:**
- **Port Count:** 24x 1GbE + 4x 10GbE SFP+
- **PoE Budget:** 370W
- **Purpose:** Floor/wing distribution

### 2.3 Uninterruptible Power Supply (UPS)

**Specification:**
- **Capacity:** 3KVA / 2700W
- **Topology:** Online double-conversion
- **Runtime:** 15 minutes at full load (server + switches)
- **Battery:** VRLA, 3-year replacement cycle
- **Management:** SNMP, USB, contact closure
- **Output:** Pure sine wave, 230V ±5%, 50Hz ±0.5Hz
- **Protection:** Surge, spike, sag, brownout, blackout

**Recommended Models:**
- APC Smart-UPS SMT3000I
- Eaton 9PX3000
- CyberPower OL3000RTXL2U

### 2.4 Camera Specifications

#### Indoor Dome Camera (Standard Areas)

| Specification | Value |
|---------------|-------|
| **Resolution** | 4MP (2688×1520) |
| **Sensor** | 1/3" Progressive Scan CMOS |
| **Lens** | 2.8mm fixed (horizontal FOV: 100°) |
| **Video Compression** | H.265+, H.264+, MJPEG |
| **Max Frame Rate** | 30fps @ 4MP |
| **WDR** | 120dB Digital WDR |
| **IR Range** | Up to 30m (built-in IR LEDs) |
| **Audio** | Optional (1-way input) |
| **Power** | PoE (IEEE 802.3af, 12W max) |
| **Protocol** | ONVIF Profile S/T, RTSP |
| **Storage** | Edge storage (microSD up to 256GB) |
| **Operating Temp** | 0°C to 50°C |
| **Ingress Protection** | IP66 (if outdoor-rated dome) |

**Recommended Models:**
- Hikvision DS-2CD2143G0-I
- Dahua IPC-HDBW2431E-S
- Axis M3045-V

#### Outdoor Bullet Camera (Perimeter, Entrances)

| Specification | Value |
|---------------|-------|
| **Resolution** | 4MP (2688×1520) |
| **Sensor** | 1/2.7" Progressive Scan CMOS |
| **Lens** | 3.6mm or 6mm (FOV: 85° or 50°) |
| **Video Compression** | H.265+, H.264+ |
| **IR Range** | Up to 40m |
| **WDR** | 120dB True WDR |
| **Weatherproof** | IP67, IK10 (vandal-resistant) |
| **Power** | PoE+ (IEEE 802.3at, 25W max) |
| **Heater** | Built-in for cold climates |
| **Operating Temp** | -30°C to 60°C |

**Recommended Models:**
- Hikvision DS-2CD2T43G0-I5
- Dahua IPC-HFW2431S-S
- Axis Q1798-LE

#### PTZ Camera (Large Perimeter, Parking)

| Specification | Value |
|---------------|-------|
| **Resolution** | 2MP (1920×1080) |
| **Zoom** | 20x optical, 16x digital |
| **Pan/Tilt Range** | 360° continuous, -15° to 90° |
| **Pan Speed** | 0.1° to 200°/s |
| **Presets** | 256 positions |
| **Tours** | 8 tours with 32 presets each |
| **IR Range** | Up to 150m |
| **Power** | PoE++ (IEEE 802.3bt, 60W) or 24VAC |
| **Protocol** | ONVIF Profile S/T, PELCO-D/P |

**Recommended Models:**
- Hikvision DS-2DE4A220IW-DE
- Dahua SD59220T-HN
- Axis Q6155-E

#### Vault/Strong Room Camera (Low-Light, Tamper-Proof)

| Specification | Value |
|---------------|-------|
| **Resolution** | 4MP |
| **Low-Light** | 0.001 lux (color), 0 lux (B&W with IR) |
| **Housing** | Explosion-proof (ATEX/IECEx certified) |
| **Tamper Detection** | Built-in gyroscope |
| **Audio** | 2-way (intercom capability) |
| **Power** | PoE+ (25W) |
| **Storage** | Edge recording (failsafe) |

**Recommended Models:**
- Hikvision DS-2CD6412FWD (Explosion-proof)
- Axis M3057-PLVE (Discreet surveillance)

### 2.5 Security Devices

#### Panic Button

**Wired Panic Button:**
- **Type:** Momentary push-button, normally-open (NO)
- **Interface:** Dry contact closure to I/O module
- **Mounting:** Flush mount, foot pedal, or desktop
- **LED Indicator:** Optional (test mode)

**Wireless Panic Button:**
- **Type:** RF transmitter (433MHz or 868MHz)
- **Range:** Up to 100m (line-of-sight)
- **Battery:** CR2032 (2-year life)
- **Protocol:** MQTT over WiFi or proprietary RF

**Recommended Models:**
- Bosch FLM-420-D-F1 (Wired)
- Honeywell 5802MN (Wireless)

#### Door/Window Contact Sensor

- **Type:** Magnetic reed switch
- **Interface:** Wired (NO/NC) or wireless (Z-Wave, Zigbee)
- **Gap Sensitivity:** 25mm maximum
- **Tamper:** Built-in tamper switch

#### PIR Motion Sensor (Perimeter)

- **Detection Range:** 12m x 12m
- **Detection Angle:** 90° horizontal
- **Mounting Height:** 2.4m
- **Outdoor-Rated:** IP65, pet-immune (up to 20kg)
- **Interface:** Wired relay or wireless

#### Glass Break Sensor (Audio-Based)

- **Detection Method:** Acoustic signature analysis
- **Coverage:** 7.6m radius (25 feet)
- **Sensitivity:** Adjustable (plate glass, tempered glass)
- **False Alarm Protection:** Multi-frequency analysis

#### Environmental Sensors

**Temperature/Humidity Sensor:**
- Range: -40°C to 125°C, 0-100% RH
- Accuracy: ±0.5°C, ±3% RH
- Protocol: SNMP, Modbus TCP, MQTT

**Water Leak Sensor:**
- Detection: Conductive probe or moisture pad
- Alert: Immediate on contact
- Protocol: Wired relay or wireless (WiFi, Zigbee)

**Smoke Detector (AI-Integrated):**
- Type: Photoelectric or ionization
- Interface: Relay output to analytics engine
- Compliance: UL 268, EN 54-7

---

## 3. Software Specifications

### 3.1 Analytics Engine

#### Platform Details

- **Operating System:** Ubuntu Server 22.04 LTS (64-bit)
- **Runtime:** Node.js 20 LTS, Python 3.11
- **AI Framework:** ONNX Runtime 1.16 (GPU-accelerated)
- **Database:** PostgreSQL 15 with TimescaleDB 2.13
- **Object Storage:** MinIO (S3-compatible) or local filesystem
- **Message Queue:** Redis 7.2 (pub/sub, caching)
- **Web Server:** Nginx 1.24 (reverse proxy, SSL termination)

#### AI Models Included

| Model | Purpose | Input Size | Framework | Size |
|-------|---------|------------|-----------|------|
| **YOLOv8n** | Person, vehicle detection | 640×640 | ONNX | 6.2 MB |
| **YOLOv8m** | Multi-object detection | 640×640 | ONNX | 49.7 MB |
| **Face Detector** | Face detection | 640×640 | ONNX | 2.5 MB |
| **Face Embedder** | Face recognition | 112×112 | ONNX | 5.1 MB |
| **ANPR Detector** | License plate detection | 640×640 | ONNX | 3.2 MB |
| **ANPR OCR** | Plate text recognition | 168×48 | ONNX | 1.8 MB |
| **Helmet Detector** | PPE compliance | 640×640 | ONNX | 6.5 MB |
| **Weapon Detector** | Firearm, knife detection | 640×640 | ONNX | 25.3 MB |
| **Fire/Smoke** | Fire and smoke detection | 640×640 | ONNX | 6.1 MB |

**Total Model Storage:** ~110 MB

#### Detection Capabilities (Reference: capability-catalog.ts)

**Core Detections (No Configuration Required):**
- Motion detection
- Object detection (person, vehicle, bag, bicycle)
- Fire detection
- Smoke detection
- Fall detection
- No-helmet detection (PPE)
- Crowd density estimation
- Tailgating detection
- Queue detection
- Camera tampering
- Video loss
- Face detection (presence, not recognition)
- ANPR (plate detection, not matching)

**Advanced Detections (Require Configuration):**
- Zone-based intrusion
- Line crossing (directional)
- Loitering (configurable dwell time)
- Perimeter breach
- Restricted area violation
- Unattended object
- Removed object
- Face recognition (watchlist matching)
- ANPR watchlist matching
- Weapon detection (requires approved model)

### 3.2 API Specifications

#### REST API

**Base URL:** `https://<server-ip>:8443/api/v1`

**Authentication:** Bearer token (JWT), API key

**Key Endpoints:**

```
Authentication:
  POST   /auth/login                  # User login
  POST   /auth/refresh                # Token refresh
  POST   /auth/logout                 # User logout

Cameras:
  GET    /cameras                     # List all cameras
  POST   /cameras                     # Add camera
  GET    /cameras/{id}                # Camera details
  PUT    /cameras/{id}                # Update camera
  DELETE /cameras/{id}                # Remove camera
  GET    /cameras/{id}/snapshot       # Latest snapshot
  GET    /cameras/{id}/stream         # RTSP URL

Analytics:
  GET    /rules                       # List all rules
  POST   /rules                       # Create rule
  PUT    /rules/{id}                  # Update rule
  DELETE /rules/{id}                  # Delete rule
  POST   /rules/{id}/enable           # Enable rule
  POST   /rules/{id}/disable          # Disable rule

Incidents:
  GET    /incidents                   # List incidents (paginated)
  GET    /incidents/{id}              # Incident details
  PUT    /incidents/{id}/acknowledge  # Acknowledge incident
  PUT    /incidents/{id}/resolve      # Resolve incident
  POST   /incidents/{id}/comment      # Add comment
  GET    /incidents/{id}/evidence     # Get evidence (video clips)
  
Devices:
  GET    /devices                     # List all devices
  POST   /devices                     # Register device
  GET    /devices/{id}/status         # Device health
  POST   /devices/{id}/command        # Send command

Search:
  POST   /search/video                # Video search (attributes)
  POST   /search/face                 # Face search
  POST   /search/vehicle              # Vehicle search
  GET    /search/{id}/results         # Search results

Reports:
  GET    /reports                     # List reports
  POST   /reports/generate            # Generate report
  GET    /reports/{id}                # Download report
  
System:
  GET    /system/health               # System health
  GET    /system/metrics              # Performance metrics
  GET    /system/logs                 # System logs
```

**Response Format:**
```json
{
  "status": "success",
  "data": { ... },
  "message": "Optional message",
  "timestamp": "2026-09-16T10:30:00Z"
}
```

#### WebSocket API

**Endpoint:** `wss://<server-ip>:8443/ws`

**Purpose:** Real-time incident stream, live alerts

**Message Format:**
```json
{
  "type": "incident.created",
  "data": {
    "incident_id": "INC-20260916-001",
    "type": "intrusion",
    "severity": "P1",
    "camera_id": "CAM-001",
    "timestamp": "2026-09-16T10:30:00Z",
    "snapshot_url": "/api/v1/incidents/INC-20260916-001/snapshot"
  }
}
```

**Event Types:**
- `incident.created`
- `incident.updated`
- `incident.resolved`
- `device.offline`
- `device.online`
- `system.alert`

#### GraphQL API (Optional)

**Endpoint:** `https://<server-ip>:8443/graphql`

**Purpose:** Flexible querying for custom dashboards

**Sample Query:**
```graphql
query {
  incidents(
    filter: { severity: P1, status: OPEN }
    limit: 10
    orderBy: timestamp_DESC
  ) {
    id
    type
    severity
    timestamp
    camera {
      name
      location
    }
    evidence {
      video_url
      thumbnail_url
    }
  }
}
```

### 3.3 Integration Protocols

#### Camera Integration

**Supported Protocols:**
- **ONVIF Profile S:** Device discovery, streaming, PTZ
- **ONVIF Profile T:** Events, analytics
- **RTSP:** Direct streaming (tcp, udp, http)
- **MJPEG:** Legacy camera support
- **Proprietary SDK:** Hikvision, Dahua (optional)

**Stream Parameters:**
- **Primary Stream:** High resolution (4MP), H.265, 15-30 FPS, 4 Mbps
- **Sub Stream:** Low resolution (720p), H.264, 10 FPS, 1 Mbps (for analytics)

#### Access Control Integration

**Supported Systems:**
- **HID VertX:** REST API
- **Lenel OnGuard:** OpenAccess API
- **Genetec Synergis:** SDK, Web Services
- **Honeywell:** REST API
- **Generic:** Wiegand input, relay output

**Event Types Consumed:**
- Card swipe (authorized/denied)
- Door open/closed
- Door forced open
- Door propped open
- Tamper alarm

#### Intrusion Panel Integration

**Supported Systems:**
- **Honeywell Vista:** IP module (Ethernet)
- **DSC PowerSeries:** IT-100 or Envisalink
- **Bosch:** B Series REST API
- **Paradox:** IP150 module

**Event Types:**
- Zone alarm (intrusion, glass break, panic)
- Arm/disarm events
- Tamper, low battery

#### Fire Alarm Integration

**Protocols:**
- **BACnet IP:** Building automation standard
- **Modbus TCP:** Industrial protocol
- **Proprietary:** Simplex, Notifier, Edwards (via gateway)

**Event Types:**
- Smoke alarm
- Heat detector alarm
- Manual pull station
- Supervisory (flow, tamper)
- Trouble

#### Environmental Monitoring

**Protocols:**
- **SNMP v2c/v3:** Temperature, humidity sensors
- **Modbus TCP:** Industrial sensors
- **MQTT:** IoT sensors (subscribe to topics)

---

## 4. Network Design

### 4.1 Network Topology

```
Internet
   │
   ├─ Firewall (WAN interface)
   │     │
   │     ├─ DMZ VLAN (Public-facing services)
   │     │
   │     └─ Internal Network
   │           │
   │           ├─ VLAN 10: Management (Switches, IPMI, UPS)
   │           ├─ VLAN 20: Cameras (All IP cameras)
   │           ├─ VLAN 30: Analytics (Server, storage)
   │           ├─ VLAN 40: Security Devices (Panic, sensors)
   │           ├─ VLAN 50: Access Control
   │           └─ VLAN 100: Corporate (User devices)
```

### 4.2 VLAN Configuration

| VLAN ID | Name | Subnet | Purpose | Devices |
|---------|------|--------|---------|---------|
| 10 | Management | 192.168.10.0/24 | Network management | Switches, IPMI, UPS SNMP |
| 20 | Cameras | 192.168.20.0/22 | Camera traffic | 1024 IPs for cameras |
| 30 | Analytics | 192.168.30.0/24 | Analytics server | Server, storage |
| 40 | Security | 192.168.40.0/24 | Security devices | Panic buttons, sensors |
| 50 | Access Control | 192.168.50.0/24 | Door controllers | Card readers, locks |
| 100 | Corporate | 10.0.0.0/16 | User network | Workstations, SOC clients |

### 4.3 Firewall Rules

**Inter-VLAN Rules:**

| Source VLAN | Destination VLAN | Ports Allowed | Purpose |
|-------------|------------------|---------------|---------|
| Analytics (30) | Cameras (20) | RTSP (554), ONVIF (80) | Stream ingest |
| Analytics (30) | Security (40) | MQTT (1883), SNMP (161) | Device events |
| Analytics (30) | Access Control (50) | HTTPS (443) | Access events |
| Corporate (100) | Analytics (30) | HTTPS (8443), WSS (8443) | User access |
| Management (10) | All | SSH (22), SNMP (161) | Administration |
| Cameras (20) | Analytics (30) | **BLOCK** | Cameras cannot initiate |
| Corporate (100) | Cameras (20) | **BLOCK** | No direct camera access |

**Outbound (WAN) Rules:**

| Source | Destination | Ports | Purpose |
|--------|-------------|-------|---------|
| Analytics | NTP servers | UDP 123 | Time sync |
| Analytics | OS Update repos | HTTPS 443 | Software updates |
| Analytics | License server | HTTPS 443 | License validation |
| All | Internet | **BLOCK (default)** | Security |

### 4.4 Quality of Service (QoS)

**Priority Queue Assignment:**

| Priority | DSCP | Traffic Type | Examples |
|----------|------|--------------|----------|
| P0 (Highest) | EF (46) | Real-time alerts | Panic button, P1 incidents |
| P1 | AF41 (34) | Video streaming | Camera RTSP streams |
| P2 | AF31 (26) | Interactive | Web UI, API calls |
| P3 | AF21 (18) | Management | SNMP, SSH |
| P4 (Lowest) | Best Effort | Bulk data | Backup, file transfer |

**Bandwidth Allocation:**
- Camera VLAN: 70% minimum, 90% maximum
- Analytics VLAN: 20% minimum
- Management: 5% guaranteed
- Corporate: Best effort (remaining)

### 4.5 Bandwidth Calculation

#### Per Camera Bandwidth

**Primary Stream (Recording):**
- Resolution: 4MP (2688×1520)
- Codec: H.265
- Frame Rate: 20 FPS
- Bitrate: 3 Mbps average

**Sub Stream (Analytics):**
- Resolution: 720p (1280×720)
- Codec: H.264
- Frame Rate: 10 FPS
- Bitrate: 1 Mbps average

**Total Per Camera:** 4 Mbps

#### Branch with 50 Cameras

- **Total Camera Bandwidth:** 50 × 4 Mbps = 200 Mbps
- **Analytics Processing:** 20 Mbps (metadata, alerts)
- **User Access:** 10 Mbps (SOC operators)
- **Backup to Central:** 50 Mbps (off-hours)
- **Overhead (20%):** 56 Mbps
- **Total:** 336 Mbps

**Recommended Uplink:** 2x 1GbE (LAG) for redundancy

---

## 5. Storage Design

### 5.1 Storage Capacity Planning

#### Per Camera Storage

**Recording Profile:**
- Resolution: 4MP
- Codec: H.265
- Frame Rate: 15 FPS (motion-triggered, not continuous)
- Bitrate: 2 Mbps average (with motion detection)
- Recording Hours: 12 hours/day average (business hours + events)

**Daily Storage Per Camera:**
- 2 Mbps × 12 hours = 24 Mb × 3600 × 12 = 1.036 GB/day

**Monthly Storage Per Camera:**
- 1.036 GB × 30 days = 31 GB/month

#### 50-Camera Branch Storage

**30-Day Retention (Hot Storage):**
- 50 cameras × 31 GB = 1.55 TB
- **With 30% buffer:** 2 TB (NVMe SSD RAID 1 = 2x 2TB drives)

**90-Day Retention (Archive):**
- 50 cameras × 93 GB = 4.65 TB
- **With 50% buffer:** 7 TB
- **RAID 6 (4-drive):** 4x 5TB HDDs = 10 TB usable (70% utilized)

**Incident Evidence (Long-Term):**
- Estimate: 100 incidents/month × 5 minutes × 4 Mbps = 12 GB/month
- Annual: 144 GB
- **5-Year Archive:** 720 GB (offloaded to central storage)

### 5.2 RAID Configuration

**Hot Storage (NVMe SSD):**
- **Array:** RAID 1 (mirroring)
- **Drives:** 2x 2TB NVMe SSD
- **Usable Capacity:** 2 TB
- **Read Performance:** 7000 MB/s (single drive speed)
- **Write Performance:** 5000 MB/s
- **Fault Tolerance:** 1 drive failure

**Archive Storage (HDD):**
- **Array:** RAID 6 (dual parity)
- **Drives:** 4x 20TB HDD (7200 RPM, enterprise-grade)
- **Usable Capacity:** 40 TB (2 drives for parity)
- **Read Performance:** 500 MB/s (aggregate)
- **Write Performance:** 400 MB/s
- **Fault Tolerance:** 2 drive failures

### 5.3 Backup Strategy

**On-Site Backup:**
- **Method:** Snapshot replication to central HQ storage
- **Frequency:** Daily (incremental), Weekly (full)
- **Retention:** 30 days of incrementals, 12 weeks of fulls
- **Bandwidth:** Off-hours (overnight) transfer

**Off-Site Backup (Optional):**
- **Method:** Cloud backup (S3 Glacier for compliance)
- **Frequency:** Monthly (incident evidence only)
- **Encryption:** AES-256, client-side
- **Cost Consideration:** ~₹50K/year for 1TB

---

## 6. Security Architecture

### 6.1 Authentication & Authorization

#### User Authentication

**Methods:**
- Username/password (minimum 12 characters, complexity enforced)
- Multi-Factor Authentication (TOTP via Google Authenticator, Authy)
- LDAP/Active Directory integration (optional)
- SAML 2.0 SSO (optional, enterprise)

**Password Policy:**
- Minimum length: 12 characters
- Complexity: Upper, lower, number, special character
- History: Last 5 passwords remembered
- Expiry: 90 days (configurable)
- Lockout: 5 failed attempts, 15-minute lockout

#### Role-Based Access Control (RBAC)

| Role | Permissions | Use Case |
|------|-------------|----------|
| **Super Admin** | Full system access, configuration, user management | IT administrator |
| **Security Admin** | View all, configure rules, manage watchlists | Security manager |
| **SOC Operator** | View incidents, acknowledge, live monitoring | 24x7 SOC staff |
| **Investigator** | Search, evidence export, report generation | Forensic analyst |
| **Branch Manager** | View own branch, reports, dashboard (read-only) | Branch head |
| **Auditor** | View audit logs, compliance reports (read-only) | Compliance team |
| **Viewer** | Live view only, no historical access | Guest/temporary |

**Permission Matrix:**

| Action | Super Admin | Security Admin | SOC Operator | Investigator | Branch Manager | Auditor |
|--------|-------------|----------------|--------------|--------------|----------------|---------|
| View live cameras | ✅ | ✅ | ✅ | ✅ | ✅ (own branch) | ❌ |
| Acknowledge incidents | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Configure rules | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Search & investigate | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Export evidence | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View audit logs | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| System configuration | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 6.2 Data Encryption

#### At Rest

**Video Storage:**
- **Method:** AES-256-CBC encryption
- **Key Management:** Key stored in HSM or encrypted keystore
- **Scope:** All recorded video, snapshots

**Database:**
- **Method:** PostgreSQL native encryption (TDE)
- **Sensitive Fields:** Face embeddings, license plates, PII (AES-256)

**Backup:**
- **Method:** Encrypted before transmission (AES-256)
- **Key:** Separate backup encryption key

#### In Transit

**API Communication:**
- **Protocol:** TLS 1.3 (minimum TLS 1.2)
- **Cipher Suites:** AES-256-GCM, ChaCha20-Poly1305
- **Certificate:** Valid SSL certificate (CA-signed or Let's Encrypt)

**Camera Streams:**
- **Method:** RTSP over TLS (RTSPS) where supported
- **Fallback:** VPN tunnel for legacy cameras

**Device Communication:**
- **MQTT:** TLS encryption, client certificates
- **SNMP:** SNMPv3 with authentication and privacy

### 6.3 Network Security

**Firewall:**
- Stateful inspection firewall
- Intrusion Prevention System (IPS)
- Geoblocking (if cloud-connected)

**Network Segmentation:**
- VLANs as per section 4.2
- Private VLANs (PVLAN) for camera isolation

**VPN (For Remote Access):**
- **Protocol:** WireGuard or OpenVPN
- **Authentication:** Certificate-based + MFA
- **Access:** Jump host model (no direct device access)

**DDoS Protection (if cloud-exposed):**
- Rate limiting
- SYN flood protection
- Application-layer filtering

### 6.4 Audit Logging

**Events Logged:**
- User login/logout (success and failure)
- Camera access (live view, playback)
- Configuration changes (rules, users, devices)
- Evidence export (who, what, when)
- Watchlist modifications (add, remove)
- Device commands (door unlock, PTZ control)
- System events (startup, shutdown, errors)

**Log Format:** Syslog (RFC 5424), JSON

**Log Retention:**
- Local: 90 days (hot)
- Central SIEM: 7 years (regulatory requirement)

**Log Integrity:**
- Digitally signed (HMAC-SHA256)
- Tamper-evident (any modification invalidates signature)

**SIEM Integration:**
- Forward logs to Splunk, QRadar, ELK, etc.
- Real-time alerting on security events

---

## 7. Performance Specifications

### 7.1 AI Inference Performance

**GPU: NVIDIA RTX 4500**

| Model | Resolution | Batch Size | FPS per Stream | Max Concurrent Streams |
|-------|------------|------------|----------------|------------------------|
| YOLOv8n (Person) | 640×640 | 4 | 120 | 60+ |
| YOLOv8m (Multi-object) | 640×640 | 2 | 60 | 30 |
| Face Detection | 640×640 | 4 | 100 | 50+ |
| Face Recognition | 112×112 | 16 | 500 (embeddings/sec) | N/A |
| ANPR Detection | 640×640 | 4 | 80 | 40+ |
| ANPR OCR | 168×48 | 32 | 1000 (plates/sec) | N/A |

**Practical Branch Deployment:**
- 50 cameras @ 10 FPS analytics rate = 500 FPS total
- YOLOv8n baseline: 120 FPS per stream × 4 batch = 480 FPS
- **Conclusion:** Single RTX 4500 sufficient for 50 cameras with multi-model pipeline

### 7.2 System Latency

| Metric | Target | Typical |
|--------|--------|---------|
| **Camera-to-Inference** | <200ms | 150ms |
| **Inference-to-Alert** | <100ms | 80ms |
| **Total Detection Latency** | <500ms | 300ms |
| **Panic Button Response** | <500ms | 250ms |
| **Live Stream Latency** | <1s | 800ms |
| **API Response (95th percentile)** | <200ms | 150ms |

### 7.3 Scalability

**Vertical Scaling (Per Server):**
- **Max Cameras (Single GPU):** 60-80 (depends on models used)
- **Max Storage:** 100 TB (10x 10TB HDDs)

**Horizontal Scaling (Multi-Server):**
- **Branch Model:** 1 server per branch (50 cameras each)
- **Campus Model:** Multiple servers, load-balanced
- **Central Processing Model:** Regional data centers (not recommended for latency)

---

## 8. Compliance & Standards

### 8.1 Regulatory Compliance

**India-Specific:**
- **Information Technology Act, 2000:** Data protection provisions
- **RBI Guidelines:** Physical security norms for banks/NBFCs
- **SEBI Regulations:** Compliance and audit trail requirements
- **Personal Data Protection Bill (pending):** Consent management, data localization

**International Standards:**
- **GDPR:** If applicable (EU operations)
- **ISO 27001:** Information security management
- **IEC 62443:** Industrial cybersecurity (for device integration)
- **ONVIF Conformance:** Camera interoperability

### 8.2 Video Surveillance Standards

- **IEC 62676:** Video surveillance systems for use in security applications
- **EN 50132:** Alarm systems - CCTV surveillance systems
- **NDAA Compliance:** No banned manufacturers (if US-funded project)

### 8.3 Face Recognition Governance (Refer: AI_CAPABILITIES rule)

**Mandatory Controls:**
1. **Explicit Consent:** Written, informed consent before enrollment
2. **Local Processing:** No cloud transmission of biometric data
3. **Liveness Detection:** Anti-spoofing (photo/video attacks)
4. **Human-in-Loop:** All matches require operator verification
5. **Audit Trail:** All searches logged with purpose
6. **Retention Policy:** Auto-deletion per consent terms (30/60/90 days)
7. **Data Security:** Face embeddings encrypted at rest

**Technical Safeguards:**
- Minimum 3-frame confirmation (not single-frame match)
- Confidence threshold ≥0.85 for watchlist alerts
- Separate consent database (isolated from operational data)

---

## 9. Environmental Specifications

### 9.1 Data Center/Server Room Requirements

**Temperature:**
- Operating: 18°C to 27°C (64°F to 80°F)
- Recommended: 20°C to 24°C (68°F to 75°F)
- Maximum rate of change: 5°C/hour

**Humidity:**
- Operating: 20% to 80% RH (non-condensing)
- Recommended: 40% to 60% RH
- Maximum dew point: 21°C

**Power:**
- Input: 230V ±10%, 50Hz ±0.5Hz
- UPS-backed power (15-minute runtime minimum)
- Dedicated circuit (no shared loads)

**Cooling:**
- Minimum: 1500 BTU/hr per server
- Recommended: CRAC unit or precision cooling
- Redundant cooling (N+1)

**Fire Suppression:**
- Gas-based (FM-200, Novec 1230) preferred
- Water-based sprinkler (acceptable with waterproof racks)

**Physical Security:**
- Locked server room (card access)
- 24x7 monitoring (camera, motion sensor)
- Environmental sensors (temperature, water leak)

---

## 10. Maintenance & Support Specifications

### 10.1 Preventive Maintenance Schedule

| Component | Frequency | Activity |
|-----------|-----------|----------|
| **Analytics Server** | Monthly | Health check, log review, disk space |
| **GPU** | Quarterly | Driver update, thermal paste (annual) |
| **Storage** | Monthly | SMART monitoring, RAID status |
| **Cameras** | Quarterly | Lens cleaning, focus check, firmware |
| **Network Switches** | Semi-annual | Port status, firmware update |
| **UPS** | Monthly | Battery test (5-minute), log review |
| **UPS Battery** | Annual | Load test (15-minute), replacement (3-year) |
| **Environmental Sensors** | Semi-annual | Calibration check |

### 10.2 Spare Parts Inventory (Per 10 Branches)

| Item | Quantity | Purpose |
|------|----------|---------|
| Cameras (mixed) | 10 | Immediate replacement (DOA, failure) |
| PoE Switch (48-port) | 1 | Critical failure backup |
| HDD (20TB) | 4 | RAID rebuild (hot spare) |
| NVMe SSD (2TB) | 2 | Critical failure |
| UPS Battery Pack | 2 | Immediate swap |
| Network Cables (Cat6) | 100m | On-site repairs |
| Power Supplies | 2 | Server PSU failure |
| GPU (RTX 4500) | 1 (per region) | Critical replacement (expensive, RMA) |

---

## 11. Technical Support Specifications

### 11.1 Support Tiers (Repeat from Implementation Plan)

**Tier 1: 24x7 Helpdesk**
- Languages: English, Hindi, Regional
- Average Handle Time: <10 minutes
- First Contact Resolution: >70%

**Tier 2: Technical Support (24x7)**
- Remote access via VPN/TeamViewer
- Log analysis tools
- Configuration database access

**Tier 3: Engineering Support**
- Source code access (for debugging)
- Direct vendor liaison
- Custom patch development

**Tier 4: Vendor Escalation**
- Hardware manufacturer (NVIDIA, Intel, camera vendor)
- OS/software vendor (Canonical, PostgreSQL)

### 11.2 Remote Monitoring & Management

**Monitoring Dashboard (NOC):**
- System health (CPU, GPU, RAM, disk)
- Network health (bandwidth, packet loss)
- Camera status (online, FPS, bitrate)
- Alert volume and response times
- Incident trends

**Automated Alerts:**
- Device offline (immediate)
- High false positive rate (daily threshold)
- Storage >80% (proactive)
- GPU temperature >80°C (warning)
- License expiry (30-day notice)

**Remote Management:**
- SSH access (via jump host, MFA required)
- IPMI/iLO for out-of-band management
- Remote restart, log collection

---

## 12. Appendices

### Appendix A: Glossary

- **ANPR:** Automatic Number Plate Recognition
- **BFSI:** Banking, Financial Services, and Insurance
- **CCTV:** Closed-Circuit Television
- **DVR/NVR:** Digital Video Recorder / Network Video Recorder
- **FPS:** Frames Per Second
- **NBFC:** Non-Banking Financial Company
- **ONVIF:** Open Network Video Interface Forum
- **PoE:** Power over Ethernet
- **PTZ:** Pan-Tilt-Zoom
- **RAID:** Redundant Array of Independent Disks
- **RTSP:** Real-Time Streaming Protocol
- **SLA:** Service Level Agreement
- **SOC:** Security Operations Center
- **TDE:** Transparent Data Encryption
- **VMS:** Video Management System
- **WDR:** Wide Dynamic Range

### Appendix B: Recommended Vendor List

**Cameras:**
- Hikvision, Dahua, Axis Communications, Hanwha Techwin

**Network:**
- Cisco, HPE Aruba, Juniper, Ubiquiti (cost-effective)

**Servers:**
- Dell PowerEdge, HPE ProLiant, Supermicro

**Storage:**
- Western Digital Purple (HDD), Samsung 990 Pro (NVMe), Seagate IronWolf

**UPS:**
- APC by Schneider Electric, Eaton, CyberPower

**GPU:**
- NVIDIA (required for CUDA/TensorRT)

---

## Contact for Technical Queries

**Technical Presales:** presales@company.com  
**Solutions Architect:** architect@company.com  
**Support Engineering:** support@company.com

---

**Document Version:** 1.0  
**Last Updated:** September 16, 2026  
**Classification:** Technical - Confidential  
**Approved By:** Chief Technology Officer, Lead Solutions Architect

