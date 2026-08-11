# Security Evidence System - Migration Checklist

## Quick Start

This checklist helps you migrate from the old boolean-based security system to the new evidence-based system.

---

## Phase 0: Understanding (15 minutes)

- [ ] Read the [SECURITY_EVIDENCE_FIX_SUMMARY.md](../../../SECURITY_EVIDENCE_FIX_SUMMARY.md) (5 min)
- [ ] Review the [Problem vs Solution](./README.md#the-problem-we-solved) section (5 min)
- [ ] Understand the core principle: **missing evidence ≠ healthy** (5 min)

---

## Phase 1: Backend Integration (2-4 hours)

### 1.1 Install Dependencies (5 minutes)

```bash
# No new dependencies needed - uses existing TypeScript types
npm install  # Ensure all existing deps are installed
```

### 1.2 Apply Database Migration (10 minutes)

```bash
# Review migration
cat src/security/evidence/migrations/001_security_evidence_tables.sql

# Apply to development database
npm run migrate

# Or manually:
psql -d your_database -f src/security/evidence/migrations/001_security_evidence_tables.sql
```

Verify tables created:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('security_control_evidence', 'security_control_transition');
```

### 1.3 Update Environment Variables (15 minutes)

Add to `.env`:

```bash
# Environment
NODE_ENV=development  # or 'production'

# Ransomware Protection (optional - will show as UNKNOWN if not configured)
EDR_API_ENDPOINT=https://edr-console.company.com
THREAT_DETECTION_API=https://threat-detection.company.com

# Tamper Detection (optional - will show as UNKNOWN if not configured)
EDGE_AGENT_API=https://edge-agents.company.com
TAMPER_SENSOR_API=https://tamper-sensors.company.com
```

**Note:** It's OK to not have these configured initially. Collectors will correctly return `UNKNOWN` status.

### 1.4 Remove Old Boolean Code (30 minutes)

**Search and destroy:**

```bash
# Find dangerous boolean placeholders
grep -r "secureBoot: true" src/
grep -r "ransomware: true" src/
grep -r "tamper: true" src/
```

**Example fix:**

```typescript
// ❌ BEFORE (src/routes/security-dashboard.routes.ts)
collectors: {
  secureBoot: true, // Placeholder
  ransomware: true, // Placeholder
  tamper: true, // Placeholder
}

// ✅ AFTER - ALREADY FIXED IN security-dashboard.routes.ts
// Uses evidence-based collectors
```

The dashboard routes are **already fixed** in this implementation.

### 1.5 Run Tests (15 minutes)

```bash
# Run evidence system tests
npm test src/security/evidence/__tests__/security-evidence.test.ts

# Run posture service tests
npm test src/security/services/__tests__/security-posture.test.ts

# Run all security tests
npm test -- --testPathPattern=security
```

Expected: All tests pass ✅

### 1.6 Enable ESLint Rules (10 minutes)

Update `.eslintrc.json`:

```json
{
  "extends": [
    "./src/security/evidence/.eslintrc.security.json"
  ]
}
```

Run linter:

```bash
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix
```

Expected: No new security-related linting errors

### 1.7 Add Startup Validation (30 minutes)

Update `src/index.ts` or your main entry point:

```typescript
import { validateSecurityOnStartup } from './security/evidence/startup-validation.js';

async function main() {
  console.log('Starting application...');

  // CRITICAL: Validate security configuration before starting server
  try {
    await validateSecurityOnStartup({
      environment: process.env.NODE_ENV as any,
      strictMode: process.env.NODE_ENV === 'production',
      failOnError: process.env.NODE_ENV === 'production',
    });
  } catch (error) {
    console.error('Security validation failed:', error);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }

  // Continue with normal startup...
  const app = await createApp();
  await app.listen({ port: 3000 });
}

main();
```

### 1.8 Test Local Startup (15 minutes)

```bash
# Start application
npm run dev

# Should see:
# 🔒 Validating security evidence system...
# ✅ Security validation passed (X/4 capabilities active)
```

Check the validation report output.

### 1.9 Test API Endpoints (15 minutes)

```bash
# Get security posture
curl http://localhost:3000/api/control/v1/security/posture | jq

# Get collector status
curl http://localhost:3000/api/control/v1/security/collectors/status | jq
```

**Verify:**
- [ ] No boolean `true` placeholders in response
- [ ] Evidence has `state`, `available`, `source` fields
- [ ] UNKNOWN controls show proper `reason` field
- [ ] Evidence coverage metric present

---

## Phase 2: Frontend Integration (3-6 hours)

### 2.1 Read Frontend Guide (30 minutes)

- [ ] Read [FRONTEND_INTEGRATION_GUIDE.md](./FRONTEND_INTEGRATION_GUIDE.md)
- [ ] Understand three-state UI pattern (HEALTHY/UNHEALTHY/UNKNOWN)
- [ ] Review example components

### 2.2 Update Type Definitions (30 minutes)

Create or update `src/types/security-evidence.ts` (frontend):

```typescript
export type SecurityState = 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN';
export type EvidenceSource = 'LIVE' | 'SIMULATED' | 'UNAVAILABLE';

export interface SecurityEvidence<T = any> {
  state: SecurityState;
  available: boolean;
  source: EvidenceSource;
  confidence: number;
  observedAt: string | null;
  reason: string;
  evidence?: T;
}

export interface SecurityPostureSummary {
  overallState: SecurityState;
  controlCount: number;
  healthyControls: number;
  unhealthyControls: number;
  unknownControls: number;
  evidenceCoverage: number;
  evaluatedAt: string;
}
```

### 2.3 Update API Client (1 hour)

```typescript
// api/security.ts
export async function getSecurityPosture() {
  const response = await fetch('/api/control/v1/security/posture');
  const data = await response.json();
  return data;
}
```

### 2.4 Create UI Components (2-3 hours)

**Priority components:**

1. **SecurityStatusBadge** - Shows HEALTHY/UNHEALTHY/UNKNOWN (30 min)
2. **SecurityControlCard** - Displays individual control status (45 min)
3. **EvidenceCoverageWidget** - Shows coverage metric (30 min)
4. **SecurityPostureOverview** - Overall dashboard (1 hour)

See [FRONTEND_INTEGRATION_GUIDE.md](./FRONTEND_INTEGRATION_GUIDE.md) for examples.

### 2.5 Update Dashboard Pages (1 hour)

Replace old boolean-based logic:

```typescript
// ❌ OLD
const isSecure = data.collectors.secureBoot;
if (isSecure) return <GreenCheckmark />;

// ✅ NEW
switch (data.deviceSecurity.controls.secureBoot.state) {
  case 'HEALTHY': return <HealthyBadge />;
  case 'UNHEALTHY': return <UnhealthyBadge />;
  case 'UNKNOWN': return <UnknownBadge />;
}
```

### 2.6 Add Evidence Coverage Display (30 minutes)

```tsx
<EvidenceCoverageWidget 
  coverage={data.deviceSecurity.overall.evidenceCoverage}
/>
```

### 2.7 Test UI (1 hour)

Manual testing:
- [ ] HEALTHY state shows green indicator
- [ ] UNHEALTHY state shows red indicator  
- [ ] UNKNOWN state shows gray/neutral indicator
- [ ] Never shows green for UNKNOWN
- [ ] Evidence coverage displayed
- [ ] Stale evidence warnings shown

---

## Phase 3: Production Deployment (2-4 hours)

### 3.1 Staging Deployment (1 hour)

```bash
# Build
npm run build

# Run validation
NODE_ENV=production npm run validate:security

# Deploy to staging
npm run deploy:staging
```

### 3.2 Staging Verification (30 minutes)

- [ ] Startup validation passes
- [ ] No simulated data in production
- [ ] Evidence coverage acceptable (>50%)
- [ ] API responses correct format
- [ ] Dashboard displays three states correctly

### 3.3 Configure Production Environment (30 minutes)

Set environment variables in production:

```bash
NODE_ENV=production
EDR_API_ENDPOINT=<production-edr-endpoint>
EDGE_AGENT_API=<production-edge-agent-endpoint>
```

### 3.4 Production Deployment (1 hour)

```bash
# Final validation
NODE_ENV=production npm run validate:security

# Deploy
npm run deploy:production

# Monitor logs
npm run logs:production
```

### 3.5 Post-Deployment Verification (30 minutes)

- [ ] Application started successfully
- [ ] Startup validation passed
- [ ] No security-related errors in logs
- [ ] Evidence collection working
- [ ] Dashboard accessible
- [ ] Health check endpoint responding

### 3.6 Smoke Tests (30 minutes)

```bash
# Production API test
curl https://your-app.com/api/control/v1/security/posture

# Health check
curl https://your-app.com/health
```

**Verify:**
- [ ] No `true` placeholders
- [ ] Proper evidence structure
- [ ] Coverage metric present
- [ ] State transitions logged

---

## Phase 4: Monitoring Setup (1-2 hours)

### 4.1 Configure Alerts (30 minutes)

**Prometheus/Grafana:**

```yaml
# alerts.yml
groups:
  - name: security_evidence
    rules:
      - alert: LowEvidenceCoverage
        expr: security_evidence_coverage < 0.5
        for: 10m
        annotations:
          summary: "Security evidence coverage below 50%"
          
      - alert: SecurityDegradation
        expr: increase(security_transitions{type="degradation"}[5m]) > 0
        annotations:
          summary: "Security control degradation detected"
```

### 4.2 Dashboard Setup (30 minutes)

Create Grafana dashboard with:
- Evidence coverage gauge
- Active capabilities count
- State transition timeline
- Collector health status

### 4.3 Log Monitoring (30 minutes)

Set up log aggregation for:
- Startup validation results
- Evidence collection failures
- State transitions
- Coverage drops

---

## Phase 5: Documentation & Training (1-2 hours)

### 5.1 Update Documentation (30 minutes)

- [ ] Add environment variable documentation
- [ ] Update deployment guide
- [ ] Document new API responses
- [ ] Update runbooks

### 5.2 Team Training (1 hour)

Share with team:
- [ ] Core principle: missing evidence ≠ healthy
- [ ] How to add new collectors
- [ ] How to interpret evidence states
- [ ] Troubleshooting guide

---

## Verification Checklist

### Backend ✅

- [ ] No `return true` in security code
- [ ] All collectors return `SecurityEvidence<T>`
- [ ] Database migration applied
- [ ] Environment variables configured
- [ ] Startup validation enabled
- [ ] ESLint rules active
- [ ] Tests passing
- [ ] API returns evidence structure

### Frontend ✅

- [ ] Three-state UI components
- [ ] Evidence coverage displayed
- [ ] No boolean-based logic
- [ ] UNKNOWN state handled properly
- [ ] Stale evidence indicated
- [ ] Visual regression tests passing

### Production ✅

- [ ] Startup validation passes
- [ ] No simulated data
- [ ] Evidence coverage >50%
- [ ] State transitions logged
- [ ] Alerts configured
- [ ] Monitoring dashboards active
- [ ] Health checks responding

---

## Rollback Plan

If issues arise:

### 1. Disable Evidence System

```typescript
// Emergency rollback - use with caution
const USE_LEGACY_SECURITY = process.env.USE_LEGACY_SECURITY === 'true';

if (USE_LEGACY_SECURITY) {
  // Return old format (but acknowledge it's unreliable)
  return { collectors: { secureBoot: null, ransomware: null, tamper: null } };
}
```

### 2. Roll Back Deployment

```bash
npm run deploy:rollback
```

### 3. Investigate Issues

Check:
- Startup validation logs
- Collector error messages
- Environment configuration
- Database connectivity

---

## Common Issues

### Issue: "Security validation failed"

**Cause:** Missing configuration or collector errors

**Fix:**
1. Review validation report
2. Check environment variables
3. Verify collector endpoints reachable
4. Check database migration applied

### Issue: "All controls showing UNKNOWN"

**Cause:** Collectors not configured

**Fix:**
1. Set required environment variables
2. Verify endpoints accessible
3. Check collector health status
4. Review startup validation warnings

### Issue: "Evidence coverage too low"

**Cause:** Not all collectors available

**Actions:**
1. Configure missing environment variables
2. Deploy required collector agents
3. Verify platform support
4. Adjust coverage threshold if intentional

---

## Timeline Estimates

- **Backend only:** 2-4 hours
- **Backend + Frontend:** 5-10 hours
- **Full deployment + monitoring:** 8-15 hours
- **Team training:** +1-2 hours

---

## Success Criteria

✅ No boolean placeholders in code  
✅ Evidence-based API responses  
✅ Three-state UI implementation  
✅ Startup validation passing  
✅ Evidence coverage >50%  
✅ State transitions logged  
✅ Production deployment successful  
✅ Monitoring active  
✅ Team trained  

---

## Support

Questions? Review:
1. [README.md](./README.md) - Overview and usage
2. [SECURITY_EVIDENCE_IMPLEMENTATION.md](./SECURITY_EVIDENCE_IMPLEMENTATION.md) - Technical details
3. [FRONTEND_INTEGRATION_GUIDE.md](./FRONTEND_INTEGRATION_GUIDE.md) - UI patterns
4. [STARTUP_INTEGRATION_EXAMPLE.md](./STARTUP_INTEGRATION_EXAMPLE.md) - Deployment examples

---

## Completion

Once all checkboxes are complete:

🎉 **Congratulations!** Your security dashboard now uses evidence-based status that can be trusted. The dangerous boolean placeholder bug has been eliminated.

**Next steps:**
- Monitor evidence coverage
- Review state transitions
- Optimize collector performance
- Add new security capabilities as needed
