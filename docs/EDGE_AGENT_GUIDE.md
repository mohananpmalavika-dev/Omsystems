# KRYPTOVISION / SENTINEL GRID — EDGE AGENT DEPLOYMENT & OPERATIONS GUIDE

> **Distributed Edge Gateway Engineering & Branch Survivability Manual**
> **Component**: \`@sentinel/edge-agent\` | **Target Devices**: Industrial Edge PCs, Intel NUC, Raspberry Pi 4/5, Linux Branch Gateways, Windows NVRs
> **Version**: v1.0.0-rc.2

---

## 1. Overview & Architecture

The Sentinel Edge Agent is a lightweight, autonomous daemon deployed inside the branch LAN. It bridges physical security hardware (IP cameras, analog DVRs, NVRs, biometric access controllers, alarm sensors) to the Sentinel Grid Central Control Plane.

\`\`\`mermaid
graph LR
    subgraph Branch_LAN["Branch Local Area Network (Air-Gapped / Isolated CCTV VLAN)"]
        CAM1[IP Cameras - ONVIF Profile S/T]
        DVR1[Analog DVR / NVR - RTSP/CGI]
        SENS[Alarm I/O & Sensors]
        
        EA[Sentinel Edge Agent Daemon]
        DB[(Local SQLite Ring Buffer)]
        
        CAM1 -->|RTSP / ONVIF| EA
        DVR1 -->|ISAPI / SDK| EA
        SENS -->|GPIO / Relay| EA
        EA <--> DB
    end

    subgraph WAN_Link["Protected WAN Uplink (4G / MPLS / Broadband)"]
        EA ==>|mTLS / HTTPS Heartbeat & Telemetry| CP[Sentinel Central Control Plane]
        EA ==>|WebRTC WHEP Live Video| MGW[Media Gateway]
    end

    style Branch_LAN fill:#0f172a,stroke:#10b981,stroke-width:2px,color:#fff
    style WAN_Link fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#fff
\`\`\`

---

## 2. Key Capabilities & Behavioral Invariants

### 2.1 Zero-Touch Provisioning (ZTP)
1. **DHCP Option 66/67 / DNS-SD Bootstrapping**: Newly connected edge appliances request network configuration and discover the central enrollment endpoint automatically.
2. **QR Code / One-Time Pairing Token**: Field technicians scan a QR code from the Sentinel mobile installer app, establishing an initial mTLS enrollment session.
3. **Cryptographic Enrollment**: The agent generates an Ed25519 device keypair locally, submits a Certificate Signing Request (CSR) to the control plane, and receives an X.509 device certificate. Private keys never leave the edge hardware.

### 2.2 Autonomous Device Discovery Engine
The edge agent scans the local branch subnet using multiple non-intrusive protocols:
- **ONVIF WS-Discovery**: Multicast UDP probe on port \`3702\` to discover compliant IP cameras.
- **mDNS / Bonjour**: Zero-configuration discovery on port \`5353\`.
- **Subnet ARP & TCP Probe**: Sweeps common RTSP (\`554\`), HTTP (\`80\`, \`88\`, \`8000\`), and vendor management ports (\`37777\` Dahua, \`8000\` Hikvision).
- **Vendor Fingerprinting**: Automatically queries vendor APIs to classify hardware type, channel count, firmware version, and MAC address.

### 2.3 Offline Survivability & 72-Hour Ring Buffer
- **Local Telemetry Cache**: When the WAN connection fails, health metrics, sensor alerts, and AI detection events are written to an encrypted local SQLite database.
- **Edge Storage Buffer**: High-priority alarm video clips (pre-event and post-event) are saved to local NVMe/SSD storage.
- **Reconciliation Protocol**: Upon WAN restoration, the agent executes an exponential backoff reconciliation sync, uploading buffered telemetry and alarm evidence in chronological sequence without dropping sequence numbers or overwhelming the central control plane.

### 2.4 Resource Limits & Operational Safety
- **CPU Ceiling**: Uses $< 15\%$ CPU during normal operation; capped at $40\%$ during active local stream transcoding.
- **Memory Footprint**: Designed to operate within a strict $< 256\text{ MB}$ RSS memory envelope.
- **Watchdog Supervision**: Monitored by a hardware watchdog timer and systemd service; automatically restarts in $< 2\text{ seconds}$ if unhandled faults occur.

---

## 3. Hardware Requirements & Sizing

| Branch Size | Camera Count | Recommended Hardware | CPU | RAM | Local Storage |
| :--- | :---: | :--- | :---: | :---: | :---: |
| **Small Branch / ATM** | 1–8 | Intel NUC / Raspberry Pi 4 (4GB) / ARM64 | 2 Cores | 4 GB | 64 GB SSD |
| **Standard Bank Branch** | 8–24 | Industrial Fanless PC (Advantech / Neousys) | 4 Cores | 8 GB | 256 GB NVMe |
| **Large Hub / Currency Chest** | 25–64 | 1U Rack Server (Intel Xeon-E / Core i7) | 8 Cores | 16 GB | 1 TB NVMe |

---

## 4. Installation & Deployment

### 4.1 Linux Service Installation (systemd)

\`\`\`bash
# 1. Download official release binary
curl -L https://releases.sentinel.internal/edge-agent/v1.0.0-rc.2/sentinel-edge-linux-amd64.tar.gz | tar -xz

# 2. Configure edge agent credentials
sudo mkdir -p /etc/sentinel
sudo cp config.example.yaml /etc/sentinel/config.yaml

# 3. Enroll device with branch pairing token
sudo ./sentinel-edge enroll --token="tok_branch_789456123" --server="https://sentinel.internal.bank.com"

# 4. Install and enable systemd daemon
sudo ./sentinel-edge service install
sudo systemctl start sentinel-edge
sudo systemctl status sentinel-edge
\`\`\`

### 4.2 Windows Installation (Service / Standalone NVR)

Run the included automated installer script:
\`\`\`powershell
# From edge-agent directory
.\AUTO_INSTALL_AND_RUN.bat
\`\`\`
Or execute in PowerShell as Administrator:
\`\`\`powershell
.\START_SCANNER.ps1 -ServerUrl "https://sentinel.internal.bank.com" -EnrollmentToken "tok_branch_789456123"
\`\`\`

---

## 5. Configuration Reference (\`/etc/sentinel/config.yaml\`)

\`\`\`yaml
agent:
  id: "ea-br-042"
  branchId: "branch-mumbai-042"
  tenantId: "tenant-hdfc-bank"
  heartbeatIntervalSec: 10
  logLevel: "info"

server:
  url: "https://sentinel.internal.bank.com"
  tls:
    caCert: "/etc/sentinel/certs/ca.pem"
    clientCert: "/etc/sentinel/certs/device.crt"
    clientKey: "/etc/sentinel/certs/device.key"

discovery:
  enabled: true
  autoScanIntervalMin: 60
  subnets:
    - "192.168.1.0/24"
    - "10.10.42.0/24"
  defaultCredentials:
    - username: "admin"
      password: "Password123"

buffering:
  maxLocalBufferSizeMb: 4096
  maxOfflineRetentionHours: 72
  storagePath: "/var/lib/sentinel/buffer"

media:
  webrtcProxyPort: 8889
  rtspProxyPort: 8554
\`\`\`

---

## 6. Health Diagnostics & Troubleshooting

\`\`\`bash
# Check local agent status and connected camera streams
curl http://localhost:9100/status

# Test camera stream connectivity directly from edge
sudo ./sentinel-edge probe --rtsp="rtsp://admin:Password123@192.168.1.100:554/Streaming/Channels/101"

# View local offline buffer status
sudo ./sentinel-edge buffer inspect
\`\`\`
