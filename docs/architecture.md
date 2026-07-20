# Architecture

## Scale and operating assumptions

- 500 branches.
- 6–8 cameras per branch.
- 3,000–4,000 cameras overall.
- Mixed IP cameras and analog cameras connected through DVR/NVR equipment.
- Branch-local continuous recording.
- Data-center monitoring with cloud access and disaster recovery.
- Central storage reserved for incidents, evidence, and selected critical feeds.

## Service boundaries

```text
Branch LAN
  Cameras / DVR / NVR
          |
      Edge Agent  -- outbound mTLS -->  Device Gateway
          |                              |
     Local recording                Event Bus
                                         |
                     +-------------------+------------------+
                     |                                      |
               Control Plane                          Media Gateway
        inventory, RBAC, audit, alarms        WebRTC/HLS, no RBAC policy
                     |                                      |
                  PostgreSQL                         Object storage
```

The control plane creates short-lived, authorized viewing sessions. The media
gateway accepts those sessions but never decides employee permissions itself.
Camera credentials remain in a secrets manager and are consumed only by the
edge agent or media gateway.

## Hybrid deployment

Data center:

- primary media gateway and security-operations video wall;
- optional recording cluster for selected critical cameras;
- control-plane replica and PostgreSQL standby;
- local identity cache for a temporary cloud outage.

Cloud:

- primary public control-plane entry point;
- OIDC integration, employee permission management, and alerts;
- incident/evidence object storage;
- secondary media gateway and disaster-recovery services.

Branches initiate every connection. Cameras and recorders must never be exposed
through public port forwarding.

## First pilot

Use 20 representative branches:

- five Hikvision-heavy branches;
- five CP Plus-heavy branches;
- five analog/DVR branches;
- five branches with constrained or unstable connectivity.

The pilot exit criteria are successful scoped authorization, live-view startup,
recording playback, offline buffering, health alarms, evidence export, and
data-center/cloud failover.

## Implemented camera onboarding flow

```text
Admin registers edge agent
        |
Edge agent sends heartbeat
        |
WS-Discovery finds camera on branch LAN
        |
ONVIF reads device information, capabilities and media profiles
        |
ffprobe validates RTSP locally (credentials stay at the edge)
        |
Edge agent submits a pending discovery
        |
Admin approves discovery and assigns secret reference
        |
Control plane creates camera resource and audit event
```

Live-session tokens are cryptographically random, valid for sixty seconds, and
stored in PostgreSQL only as SHA-256 hashes. The media gateway will consume
each token once. It then creates an on-demand MediaMTX path and issues a
separate, path-scoped media token. MediaMTX asks the gateway to validate that
token for every HLS or WebRTC read. When the last token expires, the path is
deleted and its RTSP source closes automatically.
