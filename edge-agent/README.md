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

The standalone Node 18 x64 executable is written to
`edge-agent/release/edge-agent.exe`. Verify it without starting monitoring:

```powershell
.\edge-agent\release\edge-agent.exe --version
.\edge-agent\release\edge-agent.exe --config .\edge-agent\.env.example --check-config
```

The build first bundles all JavaScript dependencies into one CommonJS entry.
Do not pass the TypeScript/ESM output directly to `pkg`; that produces an EXE
which looks valid but fails at runtime with a `C:\snapshot\...\index.js` module
error.

## Recommended branch installation

1. Configure the control plane with a branch-reachable
   `CONTROL_PLANE_PUBLIC_URL` and a random 32+ character
   `EDGE_BRIDGE_SHARED_KEY`.
2. In the dashboard, create/select the branch edge agent and download its
   Windows package.
3. Extract the complete ZIP on the branch PC.
4. Run an Administrator PowerShell window in that folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-edge-agent.ps1
```

The installer copies the agent under `C:\Program Files\Sentinel Grid\Edge
Agent`, protects its credential file, validates it, authenticates with the
dashboard, and creates a SYSTEM startup task with automatic restart.

The generated package is branch-specific. Do not copy one branch's ZIP to a
different branch and do not send it by unsecured email because it contains the
edge bridge credential.

## Diagnostics

```powershell
& 'C:\Program Files\Sentinel Grid\Edge Agent\edge-agent.exe' `
  --config 'C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent.env' `
  --diagnose

Get-ScheduledTask -TaskName 'Sentinel Grid Edge Agent'
Get-Content 'C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log' -Tail 100
```

The control-plane URL must be reachable over outbound HTTP(S), while the agent
must have LAN access to the cameras/NVRs. Install FFmpeg and make `ffprobe.exe`
and `ffmpeg.exe` available on PATH for RTSP health checks and evidence capture.

Camera discovery and health data work through this EXE. Live HLS playback also
needs the separately deployed branch media gateway/tunnel and the
`PUBLIC_MEDIA_GATEWAY_URL` plus `EDGE_MEDIA_SHARED_KEY` settings.

## Uninstall

Run the installed script as Administrator. It retains logs/config by default:

```powershell
& 'C:\Program Files\Sentinel Grid\Edge Agent\uninstall-edge-agent.ps1'
```

Add `-PurgeData` only when the local configuration and logs should also be
removed.
