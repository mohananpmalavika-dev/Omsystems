# API documentation

## OpenAPI source and scope

The repository contains [OpenAPI 3.1](https://github.com/mohananpmalavika-dev/Omsystems/blob/main/openapi/control-plane.yaml)
at `openapi/control-plane.yaml`. Its self-declared version is `0.7.0-phase6`;
the root npm package version is `1.0.0-rc.2`. The document describes selected
control-plane operations but is **not an exhaustive API specification**. The
repository has many additional route modules and the OpenAPI document has
limited request/response schemas. Verify exact payloads, authentication, and
status codes against the registered route implementation before generating
clients or treating it as a customer contract.

The OpenAPI `servers` entries include a dashboard BFF path (`/api/control`) and
a local control-plane URL. The root Compose file exposes the control plane on
port 8080. Public base URLs and reverse-proxy prefixes are deployment-specific.

## Areas represented by the checked-in contract

The current spec includes operations for:

- health, readiness, metrics, and current-user lookup;
- branches, branch cameras, camera listing, and live-session creation;
- device inventory;
- operational storage disk inventory/discovery;
- maintenance assets;
- analytics alerts and acknowledge/escalate actions;
- operations report summary;
- edge-agent telemetry ingestion;
- operational health summary, branch/camera health, retention, policy, and
  event streams;
- video-wall layouts;
- alert command center, alert event stream, assignment, notification attempts,
  and notification policy;
- scheduled operational reports, runs, and signed artifact downloads.

Use the YAML as the exact list of spec-covered paths and methods. Do not infer
that an unlisted route does not exist.

## Authentication and authorization

The spec defines an HTTP bearer scheme named `bearerSession`; the control-plane
middleware also supports session/cookie mechanisms and includes a development
identity path. Per-route authorization is source-backed and tenant/resource
scoped, but the OpenAPI file does not fully describe all credential flows or
permission requirements. See [Security](security.md).

## Operational endpoint guidance

- `/health`, `/ready`, and `/metrics` are health/observability surfaces in the
  contract; apply network controls appropriate to the deployment.
- Event-stream paths are streaming responses, not ordinary JSON polling.
- Report downloads use expiry/token query parameters in the contract. Treat
  download links as sensitive and short-lived.
- Edge telemetry includes an idempotency key and explicit source/quality
  fields in the OpenAPI schema.

## Known contract gaps

- OpenAPI coverage is partial relative to the route tree and UI.
- Many operations have descriptions but do not declare detailed schemas,
  validation limits, or error shapes.
- Version metadata does not match the current root package version.
- The repository does not show an automatic route-to-OpenAPI generation or
  drift-validation step.

Until these gaps are addressed, confirm each integration against route code and
tests. Do not rely on undocumented endpoints in a production integration.
