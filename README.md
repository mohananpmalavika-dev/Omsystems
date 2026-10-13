# Sentinel Grid

Sentinel Grid is a TypeScript-based, multi-service video-surveillance and
operations platform. The repository contains a Fastify control plane, a Next.js
dashboard, media and recording services, an analytics service, and a separately
packaged edge agent. PostgreSQL stores durable application data; Redis is used
by supported deployments for shared runtime state and events.

This README is an entry point, not a deployment guarantee. Capabilities depend on
configuration, external services, device compatibility, feature settings, and
the installed database schema. The documentation describes evidence found in
this repository and marks areas that are conditional or not verified end to
end.

## Documentation

Start at the [documentation site source](docs/index.md), or build the MkDocs
Material website:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r docs\requirements.txt
mkdocs serve -f docs\mkdocs.yml
```

The site is generated under the root `site\` build-output directory (ignored by
Git). The main guides are:

- [Installation and local deployment](docs/getting-started.md)
- [Software Requirements Specification](docs/srs.md)
- [Software Design Document](docs/sdd.md)
- [Feature inventory and implementation status](docs/features.md)
- [API and OpenAPI coverage](docs/api.md)
- [Database and migrations](docs/database.md)
- [Administrator Manual](docs/administrator-manual.md)
- [Developer Manual](docs/developer-manual.md)
- [End-User Manual](docs/end-user-manual.md)
- [Security and configuration](docs/security.md)
- [Operations, backup, and recovery](docs/operations.md)
- [Testing, deployment, and troubleshooting](docs/testing-deployment.md)

## Repository at a glance

| Area | Location | Runtime/package evidence |
|---|---|---|
| Control plane | `src/` | Node.js 22+, TypeScript, Fastify, PostgreSQL |
| Dashboard | `dashboard/` | Next.js, React |
| Edge agent | `edge-agent/` | Node.js/TypeScript source and separately supplied Windows release |
| Media gateway | `media-gateway/` | Fastify service integrated with MediaMTX |
| Recording engine | `recording-engine/` | Recording, storage, retention, and evidence service |
| Analytics engine | `analytics-engine/` | Detection and analytics service |
| Shared packages | `packages/` | Authorization, contracts, crypto, identity, evidence, observability, and recorder SDK packages |
| Schema | `database/migrations/` | PostgreSQL SQL migrations |
| API contract | `openapi/control-plane.yaml` | OpenAPI 3.1 document; partial API coverage |
| Container definitions | `compose.yaml`, `docker-compose.production.yml`, `Dockerfile` | Two Compose deployment definitions and service images |

## Prerequisites

- Node.js version 22 or later and npm.
- PostgreSQL compatible with the included PostgreSQL 16/17 Compose images.
- Docker Compose for the containerized local stack.
- A separately supplied Windows edge-agent release for the root Docker build.
- Credentials and service configuration appropriate to the deployment.

See [Getting started](docs/getting-started.md) before starting services.

## Development commands

From the repository root:

```powershell
npm ci
npm run dev
npm run typecheck
npm test
```

`npm run dev` starts the control plane only; it does not start the dashboard,
database, Redis, media gateway, recording engine, or analytics engine.

## Security and operational notes

- Do not commit real credentials or copy secret values from local environment
  files into documentation, issue reports, or logs.
- Review [Security](docs/security.md) and [Operations](docs/operations.md)
  before exposing services or applying database restores.
- A successful build or unit test is not proof of a production-ready deployment,
  device compatibility, an available AI model, or a tested disaster-recovery
  process.
- Preserve third-party notices distributed with packaged components, including
  the FFmpeg runtime notices under `edge-agent/runtime/`.

## Project status

The package version is `1.0.0-rc.2`. The repository contains active runtime
implementations and extensive route, test, and migration sources, but no
authoritative release support matrix or complete approved product roadmap was
found. See the [implementation status](docs/features.md) for known limitations
and verification boundaries.
