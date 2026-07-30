# Sentinel Grid federation

Sentinel Grid now has a first operational federation control-plane slice for
multi-region deployments. It uses the existing metadata-only federation schema;
video remains on its regional recording server.

## Delivered in this slice

- tenant-isolated regional and DR server registry;
- per-server scrypt identities for authenticated heartbeats;
- global and per-region health, branch, camera and storage aggregation;
- automatic stale-heartbeat demotion in dashboard and search routing;
- smart organizational-node routing through `regional_server_mappings`;
- cross-region search fan-out with bounded peer timeouts, normalized merged
  results and partial results when one region fails;
- manual/planned DR activation with transactional server state, failover
  history and organizational-scope remapping;
- active cross-region correlation reads from the global correlation schema;
- a Global Command Center page at `/federation`.

The gateway never returns a stored server-secret hash. Management calls use the
platform's existing scoped authorization and audit log. Regional peer search
uses `FEDERATION_SHARED_KEY`; heartbeats use the individual secret supplied when
the server is registered.

## Configuration

All trusted control centers participating in peer search need the same rotated
secret (prefer a secret file or platform secret manager):

```env
FEDERATION_SHARED_KEY=<at-least-32-random-characters>
FEDERATION_PEER_TIMEOUT_MS=8000
FEDERATION_HEARTBEAT_TTL_SECONDS=90
```

Render declares the key with `sync: false`; provide its value in the Render
dashboard. A server can still register and report health without the global peer
key, but internal cross-server search returns 503 until it is configured.

Regional `baseUrl` and `apiUrl` values must use HTTPS. Loopback HTTP is accepted
only for local development.

## API surface

Operator APIs:

- `GET /v1/federation/servers`
- `POST /v1/federation/register`
- `GET /v1/federation/dashboard`
- `GET /v1/global/dashboard`
- `GET /v1/federation/health`
- `GET /v1/federation/search`
- `GET /v1/federation/route/:resourceNodeId`
- `POST /v1/federation/failover`
- `GET /v1/federation/correlations`

Server-to-server APIs:

- `POST /internal/federation/heartbeat`
- `POST /internal/federation/search`

Registration requires `org:manage`; dashboard/server health requires
`audit:view`; search requires `recording:view`; correlation reads require
`analytics:view`. Smart routing also verifies the caller's access to the target
resource.

## Failure behavior

Search fans out only to current online, degraded or failover-active regional
nodes. One failed or timed-out node produces `status: "partial"` with per-source
failure details while successful regional matches remain available. An expired
heartbeat removes the region from search routing and marks it offline in global
health without deleting its registry or history.

Manual failover accepts only a registered backup paired with the failed primary.
The database operation locks both servers, marks the primary offline, activates
the backup, moves primary scope mappings and records the completed event in one
transaction.

## Remaining v2 federation milestones

This slice does not claim complete Genetec-style federation. Remaining major
work includes OIDC token exchange and global user provisioning, signed
cross-server playback sessions and synchronized timelines, automatic quorum
failover/failback, real-time metadata replication workers, regional policy
conflict resolution, global ANPR/face journey correlation, multi-country data
residency controls, and production multi-region chaos/performance certification.

