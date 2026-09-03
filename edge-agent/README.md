# KryptonVision Edge Agent

The Windows edge agent discovers ONVIF cameras and recorders on a branch LAN,
checks RTSP/device health, and reports heartbeat and telemetry to the Sentinel
Grid control plane.

## Build the Windows executable

From the repository root on Windows:

```powershell
npm install
npm run build:exe
```

The all-in-one Node 18 x64 executable is written to
`edge-agent/release/edge-agent.exe`. Verify it without starting monitoring:

```powershell
.\edge-agent\release\edge-agent.exe --version
.\edge-agent\release\edge-agent.exe --config .\edge-agent\.env.example --check-config
```

The build first bundles all JavaScript dependencies into one CommonJS entry.
Do not pass the TypeScript/ESM output directly to `pkg`; that produces an EXE
which looks valid but fails at runtime with a `C:\snapshot\...\index.js` module
error.

The first build downloads pinned Windows releases of FFmpeg/ffprobe,
MediaMTX, and cloudflared, verifies their SHA-256 checksums, and embeds them as
assets. Later builds reuse the verified cache under `edge-agent/vendor`.

## Recommended branch installation

1. Configure the control plane with a branch-reachable
   `CONTROL_PLANE_PUBLIC_URL` and a random 32+ character
   `EDGE_BRIDGE_SHARED_KEY`.
2. In the dashboard, create/select the branch edge agent and click **Download
   one-click Windows installer**.
3. Copy that one `.exe` to the branch PC and double-click it. Approve the
   Windows administrator prompt and enter the ONVIF camera password.

The installer copies the agent under `C:\Program Files\KryptonVision\Edge
Agent`, protects its credential file, validates it, authenticates with the
dashboard, extracts the bundled media tools, and creates a SYSTEM startup task
with automatic restart.

The generated executable is branch-specific. Do not copy one branch's EXE to a
different branch and do not send it by unsecured email because it contains the
edge bridge credential.

## Physical siren for every alert

Edge Agent 0.1.18 and later can pulse an HTTP-controlled dry-contact/network
relay for every newly-created alert (P1 through P5). Connect the siren through
a correctly rated, normally-open relay; do not power a siren directly from the
branch PC or a low-voltage controller output.

Add these settings to the installed `config\edge-agent.env` file, then restart
the **Sentinel Grid Edge Agent** scheduled task:

```dotenv
PHYSICAL_SIREN_ENABLED=true
PHYSICAL_SIREN_ON_URL=http://192.168.1.50/relay/on
PHYSICAL_SIREN_OFF_URL=http://192.168.1.50/relay/off
PHYSICAL_SIREN_HTTP_METHOD=POST
PHYSICAL_SIREN_AUTH_TOKEN=replace-with-relay-token
PHYSICAL_SIREN_PULSE_MS=5000
PHYSICAL_SIREN_TIMEOUT_MS=5000
```

For POST relays, each request contains `action`, `state`, `pulseMs`, `alertId`,
`branchId`, `severity`, `detectionType`, and `occurredAt`. GET relays receive no
body, so their ON and OFF action must be encoded in the two URLs. The controller
always sends OFF after the configured pulse and suppresses a repeated command
for the same alert ID.

## One-time discovery from a connected laptop

When an operator connects a Windows laptop to the same LAN/VLAN as a branch's
cameras and recorders, download **Local PC scan** from Branches & devices.
Extract the ZIP and double-click `Run Local Discovery.cmd`. The scanner reads
the branch's saved ONVIF/DVR credentials from KryptonVision for this one run,
so no local configuration or password prompt is required. Credentials are not
saved on the laptop.

It discovers:

- ONVIF IP cameras;
- DVR/XVR channels for analog cameras; and
- NVR channels for IP cameras connected through the recorder.

The scanner exits after the scan. It does not install a service, create a
tunnel, relay video, or leave the laptop as a 24/7 dependency. Review the
discoveries in KryptonVision afterwards. For a VPN branch, approved devices use
the configured router route; for a tunnel branch, use the permanent gateway.

The single installer contains:

- ONVIF discovery and camera/recorder health agent
- FFmpeg and ffprobe for RTSP, freeze, black-frame and evidence checks
- MediaMTX for branch-local RTSP-to-HLS remuxing
- cloudflared for an outbound-only media connection with no branch port forward
- installer, protected configuration, logs, automatic startup and restart

## Diagnostics

```powershell
& 'C:\Program Files\KryptonVision\Edge Agent\edge-agent.exe' `
  --config 'C:\Program Files\KryptonVision\Edge Agent\config\edge-agent.env' `
  --diagnose

Get-ScheduledTask -TaskName 'Sentinel Grid Edge Agent'
Get-Content 'C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log' -Tail 100
```

The control-plane URL must be reachable over outbound HTTPS, while the branch
PC must have LAN access to the cameras/NVRs. Secure internet viewing also needs
outbound TCP or UDP port 7844 to Cloudflare. No inbound router port, public
camera address, or RTSP port forwarding is required.

Installed scanners request a stable, named Cloudflare Tunnel from the control
plane. The tunnel token is delivered only to the authenticated scanner and is
stored in its encrypted device identity. When the control plane has no managed
tunnel provider configured, installers use a temporary Quick Tunnel so testing
works over the internet without a Cloudflare account. Quick Tunnel URLs change
after a scanner restart, so production branches should configure the four
Cloudflare settings in `render.yaml` and use the stable managed endpoint.

## Uninstall

Run the installed script as Administrator. It retains logs/config by default:

```powershell
& 'C:\Program Files\Sentinel Grid\Edge Agent\uninstall-edge-agent.ps1'
```

Add `-PurgeData` only when the local configuration and logs should also be
removed.
