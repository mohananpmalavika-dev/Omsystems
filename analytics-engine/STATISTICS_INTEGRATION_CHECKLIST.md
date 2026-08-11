# Analytics Statistics Integration Checklist

Use this checklist to deploy and verify the analytics statistics endpoint.

## Pre-Deployment

### Database Preparation
- [ ] Control plane database is accessible from analytics-engine
- [ ] `analytics_events` table exists (from migration `012_video_analytics.sql`)
- [ ] Database user has SELECT permissions on:
  - [ ] `analytics_events`
  - [ ] `analytics_alerts`
  - [ ] `cameras`
- [ ] Run performance indexes migration:
  ```bash
  psql $DATABASE_URL -f database/migrations/018_analytics_statistics_indexes.sql
  ```
- [ ] Verify indexes were created:
  ```sql
  SELECT indexname FROM pg_indexes WHERE tablename = 'analytics_events';
  ```

### Environment Configuration
- [ ] Copy `.env.statistics.example` to `.env`:
  ```bash
  cd analytics-engine
  cp .env.statistics.example .env
  ```
- [ ] Configure `DATABASE_URL` in `.env`:
  ```bash
  DATABASE_URL=postgresql://user:password@host:5432/sentinel
  ```
- [ ] Adjust connection pool size if needed:
  ```bash
  STATISTICS_DB_POOL_MAX=5  # Default: 5
  ```
- [ ] Configure query timeouts:
  ```bash
  DB_STATEMENT_TIMEOUT_MS=15000  # Default: 15s
  ```

### Dependencies
- [ ] Install Node.js dependencies (if not already):
  ```bash
  npm install
  ```
- [ ] Verify PostgreSQL driver is installed:
  ```bash
  npm list pg
  ```

## Deployment

### Start Analytics Engine
- [ ] Start the service:
  ```bash
  cd analytics-engine
  npm start
  ```
- [ ] Verify successful initialization in logs:
  ```
  [Statistics] Successfully initialized with control plane database
  ```
- [ ] If you see errors:
  - Check `DATABASE_URL` is correct
  - Verify database is accessible
  - Check database user permissions
  - Review `analytics-engine/README.statistics.md` troubleshooting section

### Smoke Tests
- [ ] Test endpoint responds:
  ```bash
  curl "http://localhost:3001/health"
  ```
- [ ] Test statistics endpoint with valid tenant:
  ```bash
  curl "http://localhost:3001/v1/analytics/statistics?tenantId=<your-tenant-id>"
  ```
- [ ] Verify response is not the old stub message
- [ ] Response should include:
  - [ ] `totalDetections` (number, not message)
  - [ ] `averageConfidence` (number or null)
  - [ ] `alerts` (number)
  - [ ] `byType` (object with detection types)
  - [ ] `timeline` (array)
  - [ ] `meta` (object with generatedAt, source, cached)

### Automated Test Script
- [ ] Run comprehensive test script:
  ```bash
  chmod +x analytics-engine/scripts/test-statistics-endpoint.sh
  ./analytics-engine/scripts/test-statistics-endpoint.sh <tenant-id>
  ```
- [ ] All tests should pass (green checkmarks)
- [ ] Address any failures before proceeding

## Verification

### Functional Testing
- [ ] **Test 1**: Default query (last 24 hours)
  ```bash
  curl "http://localhost:3001/v1/analytics/statistics?tenantId=<uuid>"
  ```
  Expected: Returns statistics for last 24 hours

- [ ] **Test 2**: Custom time range
  ```bash
  curl "http://localhost:3001/v1/analytics/statistics?tenantId=<uuid>&from=2026-08-10T00:00:00Z&to=2026-08-11T00:00:00Z"
  ```
  Expected: Returns statistics for specified range

- [ ] **Test 3**: Hourly buckets
  ```bash
  curl "http://localhost:3001/v1/analytics/statistics?tenantId=<uuid>&bucket=hour"
  ```
  Expected: Timeline with hourly aggregation

- [ ] **Test 4**: Filter by detector type
  ```bash
  curl "http://localhost:3001/v1/analytics/statistics?tenantId=<uuid>&detectorType=person&detectorType=vehicle"
  ```
  Expected: Only person and vehicle detections

- [ ] **Test 5**: Camera breakdown
  ```bash
  curl "http://localhost:3001/v1/analytics/statistics?tenantId=<uuid>&includeCameraBreakdown=true"
  ```
  Expected: Includes `topCameras` array

- [ ] **Test 6**: Branch breakdown
  ```bash
  curl "http://localhost:3001/v1/analytics/statistics?tenantId=<uuid>&includeBranchBreakdown=true"
  ```
  Expected: Includes `topBranches` array

### Error Handling
- [ ] **Invalid tenant**: Returns 400
  ```bash
  curl "http://localhost:3001/v1/analytics/statistics"
  ```
  
- [ ] **Invalid detector type**: Returns 400
  ```bash
  curl "http://localhost:3001/v1/analytics/statistics?tenantId=<uuid>&detectorType=invalid"
  ```
  
- [ ] **Invalid time range**: Returns 400
  ```bash
  curl "http://localhost:3001/v1/analytics/statistics?tenantId=<uuid>&from=2026-08-11T00:00:00Z&to=2026-08-10T00:00:00Z"
  ```

### Tenant Isolation
- [ ] Query with tenant A returns only tenant A's data
- [ ] Query with tenant B returns only tenant B's data
- [ ] No cross-tenant data leaks
- [ ] Verify in database:
  ```sql
  SELECT tenant_id, COUNT(*) FROM analytics_events GROUP BY tenant_id;
  ```

### Performance
- [ ] Response time < 500ms for 24-hour query
- [ ] Response time < 1s for 7-day query
- [ ] Response time < 5s for 30-day query
- [ ] Check slow query log if needed:
  ```sql
  SELECT query, mean_exec_time, calls
  FROM pg_stat_statements
  WHERE query LIKE '%analytics_events%'
  ORDER BY mean_exec_time DESC
  LIMIT 10;
  ```

## Frontend Integration

### Dashboard Development
- [ ] Share API documentation with frontend team:
  - [ ] `analytics-engine/STATISTICS_API.md`
  - [ ] `analytics-engine/STATISTICS_DASHBOARD_INTEGRATION.md`
- [ ] Provide example tenant ID for testing
- [ ] Set up CORS if needed:
  ```bash
  CORS_ORIGINS=https://dashboard.example.com
  ```

### Integration Points
- [ ] Real-time dashboard overview (last 24h, auto-refresh)
- [ ] Custom date range selector
- [ ] Detection type filter
- [ ] Camera performance comparison
- [ ] Timeline charts
- [ ] Type breakdown pie chart
- [ ] Severity heatmap

### Example Integration
- [ ] Test with provided React hook example
- [ ] Verify Chart.js/Recharts integration
- [ ] Handle loading states
- [ ] Handle error states
- [ ] Handle empty states (no detections)

## Production Hardening

### Security
- [ ] **CRITICAL**: Replace query-parameter `tenantId` with auth middleware
  - Current: `?tenantId=<uuid>` (insecure)
  - Target: Extract from authenticated user session
- [ ] Implement branch/camera authorization checks
- [ ] Enable SSL/TLS for database connections
- [ ] Configure rate limiting:
  ```bash
  RATE_LIMIT_WINDOW_MS=60000
  RATE_LIMIT_MAX_REQUESTS=100
  ```
- [ ] Validate CORS origins are restricted

### Monitoring
- [ ] Add Prometheus metrics for query latency
- [ ] Set up alerts for:
  - [ ] Slow queries (> 1s)
  - [ ] High error rate (> 5%)
  - [ ] Connection pool exhaustion
- [ ] Configure logging:
  ```bash
  LOG_LEVEL=info
  ```
- [ ] Set up dashboard for statistics endpoint metrics

### Performance Optimization
- [ ] Configure read replica if available:
  ```bash
  STATISTICS_DATABASE_URL=postgresql://user:pass@read-replica:5432/sentinel
  ```
- [ ] Increase pool size for high traffic:
  ```bash
  STATISTICS_DB_POOL_MAX=20
  ```
- [ ] Plan for Redis caching (future)
- [ ] Plan for rollup tables if > 10M events

### Disaster Recovery
- [ ] Database backup strategy in place
- [ ] Test statistics endpoint recovery after database failure
- [ ] Graceful degradation when database unavailable
- [ ] Document rollback procedure

## Post-Deployment

### Monitoring Checklist
- [ ] Query latency within acceptable range
- [ ] No errors in application logs
- [ ] Database connection pool healthy
- [ ] No slow query alerts
- [ ] Response times stable under load

### Documentation
- [ ] Update internal wiki with endpoint details
- [ ] Share integration guide with team
- [ ] Document any custom configurations
- [ ] Update runbooks for operations team

### Training
- [ ] Demo endpoint to dashboard developers
- [ ] Walkthrough query parameters and filtering
- [ ] Explain error handling
- [ ] Show example integrations

### Feedback Loop
- [ ] Collect feedback from frontend team
- [ ] Track common issues and questions
- [ ] Document FAQs
- [ ] Plan enhancements based on usage

## Future Enhancements

### Short Term (Next Sprint)
- [ ] Implement authentication middleware integration
- [ ] Add Prometheus metrics
- [ ] Set up Redis caching layer
- [ ] Implement rate limiting

### Medium Term (1-2 Months)
- [ ] Create hourly rollup tables for performance
- [ ] Add CSV/Excel export functionality
- [ ] Implement scheduled reports
- [ ] Add WebSocket for real-time updates

### Long Term (3+ Months)
- [ ] Migrate to TimescaleDB
- [ ] Implement continuous aggregates
- [ ] Add predictive analytics
- [ ] Support custom time zones

## Rollback Plan

If issues occur:

1. **Immediate rollback** (if critical):
   ```bash
   # Stop analytics-engine
   npm stop
   
   # Remove DATABASE_URL from .env
   # Endpoint will return 503 but won't affect detection processing
   ```

2. **Database rollback** (if indexes cause issues):
   ```sql
   -- Drop indexes created by migration 018
   DROP INDEX IF EXISTS analytics_events_tenant_time_idx;
   DROP INDEX IF EXISTS analytics_events_tenant_detector_time_idx;
   DROP INDEX IF EXISTS analytics_events_tenant_alert_time_idx;
   DROP INDEX IF EXISTS analytics_events_tenant_status_type_time_idx;
   DROP INDEX IF EXISTS cameras_branch_id_idx;
   DROP INDEX IF EXISTS analytics_alerts_event_severity_idx;
   ```

3. **Code rollback**:
   ```bash
   git revert <commit-hash>
   npm start
   ```

## Success Criteria

✅ All checklist items complete  
✅ Automated tests pass  
✅ Response times acceptable  
✅ No tenant isolation issues  
✅ Frontend successfully integrated  
✅ Monitoring and alerts configured  
✅ Documentation complete  
✅ Team trained  

## Support Resources

- **API Documentation**: `analytics-engine/STATISTICS_API.md`
- **Implementation Guide**: `analytics-engine/STATISTICS_IMPLEMENTATION_COMPLETE.md`
- **Frontend Guide**: `analytics-engine/STATISTICS_DASHBOARD_INTEGRATION.md`
- **Quick Start**: `analytics-engine/README.statistics.md`
- **Troubleshooting**: See README.statistics.md troubleshooting section

## Contacts

- **Backend Team**: [Your team contact]
- **Database Team**: [DBA contact]
- **Frontend Team**: [Dashboard team contact]
- **DevOps**: [Infrastructure team contact]

---

**Checklist Version**: 1.0  
**Last Updated**: August 11, 2026  
**Maintained By**: Backend Engineering Team
