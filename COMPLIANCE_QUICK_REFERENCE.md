# Compliance System - Quick Reference Guide

## 🚀 Quick Start (5 Minutes)

### Step 1: Apply Migrations (2 min)
```powershell
cd c:\Omsystems
.\scripts\apply-migrations.ps1
```

### Step 2: Start Backend (1 min)
```bash
npm run dev
```
Backend runs at: `http://localhost:3000`

### Step 3: Start Frontend (1 min)
```bash
cd dashboard
npm run dev
```
Frontend runs at: `http://localhost:3001`

### Step 4: Access System (1 min)
Open browser to: `http://localhost:3001/compliance/requirements`

---

## 📍 Page URLs

| Page | URL | Purpose |
|------|-----|---------|
| Requirements | `/compliance/requirements` | Manage compliance requirements |
| Controls | `/compliance/controls` | Implement and track controls |
| Findings | `/compliance/findings` | Track audit findings |
| Evidence | `/compliance/evidence` | Store compliance evidence |
| Risks | `/compliance/risks` | Manage compliance risks |
| Dashboard | `/compliance/dashboard` | Overview metrics |

---

## 🔑 API Endpoints Cheat Sheet

### Requirements
```bash
# List all requirements
GET /v1/compliance/requirements

# Get single requirement
GET /v1/compliance/requirements/:id

# Create requirement
POST /v1/compliance/requirements
{
  "frameworkId": "uuid",
  "requirementCode": "REQ-001",
  "title": "Access Control",
  "description": "Implement role-based access",
  "category": "Security",
  "isMandatory": true
}

# Update requirement
PUT /v1/compliance/requirements/:id

# Delete requirement
DELETE /v1/compliance/requirements/:id
```

### Controls
```bash
# List all controls
GET /v1/compliance/controls

# Create control
POST /v1/compliance/controls
{
  "requirementId": "uuid",
  "controlCode": "CTRL-001",
  "title": "Password Policy",
  "description": "Enforce strong passwords",
  "controlType": "preventive",
  "implementationStatus": "implemented",
  "testFrequency": "quarterly"
}
```

### Findings
```bash
# List all findings
GET /v1/compliance/findings

# Create finding
POST /v1/compliance/findings
{
  "controlId": "uuid",
  "findingNumber": "FIND-001",
  "title": "Weak Password Detected",
  "description": "User passwords not meeting complexity",
  "severity": "high",
  "riskScore": 18
}

# Close finding
POST /v1/compliance/findings/:id/close
{
  "resolution": "Passwords updated, policy enforced",
  "verifiedBy": "auditor-uuid"
}
```

### Evidence
```bash
# List all evidence
GET /v1/compliance/evidence

# Upload evidence
POST /v1/compliance/evidence
{
  "controlId": "uuid",
  "evidenceType": "document",
  "title": "Firewall Configuration",
  "description": "Current firewall rules export",
  "filePath": "/uploads/firewall-config.pdf",
  "validFrom": "2026-01-01",
  "validTo": "2026-12-31"
}

# Validate evidence
POST /v1/compliance/evidence/:id/validate
{
  "verifiedBy": "auditor-uuid",
  "verificationNotes": "Reviewed and approved"
}
```

### Risks
```bash
# List all risks
GET /v1/compliance/risks

# Create risk
POST /v1/compliance/risks
{
  "requirementId": "uuid",
  "riskCode": "RISK-001",
  "title": "Data Breach Risk",
  "description": "Unencrypted data in transit",
  "likelihood": "high",
  "impact": "very_high",
  "riskResponse": "mitigate"
}

# Assess risk
POST /v1/compliance/risks/:id/assess
{
  "inherentRiskScore": 25,
  "residualRiskScore": 10,
  "assessmentNotes": "Encryption implemented"
}
```

### Dashboard
```bash
# Get dashboard metrics
GET /v1/compliance/dashboard

# Get requirement status
GET /v1/compliance/requirements/:id/status

# Get framework coverage
GET /v1/compliance/frameworks/:id/coverage

# Get audit log
GET /v1/compliance/audit-log?startDate=2026-01-01&endDate=2026-12-31
```

---

## 🎯 Common Workflows

### Workflow 1: Implementing a New Requirement

```bash
# 1. Create requirement
POST /v1/compliance/requirements
{
  "frameworkId": "iso27001-uuid",
  "requirementCode": "A.9.2.1",
  "title": "User Registration and De-registration",
  "category": "Access Control",
  "isMandatory": true
}

# 2. Create control
POST /v1/compliance/controls
{
  "requirementId": "{{requirement-id}}",
  "controlCode": "AC-001",
  "title": "Automated User Provisioning",
  "controlType": "preventive",
  "implementationStatus": "in_progress"
}

# 3. Upload evidence
POST /v1/compliance/evidence
{
  "controlId": "{{control-id}}",
  "evidenceType": "screenshot",
  "title": "User Provisioning System",
  "description": "Screenshot of automated provisioning"
}

# 4. Test control
POST /v1/compliance/tests
{
  "controlId": "{{control-id}}",
  "testDate": "2026-07-22",
  "testResult": "passed",
  "effectiveness": "effective"
}
```

### Workflow 2: Handling an Audit Finding

```bash
# 1. Create finding
POST /v1/compliance/findings
{
  "controlId": "{{control-id}}",
  "findingNumber": "AUD-2026-001",
  "title": "Backup Process Incomplete",
  "severity": "high",
  "riskScore": 16
}

# 2. Create remediation plan
POST /v1/compliance/remediation-plans
{
  "findingId": "{{finding-id}}",
  "title": "Implement Full Backup Solution",
  "priority": "high",
  "dueDate": "2026-08-30"
}

# 3. Add remediation actions
POST /v1/compliance/remediation-actions
{
  "planId": "{{plan-id}}",
  "actionNumber": "ACT-001",
  "description": "Purchase backup software",
  "owner": "it-manager-uuid",
  "dueDate": "2026-08-01"
}

# 4. Complete action
POST /v1/compliance/remediation-actions/{{action-id}}/complete
{
  "completionNotes": "Backup software purchased and installed"
}

# 5. Verify plan
POST /v1/compliance/remediation-plans/{{plan-id}}/verify
{
  "verifiedBy": "auditor-uuid",
  "verificationNotes": "All backups tested and working"
}

# 6. Close finding
POST /v1/compliance/findings/{{finding-id}}/close
{
  "resolution": "Backup solution implemented",
  "verifiedBy": "auditor-uuid"
}
```

### Workflow 3: Managing Compliance Risk

```bash
# 1. Identify risk
POST /v1/compliance/risks
{
  "requirementId": "{{requirement-id}}",
  "riskCode": "RISK-SEC-001",
  "title": "Weak Authentication",
  "likelihood": "high",
  "impact": "high",
  "category": "Security"
}

# 2. Assess risk
POST /v1/compliance/risks/{{risk-id}}/assess
{
  "inherentRiskScore": 20,
  "assessmentDate": "2026-07-22",
  "assessmentNotes": "No MFA implemented"
}

# 3. Create mitigation control
POST /v1/compliance/controls
{
  "requirementId": "{{requirement-id}}",
  "controlCode": "MFA-001",
  "title": "Multi-Factor Authentication",
  "controlType": "preventive",
  "implementationStatus": "in_progress"
}

# 4. Re-assess risk after mitigation
POST /v1/compliance/risks/{{risk-id}}/assess
{
  "residualRiskScore": 8,
  "assessmentNotes": "MFA implemented, risk reduced"
}

# 5. Review risk
POST /v1/compliance/risks/{{risk-id}}/review
{
  "reviewedBy": "risk-manager-uuid",
  "reviewNotes": "Risk now at acceptable level"
}
```

---

## 🔍 Search & Filter Examples

### Frontend Filters

**Requirements Page:**
- Search: Type requirement code, title, or description
- Filter by Category: Select from dropdown
- Filter by Status: Active, Draft, Deprecated

**Controls Page:**
- Search: Type control code or title
- Filter by Type: Preventive, Detective, Corrective, Deterrent
- Filter by Status: Not Implemented, In Progress, Implemented, Verified

**Findings Page:**
- Search: Type finding number or title
- Filter by Severity: Critical, High, Medium, Low, Negligible
- Filter by Status: Open, In Review, Resolved, Closed

**Evidence Page:**
- Search: Type evidence title
- Filter by Type: Document, Screenshot, Log, Report, Certificate
- Filter by Status: Active, Expired, Revoked

**Risks Page:**
- Search: Type risk code or title
- Filter by Likelihood: Very Low to Very High
- Filter by Impact: Very Low to Very High
- Filter by Status: Identified, Assessed, Treated, Monitored

### API Query Parameters

```bash
# Filter requirements by category
GET /v1/compliance/requirements?category=Security

# Filter controls by status
GET /v1/compliance/controls?implementationStatus=implemented

# Filter findings by severity
GET /v1/compliance/findings?severity=critical

# Filter evidence by type
GET /v1/compliance/evidence?evidenceType=document

# Filter risks by likelihood and impact
GET /v1/compliance/risks?likelihood=high&impact=high

# Pagination
GET /v1/compliance/requirements?page=1&limit=20

# Sorting
GET /v1/compliance/requirements?sortBy=createdAt&order=desc
```

---

## 📊 Understanding Status Values

### Requirement Status
- **active** - Currently applicable
- **draft** - Under development
- **deprecated** - No longer applicable

### Control Implementation Status
- **not_implemented** - Not started
- **in_progress** - Being implemented
- **implemented** - Implemented but not verified
- **verified** - Implemented and verified

### Control Effectiveness
- **effective** - Working as intended
- **partially_effective** - Working but needs improvement
- **ineffective** - Not working
- **not_tested** - Not yet tested

### Finding Status
- **open** - Newly identified
- **in_review** - Being reviewed
- **resolved** - Fixed, pending verification
- **closed** - Verified and closed

### Risk Status
- **identified** - Risk identified
- **assessed** - Risk assessed
- **treated** - Mitigation implemented
- **monitored** - Being monitored

### Risk Response
- **accept** - Accept the risk
- **mitigate** - Reduce the risk
- **transfer** - Transfer to third party
- **avoid** - Eliminate the risk

---

## 🎨 UI Color Codes

### Severity Levels
- 🔴 **Critical** - Immediate action required
- 🟠 **High** - Address soon
- 🟡 **Medium** - Schedule for resolution
- 🔵 **Low** - Monitor
- ⚪ **Negligible** - Minimal concern

### Risk Scores
- **Critical:** 20-25 (Red)
- **High:** 15-19 (Orange)
- **Medium:** 10-14 (Yellow)
- **Low:** 5-9 (Blue)
- **Very Low:** 0-4 (Gray)

### Control Types
- 🛡️ **Preventive** - Prevent issues
- 🔍 **Detective** - Detect issues
- 🔧 **Corrective** - Correct issues
- ⚠️ **Deterrent** - Deter violations

---

## 🔐 Authentication

All API requests require the `x-user-id` header:

```bash
curl -H "x-user-id: your-user-uuid" \
  http://localhost:3000/v1/compliance/requirements
```

Frontend automatically includes this header in all API calls.

---

## 📈 Dashboard Metrics Explained

### Framework Coverage
- **Total Requirements** - All requirements in framework
- **Total Controls** - Controls implemented
- **Controls Implemented** - Verified controls
- **Implementation Rate** - (Implemented / Total) × 100%

### Requirement Status
- **Compliance Rate** - Requirements with passing controls
- **Gap Count** - Requirements without controls
- **Overdue Tests** - Controls needing testing

### Risk Metrics
- **Inherent Risk Score** - Risk before mitigation
- **Residual Risk Score** - Risk after mitigation
- **Risk Reduction** - Inherent - Residual

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check if port 3000 is in use
netstat -ano | findstr :3000

# Kill process if needed
taskkill /PID <pid> /F

# Restart
npm run dev
```

### Frontend won't start
```bash
# Check if port 3001 is in use
netstat -ano | findstr :3001

# Kill process if needed
taskkill /PID <pid> /F

# Restart
cd dashboard
npm run dev
```

### Database connection error
```powershell
# Check PostgreSQL is running
Get-Service -Name postgresql*

# Start if needed
Start-Service postgresql-x64-14

# Test connection
psql -h localhost -U postgres -d sentinel
```

### Migration errors
```powershell
# Check current migration status
psql -h localhost -U postgres -d sentinel -c "SELECT * FROM schema_migrations;"

# Manually apply if needed
psql -h localhost -U postgres -d sentinel -f "database\migrations\022_compliance_enhancements.sql"
```

### API returns 404
- Verify backend is running on port 3000
- Check route is registered in `src/app.ts`
- Verify endpoint URL is correct

### Frontend shows empty data
- Verify backend is running
- Check browser console for errors
- Verify API proxy routes exist
- Check `NEXT_PUBLIC_API_URL` in `.env`

---

## 📝 Sample Data

### Create Sample Framework
```bash
POST /v1/compliance/frameworks
{
  "name": "ISO 27001:2022",
  "description": "Information Security Management",
  "version": "2022",
  "effectiveDate": "2026-01-01"
}
```

### Create Sample Requirements
```bash
# Access Control Requirement
POST /v1/compliance/requirements
{
  "frameworkId": "{{framework-id}}",
  "requirementCode": "A.9.1.1",
  "title": "Access Control Policy",
  "description": "Establish, document and review access control policy",
  "category": "Access Control",
  "isMandatory": true
}

# Encryption Requirement
POST /v1/compliance/requirements
{
  "frameworkId": "{{framework-id}}",
  "requirementCode": "A.10.1.1",
  "title": "Policy on Cryptographic Controls",
  "description": "Develop and implement policy on cryptographic controls",
  "category": "Cryptography",
  "isMandatory": true
}
```

---

## 🎓 Best Practices

### Requirements
- Use standard framework codes (e.g., ISO A.9.1.1)
- Mark critical requirements as mandatory
- Group by category for easier management
- Link to framework documentation

### Controls
- One control per requirement (or multiple if needed)
- Set realistic test frequencies
- Assign control owners
- Document implementation details

### Evidence
- Collect evidence regularly
- Set validity periods
- Verify evidence promptly
- Store securely with proper access controls

### Findings
- Document thoroughly
- Assess risk accurately
- Create remediation plans immediately
- Track to closure

### Risks
- Assess both likelihood and impact
- Calculate risk scores consistently
- Review risks regularly
- Document mitigation strategies

---

## 📞 Quick Help

| Issue | Solution |
|-------|----------|
| Can't find page | Check URL matches `/compliance/[page-name]` |
| No data showing | Ensure backend is running and seeded |
| API error | Check backend logs for details |
| Slow loading | Check database connection |
| Filter not working | Clear search, try again |
| Can't create item | Check required fields |

---

## 🚀 Performance Tips

- Use pagination for large datasets
- Filter data before searching
- Cache dashboard metrics
- Index frequently queried fields
- Batch API calls when possible

---

## 📚 Related Documentation

- `COMPLIANCE_IMPLEMENTATION_COMPLETE_SUMMARY.md` - Full implementation details
- `COMPLIANCE_FRONTEND_COMPLETE.md` - Frontend documentation
- `COMPLIANCE_DATABASE_IMPLEMENTATION_GUIDE.md` - Database schema
- `COMPLIANCE_ENHANCED_QUICK_START.md` - Detailed quick start

---

**Last Updated:** Now
**Version:** 1.0
**Status:** Production Ready ✅

