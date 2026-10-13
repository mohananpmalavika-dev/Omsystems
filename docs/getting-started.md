# Installation and local deployment

This guide covers the repository's included Compose stack and a control-plane
development process. It is not a substitute for a production runbook.

## Prerequisites

- Git.
- Node.js 22 or later and npm (declared by the root package).
- Docker Engine and the Docker Compose plugin.
- A separately supplied Windows edge-agent release and checksum manifest for
  building the root control-plane image. The Dockerfile verifies this input and
  intentionally fails when it is missing or mismatched.
- Deployment-specific secrets and a PostgreSQL connection string.
- PostgreSQL must have pgvector installed for migration `014_enable_pgvector_faces.sql`.
  The Compose definitions use matching PostgreSQL 16/17 images with pgvector.
  The supported images are documented by [pgvector](https://github.com/pgvector/pgvector#docker).
  These definitions support new installations. Validate backup/restore and
  collation compatibility before changing the image of an existing database.

## Configure the Compose stack

The root `compose.yaml` starts the API, dashboard, media gateway, recording
engine, analytics engine, MediaMTX, Redis, and PostgreSQL. It requires these
values (do not use real values in source control):

| Variable | Purpose in Compose |
|---|---|
| `DATABASE_URL` | API PostgreSQL connection string |
| `DB_PASSWORD` | PostgreSQL container password |
| `MEDIA_GATEWAY_SHARED_KEY` | API-to-media service authentication |
| `REPORT_DOWNLOAD_SECRET` | Signed report-download secret |
| `EDGE_BRIDGE_SHARED_KEY` | Edge bridge shared authentication |
| `RECORDING_ENGINE_SHARED_KEY` | API/recording service shared authentication |
| `ANALYTICS_ENGINE_SHARED_KEY` | API/analytics service shared authentication |
| `ANALYTICS_SOURCE_SHARED_KEY` | Analytics source authentication |
| `DASHBOARD_DEV_USER_ID` | Dashboard build/runtime user identity setting |

Other optional values and service-specific controls are defined directly in
`compose.yaml` and the service `.env.example` files. Inspect those definitions
before enabling an integration. Use a secret manager or a local untracked
environment file; never paste secrets into checked-in files.

The root Compose file publishes several service ports on the Docker host and
uses a simple local PostgreSQL configuration. Do not expose it to an untrusted
network as-is. For production considerations and the separate
`docker-compose.production.yml`, see [Deployment](testing-deployment.md).

## Start services

After setting required environment values in your shell or a Compose-compatible
environment file:

```powershell
docker compose -f compose.yaml config
docker compose -f compose.yaml up --build -d
docker compose -f compose.yaml ps
```

The control-plane image entrypoint attempts to download an ArcFace model if the
configured model file is missing, runs database migrations, and then starts the
API. A failure to download a required model or connect to PostgreSQL prevents
successful startup. Model-source access and model integrity are deployment
responsibilities; SHA-256 verification occurs only when a checksum is
configured.

Check service health using Compose status and the configured `/health`
endpoints. The dashboard is published on port `3000`, the control plane on
`8080`, the media gateway on `8090`, the analytics engine on `8092`, and
MediaMTX ports are published as specified in the Compose file. Do not assume
that an open TCP port means the relevant application function is configured.

Stop the stack:

```powershell
docker compose -f compose.yaml down
```

Named volumes persist PostgreSQL, Redis, and recording data. `down` without
`--volumes` does not remove them. Deleting volumes is destructive; take and
verify backups first.

## Run only the control plane in development

```powershell
npm ci
$env:DATABASE_URL = "postgres://<user>:<password>@<host>:5432/<database>"
npm run migrate
npm run dev
```

`npm run dev` starts `src/index.ts` only. PostgreSQL must be reachable and
required application configuration must be set. External services are not
automatically started by this command. For service-specific development
commands, use the [Developer Manual](developer-manual.md).

## First-run verification

1. Confirm PostgreSQL is reachable and `npm run migrate:status` shows the
   expected migration state.
2. Confirm each required container is healthy and inspect its logs.
3. Verify an authorized user can sign in and access only their intended
   tenant/branch scope.
4. Test live view, recording, alerts, and device operations only with equipment
   and credentials authorized for the environment.
5. Verify backup and restore procedures in a non-production environment.

These checks are operator actions; the repository does not establish that they
have been completed for a particular installation.
