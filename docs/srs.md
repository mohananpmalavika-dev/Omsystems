# Software Requirements Specification (SRS)

## 1. Purpose and status

This document reconstructs the implemented system requirements from the
repository. It is an **as-built specification**, not a customer-approved
requirements baseline. Requirements marked below describe source-backed
capabilities; deployment-dependent behavior and limitations are called out
separately.

## 2. Product scope

The repository implements a hybrid surveillance and operations platform
composed of a web dashboard, control-plane API, PostgreSQL persistence, media
and recording services, an analytics service, and a separately deployed edge
agent. The codebase includes camera/device inventory and health, organization
and access scoping, live and recorded media flows, analytics/alerts/incidents,
evidence, compliance/privacy, and operational maintenance/reporting domains.

The exact feature set available to an operator depends on the selected build,
database migrations, feature configuration, service credentials, models,
external providers, and connected device support.

## 3. Users and external actors

| Actor | Source-backed interaction |
|---|---|
| Dashboard user | Uses the Next.js interface and control-plane-backed workflows. |
| Tenant/organization administrator | Manages organization-scoped users, branches, devices, and operational settings where permissions allow. |
| Operator/investigator | Uses live, alert, incident, recording, evidence, and investigation workflows where configured. |
| Edge agent | Reports branch/device activity and communicates with control-plane and media components. |
| External identity provider | OIDC/SAML and LDAP-related code and migrations exist; actual provider configuration is deployment-dependent. |
| Camera/recorder/media source | Communicates through supported device adapters/protocols; compatibility varies by model and implemented operation. |
| Operations/platform administrator | Deploys services, configures secrets and storage, applies migrations, and monitors health. |

Role names and exact permissions are configuration/schema dependent; see
[Security](security.md).

## 4. Functional requirements inferred from active code

| ID | Requirement area | As-built evidence and qualification |
|---|---|---|
| FR-01 | Tenant and organization model | Tenant-scoped users and a hierarchical resource-node model exist; SQL migrations and authorization code implement scoped access. |
| FR-02 | Authentication and authorization | The control plane has request authentication, session checks, role/permission data, and default-deny resource authorization. Exact login methods and enabled providers are deployment-dependent. |
| FR-03 | Camera and device inventory | Routes, repositories, SQL schema, and dashboard pages cover cameras, device inventory, discovery, recorders, edge agents, and health. Reachability and vendor compatibility are not guaranteed. |
| FR-04 | Live media | Control-plane live-session operations and a separate media gateway/MediaMTX deployment are present. Valid stream secrets, network paths, and media protocols are prerequisites. |
| FR-05 | Recording and playback | Recording engine source, storage adapters, recording/evidence schema, playback routes/UI, retention, and recovery-related migrations exist. Actual continuity depends on configured storage and services. |
| FR-06 | Video analytics | An analytics service and route/schema families cover analytics, detections, alerting, and multiple detection domains. Models, rules, camera inputs, and feature settings determine availability. |
| FR-07 | Alerts and incidents | Alert command-center, incident, notification, escalation, and operational-event modules are present. External notification delivery requires working provider configuration. |
| FR-08 | Evidence and investigations | Evidence capture, cases/items/exports, chain-of-custody and investigation routes/schema are present. This does not certify evidentiary admissibility or legal compliance. |
| FR-09 | Administration and maintenance | Organization, feature-management, maintenance asset/work-order/vendor, reporting, and compliance surfaces exist in source. Permissions and enabled integrations gate operations. |
| FR-10 | Edge operations | Edge agent package, discovery, telemetry, lifecycle, signed-configuration and update code/schema exist. A release executable is supplied separately from Git. |
| FR-11 | Health and observability | Health/readiness/metrics and operational health/telemetry domains are implemented. Monitoring backends and alert receivers must be configured. |
| FR-12 | Communications | Communication-related pages, routes, migrations, and a communications build step exist. Production enrollment, TURN, credentials, and network support are prerequisites. |

## 5. Data requirements

PostgreSQL is the durable relational store. The schema is evolved by SQL files
under `database/migrations/`; entities include tenants, organization nodes,
users and sessions, cameras and devices, edge agents, analytics, alerts,
incidents, recording, evidence, compliance, privacy, maintenance, and
operational telemetry. Redis is configured in the supplied Compose deployments
for shared runtime state. See [Database](database.md) for relationships and
migration semantics.

## 6. Non-functional requirements and observable constraints

| ID | Requirement / constraint | Evidence or limit |
|---|---|---|
| NFR-01 | Runtime | Root package declares Node.js `>=22`; TypeScript targets ES2022 and strict checking is enabled for the root compile. |
| NFR-02 | API service | Fastify control plane; supplied Compose listens on port 8080. |
| NFR-03 | Persistence | PostgreSQL is required for the normal control-plane deployment and migration runner. |
| NFR-04 | Web client | Dashboard is a Next.js application; supplied Compose publishes port 3000. |
| NFR-05 | Security controls | CORS/Helmet, CSRF hook, session/token checks, scoped authorization, shared service keys, and optional deployment TLS controls appear in code/config. Secure deployment still requires correct configuration. |
| NFR-06 | Availability/recovery | Health probes, storage recovery/failover code, and backup/restore scripts exist. No repository evidence establishes an SLA, RPO/RTO, or a completed disaster-recovery exercise. |
| NFR-07 | Performance/scale | Performance and scale test runners exist. Their presence does not establish a measured capacity guarantee; run them against the target release and environment. |
| NFR-08 | Accessibility/usability | A dashboard exists; no verified accessibility conformance statement or usability acceptance baseline was located. |

## 7. Out of scope / unverified claims

- No complete approved product roadmap or signed customer requirements baseline
  was located. Therefore no future capability is asserted as “planned.”
- Third-party identity, email/SMS, cloud object storage, cloud model delivery,
  TURN, federation, and device integrations require configuration and may incur
  separate service constraints.
- Device-specific compatibility, AI detection accuracy, legal compliance,
  evidentiary admissibility, production readiness, availability, and capacity
  must be validated independently.
- The repository does not provide enough evidence to assert that all dashboard
  pages or route modules are supported, enabled, or acceptance-tested together.

## 8. Acceptance evidence

Use the test commands and release checks in [Testing and deployment](testing-deployment.md).
Record the exact Git revision, environment, database migration status,
external-service configuration, test reports, and operator acceptance for each
release. Test-source presence alone is not acceptance evidence.
