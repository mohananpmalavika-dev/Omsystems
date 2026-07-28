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
- The edge agent reports measured control-plane latency, process-host facts and
  RTSP reachability. Unmeasured values are sent as `null` with reason codes.

## CP PLUS capability matrix

The executable conservative matrix is in
`edge-agent/src/devices/compatibility-registry.ts`. ONVIF reachability, channel
inventory and firmware identity are the baseline. Recording state, CPU, memory,
temperature, uptime, SMART, RAID and write status remain `vendor-specific` or
`unverified` until exact model/firmware combinations pass the equipment lab.

No generic CP PLUS model is treated as supporting a metric solely because of its
brand. Vendor SDK documentation and test credentials are external pilot inputs,
not repository artifacts.

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
