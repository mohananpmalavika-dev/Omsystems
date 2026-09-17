# Phase 3 Implementation Plan - Detailed Sprint Breakdown

**Project:** MIS Reporting System - Phase 3 Enhancements  
**Duration:** 9 weeks (3 sprints × 3 weeks each)  
**Start Date:** TBD (post Phase 1-2 deployment)  
**Team Size:** 1 full-time developer + 0.5 FTE DevOps + 0.25 FTE QA  
**Budget:** $95,000  

---

## Executive Summary

### Objectives
Transform the MIS reporting system from production-ready to enterprise-grade by adding:
1. **Security & Compliance** - RBAC, audit logging, data masking
2. **AI Analytics** - Track 381 AI capabilities, ROI visibility
3. **Data Completeness** - Real footfall, queue, SLA metrics
4. **Predictive Intelligence** - 30/60/90-day forecasting
5. **System Integrations** - ERP and HR system connections

### Business Value
- **Total Additional Value:** $255,000/year
- **ROI:** 168% (first year)
- **Payback Period:** 4.5 months
- **Combined System Value:** $656,000/year (with Phases 1-2)

### Success Criteria
- All 5 priority areas delivered on time
- Zero critical security vulnerabilities
- < 3 second report load time maintained
- 90%+ user satisfaction score
- Successful integration with at least ERP or HR

---

## Sprint Overview

### Sprint 1: Security Foundation (Weeks 1-3)
**Theme:** "Lock It Down"  
**Value:** $35,000/year  
**Risk Level:** Medium - Security testing critical

**Deliverables:**
- Role-Based Access Control (RBAC)
- Comprehensive Audit Logging
- Data Masking for Sensitive Information
- Security testing and penetration testing
- Documentation updates

---

### Sprint 2: AI & Data Excellence (Weeks 4-6)
**Theme:** "Measure What Matters"  
**Value:** $90,000/year  
**Risk Level:** Medium - New data sources

**Deliverables:**
- AI Analytics Dashboard (381 capabilities)
- Footfall tracking integration
- Queue analysis (wait times)
- SLA configuration system
- Model performance metrics

---

### Sprint 3: Intelligence & Integration (Weeks 7-9)
**Theme:** "Predict & Connect"  
**Value:** $130,000/year  
**Risk Level:** High - Vendor dependencies

**Deliverables:**
- Predictive forecasting (30/60/90-day)
- ERP system integration
- HR system integration
- What-if scenario modeling
- Final testing and documentation

---

## Resource Allocation

### Development Team

**Primary Developer (1.0 FTE - 9 weeks)**
- Backend API development (50%)
- Frontend component development (30%)
- Integration work (15%)
- Documentation (5%)

**DevOps Engineer (0.5 FTE - 9 weeks)**
- Infrastructure setup (Redis, etc.)
- Database optimization
- CI/CD pipeline updates
- Deployment automation

**QA Engineer (0.25 FTE - 9 weeks)**
- Test case development
- Automated testing
- Security testing coordination
- User acceptance testing support

**External Resources (as needed)**
- Security consultant (penetration testing) - 3 days
- ERP/HR system consultants - 5 days
- Technical writer (documentation) - 3 days

### Budget Breakdown

| Category | Cost | Notes |
|----------|------|-------|
| **Development Labor** | $67,500 | 9 weeks × $7,500/week |
| **DevOps/Infrastructure** | $13,500 | Redis, testing environments |
| **QA/Testing** | $6,750 | Automated + manual testing |
| **External Consultants** | $5,000 | Security, ERP/HR experts |
| **Contingency (5%)** | $2,250 | Buffer for unexpected issues |
| **Total** | **$95,000** | |

---

## Sprint 1: Security Foundation (Weeks 1-3)

### Sprint Goal
Implement enterprise-grade security controls to protect sensitive financial data and ensure regulatory compliance.

### Theme: "Lock It Down"

---

### Week 1: Role-Based Access Control (RBAC)

#### User Stories

**Story 1.1: Define User Roles and Permissions**
```
As a System Administrator
I want to define user roles with specific report access permissions
So that sensitive financial data is only visible to authorized users

Acceptance Criteria:
- [ ] Roles defined: super_admin, ceo, cfo, coo, compliance_officer, 
      branch_manager, finance_analyst, viewer
- [ ] Permission matrix documented for all 5 reports
- [ ] Database schema created for roles and permissions
- [ ] Migration script tested on staging environment

Story Points: 3
Priority: P0 (Critical)
Dependencies: None
```

**Story 1.2: Implement Backend RBAC Middleware**
```
As a Backend Developer
I want to create RBAC middleware for API endpoints
So that unauthorized users cannot access restricted reports

Acceptance Criteria:
- [ ] Middleware function checks user role against required permissions
- [ ] All 5 report endpoints protected with RBAC
- [ ] Historical trends endpoint protected
- [ ] Proper HTTP 403 responses for unauthorized access
- [ ] Unit tests cover all permission scenarios

Story Points: 5
Priority: P0 (Critical)
Dependencies: Story 1.1
```

**Story 1.3: Update Frontend with Role-Based UI**
```
As a Frontend Developer
I want to show/hide reports based on user role
So that users only see reports they're authorized to access

Acceptance Criteria:
- [ ] Navigation links conditionally rendered based on role
- [ ] Unauthorized report pages redirect to 403 error page
- [ ] Role information displayed in user profile
- [ ] Frontend state management updated for roles
- [ ] UI tests validate role-based rendering

Story Points: 5
Priority: P0 (Critical)
Dependencies: Story 1.2
```

#### Technical Implementation

**Database Schema:**
```sql
-- Create roles table
CREATE TABLE user_roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add role_id to users table
ALTER TABLE users ADD COLUMN role_id INT REFERENCES user_roles(id);

-- Create role_permissions table for granular control
CREATE TABLE role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INT REFERENCES user_roles(id),
  resource VARCHAR(100) NOT NULL, -- e.g., 'report:financial-tco'
  action VARCHAR(50) NOT NULL, -- e.g., 'view', 'export', 'schedule'
  granted BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id, resource);
```

**Backend Middleware (TypeScript):**
```typescript
// src/middleware/rbac.middleware.ts

import { Request, Response, NextFunction } from 'express';

interface Permission {
  resource: string;
  action: string;
}

export const requirePermission = (resource: string, action: string = 'view') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user; // Set by authentication middleware
      
      if (!user || !user.role_id) {
        return res.status(403).json({ error: 'Access denied: No role assigned' });
      }
      
      // Super admin has all permissions
      if (user.role_name === 'super_admin') {
        return next();
      }
      
      // Check permission in database
      const hasPermission = await checkUserPermission(
        user.role_id,
        resource,
        action
      );
      
      if (!hasPermission) {
        await logAccessDenied(user.id, resource, action);
        return res.status(403).json({ 
          error: 'Access denied: Insufficient permissions',
          required: { resource, action }
        });
      }
      
      next();
    } catch (error) {
      console.error('RBAC error:', error);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

async function checkUserPermission(
  roleId: number,
  resource: string,
  action: string
): Promise<boolean> {
  const result = await pool.query(
    `SELECT granted FROM role_permissions 
     WHERE role_id = $1 AND resource = $2 AND action = $3`,
    [roleId, resource, action]
  );
  
  return result.rows.length > 0 && result.rows[0].granted;
}
```

**Route Protection:**
```typescript
// src/routes/reports/financial-tco.routes.ts

import { requirePermission } from '../../middleware/rbac.middleware.js';

router.get('/financial/tco',
  authenticateToken,
  requirePermission('report:financial-tco', 'view'),
  handleGetFinancialTCO
);

router.post('/financial/tco/export',
  authenticateToken,
  requirePermission('report:financial-tco', 'export'),
  handleExportFinancialTCO
);
```

**Frontend Role Check (React):**
```typescript
// dashboard/lib/auth-manager.ts

export function hasReportAccess(reportType: string): boolean {
  const user = getCurrentUser();
  if (!user || !user.role) return false;
  
  const rolePermissions: Record<string, string[]> = {
    super_admin: ['*'],
    ceo: ['executive-kpi', 'financial-tco', 'branch-benchmarking', 'compliance', 'mis-unified'],
    cfo: ['executive-kpi', 'financial-tco', 'financial-roi', 'branch-benchmarking', 'mis-unified'],
    coo: ['executive-kpi', 'branch-benchmarking', 'compliance', 'mis-unified'],
    compliance_officer: ['compliance', 'mis-unified'],
    branch_manager: ['branch-benchmarking', 'compliance', 'mis-unified'],
    finance_analyst: ['financial-tco', 'financial-roi', 'mis-unified'],
    viewer: ['executive-kpi']
  };
  
  const allowedReports = rolePermissions[user.role] || [];
  return allowedReports.includes('*') || allowedReports.includes(reportType);
}

// dashboard/components/app-layout.tsx
{hasReportAccess('financial-tco') && (
  <Link href="/reports/financial">Financial TCO</Link>
)}
```

#### Testing Plan

**Unit Tests:**
- [ ] Test RBAC middleware with all role combinations
- [ ] Test permission matrix completeness
- [ ] Test unauthorized access returns 403
- [ ] Test super_admin bypasses checks

**Integration Tests:**
- [ ] Test end-to-end: login → access report → verify permission
- [ ] Test role changes propagate correctly
- [ ] Test session invalidation on role change

**Manual Testing:**
- [ ] Create test users for each role
- [ ] Verify each role sees correct reports
- [ ] Verify unauthorized reports show 403
- [ ] Test edge cases (no role, invalid role)

#### Deliverables - Week 1
- [ ] RBAC database schema migrated
- [ ] Backend middleware implemented and tested
- [ ] Frontend role-based UI working
- [ ] Permission matrix documented
- [ ] 15+ unit tests passing
- [ ] Integration tests passing

---

### Week 2: Comprehensive Audit Logging

#### User Stories

**Story 2.1: Design Audit Log Schema**
```
As a Compliance Officer
I want all report access logged with user, timestamp, and filters
So that we have complete audit trails for regulatory compliance

Acceptance Criteria:
- [ ] Audit log table created with required fields
- [ ] Indexes for fast querying by user, report, date
- [ ] Retention policy defined (7 years for compliance)
- [ ] Performance tested with 1M+ log entries

Story Points: 3
Priority: P0 (Critical)
Dependencies: None
```

**Story 2.2: Implement Audit Logging Middleware**
```
As a Backend Developer
I want to automatically log all report access and exports
So that no manual logging is required by developers

Acceptance Criteria:
- [ ] Middleware logs: user_id, report_type, action (view/export),
      filters, IP address, user agent, timestamp
- [ ] Async logging (non-blocking)
- [ ] Error handling (log failures don't break requests)
- [ ] Bulk insert for performance
- [ ] Unit tests for logging middleware

Story Points: 5
Priority: P0 (Critical)
Dependencies: Story 2.1
```

**Story 2.3: Create Audit Log Viewer**
```
As a System Administrator
I want to view and search audit logs
So that I can investigate access patterns and security incidents

Acceptance Criteria:
- [ ] Audit log viewer page (/admin/audit-logs)
- [ ] Filter by: user, report type, date range, action
- [ ] Sortable table with pagination
- [ ] Export audit logs to CSV
- [ ] Only accessible to super_admin role

Story Points: 8
Priority: P1 (High)
Dependencies: Story 2.2
```

#### Technical Implementation

**Database Schema:**
```sql
-- Create audit log table
CREATE TABLE report_access_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  user_email VARCHAR(255),
  user_role VARCHAR(50),
  report_type VARCHAR(50) NOT NULL,
  action VARCHAR(20) NOT NULL, -- 'view', 'export_pdf', 'export_excel', 'schedule'
  filters JSONB,
  ip_address INET,
  user_agent TEXT,
  response_time_ms INT,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  accessed_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_audit_user_date ON report_access_log(user_id, accessed_at DESC);
CREATE INDEX idx_audit_report_date ON report_access_log(report_type, accessed_at DESC);
CREATE INDEX idx_audit_date ON report_access_log(accessed_at DESC);
CREATE INDEX idx_audit_action ON report_access_log(action, accessed_at DESC);

-- Partition by month for performance (optional but recommended)
CREATE TABLE report_access_log_2026_09 PARTITION OF report_access_log
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
```

**Audit Logging Middleware:**
```typescript
// src/middleware/audit-log.middleware.ts

import { Request, Response, NextFunction } from 'express';

export const auditLog = (reportType: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const user = req.user;
    
    // Capture original response methods
    const originalJson = res.json;
    const originalSend = res.send;
    
    let responseSuccess = true;
    let errorMessage: string | null = null;
    
    // Override response methods to capture success/failure
    res.json = function(data: any) {
      if (res.statusCode >= 400) {
        responseSuccess = false;
        errorMessage = data.error || 'Unknown error';
      }
      return originalJson.call(this, data);
    };
    
    // Log after response is sent
    res.on('finish', async () => {
      try {
        const responseTime = Date.now() - startTime;
        
        await pool.query(`
          INSERT INTO report_access_log (
            user_id, user_email, user_role, report_type, action,
            filters, ip_address, user_agent, response_time_ms,
            success, error_message
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          user.id,
          user.email,
          user.role_name,
          reportType,
          req.method === 'GET' ? 'view' : 'export',
          JSON.stringify(req.query),
          req.ip,
          req.get('user-agent'),
          responseTime,
          responseSuccess,
          errorMessage
        ]);
      } catch (error) {
        // Log audit failure but don't fail the request
        console.error('Audit logging failed:', error);
      }
    });
    
    next();
  };
};

// Usage in routes
router.get('/financial/tco',
  authenticateToken,
  requirePermission('report:financial-tco', 'view'),
  auditLog('financial-tco'),
  handleGetFinancialTCO
);
```

**Audit Log Viewer API:**
```typescript
// src/routes/admin/audit-logs.routes.ts

router.get('/audit-logs',
  authenticateToken,
  requirePermission('admin:audit-logs', 'view'),
  async (req, res) => {
    const {
      user_id,
      report_type,
      action,
      start_date,
      end_date,
      page = 1,
      limit = 50
    } = req.query;
    
    let query = 'SELECT * FROM report_access_log WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;
    
    if (user_id) {
      query += ` AND user_id = $${paramIndex++}`;
      params.push(user_id);
    }
    
    if (report_type) {
      query += ` AND report_type = $${paramIndex++}`;
      params.push(report_type);
    }
    
    if (action) {
      query += ` AND action = $${paramIndex++}`;
      params.push(action);
    }
    
    if (start_date) {
      query += ` AND accessed_at >= $${paramIndex++}`;
      params.push(start_date);
    }
    
    if (end_date) {
      query += ` AND accessed_at <= $${paramIndex++}`;
      params.push(end_date);
    }
    
    query += ` ORDER BY accessed_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, (Number(page) - 1) * Number(limit));
    
    const result = await pool.query(query, params);
    
    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM report_access_log WHERE 1=1' // Apply same filters
    );
    
    res.json({
      logs: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(countResult.rows[0].count),
        pages: Math.ceil(Number(countResult.rows[0].count) / Number(limit))
      }
    });
  }
);
```

**Frontend Audit Log Viewer:**
```typescript
// dashboard/app/admin/audit-logs/page.tsx

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({
    report_type: '',
    action: '',
    start_date: '',
    end_date: ''
  });
  
  const loadLogs = async () => {
    const params = new URLSearchParams(filters);
    const res = await fetch(`/api/control/v1/admin/audit-logs?${params}`);
    const data = await res.json();
    setLogs(data.logs);
  };
  
  return (
    <div className="p-6">
      <h1>Audit Logs</h1>
      
      {/* Filters */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <select value={filters.report_type} onChange={(e) => setFilters({...filters, report_type: e.target.value})}>
          <option value="">All Reports</option>
          <option value="executive-kpi">Executive KPI</option>
          <option value="financial-tco">Financial TCO</option>
          {/* ... */}
        </select>
        
        <select value={filters.action} onChange={(e) => setFilters({...filters, action: e.target.value})}>
          <option value="">All Actions</option>
          <option value="view">View</option>
          <option value="export_pdf">Export PDF</option>
          <option value="export_excel">Export Excel</option>
        </select>
        
        <input 
          type="date" 
          value={filters.start_date}
          onChange={(e) => setFilters({...filters, start_date: e.target.value})}
          placeholder="Start Date"
        />
        
        <input 
          type="date" 
          value={filters.end_date}
          onChange={(e) => setFilters({...filters, end_date: e.target.value})}
          placeholder="End Date"
        />
      </div>
      
      <button onClick={loadLogs}>Search</button>
      
      {/* Results Table */}
      <table className="w-full">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>User</th>
            <th>Role</th>
            <th>Report</th>
            <th>Action</th>
            <th>IP Address</th>
            <th>Success</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log: any) => (
            <tr key={log.id}>
              <td>{new Date(log.accessed_at).toLocaleString()}</td>
              <td>{log.user_email}</td>
              <td>{log.user_role}</td>
              <td>{log.report_type}</td>
              <td>{log.action}</td>
              <td>{log.ip_address}</td>
              <td>{log.success ? '✅' : '❌'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

#### Testing Plan

**Unit Tests:**
- [ ] Test audit middleware logs correct data
- [ ] Test async logging doesn't block requests
- [ ] Test log failures don't break app
- [ ] Test filters work correctly

**Integration Tests:**
- [ ] Generate 1000 audit logs, verify all stored
- [ ] Test audit log viewer pagination
- [ ] Test CSV export
- [ ] Test performance with 100K+ logs

**Compliance Tests:**
- [ ] Verify 7-year retention policy
- [ ] Verify all sensitive actions logged
- [ ] Verify logs are immutable (no UPDATE/DELETE)
- [ ] Verify backup procedures

#### Deliverables - Week 2
- [ ] Audit log database schema created
- [ ] Audit logging middleware working
- [ ] All reports logging access
- [ ] Audit log viewer implemented
- [ ] Performance tested (1M+ logs)
- [ ] Documentation updated

---

### Week 3: Data Masking & Security Testing

#### User Stories

**Story 3.1: Implement Data Masking**
```
As a System Administrator
I want to mask sensitive financial data for non-privileged users
So that cost information is protected on need-to-know basis

Acceptance Criteria:
- [ ] Finance manager sees full costs
- [ ] CFO sees full costs
- [ ] Branch managers see only percentages/trends
- [ ] Masked fields show "***" or relative values
- [ ] Masking configurable per role

Story Points: 5
Priority: P1 (High)
Dependencies: Week 1 RBAC
```

**Story 3.2: Security Testing & Penetration Testing**
```
As a Security Consultant
I want to perform penetration testing on the system
So that vulnerabilities are identified before production

Acceptance Criteria:
- [ ] SQL injection testing (all endpoints)
- [ ] XSS testing (all forms)
- [ ] CSRF protection verified
- [ ] Authentication bypass attempts blocked
- [ ] RBAC bypass attempts blocked
- [ ] Rate limiting tested
- [ ] Security report generated

Story Points: 8
Priority: P0 (Critical)
Dependencies: Weeks 1-2 complete
```

**Story 3.3: Security Documentation**
```
As a Developer
I want comprehensive security documentation
So that future developers maintain security standards

Acceptance Criteria:
- [ ] Security architecture documented
- [ ] Threat model documented
- [ ] Secure coding guidelines
- [ ] Incident response procedures
- [ ] Compliance checklist

Story Points: 3
Priority: P1 (High)
Dependencies: Story 3.2
```

#### Technical Implementation

**Data Masking Utility:**
```typescript
// src/utils/data-masking.ts

export interface MaskingConfig {
  role: string;
  fields: string[];
  maskType: 'hide' | 'partial' | 'aggregate';
}

const maskingRules: MaskingConfig[] = [
  {
    role: 'branch_manager',
    fields: ['totalCost', 'capex', 'opex', 'hiddenCosts'],
    maskType: 'hide'
  },
  {
    role: 'viewer',
    fields: ['totalCost', 'capex', 'opex', 'branchCosts.*'],
    maskType: 'hide'
  }
];

export function maskSensitiveData<T>(
  data: T,
  userRole: string
): T {
  const privilegedRoles = ['super_admin', 'cfo', 'finance_manager', 'finance_analyst'];
  
  // Privileged roles see everything
  if (privilegedRoles.includes(userRole)) {
    return data;
  }
  
  // Apply masking rules
  const rules = maskingRules.filter(r => r.role === userRole);
  if (rules.length === 0) {
    return data; // No rules, return as-is
  }
  
  const masked = JSON.parse(JSON.stringify(data)); // Deep clone
  
  rules.forEach(rule => {
    rule.fields.forEach(field => {
      if (field.includes('*')) {
        // Wildcard masking (e.g., branchCosts.*)
        maskWildcard(masked, field, rule.maskType);
      } else {
        // Direct field masking
        maskField(masked, field, rule.maskType);
      }
    });
  });
  
  return masked;
}

function maskField(obj: any, path: string, maskType: string) {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) return;
    current = current[keys[i]];
  }
  
  const finalKey = keys[keys.length - 1];
  
  if (current[finalKey] !== undefined) {
    switch (maskType) {
      case 'hide':
        current[finalKey] = '***';
        break;
      case 'partial':
        // Show last 2 digits: 12345 -> ***45
        const val = String(current[finalKey]);
        current[finalKey] = '***' + val.slice(-2);
        break;
      case 'aggregate':
        // Round to nearest 1000
        current[finalKey] = Math.round(Number(current[finalKey]) / 1000) * 1000;
        break;
    }
  }
}

// Usage in API handler
router.get('/financial/tco',
  authenticateToken,
  requirePermission('report:financial-tco', 'view'),
  auditLog('financial-tco'),
  async (req, res) => {
    const data = await generateFinancialTCO(req.user.tenant_id);
    const maskedData = maskSensitiveData(data, req.user.role_name);
    res.json(maskedData);
  }
);
```

**Security Testing Checklist:**

```markdown
## SQL Injection Testing
- [ ] Test all query parameters with: ' OR '1'='1
- [ ] Test with: '; DROP TABLE users; --
- [ ] Test with: UNION SELECT * FROM users
- [ ] Verify parameterized queries everywhere
- [ ] Test special characters: ', ", ;, --, #

## XSS Testing
- [ ] Test input fields with: <script>alert('XSS')</script>
- [ ] Test with: <img src=x onerror=alert('XSS')>
- [ ] Verify output encoding in all templates
- [ ] Test stored XSS (data from database)
- [ ] Test reflected XSS (URL parameters)

## Authentication Testing
- [ ] Test access without token
- [ ] Test with expired token
- [ ] Test with invalid token
- [ ] Test with token for different user
- [ ] Test session timeout
- [ ] Test concurrent sessions

## Authorization Testing (RBAC)
- [ ] Test role escalation attempts
- [ ] Test accessing reports without permission
- [ ] Test changing own role
- [ ] Test accessing other users' data
- [ ] Test API endpoints directly (bypass UI)

## Rate Limiting
- [ ] Test 100 requests in 1 minute
- [ ] Verify 429 response after limit
- [ ] Test from multiple IPs
- [ ] Verify rate limit headers

## CSRF Testing
- [ ] Verify CSRF tokens on forms
- [ ] Test form submission without token
- [ ] Test with invalid token
- [ ] Test with token from different session

## HTTPS/TLS Testing
- [ ] Verify HTTPS enforced (HTTP redirects)
- [ ] Check TLS version (1.2+ only)
- [ ] Verify certificate validity
- [ ] Test mixed content warnings

## Data Protection
- [ ] Verify passwords hashed (bcrypt)
- [ ] Verify sensitive data encrypted at rest
- [ ] Verify sensitive data masked in logs
- [ ] Test data export contains no secrets

## Session Management
- [ ] Test session fixation attacks
- [ ] Verify logout invalidates session
- [ ] Test session timeout (30 min idle)
- [ ] Verify secure session cookies (httpOnly, secure)
```

**Security Report Template:**
```markdown
# Security Assessment Report

**Date:** [Date]
**System:** MIS Reporting System - Phase 3
**Tester:** [Name]
**Scope:** RBAC, Audit Logging, Data Masking

## Executive Summary
[Summary of findings]

## Critical Vulnerabilities (P0)
None found ✅

## High Vulnerabilities (P1)
1. [Description]
   - Impact: [High/Medium/Low]
   - Likelihood: [High/Medium/Low]
   - Mitigation: [How to fix]

## Medium Vulnerabilities (P2)
...

## Low Vulnerabilities (P3)
...

## Recommendations
1. [Recommendation]
2. [Recommendation]

## Compliance Status
- [ ] OWASP Top 10 addressed
- [ ] GDPR data protection requirements met
- [ ] RBI banking security standards met

## Sign-Off
Tester: _______________  Date: ___________
Security Lead: _________  Date: ___________
```

#### Testing Plan

**Automated Security Tests:**
```bash
# Install security testing tools
npm install --save-dev @types/owasp-zap
npm install --save-dev helmet
npm install --save-dev rate-limit-redis

# Run automated scans
npm run test:security

# OWASP ZAP scan
zap-cli quick-scan --self-contained http://localhost:3000

# npm audit (dependencies)
npm audit --production

# Snyk scan (vulnerabilities)
snyk test
```

**Manual Testing:**
- [ ] External penetration test (hire consultant)
- [ ] Code review by security expert
- [ ] Threat modeling session
- [ ] Social engineering test (phishing simulation)

#### Deliverables - Week 3
- [ ] Data masking implemented and tested
- [ ] Security testing completed
- [ ] Penetration test report reviewed
- [ ] All P0/P1 vulnerabilities fixed
- [ ] Security documentation complete
- [ ] Sprint 1 demo to stakeholders

---

### Sprint 1 Review & Retrospective

#### Demo (End of Week 3)
**Audience:** Product Owner, Stakeholders, Security Team

**Demo Script:**
1. Show RBAC in action
   - Login as CFO → See all financial reports
   - Login as Branch Manager → Cannot see financial costs
   - Login as Viewer → Only see executive dashboard

2. Show audit logging
   - Access several reports
   - Show audit log viewer with entries
   - Export audit log to CSV

3. Show data masking
   - CFO sees: "$1,234,567 total cost"
   - Branch Manager sees: "*** total cost" (masked)
   - Show percentage/trend data still visible

4. Show security improvements
   - Demonstrate HTTPS enforcement
   - Show rate limiting (via Postman)
   - Review security test results

#### Success Metrics - Sprint 1
- [ ] All 8 user stories completed
- [ ] Zero critical security vulnerabilities
- [ ] All tests passing (unit, integration, security)
- [ ] Demo successful with stakeholder approval
- [ ] Documentation complete

#### Retrospective Questions
- What went well?
- What could be improved?
- What blockers did we face?
- What should we do differently in Sprint 2?

---

## Sprint 2: AI & Data Excellence (Weeks 4-6)

### Sprint Goal
Build AI Analytics Dashboard to track 381 capabilities and complete remaining data sources (footfall, queue, SLA).

### Theme: "Measure What Matters"

---

### Week 4: AI Analytics Dashboard - Backend

#### User Stories

**Story 4.1: Design AI Metrics Database Schema**
```
As a Data Architect
I want to design schema for tracking AI capability metrics
So that we can measure performance of all 381 capabilities

Acceptance Criteria:
- [ ] Schema supports 381 capability types
- [ ] Tracks: accuracy, false positives, inference time, volume
- [ ] Time-series data for trend analysis
- [ ] Aggregation-friendly for reports
- [ ] Tested with sample data (1M+ rows)

Story Points: 5
Priority: P0 (Critical)
Dependencies: None
```

**Story 4.2: Implement AI Metrics Collection**
```
As a Backend Developer
I want to collect AI metrics from analytics engine
So that performance data flows into MIS system

Acceptance Criteria:
- [ ] Metrics collected from analytics engine events
- [ ] Batch insertion (performance optimization)
- [ ] Error handling for metric failures
- [ ] Support for all 15 capability domains
- [ ] Real-time and historical queries

Story Points: 8
Priority: P0 (Critical)
Dependencies: Story 4.1
```

**Story 4.3: Create AI Analytics API**
```
As a Backend Developer
I want to create API endpoint for AI analytics dashboard
So that frontend can display AI performance metrics

Acceptance Criteria:
- [ ] GET /api/reports/ai-analytics
- [ ] Filter by: capability type, date range, camera, branch
- [ ] Returns: accuracy, FP rate, volume, inference time
- [ ] Includes trend data (30-day comparison)
- [ ] Response time < 2 seconds

Story Points: 8
Priority: P0 (Critical)
Dependencies: Story 4.2
```

#### Technical Implementation

**Database Schema:**
```sql
-- AI capability metrics table
CREATE TABLE ai_capability_metrics (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  capability_type VARCHAR(100) NOT NULL, -- e.g., 'person-detection', 'anpr', 'face-recognition'
  capability_domain VARCHAR(50) NOT NULL, -- e.g., 'human', 'vehicle', 'face', 'safety'
  camera_id UUID,
  branch_id UUID,
  
  -- Performance metrics
  detections_count INT DEFAULT 0,
  true_positives INT DEFAULT 0,
  false_positives INT DEFAULT 0,
  false_negatives INT DEFAULT 0,
  accuracy_percent NUMERIC(5,2),
  
  -- Timing metrics
  avg_inference_ms NUMERIC(10,2),
  min_inference_ms NUMERIC(10,2),
  max_inference_ms NUMERIC(10,2),
  
  -- Business impact
  incidents_prevented INT DEFAULT 0,
  investigation_time_saved_minutes INT DEFAULT 0,
  estimated_cost_avoided NUMERIC(12,2),
  
  -- Metadata
  measured_at TIMESTAMP DEFAULT NOW(),
  measurement_period_hours INT DEFAULT 24,
  
  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_camera FOREIGN KEY (camera_id) REFERENCES cameras(id),
  CONSTRAINT fk_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- Indexes
CREATE INDEX idx_ai_metrics_capability ON ai_capability_metrics(tenant_id, capability_type, measured_at DESC);
CREATE INDEX idx_ai_metrics_domain ON ai_capability_metrics(tenant_id, capability_domain, measured_at DESC);
CREATE INDEX idx_ai_metrics_camera ON ai_capability_metrics(camera_id, measured_at DESC);
CREATE INDEX idx_ai_metrics_branch ON ai_capability_metrics(branch_id, measured_at DESC);

-- Materialized view for faster dashboard queries
CREATE MATERIALIZED VIEW ai_analytics_summary AS
SELECT 
  tenant_id,
  capability_domain,
  capability_type,
  DATE_TRUNC('day', measured_at) as date,
  AVG(accuracy_percent) as avg_accuracy,
  AVG(avg_inference_ms) as avg_inference_time,
  SUM(detections_count) as total_detections,
  SUM(false_positives) as total_false_positives,
  SUM(incidents_prevented) as total_incidents_prevented,
  SUM(estimated_cost_avoided) as total_cost_avoided
FROM ai_capability_metrics
GROUP BY tenant_id, capability_domain, capability_type, DATE_TRUNC('day', measured_at);

CREATE INDEX idx_ai_summary_lookup ON ai_analytics_summary(tenant_id, date DESC);
```

**AI Analytics API:**
```typescript
// src/routes/reports/ai-analytics.routes.ts

import express from 'express';
import { pool } from '../../database.js';

const router = express.Router();

router.get('/ai-analytics',
  authenticateToken,
  requirePermission('report:ai-analytics', 'view'),
  auditLog('ai-analytics'),
  async (req, res) => {
    try {
      const {
        capability_domain, // human, vehicle, face, safety, etc.
        capability_type,   // person-detection, anpr, etc.
        start_date,
        end_date,
        branch_id,
        camera_id,
        group_by = 'domain' // domain, type, branch, camera
      } = req.query;
      
      const tenantId = req.user.tenant_id;
      
      // Build query based on grouping
      let query = `
        SELECT 
          capability_domain,
          capability_type,
          COUNT(DISTINCT camera_id) as cameras_count,
          AVG(accuracy_percent) as avg_accuracy,
          SUM(detections_count) as total_detections,
          SUM(false_positives) as total_false_positives,
          CASE 
            WHEN SUM(detections_count) > 0 
            THEN (SUM(false_positives)::NUMERIC / SUM(detections_count) * 100)
            ELSE 0
          END as false_positive_rate,
          AVG(avg_inference_ms) as avg_inference_time,
          SUM(incidents_prevented) as incidents_prevented,
          SUM(estimated_cost_avoided) as cost_avoided
        FROM ai_capability_metrics
        WHERE tenant_id = $1
      `;
      
      const params: any[] = [tenantId];
      let paramIndex = 2;
      
      // Add filters
      if (capability_domain) {
        query += ` AND capability_domain = $${paramIndex++}`;
        params.push(capability_domain);
      }
      
      if (capability_type) {
        query += ` AND capability_type = $${paramIndex++}`;
        params.push(capability_type);
      }
      
      if (start_date) {
        query += ` AND measured_at >= $${paramIndex++}`;
        params.push(start_date);
      }
      
      if (end_date) {
        query += ` AND measured_at <= $${paramIndex++}`;
        params.push(end_date);
      }
      
      if (branch_id) {
        query += ` AND branch_id = $${paramIndex++}`;
        params.push(branch_id);
      }
      
      if (camera_id) {
        query += ` AND camera_id = $${paramIndex++}`;
        params.push(camera_id);
      }
      
      // Group by clause
      if (group_by === 'domain') {
        query += ' GROUP BY capability_domain ORDER BY capability_domain';
      } else if (group_by === 'type') {
        query += ' GROUP BY capability_domain, capability_type ORDER BY capability_domain, capability_type';
      }
      
      const result = await pool.query(query, params);
      
      // Calculate totals
      const totals = {
        total_capabilities: result.rows.length,
        total_detections: result.rows.reduce((sum, row) => sum + Number(row.total_detections), 0),
        avg_accuracy: result.rows.reduce((sum, row) => sum + Number(row.avg_accuracy), 0) / result.rows.length,
        avg_fp_rate: result.rows.reduce((sum, row) => sum + Number(row.false_positive_rate), 0) / result.rows.length,
        incidents_prevented: result.rows.reduce((sum, row) => sum + Number(row.incidents_prevented), 0),
        cost_avoided: result.rows.reduce((sum, row) => sum + Number(row.cost_avoided), 0)
      };
      
      // Get trend data (compare to previous 30 days)
      const trendQuery = `
        SELECT 
          DATE_TRUNC('day', measured_at) as date,
          AVG(accuracy_percent) as avg_accuracy,
          SUM(detections_count) as detections,
          SUM(false_positives) as false_positives
        FROM ai_capability_metrics
        WHERE tenant_id = $1
          AND measured_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', measured_at)
        ORDER BY date
      `;
      
      const trendResult = await pool.query(trendQuery, [tenantId]);
      
      res.json({
        summary: totals,
        breakdown: result.rows,
        trend: trendResult.rows,
        filter: {
          capability_domain,
          capability_type,
          start_date,
          end_date,
          group_by
        }
      });
      
    } catch (error) {
      console.error('AI analytics error:', error);
      res.status(500).json({ error: 'Failed to generate AI analytics report' });
    }
  }
);

// Get capability list (all 381)
router.get('/ai-analytics/capabilities',
  authenticateToken,
  async (req, res) => {
    const result = await pool.query(`
      SELECT DISTINCT 
        capability_domain,
        capability_type,
        COUNT(*) OVER (PARTITION BY capability_domain) as domain_count
      FROM ai_capability_metrics
      WHERE tenant_id = $1
      ORDER BY capability_domain, capability_type
    `, [req.user.tenant_id]);
    
    // Group by domain
    const grouped: any = {};
    result.rows.forEach(row => {
      if (!grouped[row.capability_domain]) {
        grouped[row.capability_domain] = {
          domain: row.capability_domain,
          count: row.domain_count,
          capabilities: []
        };
      }
      grouped[row.capability_domain].capabilities.push(row.capability_type);
    });
    
    res.json(Object.values(grouped));
  }
);

export default router;
```

#### Deliverables - Week 4
- [ ] AI metrics database schema created
- [ ] Metrics collection from analytics engine
- [ ] AI analytics API implemented
- [ ] Unit tests for API
- [ ] Performance tested with 1M+ rows
- [ ] API documentation

---

### Week 5: AI Analytics Dashboard - Frontend

#### User Stories

**Story 5.1: Create AI Analytics Dashboard Page**
```
As an Executive
I want to see AI performance dashboard
So that I understand ROI on AI investments

Acceptance Criteria:
- [ ] Dashboard shows summary KPIs
- [ ] Breakdown by 15 capability domains
- [ ] Drill-down to 381 individual capabilities
- [ ] Charts: accuracy trend, detection volume, FP rate
- [ ] Export to PDF/Excel

Story Points: 13
Priority: P0 (Critical)
Dependencies: Week 4 backend complete
```

(Continuing in next message due to length...)

#### Deliverables - Sprint 2 (Summary)
- [ ] AI Analytics Dashboard (backend + frontend)
- [ ] Footfall tracking integration
- [ ] Queue analysis (wait times)
- [ ] SLA configuration system
- [ ] All metrics integrated with MIS Unified Report
- [ ] Sprint 2 demo successful

---

## Sprint 3: Intelligence & Integration (Weeks 7-9)

### Sprint Goal
Implement predictive forecasting and integrate with ERP/HR systems.

### Theme: "Predict & Connect"

(Full Sprint 3 details available - continuing in next section...)

---

## Risk Management

### High Risks

**Risk 1: Vendor API Access Delays**
- **Impact:** High - Could delay Sprint 3 integrations
- **Likelihood:** Medium
- **Mitigation:** 
  - Contact ERP/HR vendors in Sprint 1
  - Request API credentials early
  - Have mock integration ready as fallback
  - Prioritize one integration over the other

**Risk 2: Security Vulnerabilities Found**
- **Impact:** Critical - Could block deployment
- **Likelihood:** Low
- **Mitigation:**
  - Hire external security consultant
  - Conduct penetration test in Week 3
  - Fix all P0/P1 issues before Sprint 2
  - Budget 1 week contingency for fixes

**Risk 3: Performance Degradation**
- **Impact:** Medium - Could affect user experience
- **Likelihood:** Low
- **Mitigation:**
  - Monitor query performance weekly
  - Use Redis caching
  - Implement database partitioning if needed
  - Load test after each sprint

### Medium Risks

**Risk 4: Scope Creep**
- **Impact:** Medium - Could delay delivery
- **Likelihood:** Medium
- **Mitigation:**
  - Strict sprint planning
  - Product Owner approval for any additions
  - Document "Phase 4" wishlist separately
  - Weekly progress reviews

**Risk 5: Team Capacity**
- **Impact:** Medium - Could slow development
- **Likelihood:** Low
- **Mitigation:**
  - Buffer 5% contingency in budget
  - Cross-train team members
  - Have backup contractor on standby
  - Reduce scope if necessary

---

## Quality Assurance Plan

### Code Quality Standards
- [ ] TypeScript strict mode enabled
- [ ] ESLint configured and enforced
- [ ] Prettier for code formatting
- [ ] 80%+ code coverage (unit tests)
- [ ] No critical Sonar issues
- [ ] Peer code review required

### Testing Strategy

**Unit Tests (Jest):**
- Target: 80% coverage
- All business logic functions
- All utility functions
- Middleware functions

**Integration Tests:**
- API endpoint tests
- Database transaction tests
- End-to-end report generation

**Security Tests:**
- OWASP ZAP automated scans
- Manual penetration testing
- Dependency vulnerability scans (npm audit, Snyk)

**Performance Tests:**
- Load testing (100 concurrent users)
- Database query performance
- Report generation time
- Export file size limits

**User Acceptance Testing (UAT):**
- 5-10 pilot users per sprint
- Feedback forms
- Bug reporting process
- Acceptance criteria validation

---

## Deployment Strategy

### Environments

**Development:**
- Continuous deployment from `develop` branch
- Latest code always deployed
- Used for developer testing

**Staging:**
- Deployed from `main` branch after PR approval
- Production-like data (anonymized)
- Used for QA and UAT
- Deployed at end of each sprint

**Production:**
- Deployed manually with approval
- Blue-green deployment strategy
- Rollback plan ready
- Deployed after Sprint 1, 2, and 3

### Deployment Checklist

**Pre-Deployment:**
- [ ] All tests passing (unit, integration, security)
- [ ] Code review completed
- [ ] Database migration tested on staging
- [ ] Performance benchmarks met
- [ ] Documentation updated
- [ ] Rollback plan documented
- [ ] Stakeholder approval received

**Deployment Steps:**
1. [ ] Tag release in Git (e.g., v3.1.0)
2. [ ] Run database migration
3. [ ] Deploy backend (blue-green)
4. [ ] Deploy frontend
5. [ ] Smoke tests on production
6. [ ] Monitor for 1 hour
7. [ ] Announce to users

**Post-Deployment:**
- [ ] Monitor error rates
- [ ] Monitor performance metrics
- [ ] Collect user feedback
- [ ] Hot-fix process ready
- [ ] Retrospective scheduled

---

## Success Metrics

### Sprint-Level Metrics

**Sprint 1:**
- [ ] RBAC implemented (8 roles)
- [ ] 100% report access logged
- [ ] Zero critical security vulnerabilities
- [ ] Data masking working for all roles

**Sprint 2:**
- [ ] AI dashboard tracking 381 capabilities
- [ ] Footfall, queue, SLA data sources complete
- [ ] < 3 second report load time maintained
- [ ] 90%+ user satisfaction (pilot users)

**Sprint 3:**
- [ ] Predictive forecasting 30/60/90-day
- [ ] At least 1 integration live (ERP or HR)
- [ ] All Phase 3 features deployed
- [ ] Documentation 100% complete

### Overall Phase 3 Metrics (90-Day)

**Adoption:**
- [ ] 80%+ executives use AI dashboard monthly
- [ ] 50+ predictive forecasts viewed
- [ ] 100+ audit log queries run
- [ ] Zero security incidents

**Performance:**
- [ ] Average load time < 3 seconds
- [ ] 99.9% uptime
- [ ] Zero timeout errors
- [ ] < 1% error rate

**Business Impact:**
- [ ] $50K+ cost savings identified (AI optimization)
- [ ] 15 compliance issues caught via audit logs
- [ ] 10 predictive warnings acted upon
- [ ] ERP integration saves 20 hours/month

---

## Communication Plan

### Weekly Status Updates (Email)
- **Audience:** Product Owner, Stakeholders
- **Content:** Progress, risks, blockers, next week plan
- **Format:** Bullet points, dashboard screenshots
- **Sent:** Every Friday 4pm

### Sprint Reviews (Demo)
- **Audience:** All stakeholders, users
- **Duration:** 30 minutes
- **Schedule:** End of Week 3, 6, 9
- **Format:** Live demo + Q&A

### Sprint Retrospectives (Internal)
- **Audience:** Development team only
- **Duration:** 1 hour
- **Schedule:** End of each sprint
- **Format:** What went well, what didn't, action items

### Daily Stand-ups (Team)
- **Audience:** Development team
- **Duration:** 15 minutes
- **Schedule:** Every morning 9:30am
- **Format:** Yesterday, today, blockers

---

## Budget Tracking

### Budget Allocation by Sprint

| Sprint | Labor | Infrastructure | External | Total |
|--------|-------|----------------|----------|-------|
| Sprint 1 | $22,500 | $2,000 | $5,000 | $29,500 |
| Sprint 2 | $22,500 | $6,500 | $0 | $29,000 |
| Sprint 3 | $22,500 | $5,000 | $0 | $27,500 |
| **Total** | **$67,500** | **$13,500** | **$5,000** | **$95,000** |

### Monthly Burn Rate
- **Target:** $31,667/month (even burn)
- **Actual:** Track weekly
- **Variance Alert:** ±10% triggers review

### Budget Contingency
- **Reserve:** $2,250 (2.4% of total)
- **Use Cases:** Security fixes, vendor delays, scope adjustments
- **Approval:** Product Owner required

---

## Documentation Deliverables

### Technical Documentation
- [ ] API Reference (Phase 3 endpoints)
- [ ] Database Schema Updates
- [ ] Security Architecture
- [ ] Integration Guides (ERP, HR)
- [ ] Deployment Procedures

### User Documentation
- [ ] AI Analytics Dashboard Guide
- [ ] Audit Log Viewer Guide
- [ ] Predictive Forecasting Guide
- [ ] Administrator Manual (RBAC, security)
- [ ] Quick Reference Cards

### Process Documentation
- [ ] Security Incident Response
- [ ] Data Breach Procedures
- [ ] Backup and Recovery
- [ ] Disaster Recovery Plan
- [ ] Compliance Audit Checklist

---

## Final Deliverables - Phase 3

### Code Deliverables
- [ ] Backend API (5 new endpoints)
- [ ] Frontend components (AI dashboard, audit viewer)
- [ ] Database migrations (5 new tables)
- [ ] Security middleware (RBAC, audit, masking)
- [ ] Integration connectors (ERP, HR)

### Testing Deliverables
- [ ] 200+ unit tests
- [ ] 50+ integration tests
- [ ] Security test report
- [ ] Performance test report
- [ ] UAT sign-off documents

### Documentation Deliverables
- [ ] Technical specifications (50+ pages)
- [ ] User guides (75+ pages)
- [ ] API documentation (25+ pages)
- [ ] Training materials (presentations, videos)
- [ ] Compliance documentation

### Deployment Deliverables
- [ ] Production deployment successful
- [ ] Rollback plan tested
- [ ] Monitoring dashboards configured
- [ ] Alert rules established
- [ ] Support runbook created

---

## Sign-Off & Approval

### Sprint Approvals

**Sprint 1 (Security Foundation):**
- [ ] Product Owner: ________________  Date: _______
- [ ] Security Lead: ________________  Date: _______
- [ ] CTO: _________________________  Date: _______

**Sprint 2 (AI & Data):**
- [ ] Product Owner: ________________  Date: _______
- [ ] Data Architect: _______________  Date: _______
- [ ] CTO: _________________________  Date: _______

**Sprint 3 (Intelligence & Integration):**
- [ ] Product Owner: ________________  Date: _______
- [ ] Enterprise Architect: _________  Date: _______
- [ ] CTO: _________________________  Date: _______

### Final Phase 3 Approval

- [ ] All deliverables complete
- [ ] All tests passing
- [ ] All documentation delivered
- [ ] User training completed
- [ ] Production deployment successful

**Approved By:**
- Product Owner: __________________  Date: _______
- CTO: ___________________________  Date: _______
- CFO (Budget): __________________  Date: _______

---

**Plan Version:** 1.0  
**Last Updated:** September 17, 2026  
**Next Review:** After Sprint 1 completion

**This plan is a living document and will be updated based on sprint retrospectives and changing priorities.**
