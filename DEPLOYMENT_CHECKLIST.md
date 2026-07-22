# Compliance System - Deployment Checklist ✅

## Pre-Deployment Checklist

### Environment Setup
- [ ] PostgreSQL 12+ installed and running
- [ ] Node.js 18+ installed
- [ ] npm or yarn package manager available
- [ ] Git repository accessible
- [ ] Environment variables configured

### Database Preparation
- [ ] Database `sentinel` created
- [ ] User `postgres` has appropriate permissions
- [ ] Connection string verified: `postgresql://localhost:5432/sentinel`
- [ ] Previous migrations applied (if any)

### Code Repository
- [ ] Latest code pulled from repository
- [ ] All dependencies installed (`npm install` in root)
- [ ] All dependencies installed (`npm install` in dashboard)
- [ ] No build errors present

---

## Deployment Steps

### Step 1: Database Migrations ✅

**Objective:** Apply compliance schema to database

```powershell
# Navigate to project root
cd c:\Omsystems

# Run migration script
.\scripts\apply-migrations.ps1

# OR manually apply
psql -h localhost -U postgres -d sentinel -f "database\migrations\013_analytics_phase2.sql"
psql -h localhost -U postgres -d sentinel -f "database\migrations\022_compliance_enhancements.sql"
```

**Verification:**
```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'compliance%';

-- Expected tables:
-- compliance_requirements
-- compliance_controls
-- compliance_evidence
-- compliance_tests
-- compliance_findings
-- compliance_remediation_plans
-- compliance_remediation_actions
-- compliance_risks
-- compliance_audit_log

-- Check view exists
SELECT * FROM compliance_dashboard_view LIMIT 1;
```

**Checklist:**
- [ ] Migration script executed successfully
- [ ] 9 compliance tables created
- [ ] 1 dashboard view created
- [ ] No error messages in output
- [ ] Tables verified in database

---

### Step 2: Backend API Server ✅

**Objective:** Start the backend API service

```bash
# In project root
npm run dev

# OR for production
npm run build
npm start
```

**Verification:**
```bash
# Test health endpoint
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","timestamp":"..."}

# Test compliance endpoints
curl http://localhost:3000/v1/compliance/requirements \
  -H "x-user-id: test-user"

# Expected response:
# {"data":[],"pagination":{...}}
```

**Checklist:**
- [ ] Server starts without errors
- [ ] Port 3000 is accessible
- [ ] Health endpoint responds
- [ ] Compliance routes registered
- [ ] No database connection errors
- [ ] Server logs show no errors

---

### Step 3: Frontend Dashboard ✅

**Objective:** Start the Next.js frontend

```bash
# In dashboard directory
cd dashboard
npm run dev

# OR for production
npm run build
npm start
```

**Verification:**
- Open browser to `http://localhost:3001`
- Verify pages load without errors
- Check browser console for errors

**Checklist:**
- [ ] Dashboard starts without errors
- [ ] Port 3001 is accessible
- [ ] Home page loads
- [ ] Compliance pages accessible
- [ ] No console errors
- [ ] API calls successful

---

### Step 4: Functionality Testing ✅

#### Test 1: Requirements Page
```bash
# Open in browser
http://localhost:3001/compliance/requirements
```

**Verify:**
- [ ] Page loads with purple gradient background
- [ ] Stats cards display (Total, Active, Draft, Mandatory)
- [ ] Search bar present
- [ ] Filter dropdowns work
- [ ] Empty state shows when no data
- [ ] "Add Requirement" button visible

#### Test 2: Controls Page
```bash
# Open in browser
http://localhost:3001/compliance/controls
```

**Verify:**
- [ ] Page loads with blue gradient background
- [ ] Stats cards display (Total, Implemented, In Progress, Not Implemented)
- [ ] Filter by type works (Preventive, Detective, Corrective, Deterrent)
- [ ] Filter by status works
- [ ] Card layout displays properly

#### Test 3: Findings Page
```bash
# Open in browser
http://localhost:3001/compliance/findings
```

**Verify:**
- [ ] Page loads with red gradient background
- [ ] Stats cards by severity (Critical, High, Medium, etc.)
- [ ] Filter by severity works
- [ ] Filter by status works
- [ ] Risk score displays
- [ ] Card layout with color coding

#### Test 4: Evidence Page
```bash
# Open in browser
http://localhost:3001/compliance/evidence
```

**Verify:**
- [ ] Page loads with green gradient background
- [ ] Stats cards (Total, Verified, Pending, Expired)
- [ ] Filter by evidence type works
- [ ] Verification status displays
- [ ] Download buttons present

#### Test 5: Risks Page
```bash
# Open in browser
http://localhost:3001/compliance/risks
```

**Verify:**
- [ ] Page loads with orange gradient background
- [ ] Stats cards (Critical, High, Medium, Treated, Avg Reduction)
- [ ] Filter by likelihood works
- [ ] Filter by impact works
- [ ] Risk score visualization with progress bars
- [ ] Risk level color coding

#### Test 6: Dashboard Page
```bash
# Open in browser
http://localhost:3001/compliance/dashboard
```

**Verify:**
- [ ] Page loads
- [ ] Framework cards display
- [ ] Stats and metrics show
- [ ] No API errors

#### Test 7: Overview Page (Navigation Hub)
```bash
# Open in browser
http://localhost:3001/compliance/overview
```

**Verify:**
- [ ] Page loads
- [ ] All 6 navigation cards present
- [ ] Links work to each sub-page
- [ ] Quick stats display
- [ ] Features section visible

---

### Step 5: API Endpoint Testing ✅

#### Create Sample Data

**Create Framework:**
```bash
curl -X POST http://localhost:3000/v1/compliance/frameworks \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-admin" \
  -d '{
    "name": "ISO 27001:2022",
    "description": "Information Security Management",
    "version": "2022",
    "effectiveDate": "2026-01-01"
  }'
```

**Create Requirement:**
```bash
curl -X POST http://localhost:3000/v1/compliance/requirements \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-admin" \
  -d '{
    "frameworkId": "{{framework-id}}",
    "requirementCode": "A.9.1.1",
    "title": "Access Control Policy",
    "description": "Establish access control policy",
    "category": "Access Control",
    "isMandatory": true
  }'
```

**Create Control:**
```bash
curl -X POST http://localhost:3000/v1/compliance/controls \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-admin" \
  -d '{
    "requirementId": "{{requirement-id}}",
    "controlCode": "AC-001",
    "title": "Password Policy",
    "description": "Enforce strong passwords",
    "controlType": "preventive",
    "implementationStatus": "implemented",
    "testFrequency": "quarterly"
  }'
```

**Checklist:**
- [ ] Framework created successfully
- [ ] Requirement created and linked
- [ ] Control created and linked
- [ ] Data visible in frontend
- [ ] Audit log entries created

---

### Step 6: Integration Testing ✅

#### End-to-End Workflow Test

**Scenario:** Implement a new compliance requirement

1. **Create Requirement**
   - [ ] Open Requirements page
   - [ ] Click "Add Requirement"
   - [ ] Fill form and submit
   - [ ] Verify appears in list

2. **Create Control**
   - [ ] Open Controls page
   - [ ] Create control for requirement
   - [ ] Verify control appears
   - [ ] Check control linked to requirement

3. **Upload Evidence**
   - [ ] Open Evidence page
   - [ ] Upload evidence for control
   - [ ] Verify evidence appears
   - [ ] Check verification status

4. **Create Finding (if applicable)**
   - [ ] Open Findings page
   - [ ] Create finding for control
   - [ ] Verify appears with correct severity
   - [ ] Check risk score calculated

5. **Create Risk**
   - [ ] Open Risks page
   - [ ] Create risk for requirement
   - [ ] Perform assessment
   - [ ] Verify inherent/residual scores

6. **View Dashboard**
   - [ ] Open Dashboard
   - [ ] Verify metrics updated
   - [ ] Check framework coverage
   - [ ] Confirm all data visible

---

## Performance Checklist

### Database Performance
- [ ] Indexes created on foreign keys
- [ ] Query execution time < 100ms for lists
- [ ] No N+1 query issues
- [ ] Connection pooling configured

### API Performance
- [ ] Response time < 200ms for GET requests
- [ ] Response time < 500ms for POST requests
- [ ] Pagination implemented
- [ ] Rate limiting configured (if needed)

### Frontend Performance
- [ ] Page load time < 2 seconds
- [ ] No memory leaks
- [ ] Images optimized
- [ ] Lazy loading implemented where appropriate

---

## Security Checklist

### Authentication & Authorization
- [ ] User authentication required (x-user-id header)
- [ ] Permission checks in place
- [ ] SQL injection protection (parameterized queries)
- [ ] Input validation on all endpoints

### Data Protection
- [ ] Audit logging enabled
- [ ] Sensitive data encrypted (if applicable)
- [ ] Soft delete preserves history
- [ ] CORS configured properly

### API Security
- [ ] HTTPS enabled (production)
- [ ] API rate limiting (if needed)
- [ ] Error messages don't leak sensitive info
- [ ] Headers secured

---

## Monitoring & Logging

### Backend Logging
- [ ] API request logging enabled
- [ ] Error logging configured
- [ ] Audit log capturing all changes
- [ ] Log rotation configured

### Frontend Logging
- [ ] Client-side error tracking
- [ ] API error handling
- [ ] User action tracking (if needed)

### Database Logging
- [ ] Slow query log enabled
- [ ] Error log monitored
- [ ] Connection pool metrics

---

## Documentation Checklist

### User Documentation
- [ ] Quick Reference Guide available
- [ ] API documentation accessible
- [ ] User guide for each page
- [ ] Troubleshooting guide

### Technical Documentation
- [ ] Database schema documented
- [ ] API endpoints documented
- [ ] Code comments in place
- [ ] Deployment guide complete

### Operational Documentation
- [ ] Backup procedures documented
- [ ] Disaster recovery plan
- [ ] Maintenance procedures
- [ ] Support contacts

---

## Backup & Recovery

### Backup Strategy
- [ ] Database backup scheduled
- [ ] Backup retention policy defined
- [ ] Backup restoration tested
- [ ] Off-site backup configured

### Recovery Procedures
- [ ] Database recovery procedure documented
- [ ] Application recovery procedure documented
- [ ] RTO (Recovery Time Objective) defined
- [ ] RPO (Recovery Point Objective) defined

---

## Production Readiness

### Environment Configuration
- [ ] Environment variables set
- [ ] Database connection strings configured
- [ ] API URLs configured
- [ ] Logging configured for production

### Scalability
- [ ] Database connection pooling
- [ ] API server can scale horizontally
- [ ] Load balancer configured (if needed)
- [ ] Caching strategy in place

### Monitoring
- [ ] Health check endpoints working
- [ ] Uptime monitoring configured
- [ ] Performance monitoring in place
- [ ] Alert system configured

---

## Post-Deployment Verification

### Smoke Tests
- [ ] All pages accessible
- [ ] All API endpoints responding
- [ ] Database queries working
- [ ] No critical errors in logs

### User Acceptance
- [ ] Sample data created
- [ ] User walkthrough completed
- [ ] Feedback collected
- [ ] Issues documented

### Performance Validation
- [ ] Load testing completed
- [ ] Response times acceptable
- [ ] Resource usage reasonable
- [ ] No memory leaks detected

---

## Rollback Plan

### If Issues Occur
1. [ ] Stop application servers
2. [ ] Restore database from backup (if needed)
3. [ ] Revert code to previous version
4. [ ] Restart servers
5. [ ] Verify functionality
6. [ ] Document issues for resolution

---

## Sign-Off

### Technical Lead
- [ ] Code reviewed and approved
- [ ] Database migrations verified
- [ ] API functionality tested
- [ ] Documentation reviewed

### QA Team
- [ ] All test cases passed
- [ ] Performance acceptable
- [ ] Security validated
- [ ] User acceptance testing complete

### Operations Team
- [ ] Deployment procedures verified
- [ ] Monitoring configured
- [ ] Backup strategy in place
- [ ] Support procedures documented

---

## Success Criteria

The deployment is considered successful when:

- ✅ All database tables created without errors
- ✅ Backend API serving all 60+ endpoints
- ✅ Frontend dashboard accessible on all pages
- ✅ Sample data can be created and retrieved
- ✅ No critical errors in logs
- ✅ All performance metrics within acceptable range
- ✅ Security controls verified
- ✅ Documentation complete
- ✅ Backup and recovery procedures tested
- ✅ User acceptance testing passed

---

## Quick Command Reference

### Start Everything
```bash
# Terminal 1: Backend
cd c:\Omsystems
npm run dev

# Terminal 2: Frontend
cd c:\Omsystems\dashboard
npm run dev
```

### Check Status
```bash
# Backend health
curl http://localhost:3000/health

# Frontend access
http://localhost:3001/compliance/overview

# Database check
psql -h localhost -U postgres -d sentinel -c "SELECT COUNT(*) FROM compliance_requirements;"
```

### Stop Everything
```bash
# Ctrl+C in each terminal
# Or kill processes on ports 3000 and 3001
```

---

## Support Information

### Common Issues
- **Port already in use:** Kill process or use different port
- **Database connection error:** Verify PostgreSQL is running
- **Migration errors:** Check migration files for syntax errors
- **API 404 errors:** Verify routes registered in app.ts
- **Frontend blank page:** Check browser console for errors

### Getting Help
1. Check logs in console/terminal
2. Review documentation files
3. Check browser developer console
4. Verify environment variables
5. Test individual components

---

**Deployment Checklist Version:** 1.0  
**Last Updated:** Now  
**Status:** Ready for Production Deployment ✅

