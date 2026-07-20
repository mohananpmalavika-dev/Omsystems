# Production Readiness Gap Analysis - Sentinel Grid
**Analysis Date:** January 20, 2025  
**Target Go-Live:** Tomorrow  
**Status:** ⚠️ CRITICAL GAPS IDENTIFIED

## Executive Summary

The Sentinel Grid system has solid foundational architecture for camera management, authorization, and live streaming. However, **multiple critical security and operational gaps must be addressed before production deployment**. This is not production-ready for tomorrow without immediate fixes.

### Risk Level: 🔴 HIGH
- **Security:** Multiple critical vulnerabilities (weak secrets, no auth, exposed credentials)
- **Operational:** Missing monitoring, no disaster recovery, incomplete error handling
- **Data:** No backup strategy, missing cleanup jobs, no migration tooling

---

## 🔴 CRITICAL - MUST FIX BEFORE GO-LIVE

### 1. Authentication & Authorization

#### **No OIDC Implementation**
- **Impact:** Using development `x-user-id` header instead of real authentication
- **Current:** `AUTH_MODE=development` with header-based identity
- **Required:** OIDC token validation with signed JWT
- **Location:** `src/app.ts` lines 37-50
- **Fix Required:**
  - Implement OIDC middleware
  - Validate JWT signatures
  - Extract claims and map to user identity
  - Add token expiration checks

#### **No mTLS for Edge Agents**
- **Impact:** Edge agents use development user headers, no certificate-based identity
- **Current:** `DEV_USER_ID` environment variable for authentication
- **Required:** Mutual TLS with client certificates
- **Location:** `edge-agent/src/config.ts`, `edge-agent/src/registration/gateway-client.ts`
- **Fix Required:**
  - Generate per-agent certificates
  - Implement certificate validation in control plane
  - Store agent identity in certificate CN/SAN

### 2. Secrets Management

#### **Hardcoded Development Secrets**
- **Impact:** Weak, predictable secrets in production
- **Current Issues:**
  - `MEDIA_GATEWAY_SHARED_KEY: "development-media-gateway-key-change-me"`
  - Database password: `local-development-only`
  - Secrets visible in `compose.yaml` and `.env.example`
- **Required:**
  - Generate strong random secrets (32+ bytes, cryptographically random)
  - Use secrets management (AWS Secrets Manager, HashiCorp Vault, or Kubernetes Secrets)
  - Rotate secrets regularly

#### **Camera Credentials in Plaintext**
- **Impact:** RTSP credentials stored in environment variables and memory
- **Current:** `STREAM_SECRETS_JSON` as plaintext JSON, camera credentials in env vars
- **Location:** `media-gateway/src/secret-provider.ts`, `edge-agent/src/config.ts`
- **Required:**
  - Encrypt credentials at rest
  - Integrate with secrets manager
  - Implement credential rotation

### 3. Database Security & Operations

#### **No TLS/SSL for PostgreSQL**
- **Impact:** Database credentials and data transmitted in plaintext
- **Location:** `src/database/pool.ts`
- **Fix Required:**
  - Add `ssl: { rejectUnauthorized: true, ca: ... }` to pool config
  - Require TLS in production DATABASE_URL

#### **No Connection Retry Logic**
- **Impact:** Application crashes on temporary database outage
- **Location:** `src/database/pool.ts`
- **Fix Required:**
  - Implement exponential backoff retry
  - Add connection health checks
  - Graceful degradation on database unavailability

#### **No Migration Tooling**
- **Impact:** Manual migration execution, no version tracking, no rollback capability
- **Current:** SQL files in `database/migrations/`, loaded at container init
- **Required:**
  - Implement migration runner (e.g., node-pg-migrate, Flyway, or custom)
  - Track applied migrations in database
  - Add rollback scripts
  - Test migrations on production-like dataset

#### **No Data Retention & Cleanup**
- **Impact:** `live_sessions`, `audit_events`, `camera_discoveries` tables grow unbounded
- **Location:** `database/migrations/002_edge_and_media_contract.sql`
- **Fix Required:**
  - Implement TTL-based cleanup job for expired sessions
  - Add audit log rotation/archival (e.g., partition by month)
  - Create indexes for cleanup queries
  - Schedule periodic vacuum/analyze

### 4. Rate Limiting & DoS Protection

#### **No Rate Limiting**
- **Impact:** System vulnerable to API abuse, credential brute-force, resource exhaustion
- **Current:** No rate limiting on any endpoint
- **Critical Endpoints:**
  - `/v1/cameras/:id/live-sessions` - Can exhaust tokens
  - `/internal/mediamtx/auth` - Called on every HLS segment/WebRTC request
  - `/v1/branches/:branchId/cameras/discovered` - Can flood discovery queue
- **Fix Required:**
  - Add `@fastify/rate-limit` plugin
  - Per-user rate limits (100 req/min general, 10 req/min for live sessions)
  - Per-IP rate limits for internal endpoints
  - Token bucket algorithm for bursty traffic

### 5. Input Validation & Injection Protection

#### **SQL Injection Risk**
- **Status:** ✅ **GOOD** - Using parameterized queries throughout
- **Location:** All `*-repository.ts` files use `$1, $2` placeholders

#### **Missing Input Sanitization**
- **Impact:** Potential XSS, command injection, path traversal
- **Issues:**
  - Branch/camera names not sanitized before display
  - File paths from external sources (`ffprobe` output)
  - ONVIF XML parsing without schema validation
- **Fix Required:**
  - Add DOMPurify or similar for user-generated content in dashboard
  - Validate all external data against schemas
  - Sanitize file paths from `ffprobe` before use

### 6. Error Handling & Information Disclosure

#### **Internal Details Exposed in Errors**
- **Impact:** Stack traces, database errors, internal paths exposed to clients
- **Location:** 
  - `src/app.ts` - Generic error handler logs but may expose details
  - `media-gateway/src/app.ts` - Error messages leak internal state
  - `edge-agent/src/devices/onvif-client.ts` - ONVIF errors include XML snippets
- **Fix Required:**
  - Implement generic error responses ("Internal Server Error")
  - Log full details server-side only
  - Add error codes for debugging without exposing internals

#### **Missing Global Error Handlers**
- **Impact:** Unhandled promise rejections crash the process
- **Fix Required:**
  ```typescript
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', reason);
    // Graceful shutdown
  });
  
  process.on('uncaughtException', (error) => {
    logger.fatal('Uncaught exception', error);
    process.exit(1);
  });
  ```

### 7. CORS Misconfiguration

#### **CORS Disabled in Production**
- **Impact:** API accessible from any origin
- **Current:** `cors: { origin: false }` in `src/app.ts`
- **Fix Required:**
  - Set explicit allowed origins
  - Configure credentials support
  - Restrict methods and headers
  ```typescript
  await app.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? [],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH'],
  });
  ```

### 8. Missing Health Checks

#### **No Dependency Health Checks**
- **Impact:** Load balancers can't detect partial failures
- **Current:** `/health` returns 200 without checking dependencies
- **Location:** `src/app.ts`, `media-gateway/src/app.ts`
- **Fix Required:**
  - Check database connectivity
  - Check MediaMTX availability (for media gateway)
  - Check control plane availability (for media gateway)
  - Return 503 if critical dependencies unavailable
  - Add `/health/ready` and `/health/live` endpoints

### 9. Logging & Observability

#### **No Structured Logging**
- **Impact:** Difficult to parse logs, no correlation IDs, missing audit context
- **Current:** Fastify logger enabled but minimal structured context
- **Fix Required:**
  - Add correlation IDs (X-Request-ID header)
  - Log user identity, tenant ID on every request
  - Add log levels based on severity
  - Include request duration, status code in access logs

#### **No Metrics/Telemetry**
- **Impact:** Cannot monitor performance, detect anomalies, or capacity plan
- **Fix Required:**
  - Add Prometheus metrics (request count, duration, error rate)
  - Track live sessions, active streams, authorization checks
  - Add MediaMTX path count, viewer count
  - Expose `/metrics` endpoint

#### **No Distributed Tracing**
- **Impact:** Cannot trace requests across services (dashboard → control plane → media gateway)
- **Fix Required:**
  - Add OpenTelemetry instrumentation
  - Propagate trace context between services
  - Track latency per service hop

### 10. Configuration Validation

#### **Missing Environment Variable Validation**
- **Status:** ✅ **GOOD** - Using Zod schemas in all config files
- **Improvement Needed:** Validate at startup, not first use

#### **No Configuration File for Production**
- **Impact:** Production deployments rely on copy-pasting `.env.example`
- **Fix Required:**
  - Create `deploy/production.env.template` with strong defaults
  - Document required vs optional variables
  - Add configuration checker script

---

## 🟡 HIGH PRIORITY - FIX WITHIN WEEK 1

### 11. Missing Graceful Shutdown

- **Impact:** In-flight requests dropped, database connections not closed
- **Fix Required:**
  ```typescript
  process.on('SIGTERM', async () => {
    await app.close();
    await store.close();
    process.exit(0);
  });
  ```

### 12. No Request Timeouts

- **Impact:** Slow clients can exhaust connection pool
- **Location:** `src/app.ts`, `media-gateway/src/app.ts`
- **Fix Required:**
  - Add `connectionTimeout: 30000` to Fastify config
  - Add `requestTimeout: 60000` for long-running requests
  - Set timeouts on all HTTP client calls

### 13. Missing Database Indexes

- **Impact:** Slow queries on large datasets (500 branches, 4000 cameras)
- **Current:** Basic indexes exist but missing optimization indexes
- **Fix Required:**
  - Add composite index on `(tenant_id, user_id, action)` for grant lookups
  - Add index on `cameras.last_seen_at` for health monitoring
  - Add index on `audit_events.correlation_id` for tracing
  - Run `EXPLAIN ANALYZE` on all common queries

### 14. No Backup & Disaster Recovery

- **Impact:** Data loss if database corrupted or deleted
- **Fix Required:**
  - Implement automated daily PostgreSQL backups (pg_dump or WAL archiving)
  - Test restore procedure
  - Document RTO (Recovery Time Objective) and RPO (Recovery Point Objective)
  - Add backup verification (restore to staging daily)

### 15. No Monitoring & Alerting

- **Impact:** Cannot detect outages, performance degradation, or security incidents
- **Fix Required:**
  - Set up alerting on error rates, latency, database connections
  - Alert on failed authentication attempts
  - Alert on camera offline/degraded status
  - Alert on disk space, memory usage

### 16. Resource Limits Not Set

- **Impact:** Containers can exhaust host resources
- **Location:** `compose.yaml`
- **Fix Required:**
  ```yaml
  deploy:
    resources:
      limits:
        cpus: '1'
        memory: 512M
      reservations:
        cpus: '0.5'
        memory: 256M
  ```

### 17. Container Security

#### **Base Images Not Pinned**
- **Impact:** Builds non-reproducible, vulnerable to supply chain attacks
- **Fix Required:**
  - Pin to specific digest: `node:22-alpine@sha256:...`
  - Scan images with Trivy or Grype
  - Update base images monthly

#### **Running as node User**
- **Status:** ✅ **GOOD** - All Dockerfiles use `USER node`

#### **No Security Scanning**
- **Fix Required:**
  - Add `docker scan` or Trivy to CI pipeline
  - Block deployments with HIGH/CRITICAL vulnerabilities

---

## 🟢 MEDIUM PRIORITY - FIX WITHIN MONTH 1

### 18. Testing Coverage

- **Unit Tests:** Basic tests exist but incomplete
  - Missing: Repository tests, authorization edge cases
- **Integration Tests:** Basic API tests exist
  - Missing: Multi-tenant isolation, grant expiration, concurrent session limits
- **Load Tests:** None
  - Required: Test 500 branches, 4000 cameras, 100 concurrent live sessions
- **Security Tests:** None
  - Required: Penetration testing, OWASP Top 10 validation

### 19. Dashboard Security

- **No CSRF Protection:** Dashboard makes state-changing requests without CSRF tokens
- **No Content Security Policy:** Missing CSP headers
- **Demo Mode in Production:** `DASHBOARD_DEMO_MODE` can be enabled
- **Fix Required:**
  - Add CSRF token validation
  - Implement CSP: `default-src 'self'; connect-src 'self' ${MEDIA_GATEWAY_URL}`
  - Remove demo mode or restrict to localhost

### 20. API Documentation

- **Missing:** No OpenAPI/Swagger spec
- **Required:** 
  - Document all endpoints, request/response schemas
  - Add authentication requirements
  - Include example requests

### 21. Operational Documentation

- **Missing:**
  - Deployment runbook
  - Incident response procedures
  - Common troubleshooting steps
  - Scaling guidelines
- **Required:** Create `docs/operations/` directory with guides

### 22. Performance Optimization

- **No Caching:** Authorization checks, node lookups happen on every request
- **No Connection Pooling:** HTTP clients create new connections per request
- **No CDN:** Media gateway serves HLS directly (should use CDN for scale)
- **Fix Required:**
  - Add Redis cache for authorization decisions (30s TTL)
  - Implement HTTP connection pooling (`undici` or `node-fetch` with agent)
  - Add CDN (CloudFront, Cloudflare) in front of MediaMTX

### 23. Camera Credential Rotation

- **Impact:** If camera credentials compromised, no way to rotate
- **Fix Required:**
  - Design credential rotation workflow
  - Update edge agent to refetch credentials periodically
  - Add credential version tracking

### 24. Multi-Region Support

- **Current:** Single-region deployment assumed
- **Required for Scale:**
  - Add region field to branches
  - Deploy media gateways per region
  - Route live sessions to nearest gateway

---

## 🔵 LOW PRIORITY - FUTURE ENHANCEMENTS

### 25. Advanced Features

- **Recording & Playback:** Not implemented (mentioned in roadmap)
- **Alarm Workflow:** Not implemented
- **Mobile App:** Dashboard is web-only
- **PTZ Control:** Capabilities tracked but no control API
- **Analytics/AI:** No video analytics integration

### 26. Developer Experience

- **Hot Reload:** Works in dev mode ✅
- **Local Development:** Requires Docker Compose ✅
- **CI/CD Pipeline:** Not present ❌
- **Pre-commit Hooks:** None (consider linting, type checking)

---

## Immediate Action Plan (24 Hours)

### Block 1: Security (4 hours)
1. Generate and deploy strong random secrets for `MEDIA_GATEWAY_SHARED_KEY` and database
2. Add OIDC authentication skeleton (even if just validates token signature)
3. Add rate limiting to live session and auth endpoints
4. Enable database TLS connections
5. Fix CORS configuration

### Block 2: Stability (3 hours)
1. Add global error handlers (unhandledRejection, uncaughtException)
2. Add graceful shutdown handlers
3. Implement dependency health checks
4. Add request timeouts
5. Add database connection retry logic

### Block 3: Observability (2 hours)
1. Add structured logging with correlation IDs
2. Add basic Prometheus metrics
3. Set up error alerting (email or Slack)

### Block 4: Testing (3 hours)
1. Run load test (100 concurrent users, 1000 cameras)
2. Test database failover
3. Test live session expiration
4. Verify authorization deny rules work

### Block 5: Documentation (1 hour)
1. Create deployment checklist
2. Document required environment variables
3. Write incident response contact list

### Total: 13 hours of critical fixes

---

## Recommendation

**Do NOT go live tomorrow without addressing CRITICAL issues.**

### Minimum Viable Production (1-week delay recommended):
- Implement OIDC authentication
- Deploy proper secrets management
- Add rate limiting
- Enable database TLS
- Add monitoring & alerting
- Complete load testing
- Document runbooks

### If Forced to Launch Tomorrow:
- Deploy to **limited pilot only** (1-2 branches, <50 cameras)
- Restrict access to internal network (no public internet)
- Manual approval for all user access
- 24/7 on-call engineering support
- Daily manual backups
- Accept risk of data breach if edge agents compromised

---

## Gap Summary by Component

| Component | Critical Gaps | High Priority | Medium Priority |
|-----------|--------------|---------------|-----------------|
| Control Plane API | 5 | 4 | 3 |
| Media Gateway | 3 | 2 | 2 |
| Edge Agent | 4 | 2 | 1 |
| Dashboard | 2 | 1 | 3 |
| Database | 4 | 3 | 1 |
| Infrastructure | 3 | 4 | 2 |
| **TOTAL** | **21** | **16** | **12** |

---

## Contact for Questions
Review this document with your team and prioritize fixes based on your risk tolerance and deployment model (cloud vs on-prem, pilot vs full rollout).
