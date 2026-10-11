# Feature inventory and implementation status

This inventory groups source-backed capabilities by operational domain. The
project contains hundreds of route and migration modules; a checked-in route,
page, migration, or package proves repository implementation evidence only. It
does not prove that the feature is enabled, supported in a specific deployment,
or verified end to end.

## Present in source

| Domain | Repository evidence |
|---|---|
| Identity and organization | Auth routes and middleware; user, role, session, organization, hierarchy, grant, and feature-management schemas/routes. |
| Cameras and edge fleet | Camera/device inventory, discovery, provisioning, edge-agent lifecycle, telemetry, and edge configuration route families. |
| Live video and media | Live-session and on-demand media routes; separate media gateway; MediaMTX configuration; dashboard live/video pages. |
| Recording and playback | Recording engine, recording/search/recovery/playback routes, storage and retention modules, timeline/bookmark and synchronized-playback schema. |
| AI/analytics | Analytics engine; analytics, AI search, ANPR, fall, crowd, face, re-identification, violence, obstruction, tamper, abandoned-object, and tailgating route families. |
| Alerts and incidents | Alert command center, operations, suppression, notifications, incidents, playbooks, escalation, and event-stream route families. |
| Evidence and investigations | Evidence capture/export, evidence packages and manifests, chain-of-custody, investigation workspace, legal-hold, and redaction-related code/schema. |
| Operations and reliability | Device/branch health, storage, retention verification, maintenance, predictive health, connectivity, clock monitoring, failover, HA, and operational reporting. |
| Governance | Compliance, privacy, audit, secure-area, identity federation, and access-control-related schemas and routes. |
| Dashboard | Next.js pages for analytics, operations, admin, compliance, maintenance, playback, communications, security devices, reports, and other workspaces. |

## Conditional behavior

The following require deployment or runtime prerequisites:

- External OIDC/SAML/LDAP providers and notification channels require valid
  provider configuration and network access.
- Live/recorded media requires compatible device protocols, working stream
  credentials/secrets, gateway connectivity, and suitable client transport.
- Analytics requires supported inputs, rules, feature configuration, and
  required model artifacts. The Docker entrypoint attempts to fetch an ArcFace
  model when it is absent.
- Storage tiers, cloud archive, SMTP notifications, federation, TURN, and
  managed tunnels need their corresponding external services and secrets.
- Feature-management code is active, so a registered UI or route alone does
  not mean a tenant has the feature enabled.
- The edge agent's Windows release is supplied separately from Git; the
  control-plane Docker build verifies that release before proceeding.

## Explicitly incomplete or unsupported behavior

These are specific source-level limitations found during review:

1. `analytics-engine/src/detectors/face-analytics.ts` contains a TODO for
   attribute detection. Face-related routes/schema do not establish that
   attribute detection is implemented.
2. `edge-agent/src/recorders/adapters/hikvision-recorder.adapter.ts` throws for
   unsupported adapter operations. Do not infer full Hikvision ISAPI coverage
   from the adapter's existence.
3. AI Assistant V2 route registration is conditional in the control-plane app;
   registration can be skipped when its database pool is unavailable or its
   optional import fails.
4. The checked-in OpenAPI contract covers only a subset of the route surface
   and has a declared version that differs from the root package version. It
   must not be treated as the exhaustive API contract.

This list is not a complete TODO audit. Search source and test the exact feature
and adapter operation before making a support commitment.

## Planned features

No authoritative roadmap or full planned-feature register was found in the
reviewed repository. TODOs, disabled rules, dormant routes, feature flags, and
future-looking migration names are not labeled as planned here.

## Release acceptance

For each capability, validate the specific package/build, required migrations,
feature settings, provider credentials, hardware/model prerequisites, and
end-to-end test path. Capture the result for the deployed revision. No
production acceptance results are implied by this repository inventory.
