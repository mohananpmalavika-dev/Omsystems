# Phase 1 Operational Health

## Delivered vertical slice

- Immutable, idempotent telemetry envelopes identify tenant, branch, edge agent,
  device, observation/receipt time, source, evidence quality and reason codes.
- PostgreSQL stores telemetry history; the in-memory store implements the same
  contract for tests and local development.
- Fastify exposes tenant-scoped summary, paginated branch health, branch detail,
  camera health, continuous-retention verification, policy and health-alert APIs.
- Stale, unsupported and unavailable evidence is never converted to healthy.
- Retention uses the oldest gap-free chain of playable `ready` segments and
  highlights values below the effective recording-job policy as a breach.
- The edge agent probes configured primary and backup ISP links, calculates
  reachability, latency, jitter and packet loss, and samples Linux/Windows
  interface byte counters for receive/transmit rates and contracted-bandwidth
  utilization. Unmeasured values are sent as `null` with reason codes.
- `/v1/operations/health/network` exposes branch link/failover status and the
  dashboard highlights outages, degraded links and branches operating on backup.

## CP PLUS capability matrix

The executable conservative matrix is in
`edge-agent/src/devices/compatibility-registry.ts`. ONVIF reachability, channel
inventory and firmware identity are the baseline. Recording state, CPU, memory,
temperature, uptime, SMART, RAID and write status remain `vendor-specific` or
`unverified` until exact model/firmware combinations pass the equipment lab.

No generic CP PLUS model is treated as supporting a metric solely because of its
brand. Vendor SDK documentation and test credentials are external pilot inputs,
not repository artifacts.

## DVR/NVR polling

- Branch edge agents poll configured Hikvision ISAPI, Dahua CGI, CP PLUS OEM/API,
  ONVIF or generic HTTP recorder endpoints on a configurable interval.
- HTTP Basic and MD5 Digest challenge authentication are supported. Credentials
  remain in the branch edge-agent environment and are never submitted centrally.
- Recorder identity, firmware, reachability, response latency, available channel
  inventory and storage payloads are normalized into operational telemetry.
- A configured recorder is auto-provisioned into the centralized health view on
  its first telemetry envelope; no control-plane database credentials are needed.
- ONVIF discovery classifies recorder-like DVR/NVR/XVR/UVR identities separately
  from cameras and auto-provisions them as recorder telemetry.
- CP PLUS `systemPath` and `storagePath` are configurable for model- or
  KVMS-version-specific documented endpoints. Proprietary KVMS Pro operations and
  recording-state fields must remain `vendor-specific` until CP PLUS supplies the
  applicable SDK/API contract and pilot credentials.

## Health policy

The Phase 1 default is 90 seconds to stale, 300 seconds to offline, 90 retention
days and a 120-second maximum recording gap. The API returns unknown whenever a
required component has no current evidence. Authorized administrators can persist
tenant defaults and branch overrides through `/v1/operations/health/policy`.

## Pilot acceptance still requiring external evidence

The software gate is `npm run ci:phase1`. The field exit gate additionally needs
10 physical branches reporting for seven consecutive days, state propagation
measurement under 30 seconds, and a completed model/firmware capability matrix.
Those claims cannot be established without deployed branch equipment.
