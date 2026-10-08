# Banking Analytics - Production Deployment Checklist

## Pre-Deployment Checklist

### Infrastructure

- [ ] **PostgreSQL Database**
  - [ ] Database server provisioned
  - [ ] Connection string configured (`DATABASE_URL`)
  - [ ] SSL/TLS enabled for connections
  - [ ] Backup strategy implemented
  - [ ] Point-in-time recovery configured
  - [ ] Monitoring and alerts set up

- [ ] **Analytics Engine**
  - [ ] Docker image built and tested
  - [ ] Environment variables configured
  - [ ] Resource limits defined (CPU, memory)
  - [ ] Horizontal scaling configured (if needed)
  - [ ] Health check endpoints verified

- [ ] **Main API Server**
  - [ ] Banking routes registered
  - [ ] API authentication configured
  - [ ] Rate limiting configured
  - [ ] CORS policies set

- [ ] **Evidence Storage**
  - [ ] S3/Object storage configured
  - [ ] Retention policies defined
  - [ ] Access controls implemented
  - [ ] Backup and archival strategy

### Configuration

- [ ] **Environment Variables**
  ```bash
  ENABLE_BANKING_ANALYTICS=true
  DATABASE_URL=postgresql://...
  ANALYTICS_SOURCE_KEY=<secure-key>
  ENABLE_GPU_ACCELERATION=true (if available)
  MODELS_DIR=/path/to/models
  ```

- [ ] **Database Schema**
  - [ ] Tables created (sessions, monitors, visits, personnel)
  - [ ] Indexes created for query performance
  - [ ] Partitioning configured (if needed)
  - [ ] Constraints and foreign keys verified

- [ ] **Detector Configuration**
  - [ ] Vehicle detector active
  - [ ] ANPR detector operational
  - [ ] Person detector running
  - [ ] Face recognition enabled
  - [ ] Zone definitions configured
  - [ ] Camera mappings complete

### Security

- [ ] **API Security**
  - [ ] Strong API keys generated
  - [ ] HTTPS/TLS enforced
  - [ ] API key rotation policy defined
  - [ ] Rate limiting configured
  - [ ] IP whitelisting (if applicable)

- [ ] **Data Privacy**
  - [ ] Face recognition consent framework
  - [ ] Data retention policies
  - [ ] GDPR/privacy compliance reviewed
  - [ ] Access control policies defined
  - [ ] Audit logging enabled

- [ ] **Credentials**
  - [ ] Database credentials secured
  - [ ] API keys stored in secrets manager
  - [ ] No hardcoded secrets in code
  - [ ] Environment variables protected

### Monitoring & Observability

- [ ] **Logging**
  - [ ] Centralized log aggregation
  - [ ] Log retention policy
  - [ ] Sensitive data redaction
  - [ ] Log analysis tools configured

- [ ] **Metrics**
  - [ ] Prometheus/metrics endpoint enabled
  - [ ] Key performance indicators defined
  - [ ] Grafana dashboards created
  - [ ] Resource usage tracking

- [ ] **Alerting**
  - [ ] Critical violation alerts configured
  - [ ] System health alerts set up
  - [ ] On-call rotation defined
  - [ ] Escalation policies documented

- [ ] **Tracing**
  - [ ] Distributed tracing enabled
  - [ ] Request correlation IDs
  - [ ] Performance profiling tools

### Testing

- [ ] **Unit Tests**
  - [ ] All rule evaluation tests passing
  - [ ] Event normalization tests passing
  - [ ] State machine tests passing

- [ ] **Integration Tests**
  - [ ] Complete workflow scenarios tested
  - [ ] API endpoint tests passing
  - [ ] Evidence generation tested
  - [ ] Database operations verified

- [ ] **Load Testing**
  - [ ] Concurrent session handling tested
  - [ ] Event throughput validated
  - [ ] Database performance verified
  - [ ] Resource usage under load measured

- [ ] **Mock Event Testing**
  - [ ] All 6 scenarios tested
  - [ ] Violation detection verified
  - [ ] Evidence collection confirmed
  - [ ] Dashboard updates validated

## Deployment Steps

### 1. Database Setup

```bash
# Create database
createdb sentinel_banking

# Run migrations
npm run migrate:up

# Verify schema
psql -d sentinel_banking -c "\dt"
```

### 2. Deploy Analytics Engine

```bash
# Build image
docker build -t sentinel-analytics-engine:latest ./analytics-engine

# Deploy with environment variables
docker run -d \
  --name analytics-engine \
  -e ENABLE_BANKING_ANALYTICS=true \
  -e DATABASE_URL=postgresql://... \
  -e ANALYTICS_SOURCE_KEY=<key> \
  -p 3002:3002 \
  sentinel-analytics-engine:latest

# Verify deployment
curl http://localhost:3002/health
```

### 3. Deploy Main API

```bash
# Build image
docker build -t sentinel-api:latest .

# Deploy
docker run -d \
  --name sentinel-api \
  -e DATABASE_URL=postgresql://... \
  -p 3000:3000 \
  --link analytics-engine:analytics \
  sentinel-api:latest

# Verify banking routes
curl http://localhost:3000/v1/banking/status \
  -H "x-analytics-source-key: <key>"
```

### 4. Configure Monitors

```bash
# Option A: Use demo setup script
cd analytics-engine
npm run setup-banking-demo

# Option B: Manual configuration via API
curl -X POST http://localhost:3000/v1/banking/monitors \
  -H "Content-Type: application/json" \
  -H "x-analytics-source-key: <key>" \
  -d @monitor-config.json
```

### 5. Add Personnel

```bash
# Import personnel from CSV or API
curl -X POST http://localhost:3000/v1/banking/personnel \
  -H "Content-Type: application/json" \
  -H "x-analytics-source-key: <key>" \
  -d @personnel-list.json
```

### 6. Verify End-to-End

```bash
# 1. Generate mock events
npm run test:banking:mock

# 2. Check session creation
curl http://localhost:3000/v1/banking/sessions \
  -H "x-analytics-source-key: <key>"

# 3. Verify dashboard access
open http://localhost:3000/banking-analytics

# 4. Test evidence generation
curl -X POST http://localhost:3000/v1/banking/evidence/{sessionId}/package \
  -H "x-analytics-source-key: <key>"
```

## Post-Deployment Checklist

### Immediate (Day 1)

- [ ] **Verify System Health**
  - [ ] All services running
  - [ ] Detectors publishing events
  - [ ] Database connections stable
  - [ ] No error logs

- [ ] **Monitor First Sessions**
  - [ ] Watch first real session
  - [ ] Verify state transitions
  - [ ] Check rule evaluations
  - [ ] Confirm evidence collection

- [ ] **Validate Alerts**
  - [ ] Test critical violation alert
  - [ ] Verify notification delivery
  - [ ] Check escalation flow
  - [ ] Confirm acknowledgment workflow

### Week 1

- [ ] **Operations Review**
  - [ ] Review all sessions
  - [ ] Analyze violation patterns
  - [ ] Check false positive rate
  - [ ] Adjust thresholds if needed

- [ ] **Performance Monitoring**
  - [ ] Check response times
  - [ ] Monitor resource usage
  - [ ] Review database performance
  - [ ] Analyze event throughput

- [ ] **User Training**
  - [ ] Train operators on dashboard
  - [ ] Document common scenarios
  - [ ] Create SOP for violations
  - [ ] Establish escalation procedures

### Month 1

- [ ] **System Optimization**
  - [ ] Fine-tune rule parameters
  - [ ] Optimize database queries
  - [ ] Adjust alert thresholds
  - [ ] Review evidence retention

- [ ] **Compliance Audit**
  - [ ] Verify data privacy compliance
  - [ ] Review access logs
  - [ ] Check retention policies
  - [ ] Validate audit trail

- [ ] **Expand Coverage**
  - [ ] Add monitors for all branches
  - [ ] Register all authorized personnel
  - [ ] Schedule regular visits
  - [ ] Extend to ATM/vault scenarios

## Rollback Plan

### If Issues Arise

```bash
# 1. Disable banking analytics
export ENABLE_BANKING_ANALYTICS=false
docker restart analytics-engine
docker restart sentinel-api

# 2. Roll back database changes (if needed)
npm run migrate:down

# 3. Restore previous version
docker pull sentinel-analytics-engine:previous
docker pull sentinel-api:previous
docker-compose up -d

# 4. Verify rollback
curl http://localhost:3002/health
```

### Troubleshooting

**Issue: No events processing**
```bash
# Check integration logs
docker logs analytics-engine | grep "Banking analytics"

# Verify environment variable
docker exec analytics-engine env | grep ENABLE_BANKING_ANALYTICS

# Check detector health
curl http://localhost:3002/health | jq '.pipeline.detectors'
```

**Issue: High latency**
```bash
# Check database connections
docker stats analytics-engine

# Review slow queries
psql -d sentinel_banking -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"

# Check event queue depth
curl http://localhost:3002/v1/banking/status | jq '.queueDepth'
```

**Issue: False positives**
```bash
# Review rule configurations
curl http://localhost:3000/v1/banking/monitors/{id} | jq '.rules'

# Adjust thresholds
curl -X PATCH http://localhost:3000/v1/banking/monitors/{id} \
  -H "Content-Type: application/json" \
  -d '{"policies": {"minimumPersonnel": 2}}'
```

## Production Monitoring

### Key Metrics to Track

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| **Event Processing Latency** | < 2s | > 5s |
| **Rule Evaluation Time** | < 500ms | > 1s |
| **Database Query Time** | < 100ms | > 500ms |
| **Active Sessions** | - | > 100 |
| **Event Queue Depth** | < 100 | > 1000 |
| **API Response Time** | < 200ms | > 1s |
| **False Positive Rate** | < 5% | > 10% |
| **Evidence Generation Time** | < 5s | > 10s |

### Health Check Endpoints

```bash
# Overall system health
GET /health

# Banking analytics status
GET /v1/banking/status

# Detector health
GET /v1/detectors/health

# Database health
GET /v1/banking/health/database
```

### Log Queries

```bash
# Recent violations
docker logs analytics-engine | grep "VIOLATION_DETECTED" | tail -20

# Failed rule evaluations
docker logs analytics-engine | grep "RULE_EVALUATION_FAILED" | tail -20

# Session errors
docker logs analytics-engine | grep "SESSION_ERROR" | tail -20
```

## Maintenance Schedule

### Daily
- [ ] Check active sessions
- [ ] Review violation alerts
- [ ] Monitor resource usage
- [ ] Verify backup completion

### Weekly
- [ ] Review false positives
- [ ] Analyze violation trends
- [ ] Update personnel authorizations
- [ ] Check evidence storage

### Monthly
- [ ] Compliance audit
- [ ] Performance optimization
- [ ] Rule effectiveness review
- [ ] Database maintenance

### Quarterly
- [ ] System architecture review
- [ ] Security audit
- [ ] Disaster recovery test
- [ ] Capacity planning

## Contact Information

### Support Contacts

**Technical Issues**
- Email: support@example.com
- Slack: #banking-analytics
- On-Call: +1-xxx-xxx-xxxx

**Security Issues**
- Email: security@example.com
- Emergency: +1-xxx-xxx-xxxx

**Operations**
- Email: ops@example.com
- Slack: #operations

## Documentation

- **Architecture**: `analytics-engine/src/banking/README.md`
- **API Reference**: `analytics-engine/src/routes/banking-analytics-api.ts`
- **Quick Reference**: `analytics-engine/src/banking/QUICK_REFERENCE.md`
- **Troubleshooting**: `analytics-engine/src/banking/ACTIVATION_GUIDE.md#troubleshooting`

---

## Sign-Off

### Deployment Team

| Role | Name | Signature | Date |
|------|------|-----------|------|
| **Tech Lead** | | | |
| **DevOps** | | | |
| **Security** | | | |
| **Operations** | | | |

### Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| **Product Manager** | | | |
| **Engineering Manager** | | | |
| **Security Officer** | | | |

---

**Deployment Date**: _______________  
**Version**: 1.0.0  
**Environment**: Production  
**Status**: Ready for Deployment ✅
