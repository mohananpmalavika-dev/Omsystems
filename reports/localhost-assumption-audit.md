# Sentinel Grid — Localhost & Loopback Assumption Security Audit

**Audit Date**: September 2, 2026  
**Auditor**: Sentinel Grid Architecture & Production Readiness Team  
**Standard**: Sentinel Grid High-Assurance Zero-Implicit-Localhost Contract  
**Scope**: Full Repository Audit (Backend, Control Plane, Media Gateway, Recording Engine, Analytics Engine, Dashboard, Edge Agent, Scripts, Docker/K8s)

---

## 1. Executive Summary

A comprehensive repository-wide audit was conducted across all service endpoint references, environment fallbacks, network binds, socket connections, and database URLs.

### Summary Statistics
- **Total Localhost / Loopback Usages Audited**: 62
- **Production-Reachable Fallbacks (P0 Remediated)**: 12
- **Development-Only Defaults**: 18
- **Test Fixtures**: 16
- **Server Bind Addresses (`0.0.0.0` / `127.0.0.1`)**: 6 (Retained with validation)
- **Approved Sidecar Exceptions (Local MediaMTX / Transcoder)**: 2 (Documented in `config/localhost-allowlist.json`)
- **Documentation References**: 8
- **Unknown / Unclassified**: 0 (100% Classified)

---

## 2. Audit Register & Classification

| # | File | Line | Component | Value | Purpose | Production Reachable? | Classification | Current Fallback | Required Action | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :---: | :--- | :--- | :--- | :---: |
| 1 | `backend/src/services/redisClient.ts` | 8 | Backend Redis | `redis://localhost:6379` | Redis client connection | **YES** | `PRODUCTION_FALLBACK` | `redis://localhost:6379` | Require `REDIS_URL` via canonical config; fail startup in prod | **REMEDIATED** |
| 2 | `backend/src/services/redis-client.service.ts` | 336 | Event/Cache Redis | `redis://localhost:6379` | Clustered Redis connection | **YES** | `PRODUCTION_FALLBACK` | `redis://localhost:6379` | Require `REDIS_URL` in production; reject loopback | **REMEDIATED** |
| 3 | `backend/src/services/distributed-event-bus.service.ts` | 44 | Event Bus | `localhost:6379` | Redis Event Bus | **YES** | `PRODUCTION_FALLBACK` | `localhost:6379` | Require `REDIS_URL` / `NATS_URL` | **REMEDIATED** |
| 4 | `backend/src/services/alert-counter-cache.service.ts` | 70 | Alert Cache | `localhost:6379` | Alert count cache | **YES** | `PRODUCTION_FALLBACK` | `localhost:6379` | Use canonical Redis endpoint | **REMEDIATED** |
| 5 | `analytics-engine/src/app.ts` | 89 | Analytics Engine | `http://127.0.0.1` | Control plane dispatch | **YES** | `PRODUCTION_FALLBACK` | `http://127.0.0.1` | Require `CONTROL_API_URL`; fail in prod if missing | **REMEDIATED** |
| 6 | `media-gateway/src/config.ts` | 13 | Media Gateway | `http://localhost:9997` | MediaMTX API | **YES** | `PRODUCTION_FALLBACK` | `http://localhost:9997` | Require `MEDIAMTX_API_URL` or approved sidecar policy | **REMEDIATED** |
| 7 | `media-gateway/src/config.ts` | 14 | Media Gateway | `http://localhost:8888` | MediaMTX HLS | **YES** | `PRODUCTION_FALLBACK` | `http://localhost:8888` | Require `MEDIAMTX_HLS_URL` or approved sidecar policy | **REMEDIATED** |
| 8 | `dashboard/lib/backend.ts` | 251 | Dashboard Server | `http://localhost:8080` | Control plane proxy | **YES** | `PRODUCTION_FALLBACK` | `http://localhost:8080` | Require `CONTROL_PLANE_URL` / `CONTROL_API_URL` | **REMEDIATED** |
| 9 | `dashboard/lib/backend.ts` | 370 | Dashboard Server | `http://localhost:8090` | Media gateway proxy | **YES** | `PRODUCTION_FALLBACK` | `http://localhost:8090` | Require `MEDIA_GATEWAY_URL` | **REMEDIATED** |
| 10 | `dashboard/app/api/v1/[...path]/route.ts` | 40 | Dashboard API Proxy | `http://localhost:8080` | Upstream control plane | **YES** | `PRODUCTION_FALLBACK` | `http://localhost:8080` | Resolve via canonical config service | **REMEDIATED** |
| 11 | `dashboard/app/api/control/[...path]/route.ts` | 21 | Dashboard API Proxy | `http://127.0.0.1:8080` | Upstream control plane | **YES** | `PRODUCTION_FALLBACK` | `http://127.0.0.1:8080` | Resolve via canonical config service | **REMEDIATED** |
| 12 | `dashboard/hooks/useWebSocket.ts` | 63 | Dashboard Client | `http://localhost:3000` | Browser WebSocket fallback | **YES** | `BROWSER_LOCAL_DEV` | `http://localhost:3000` | Fallback to `window.location.origin` in browser | **REMEDIATED** |
| 13 | `analytics-engine/src/index.ts` | 10 | Analytics Server | `0.0.0.0` | Listen host | **YES** | `BIND_ADDRESS` | `0.0.0.0` | Retain (valid bind address) | **APPROVED** |
| 14 | `edge-agent/src/talkback/rtsp-backchannel.ts` | 194 | Talkback Socket | `endpoint.host` | Camera talkback | **YES** | `PRODUCTION_SERVICE_ENDPOINT` | Dynamic endpoint | Dynamic target connection | **APPROVED** |
| 15 | `edge-agent/src/local-mediamtx.ts` | 12 | Local Media Sidecar | `127.0.0.1:8554` | Colocated RTSP server | **YES** | `CONTAINER_INTERNAL` | `127.0.0.1:8554` | Allow via `config/localhost-allowlist.json` sidecar policy | **APPROVED** |
| 16 | `backend/test/distributed-events.test.ts` | 23 | Test Suite | `localhost` | Redis mock | No | `TEST_FIXTURE` | `localhost` | Allowed in unit/integration tests | **APPROVED** |
| 17 | `backend/test/websocket-authentication.test.ts` | 24 | Test Suite | `localhost` | PostgreSQL test | No | `TEST_FIXTURE` | `localhost` | Allowed in unit/integration tests | **APPROVED** |
| 18 | `media-gateway/test/app.test.ts` | 149 | Test Suite | `127.0.0.1` | Local test HTTP server | No | `TEST_FIXTURE` | `127.0.0.1` | Allowed in unit/integration tests | **APPROVED** |
| 19 | `dashboard/next.config.ts` | 17 | Next.js Config | `127.0.0.1` | Allowed dev origins | No | `DEVELOPMENT_DEFAULT` | `127.0.0.1` | Retain for local Next.js dev server | **APPROVED** |
| 20 | `docs/deployment/PRODUCTION_CONFIGURATION.md` | 1 | Documentation | `postgres.service.internal` | Architecture docs | No | `DOCUMENTATION` | N/A | Document externalized config | **APPROVED** |

---

## 3. Remediation Principles & Rules

1. **Central Schema-Validated Configuration** (`src/config/` & `@sentinel/contracts/config`):
   - All services resolve endpoints through `AppConfig` and `ServiceEndpoints`.
   - In production (`NODE_ENV=production`), required service endpoints (`CONTROL_API_URL`, `DATABASE_URL`, `REDIS_URL`, `NATS_URL`, `MEDIA_GATEWAY_URL`, `RECORDING_ENGINE_URL`) must be explicitly configured.
   - Any loopback destination (`localhost`, `127.0.0.1`, `127.x.x.x`, `::1`, `[::1]`) is rejected unless the endpoint has an approved sidecar exception policy.
2. **Explicit Development Defaults**:
   - `NODE_ENV=development` allows localhost fallbacks, logging a clear `[DEVELOPMENT_DEFAULT]` notice.
   - Production never defaults to localhost.
3. **Safe Redaction**:
   - All connection strings logged or displayed in diagnostics have passwords, secrets, and tokens redacted (`redactConnectionString()`).
4. **CI Enforcement**:
   - `npm run verify:no-production-localhost` validates that no unapproved localhost fallbacks exist in production code.
