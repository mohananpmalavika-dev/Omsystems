# Sentinel Grid product roadmap

Sentinel Grid is positioned as an Enterprise Security and Video Operations
Platform, not only a generic VMS. Product modules can be licensed and deployed
independently while sharing one device, identity, audit and workflow foundation.

## Product modules

1. Device management
   - ONVIF discovery, approval, rename and rejection
   - camera/NVR/DVR inventory and capability testing
   - firmware inventory, credential rotation and configuration templates
   - camera, storage, network and edge-agent health
2. Live monitoring
   - permission-scoped 1/4/9/16 grids, video walls, PTZ and snapshots
3. Recording and playback
   - continuous, scheduled, event and edge recording
   - configurable hot/cold retention tiers
   - timeline search, synchronized playback and authorized export
4. Alerts and incidents
   - rules, priority, escalation, acknowledgement and case workflow
5. Investigation and evidence
   - incident timelines, chain of custody, hashes, signatures and watermarks
6. Compliance, reporting and maintenance
   - health, downtime, storage, access, retrieval and maintenance reports
7. Analytics
   - person/vehicle detection, intrusion, line crossing and tampering first
   - face matching and ANPR only with explicit legal and privacy controls
8. Integrations and workflow
   - access control, alarms, ATM/POS/core-business events, webhooks and APIs
9. Cloud and mobile operations
   - fleet management, alerts, live view, playback, snapshot and PTZ

## Current delivery gate

No additional feature module should precede this physical-camera acceptance
test:

```text
ONVIF camera
  → branch discovery
  → authenticated ONVIF inspection
  → local RTSP validation
  → pending camera approval
  → permission-scoped dashboard
  → one-time live-session exchange
  → MediaMTX HLS/WebRTC path
  → browser video
  → audit event
```

The test must cover at least one supported Hikvision or CP Plus device, WAN
loss/recovery, invalid credentials, offline status, token replay rejection and
camera reboot.

## Retention and regulatory policy

Retention must be a configurable policy attached to tenant, branch, camera
group and incident type. Do not hard-code a universal “180-day RBI rule.”
Applicable retention varies by regulated entity, location, use case and current
direction. For example, an RBI-hosted security standard describes at least
90 days of CCTV recording for the covered ATM/security context, while RBI
penalty directions also refer to compliance with the applicable preservation
instructions rather than establishing one universal duration.

Before a banking/NBFC rollout, compliance counsel should map the current RBI
directions, contractual requirements, insurer requirements and privacy rules
to explicit Sentinel Grid retention policies.

References:

- https://www.rbi.org.in/commonman/Upload/English/Notification/PDFs/NT152E06042018.pdf
- https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12810
