# Sentinel Grid — Production Configuration & Service Discovery Specification

**Standard**: Sentinel Grid Zero-Implicit-Localhost Architecture  
**Enforcement**: Central Schema Validation (`src/config/`) & CI Guard (`scripts/verify-no-production-localhost.ts`)

---

## 1. Core Principles

1. **Explicit Externalized Endpoints**: Production services must never assume `localhost` or `127.0.0.1`. All dependencies must be configured via environment variables, Kubernetes Service DNS, or dynamic service discovery.
2. **Zero Insecure Fallbacks**: If a mandatory configuration variable is missing at startup in production (`NODE_ENV=production`), the process will immediately fail startup with `ProductionConfigurationError`.
3. **Loopback Rejection**: Loopback addresses (`127.0.0.0/8`, `localhost`, `::1`) are strictly rejected in production unless registered as an approved sidecar exception in `config/localhost-allowlist.json`.
4. **Credential Redaction**: Connection strings containing usernames, passwords, or tokens are redacted in logs and diagnostics.

---

## 2. Authoritative Environment Variables

| Variable | Required in Prod? | Component | Scheme | Example (Production) | Secret? | HA Considerations |
| :--- | :---: | :--- | :--- | :--- | :---: | :--- |
| `DATABASE_URL` | **YES** | Control Plane, Backend | `postgresql://` | `postgresql://sentinel@postgres.service.internal:5432/sentinel` | Yes (Password) | Must point to HA Proxy or Virtual IP service SAN |
| `DATABASE_TLS_MODE` | **YES** | Database Pool | `string` | `VERIFY_CA` or `VERIFY_FULL` | No | Strict certificate validation |
| `DATABASE_CA_FILE` | **YES** (if private CA) | Database Pool | `path` | `/run/secrets/postgres-ca.crt` | No | Mounted read-only secret |
| `REDIS_URL` | **YES** (Clustered) | Event Bus, Cache | `redis://` or `rediss://` | `rediss://redis.service.internal:6379` | Yes (Token) | Redis Sentinel / Cluster entrypoint |
| `CONTROL_API_URL` | **YES** (Edge/Workers) | Edge, Analytics | `https://` | `https://control.sentinel.internal` | No | Load balanced control plane endpoint |
| `MEDIA_GATEWAY_URL` | Optional / Dynamic | Dashboard, Control | `http://` / `https://` | `http://media-gateway.sentinel.internal:8090` | No | Discovered via Gateway Registry |
| `RECORDING_ENGINE_URL` | Optional / Dynamic | Control Plane | `http://` / `https://` | `http://recording-engine.sentinel.internal:8095` | No | Discovered via Node Registry |
| `ANALYTICS_ENGINE_URL` | Optional | Control Plane | `http://` / `https://` | `http://analytics-engine.sentinel.internal:8092` | No | Discovered via Node Registry |
| `NATS_URL` | Optional / Cluster | Event Bus | `nats://` | `nats://nats-01.sentinel.internal:4222` | Yes (Token) | Clustered NATS endpoints |

---

## 3. Approved Sidecar Exceptions

Approved exceptions for colocated processes are declared in [`config/localhost-allowlist.json`](file:///c:/Omsystems/Omsystems/config/localhost-allowlist.json):
- `LOCAL_MEDIAMTX`: Local MediaMTX RTSP sidecar on Edge Gateway hardware (`127.0.0.1:8554`).
