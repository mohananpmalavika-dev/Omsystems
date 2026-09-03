Sentinel Grid Edge Agent 0.1.18 Fleet Rollout — Physical Siren

This is a fleet release, not a South-branch package. Use the central rollout
endpoint once to queue v0.1.18 for every authorised branch gateway. Offline
gateways retain the update command and install it when they reconnect.

Central rollout requirements:

1. Deploy the control-plane release containing:
   edge-agent/release/updates/0.1.18/edge-agent.bundle
2. Configure CONTROL_PLANE_PUBLIC_URL and EDGE_UPDATE_SIGNING_PRIVATE_KEY.
3. As a global administrator, call:
   POST /v1/edge-updates/fleet-rollout
   { "version": "0.1.18" }

The API response reports exactly how many gateways were queued, already
current, waiting offline, or need a one-time base repair. Versions older than
0.1.16 are deliberately not auto-patched; they are returned in legacyAgents
for controlled repair. This prevents sending an unsupported update command to
older installations.

The files in this folder are only the safe fallback repair kit for one of
those legacy branches. They preserve the existing branch identity and camera
credentials; they are not tied to any particular branch.

The ZIP is generated at runtime and is deliberately not kept in Git. From the
repository root, create it with:

powershell -ExecutionPolicy Bypass -File .\scripts\build-edge-agent-fleet-rollout.ps1

The script builds and verifies v0.1.18, packages this folder with the Windows
executable, and prints a SHA-256 checksum. Use -SkipBuild only when the
verified edge-agent\release\edge-agent.exe already exists.

1. Extract the complete ZIP file on the affected branch computer.
2. Double-click Run-Sentinel-Edge-Repair.cmd.
3. Approve the Windows Administrator prompt.
4. Wait for the green success message (up to about three minutes).

To connect a physical siren, use a correctly rated, normally-open network or
dry-contact relay. Do not connect a siren directly to the branch PC.

Physical relay configuration is per branch because each site can use a
different relay address and token. After the automated update (or fallback
repair), edit on only the sites that have a physical siren:
C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent.env

Add the relay values supplied by your relay manufacturer:

PHYSICAL_SIREN_ENABLED=true
PHYSICAL_SIREN_ON_URL=http://<relay-ip>/relay/on
PHYSICAL_SIREN_OFF_URL=http://<relay-ip>/relay/off
PHYSICAL_SIREN_HTTP_METHOD=POST
PHYSICAL_SIREN_AUTH_TOKEN=<relay-token>
PHYSICAL_SIREN_PULSE_MS=5000
PHYSICAL_SIREN_TIMEOUT_MS=5000

Then restart the "Sentinel Grid Edge Agent" scheduled task. Every new alert
(P1, P2, P3, P4, and P5) from that branch will pulse the relay for five seconds.
Repeated detections within an alert rule's cooldown do not re-trigger it.

For POST relays, the agent sends alert ID, severity, detection type, branch ID,
and ON/OFF state as JSON. For GET relays, put the relay action in the two URLs.

Detailed status is written to:
C:\ProgramData\Sentinel Grid\edge-agent-repair-status.json
