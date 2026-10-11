# Developer Manual

## Repository layout

| Path | Purpose |
|---|---|
| `src/` | Control-plane TypeScript application, domain, routes, middleware, stores, repositories, and services |
| `dashboard/` | Next.js dashboard workspace |
| `edge-agent/` | Edge-agent source and packaging workspace |
| `media-gateway/` | Media gateway workspace |
| `recording-engine/` | Recording engine workspace |
| `analytics-engine/` | Analytics workspace |
| `packages/` | Shared contracts, identity, authorization, crypto, security, observability, recorder SDK, evidence and offline-player packages |
| `database/migrations/` | PostgreSQL DDL and migration scripts |
| `test/`, `tests/`, workspace `test/` directories | Unit, integration, acceptance, and specialized runners |
| `openapi/` | Checked-in partial OpenAPI contract |
| `compose.yaml`, service Dockerfiles | Local service orchestration and container builds |

Root TypeScript compilation includes `src/**/*.ts`; dashboard, edge, media,
recording, analytics, and packages are separate workspaces with their own
configurations. The root `tsconfig.json` explicitly excludes several route or
feature directories from the root compiler. Do not treat a successful root
typecheck as a full monorepo typecheck.

## Install and run

```powershell
npm ci
npm run dev
```

Set `DATABASE_URL` and the service settings required by the paths being
exercised. The root development command launches only the control plane.
Database setup and migrations are described in [Getting started](getting-started.md).

Workspace commands include:

```powershell
npm run dashboard:dev
npm run media:dev
npm run analytics:dev
npm run edge:dev
```

The recording engine has workspace-level commands; inspect
`recording-engine/package.json` for the current scripts. The services may need
each other's URLs and shared keys to exercise integrated behavior.

## Build and quality commands

Root scripts in `package.json` include:

```powershell
npm run build
npm run typecheck
npm run typecheck:all
npm test
npm run test:smoke
npm run test:integration
npm run test:security
npm run release:preflight
```

`typecheck:all` includes root and configured workspaces; `build:all` also
attempts the edge executable build. Some scripts require local services,
native/runtime assets, cloud access, Windows packaging, or specific environment
values. Run focused selectors first and record prerequisites and failures.

Additional script families cover storage, TLS, cameras/recorders, HA, evidence,
alerts, telemetry, scale, and chaos testing. See `package.json` for the current
script list rather than relying on this summary as an exhaustive command index.

## Change workflow

1. Identify the owning service, route, repository, schema, and dashboard
   surface.
2. Trace authorization and tenant/resource scope for both reads and writes.
3. Add a forward-only SQL migration when persistence changes; never rewrite an
   already deployed migration.
4. Update tests, route contracts, and the OpenAPI file when API behavior
   changes.
5. Run focused tests and typechecks for every affected workspace.
6. Run build/release checks appropriate to the target artifact.
7. Document configuration, operational effects, migration requirements, and
   known limitations.

## API and data conventions

Fastify control-plane routes are registered in the control-plane app. Services
also expose their own routes. The checked-in OpenAPI document is partial and is
not generated from every route; update and validate it deliberately when a
documented API changes.

PostgreSQL schema changes are under `database/migrations/`. Migration runs are
serialized and recorded in `schema_migrations`. Review the runner's checksum
setting before production use; checksum checking is off unless explicitly
enabled.

## Security and logs

- Preserve default-deny authorization and tenant/branch checks.
- Validate inputs using existing schemas/helpers and add negative tests.
- Keep shared keys, database URLs, camera credentials, and model access
  credentials out of source, tests, snapshots, and logs.
- Do not enable development identity shortcuts in exposed deployments.
- Keep external service errors visible; do not silently convert failed
  integrations into success responses.
- Preserve relevant third-party license and attribution files when changing
  bundled runtimes.
