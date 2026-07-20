# Sentinel Grid

🎥 Hybrid CCTV monitoring platform for 500 branches and 3,000-4,000 mixed-vendor cameras.

---

## 🎯 New Here? Start With These

| If You Want To... | Read This First | Time |
|-------------------|-----------------|------|
| **Understand quickly** | [START_HERE.md](START_HERE.md) | 2 min |
| **Test with cameras** | [QUICK_START_2_CAMERAS.md](QUICK_START_2_CAMERAS.md) | 10 min |
| **Deploy to production** | [PRODUCTION_READINESS_GAPS.md](PRODUCTION_READINESS_GAPS.md) | 30 min |
| **Find any document** | [INDEX.md](INDEX.md) | Ref |

**Complete analysis:** [COMPLETE_ANALYSIS_SUMMARY.md](COMPLETE_ANALYSIS_SUMMARY.md)

---

## 🚀 Quick Start (Choose One)

### 1. Test with Your Cameras (20 minutes)
```powershell
.\deploy\one-click-deploy.ps1
# Choose option 4, then follow QUICK_START_2_CAMERAS.md
```

### 2. Deploy to Cloud (2 hours)
```powershell
.\deploy\one-click-deploy.ps1
# Choose option 1 (Vercel) then option 2 (Railway)
```

### 3. Self-Host Everything (30 minutes)
```powershell
.\deploy\one-click-deploy.ps1
# Choose option 3
```

**📚 New here?** Read [GETTING_STARTED.md](GETTING_STARTED.md) first!

---

## 📋 What's This Project?

Initial control-plane foundation for a hybrid CCTV monitoring platform serving
500 branches and approximately 3,000–4,000 mixed-vendor cameras.

This repository currently implements the first security-critical slice:

- company → division → region → branch → camera-group → camera hierarchy;
- permission inheritance down that hierarchy;
- explicit deny rules for sensitive camera groups;
- filtered branch and camera APIs;
- a PostgreSQL schema using `ltree` for efficient scope checks;
- PostgreSQL repositories selected automatically when `DATABASE_URL` is set;
- edge-agent registration, heartbeat, discovery and camera approval contracts;
- capability, health-status and short-lived live-session APIs;
- audit writes for branch, device and viewing-session actions;
- one-time control-plane viewing-token consumption;
- an on-demand MediaMTX gateway producing protected HLS and WebRTC/WHEP URLs;
- tests proving default-deny and deny-overrides-allow behavior.

Video transport is intentionally not handled by the business API. A later edge
media gateway will own stream brokering and recording synchronization. The
first edge-agent prototype now handles WS-Discovery, ONVIF inspection and local
`ffprobe` validation.

## 📦 Project Status

✅ **Working:** Core functionality, authorization, live streaming, camera discovery  
⚠️ **In Progress:** OIDC authentication, production hardening  
📋 **Documentation:** Complete setup, deployment, and security guides available

---

## 🎯 Quick Links

| Document | Purpose | Time |
|----------|---------|------|
| [GETTING_STARTED.md](GETTING_STARTED.md) | Choose your deployment path | 5 min |
| [QUICK_START_2_CAMERAS.md](QUICK_START_2_CAMERAS.md) | Test with real cameras | 10 min |
| [DEPLOYMENT_OPTIONS.md](DEPLOYMENT_OPTIONS.md) | Cloud deployment guide | 15 min |
| [PRODUCTION_READINESS_GAPS.md](PRODUCTION_READINESS_GAPS.md) | Security & production checklist | 30 min |
| [CRITICAL_FIXES_CHECKLIST.md](CRITICAL_FIXES_CHECKLIST.md) | Pre-launch tasks | 10 min |

---

## Run Locally

Prerequisites: Node.js 22 or newer, Docker Desktop

```powershell
# Quick start
.\deploy\one-click-deploy.ps1

# Or manually
npm.cmd install
npm.cmd test
npm.cmd run dev
```

Check the API:

```powershell
Invoke-RestMethod http://localhost:8080/health

Invoke-RestMethod `
  -Headers @{ "x-user-id" = "user-south-operator" } `
  http://localhost:8080/v1/branches
```

Development identities:

| Header value | Effective access |
| --- | --- |
| `user-global-admin` | Entire company |
| `user-south-operator` | Live/playback/alarm access for South Region |
| `user-branch-manager` | Bengaluru branch except the Sensitive Areas group |

The `x-user-id` header is strictly a development aid. Production deployment
must use signed OIDC tokens from the company's identity provider.

## API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/v1/me` | Current development identity |
| GET | `/v1/branches` | Branches visible to the user |
| GET | `/v1/branches/:id/cameras` | Visible cameras in a branch |
| GET | `/v1/cameras/:id` | A permitted camera |
| POST | `/v1/access/check` | Permission decision for an action and node |
| POST | `/v1/branches` | Create an authorized branch |
| POST | `/v1/branches/:branchId/edge-agents/register` | Register a branch agent |
| POST | `/v1/edge-agents/:id/heartbeat` | Report edge-agent health |
| POST | `/v1/branches/:branchId/cameras/discovered` | Submit ONVIF discovery |
| POST | `/v1/branches/:branchId/cameras` | Approve a discovered camera |
| PATCH | `/v1/cameras/:id/status` | Update camera health |
| GET | `/v1/cameras/:id/capabilities` | Read profiles and capabilities |
| POST | `/v1/cameras/:id/live-sessions` | Create a 60-second viewing token |

The browser then exchanges that one-time token with the media gateway:

```text
POST http://localhost:8090/v1/live/start
{
  "controlPlaneToken": "<one-time token>"
}
```

The response contains an HLS playlist URL, a WebRTC/WHEP URL, and a
path-scoped bearer token. HLS.js or a WHEP client must attach
`Authorization: Bearer <token>` to media requests.

Example access check:

```json
{
  "action": "recording:view",
  "resourceNodeId": "camera-entrance"
}
```

## Repository roadmap

1. Add OIDC/SSO authentication and edge-agent mTLS identities.
2. Build the branch edge-agent executable and ONVIF compatibility registry.
3. Add ONVIF discovery and `ffprobe` stream validation.
4. Add the React operations dashboard with HLS.js and WHEP playback.
5. Add the alarm workflow, recording and playback.

See [docs/architecture.md](docs/architecture.md) for system boundaries and the
first pilot topology, and [docs/product-roadmap.md](docs/product-roadmap.md)
for the module plan and physical-camera acceptance gate.

## Operations dashboard

The Next.js dashboard is in `dashboard/`. It provides:

- regional branch selection and camera-health summaries;
- responsive 1/4/9/16-camera layouts;
- same-origin control-plane and media-gateway adapters;
- HLS.js playback with path-scoped bearer authentication;
- a demo mode for hosted previews without exposing a private camera network.

```powershell
npm.cmd run dashboard:dev
npm.cmd exec --workspace @sentinel/dashboard playwright test
npm.cmd run dashboard:build
```

Set `DASHBOARD_DEMO_MODE=false`, `CONTROL_PLANE_INTERNAL_URL`,
`MEDIA_GATEWAY_INTERNAL_URL`, and `DASHBOARD_DEV_USER_ID` to connect a local
dashboard container to the pilot backend. Production identity will replace the
development user setting with OIDC claims.

## Pilot camera discovery

The edge agent must run on a machine connected to the same LAN/VLAN as the
pilot camera. WS-Discovery uses UDP multicast and may not cross routers. For a
first native Windows test:

1. Enable ONVIF on the camera and create a dedicated ONVIF operator account.
2. Install FFmpeg so `ffprobe` is available on `PATH`.
3. Start the control plane with `npm.cmd run dev`.
4. Set the variables shown in `edge-agent/.env.example`.
5. Run `npm.cmd run edge:dev`.

The prototype discovers ONVIF endpoints, reads device information and media
profiles, obtains each RTSP URI through ONVIF, probes it locally over TCP, and
submits metadata to the control plane. RTSP credentials and URIs are never sent
in the discovery payload.

For a container build that includes FFmpeg:

```powershell
docker build -f edge-agent/Dockerfile -t sentinel-edge-agent .
```

The current prototype uses one pilot ONVIF credential supplied through the
process environment. Production enrollment will replace development user
headers with per-agent mTLS certificates and retrieve per-camera credentials
from an encrypted local secret store.
