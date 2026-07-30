# Sentinel Grid Edge Agent

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

The installer copies the agent under `C:\Program Files\Sentinel Grid\Edge
Agent`, protects its credential file, validates it, authenticates with the
dashboard, extracts the bundled media tools, and creates a SYSTEM startup task
with automatic restart.

The generated executable is branch-specific. Do not copy one branch's EXE to a
different branch and do not send it by unsecured email because it contains the
edge bridge credential.

The single installer contains:

- ONVIF discovery and camera/recorder health agent
- FFmpeg and ffprobe for RTSP, freeze, black-frame and evidence checks
- MediaMTX for branch-local RTSP-to-HLS remuxing
- cloudflared for an outbound-only media connection with no branch port forward
- installer, protected configuration, logs, automatic startup and restart

## Diagnostics

```powershell
& 'C:\Program Files\Sentinel Grid\Edge Agent\edge-agent.exe' `
  --config 'C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent.env' `
  --diagnose

Get-ScheduledTask -TaskName 'Sentinel Grid Edge Agent'
Get-Content 'C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log' -Tail 100
```

The control-plane URL and Cloudflare Tunnel must be reachable over outbound
HTTPS, while the branch PC must have LAN access to the cameras/NVRs. No inbound
port forwarding is required.

Dashboard downloads default to an automatic Cloudflare Quick Tunnel so a pilot
installation works without another account. Quick Tunnels are temporary and
intended for testing. Production branches should change `MEDIA_TUNNEL_MODE` to
`named`, provide `CLOUDFLARED_TUNNEL_TOKEN`, and set the stable
`PUBLIC_MEDIA_GATEWAY_URL` issued for that branch.

## Uninstall

Run the installed script as Administrator. It retains logs/config by default:

```powershell
& 'C:\Program Files\Sentinel Grid\Edge Agent\uninstall-edge-agent.ps1'
```

Add `-PurgeData` only when the local configuration and logs should also be
removed.
