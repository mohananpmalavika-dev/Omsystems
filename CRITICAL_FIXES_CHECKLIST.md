# Critical Fixes Checklist - 24 Hour Sprint

## Priority 1: Security (MUST DO)

### ✅ Task 1: Generate Strong Secrets (15 min)
```powershell
# Generate strong random keys
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
- [ ] Generate new MEDIA_GATEWAY_SHARED_KEY (32+ bytes)
- [ ] Generate new database password (16+ chars)
- [ ] Update `.env` file (DO NOT commit)
- [ ] Update `compose.yaml` to use env vars instead of hardcoded values
- [ ] Test: Restart all services, verify connectivity

### ✅ Task 2: Add Rate Limiting (30 min)
```bash
npm install @fastify/rate-limit
```
- [ ] Add to control plane (`src/app.ts`)
- [ ] Add to media gateway (`media-gateway/src/app.ts`)
- [ ] Configure: 100 req/min global, 10 req/min for `/v1/cameras/:id/live-sessions`
- [ ] Test: Verify 429 response after limit exceeded

### ✅ Task 3: Fix CORS Configuration (10 min)
- [ ] Update `src/app.ts`: Set explicit allowed origins
- [ ] Add `ALLOWED_ORIGINS` environment variable
- [ ] Test: Verify dashboard can still connect
- [ ] Test: Verify unauthorized origins blocked

### ✅ Task 4: Add Database TLS (20 min)
- [ ] Update `src/database/pool.ts` to require SSL
- [ ] Add SSL certificates to database server
- [ ] Update DATABASE_URL to include `sslmode=require`
- [ ] Test: Verify connection works with TLS
- [ ] Test: Verify connection fails without TLS

### ✅ Task 5: Add Global Error Handlers (15 min)
- [ ] Add to `src/index.ts`
- [ ] Add to `media-gateway/src/index.ts`
- [ ] Add to `edge-agent/src/index.ts`
- [ ] Test: Trigger unhandled rejection, verify graceful handling

---

## Priority 2: Stability (SHOULD DO)

### ✅ Task 6: Health Check Improvements (30 min)
- [ ] Check database connectivity in `/health`
- [ ] Check MediaMTX in media gateway `/health`
- [ ] Add `/health/ready` and `/health/live` endpoints
- [ ] Test: Verify 503 when database down

### ✅ Task 7: Graceful Shutdown (20 min)
- [ ] Add SIGTERM handler to all services
- [ ] Close database connections
- [ ] Close Fastify server gracefully
- [ ] Test: Send SIGTERM, verify clean shutdown

### ✅ Task 8: Request Timeouts (15 min)
- [ ] Add Fastify connectionTimeout
- [ ] Add requestTimeout
- [ ] Add timeout to all fetch() calls
- [ ] Test: Simulate slow client, verify timeout

### ✅ Task 9: Database Retry Logic (30 min)
- [ ] Implement exponential backoff in pool connection
- [ ] Add max retry count
- [ ] Log connection failures
- [ ] Test: Stop database, verify retries, verify eventual success

---

## Priority 3: Observability (NICE TO HAVE)

### ✅ Task 10: Structured Logging (45 min)
- [ ] Add correlation ID middleware
- [ ] Log user ID and tenant ID on every request
- [ ] Add request duration logging
- [ ] Format logs as JSON in production
- [ ] Test: Verify logs parseable

### ✅ Task 11: Basic Metrics (60 min)
```bash
npm install prom-client
```
- [ ] Add `/metrics` endpoint
- [ ] Track: HTTP request count, duration, status codes
- [ ] Track: Live session count, active streams
- [ ] Track: Database connection pool usage
- [ ] Test: Verify metrics endpoint returns valid Prometheus format

### ✅ Task 12: Error Alerting (30 min)
- [ ] Choose alerting method (email, Slack webhook, PagerDuty)
- [ ] Alert on: 5xx error rate > 1%
- [ ] Alert on: Database connection failures
- [ ] Alert on: Live session creation failures
- [ ] Test: Trigger alert, verify received

---

## Priority 4: Deployment Prep (CRITICAL)

### ✅ Task 13: Environment Configuration (20 min)
- [ ] Create `deploy/.env.production.template`
- [ ] Document all required environment variables
- [ ] Add validation that fails startup if missing critical vars
- [ ] Remove all development defaults from production config

### ✅ Task 14: Database Migration Process (45 min)
- [ ] Install migration tool (node-pg-migrate or custom)
- [ ] Create migration tracking table
- [ ] Test migration on fresh database
- [ ] Document rollback procedure
- [ ] Create migration deployment script

### ✅ Task 15: Backup & Recovery (60 min)
- [ ] Create backup script (pg_dump)
- [ ] Schedule daily backup cron job
- [ ] Test restore from backup
- [ ] Document restore procedure
- [ ] Set up backup monitoring/alerting

### ✅ Task 16: Resource Limits (15 min)
- [ ] Add memory/CPU limits to compose.yaml
- [ ] Test services stay within limits under load
- [ ] Adjust limits if needed

---

## Priority 5: Testing (CRITICAL)

### ✅ Task 17: Security Testing (60 min)
- [ ] Test authentication bypass attempts
- [ ] Test authorization with deny rules
- [ ] Test SQL injection on all inputs
- [ ] Test XSS in camera names, branch names
- [ ] Verify secrets not logged or exposed in errors

### ✅ Task 18: Load Testing (90 min)
```bash
npm install -g autocannon
```
- [ ] Test: 100 concurrent users listing branches
- [ ] Test: 50 concurrent live session creations
- [ ] Test: 100 MediaMTX auth requests/sec
- [ ] Test: Database handles 500 branches, 4000 cameras
- [ ] Identify bottlenecks, optimize or document limits

### ✅ Task 19: Failure Testing (45 min)
- [ ] Test: Database crash and recovery
- [ ] Test: MediaMTX unavailable
- [ ] Test: Control plane unavailable (media gateway)
- [ ] Test: Network partition between services
- [ ] Test: Disk full scenario

### ✅ Task 20: End-to-End User Flow (30 min)
- [ ] Login → View branches → View cameras → Start live session
- [ ] Verify video plays in dashboard
- [ ] Verify session expires after 60 seconds
- [ ] Verify audit log entries created
- [ ] Test on different browsers

---

## Priority 6: Documentation (REQUIRED)

### ✅ Task 21: Deployment Runbook (45 min)
Create `docs/operations/DEPLOYMENT.md`:
- [ ] Pre-deployment checklist
- [ ] Deployment steps
- [ ] Post-deployment verification
- [ ] Rollback procedure

### ✅ Task 22: Incident Response Plan (30 min)
Create `docs/operations/INCIDENT_RESPONSE.md`:
- [ ] On-call contact information
- [ ] Escalation path
- [ ] Common issues and fixes
- [ ] Emergency procedures

### ✅ Task 23: Monitoring Dashboard (30 min)
- [ ] Set up Grafana or similar
- [ ] Add dashboard for: request rate, error rate, latency
- [ ] Add dashboard for: live sessions, active cameras
- [ ] Add dashboard for: database connections, query time

---

## Final Pre-Launch Checklist

### Security
- [ ] Strong secrets deployed
- [ ] Rate limiting enabled
- [ ] CORS properly configured
- [ ] Database TLS enabled
- [ ] No secrets in logs or error messages
- [ ] Authentication working (even if just token validation)

### Stability
- [ ] Error handlers in place
- [ ] Graceful shutdown working
- [ ] Timeouts configured
- [ ] Health checks accurate
- [ ] Database retry logic working

### Observability
- [ ] Structured logging enabled
- [ ] Metrics endpoint exposed
- [ ] Alerting configured
- [ ] Logs being collected centrally

### Deployment
- [ ] Environment variables documented
- [ ] Migration process tested
- [ ] Backup running and tested
- [ ] Resource limits set
- [ ] Deployment runbook complete

### Testing
- [ ] Security tests passed
- [ ] Load tests passed (or limits documented)
- [ ] Failure scenarios tested
- [ ] End-to-end flow verified

### Documentation
- [ ] Deployment runbook written
- [ ] Incident response plan written
- [ ] Architecture documentation updated
- [ ] API documentation available

---

## Time Estimate Summary

| Priority | Total Time | Parallel Work Possible |
|----------|------------|------------------------|
| Priority 1 (Security) | 1.5 hours | No - sequential |
| Priority 2 (Stability) | 1.5 hours | Partially |
| Priority 3 (Observability) | 2.5 hours | Yes |
| Priority 4 (Deployment) | 2.5 hours | Partially |
| Priority 5 (Testing) | 4 hours | Partially |
| Priority 6 (Documentation) | 2 hours | Yes |
| **TOTAL** | **14 hours** | **~8-10 hours with 2-3 people** |

---

## Recommended Team Split (3 people, 8 hours each)

### Person A: Security & Stability Lead
- Tasks 1-5 (Security)
- Tasks 6-9 (Stability)
- Task 17 (Security testing)
- **Total: ~5 hours**

### Person B: Deployment & Testing Lead
- Tasks 13-16 (Deployment prep)
- Tasks 18-19 (Load/Failure testing)
- Task 20 (E2E testing)
- **Total: ~5 hours**

### Person C: Observability & Docs Lead
- Tasks 10-12 (Observability)
- Tasks 21-23 (Documentation)
- Set up monitoring dashboard
- **Total: ~5 hours**

### Final 3 hours (all team members):
- Integration testing
- Fix issues discovered
- Final verification
- Deploy to staging/production

---

## GO / NO-GO Decision Criteria

### ✅ GO if:
- All Priority 1 tasks complete
- All Priority 2 tasks complete
- At least 50% of Priority 3 complete
- Load testing shows acceptable performance
- Deployment plan documented
- 24/7 on-call coverage arranged

### ❌ NO-GO if:
- Any Priority 1 task incomplete
- Load testing shows critical performance issues
- No backup/recovery tested
- No monitoring/alerting
- No incident response plan

---

## Post-Launch Monitoring (First 48 Hours)

### Hour 0-4: Active Monitoring
- [ ] Watch error rates every 15 minutes
- [ ] Check live session success rate
- [ ] Monitor database connections
- [ ] Verify backups running

### Hour 4-24: Regular Monitoring
- [ ] Check metrics every 2 hours
- [ ] Review logs for errors/warnings
- [ ] Monitor user feedback
- [ ] Track system resource usage

### Hour 24-48: Stabilization
- [ ] Analyze performance trends
- [ ] Optimize slow queries
- [ ] Tune resource limits
- [ ] Update documentation based on learnings

### Week 1: Refinement
- [ ] Complete remaining Priority 3 tasks
- [ ] Address issues from first 48 hours
- [ ] Update runbooks
- [ ] Plan next iteration improvements
