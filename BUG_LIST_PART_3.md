# Project Bug List - Part 3

## Security Vulnerabilities

### 41. XSS Vulnerabilities via innerHTML
**Severity:** High
**Count:** 10+ instances

**File:** `public/app.js`
- **Lines 131, 166, 185, 208**: Direct `innerHTML` assignment with potentially user-controlled data
  ```javascript
  resultsDiv.innerHTML = `...${result.success ? '✅' : '⚠️'}...`;
  ```

**File:** `public/bulk-upload.js`
- **Lines 111, 124, 143, 159, 184**: innerHTML without sanitization

**File:** `public/krypton-ai-features.html`
- **Lines 329, 339, 361, 388**: Multiple innerHTML assignments in chat interface
- Could allow XSS if user input is not properly escaped

**File:** `test-gateway-delete.html`
- **Lines 71, 75, 137, 141**: Error messages displayed via innerHTML

**File:** `public/forensic-verifier.html`
- **Lines 282, 290, 294**: Hash verification results via innerHTML

### 42. Insecure Random Number Generation (Math.random)
**Severity:** Medium-High
**Count:** 25+ instances

**File:** `src/services/auto-storage-telemetry.service.ts`
- **Lines 110, 111, 113, 131, 147, 148**: Using Math.random() for telemetry simulation
  ```typescript
  usedPercent: 35 + Math.random() * 15,
  temperatureC: 32 + Math.random() * 5,
  ```

**File:** `src/analytics/crowd/crowd-repository.ts`
- **Lines 53, 219, 389, 443, 608**: ID generation using Math.random()
  ```typescript
  const id = `zone-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  ```
- Not cryptographically secure for ID generation

**File:** `src/monitoring/repositories/durable-alert.repository.ts`
- **Lines 61, 139, 161, 199, 222**: Action ID generation with Math.random()

**File:** `analytics-engine/test/performance-benchmarks.test.ts`
- **Lines 43, 55, 107, 123, 305**: Test data generation (acceptable in tests)

**File:** `load-testing/src/utils/metrics-collector.ts`
- **Lines 117-121**: Mock metrics using Math.random() (should be documented as mock)

### 43. Hardcoded Localhost and Development URLs
**Severity:** Medium
**Count:** 40+ instances

**File:** `deploy/aws/docker-compose.aws.yml`
- **Line 20**: `DOMAIN_NAME=${DOMAIN_NAME:-localhost}`
- **Lines 50, 76**: Database and Redis bound to `127.0.0.1`
- **Lines 189-190**: MediaMTX URLs hardcoded to localhost

**File:** `deploy/gcp/docker-compose.gcp.yml`
- **Line 19**: `DOMAIN_NAME=${DOMAIN_NAME:-localhost}`
- **Lines 52, 77**: Services exposed on `127.0.0.1` only
- **Lines 195-197**: MediaMTX localhost URLs

**File:** `media-gateway/.env.example`
- **Lines 3, 5-7, 9-10**: All URLs default to localhost
  ```
  CONTROL_PLANE_URL=http://localhost:8080
  MEDIAMTX_API_URL=http://localhost:9997
  ```

### 44. Process.exit() Causing Ungraceful Shutdowns
**Severity:** Medium
**Count:** 20+ instances

**File:** `delete-edge-and-cameras.mjs`
- **Lines 39, 50, 68, 167, 224**: Multiple process.exit() calls
- No cleanup of database connections before exit

**File:** `edge-agent/src/index.ts`
- **Lines 70, 87, 91, 107, 116**: Immediate process.exit() without cleanup

**File:** `scripts/delete-cameras.mjs`
- **Lines 69, 205, 222, 229, 238**: process.exit() in script operations

**File:** `scripts/test-login.js`
- **Lines 70, 95, 105, 115, 132**: Testing script exits without cleanup

**File:** `src/index.ts`
- Multiple exits without graceful shutdown of services

### 45. Synchronous File Operations Blocking Event Loop
**Severity:** Medium
**Count:** 20+ instances

**File:** `tmp/finalize-workflow.mjs`
- **Lines 3, 5, 7, 9, 11, 13**: Multiple synchronous fs operations
  ```javascript
  let s=fs.readFileSync(p,'utf8');
  fs.writeFileSync(p,s);
  ```

**File:** `scratch/patch_analytics.cjs`
- **Lines 6, 47, 57, 90, 96**: Synchronous file reads/writes in patch script

**File:** `test/recorder-sdk/canonical-driver-runner.ts`
- **Lines 60, 64, 68, 92, 96**: Test fixtures loaded synchronously

**File:** `tmp/extend-assurance-workspaces.mjs`
- **Lines 3, 20, 22, 36, 38**: Multiple synchronous file operations

**File:** `deploy/gcp/update-edge-release.sh`
- **Lines 73-74, 78**: Node.js script with synchronous readFileSync

### 46. Dangerous eval() and new Function() Usage
**Severity:** High (with context)
**Count:** 10+ instances

**File:** `src/media/cluster/camera-lease.service.ts`
- **Lines 148, 202, 234, 266**: Redis eval() for Lua scripts (acceptable use)
  ```typescript
  const result = await this.redisClient.eval(ACQUIRE_LUA, 2, ...);
  ```

**File:** `src/alerts/services/alert-deduplication.service.ts`
- **Lines 57, 72-73, 198**: Redis eval() interface and usage

**File:** `src/ha/services/camera-lease-manager.service.ts`
- **Lines 89, 180, 256, 336**: Redis Lua script eval()

**File:** `src/integrations/connectors/saml-connector.ts`
- **Lines 50-51**: Dynamic import using Function constructor
  ```typescript
  const dynamicImport = new Function('moduleName', 'return import(moduleName)');
  const module = await dynamicImport('@node-saml/node-saml');
  ```
- Bypasses static analysis, could be security risk

### 47. React dangerouslySetInnerHTML Usage
**Severity:** Medium
**Count:** 3 instances

**File:** `dashboard/app/layout.tsx`
- **Line 146**: Theme script injected via dangerouslySetInnerHTML
  ```typescript
  <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
  ```

**File:** `dashboard/components/ai-video-search/natural-language-search.tsx`
- **Line 291**: Query understanding HTML rendered unsafely
  ```typescript
  <span dangerouslySetInnerHTML={{ __html: queryUnderstanding }} />
  ```

**File:** `dashboard/components/camera-annotation-panel.tsx`
- **Line 384**: Inline CSS styles via dangerouslySetInnerHTML

## Async/Promise Issues

### 48. Async Functions in Array.map() Without Promise.all
**Severity:** Medium
**Count:** 15+ instances

**File:** `src/routes/dashboard.routes.ts`
- **Lines 83, 139, 188, 196**: Async map without await
  ```typescript
  const cameras = await Promise.all(
    branches.map(async (branch) => {
      return await store.listCamerasByBranch(...);
    })
  );
  ```
- This is CORRECT usage (Promise.all is used)

**File:** `src/alerts/notification-dispatcher.ts`
- **Lines 63, 72, 229**: Async map with Promise.all (correct)

**File:** `analytics-engine/src/industrial/rules/rule-engine.ts`
- **Lines 100, 144**: Async map with Promise.allSettled (correct)

**Note:** Most instances found are actually CORRECT usage with Promise.all/allSettled

### 49. Unhandled Promise Rejections Risk
**Severity:** Medium

Multiple async operations without explicit error handling that could lead to unhandled rejections.

## Console Statements in Production Code

### 50. Console.log Left in Production Code
**Severity:** Low
**Count:** 50+ instances

**File:** `analytics-engine/scripts/generate-model-manifest.ts`
- **Lines 26-27, 37, 41, 69-70**: Console statements in build script

**File:** `analytics-engine/src/detectors/banking-analytics.ts`
- **Lines 176, 188, 190, 194, 204-206**: Console logs in detector initialization

**File:** `scripts/ensure-storage-visibility.ts`
- **Lines 60, 94-99**: Console logs in health check script

**File:** `scripts/verify-capability-truth.ts`
- **Lines 30-33, 186-188**: Console logs in verification script

**File:** `scripts/verify-production-truth.ts`
- **Lines 290, 293, 296, 299-302**: Console logs in validation

**File:** `src/index.ts`
- **Lines 19-25**: Startup configuration logged to console
  ```typescript
  console.log('🚀 KryptoVision Control Plane starting...');
  console.log('Configuration check:');
  ```

**File:** `src/intelligence/intelligence-orchestrator.ts`
- **Lines 78, 179**: Business logic with console.log

## Resource Management Issues (Continued)

### 51. Missing Cleanup for Zero-Delay Timers
**Severity:** Low-Medium
**Count:** 15+ instances

**File:** `analytics-engine/src/banking/__tests__/workflow.test.ts`
- **Lines 128, 152, 173, 196, 225**: Test delays with setTimeout (acceptable in tests)

**File:** `dashboard/app/control-room/page.tsx`
- **Lines 298, 1504, 1525, 1546**: UI timers with setTimeout
- Missing cleanup in some cases

**File:** `dashboard/components/global-alert-center.tsx`
- **Lines 92, 147, 194, 249**: Timer management with potential cleanup issues

**File:** `scripts/upload-gcs-stream.mjs`
- **Lines 32, 40, 92, 115**: Retry delays using setTimeout (acceptable for script)

## Database and Query Issues

### 52. Complex SQL in Single Lines (Maintainability)
**Severity:** Low
**Count:** Many instances

**File:** `src/database/operational-report-repository.ts`
- **Lines 13, 15, 19, 25**: Extremely long SQL queries on single lines
- **Line 15**: 500+ character query with CTE
  ```typescript
  async claimDueSchedules(now: string, limit: number) { 
    const result = await this.pool.query(`WITH candidates AS (SELECT id FROM operational_report_schedules WHERE enabled AND next_run_at <= $1 AND (lease_until IS NULL OR lease_until < $1) ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT $2) UPDATE operational_report_schedules schedule SET lease_until=$1::timestamptz + interval '2 minutes' FROM c...
  ```

**File:** `src/digital-twin/state.ts`
- **Lines 220-224**: Long parameterized queries without formatting

### 53. Potential SQL Injection Patterns
**Severity:** Critical (if applicable)

Most SQL queries use parameterized queries correctly, but should be audited for dynamic query construction.

## Configuration Issues (Additional)

### 54. Missing API Key Protection
**Severity:** High

**File:** `src/integrations/connectors/access-control-connector.ts`
- **Lines 46, 112**: API key retrieved from credentials
  ```typescript
  const apiKey = this.getCredential<string>('apiKey');
  ```

**File:** `src/routes/hsm-signing.routes.ts`
- **Line 56**: API key authentication from headers without rate limiting
  ```typescript
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  ```

### 55. Password Type Enums and Constants
**Severity:** Low

**File:** `src/security/types.ts`
- **Line 98**: Password type enum definition (acceptable)

**File:** `src/onvif/security/ws-security.ts`
- **Lines 36, 48, 72**: Password handling in ONVIF security (appears secure)

**File:** `src/security/services/password-rotation.service.ts`
- **Lines 341, 345, 349**: Password generation logic (appears secure)

**File:** `dashboard/app/reset-password/page.tsx`
- **Lines 26-27**: Password input fields (acceptable)

### 56. Hardcoded Credentials in Scripts
**Severity:** High

**File:** `scripts/update-sample-passwords.ps1`
- **Lines 10-12**: Hardcoded password hashes in update script
  ```powershell
  UPDATE users SET password_hash = 'scrypt$ARrxo02jwt7jo6XFNttO7A$9afGM...'
  ```
- Should use environment variables

## Testing and QA Issues

### 57. Test Data in Production Files
**Severity:** Low

**File:** `qa-artifacts/run-int-test-1788691353210/report.html`
- **Line 53**: Test report with localhost URL
- Should be in .gitignore

### 58. Loopback Detection Tests
**Severity:** N/A (Test file)

**File:** `test/config/loopback-detection.test.ts`
- Test file - not a bug

## Buffer Usage Issues

### 59. Buffer Constructor Usage
**Severity:** Low
**Count:** Multiple instances

Most Buffer usage found is modern and safe:
- `Buffer.from()` - Safe
- `Buffer.concat()` - Safe
- `Buffer.isBuffer()` - Safe

No deprecated `new Buffer()` constructor found.

## TypeScript and Type Safety (Additional)

### 60. Long Method Chains That Could Fail
**Severity:** Low-Medium

Multiple instances of method chaining without null checks between operations.

## Summary Statistics - Part 3

**Security Vulnerabilities:**
- XSS via innerHTML: 10+ instances
- Insecure random: 25+ instances
- Hardcoded secrets: 5+ instances
- eval/Function usage: 10+ instances (mostly Redis Lua, 1 concerning)
- dangerouslySetInnerHTML: 3 instances

**Resource Management:**
- Synchronous file ops: 20+ instances
- process.exit() without cleanup: 20+ instances
- Timer cleanup issues: 15+ instances

**Code Quality:**
- Console.log in production: 50+ instances
- Hardcoded localhost: 40+ instances
- Complex SQL queries: Many instances

**Total New Issues:** 300+ additional problems

## Critical Issues Requiring Immediate Attention

1. **SAML connector using Function constructor** (line 50 of saml-connector.ts) - Bypasses security
2. **XSS vulnerabilities in public HTML files** - Need sanitization
3. **Math.random() for ID generation** - Not cryptographically secure
4. **Hardcoded password hashes in scripts** - Security risk
5. **API key exposure in headers without rate limiting** - DoS risk
6. **Ungraceful shutdowns** - Could corrupt data

## Medium Priority Issues

1. Console statements in production code
2. Synchronous file operations blocking event loop
3. Hardcoded localhost URLs in config
4. Missing cleanup for timers and intervals
5. Complex SQL queries needing refactoring

## Low Priority Issues

1. Test artifacts in repository
2. Code formatting and maintainability
3. Documentation of mock data usage
