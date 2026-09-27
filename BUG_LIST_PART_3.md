# Project Bug List - Part 3

## Security Vulnerabilities

### 41. XSS Vulnerabilities via innerHTML
**Severity:** High
**Status:** ✅ **FIXED**

**File:** `public/app.js`
- ✅ **FIXED** — Added `escapeHtml()` helper; sanitized dynamic interpolations in `resultsDiv` and `tableBody` (errors, messages, IDs, usernames, and scope badges).

**File:** `public/bulk-upload.js`
- ✅ **FIXED** — Added `escapeHtml()` helper; sanitized all dynamically injected error rows, branch names, emails, and error messages.

**File:** `dashboard/components/ai-video-search/natural-language-search.tsx`
- ✅ **FIXED** — Removed `dangerouslySetInnerHTML` on Line 291; rendered `queryUnderstanding` safely as a direct React text node child.

**File:** `public/forensic-verifier.html`
- ✅ **NOT A BUG** — Dynamic verification data is injected using `.textContent` (`res-evidence-id`, `res-camera-id`, `res-calc-hash`, etc.); `innerHTML` is only used for static markup badges.

**File:** `public/krypton-ai-features.html` & `test-gateway-delete.html`
- ⚠️ **LOW RISK / DEMO ONLY** — Static demo/test HTML pages not exposed in production routing.

---

### 42. Insecure Random Number Generation (Math.random)
**Severity:** Medium
**Status:** ✅ **FIXED** for persistent IDs; confirmed safe for test/telemetry simulations

**File:** `src/analytics/crowd/crowd-repository.ts`
- ✅ **FIXED** — Replaced `Math.random().toString(36)` with cryptographically secure `randomBytes(4).toString('hex')` from `node:crypto` for `zone`, `queue`, `snapshot`, and `incident` IDs.

**File:** `src/monitoring/repositories/durable-alert.repository.ts`
- ✅ **FIXED** — Replaced `Math.random()` with cryptographically secure `randomBytes(3).toString('hex')` from `node:crypto` for alert action IDs.

**File:** `src/services/auto-storage-telemetry.service.ts`
- ✅ **NOT A BUG** — Telemetry mock simulation metrics (e.g. CPU/temperature fluctuations); does not require cryptographic security.

**File:** `analytics-engine/test/performance-benchmarks.test.ts` & `load-testing/`
- ✅ **NOT A BUG** — Synthetic benchmark and test harness data generation; standard in testing suites.

---

### 43. Hardcoded Localhost and Development URLs
**Severity:** Low
**Status:** ✅ **NOT A BUG / STANDARD TEMPLATE PATTERN**

**Files:** `deploy/aws/docker-compose.aws.yml`, `deploy/gcp/docker-compose.gcp.yml`, `media-gateway/.env.example`
- Environment fallback syntax `${DOMAIN_NAME:-localhost}` is standard docker-compose templating providing development defaults when production environment overrides are not supplied.

---

### 44. Process.exit() Causing Ungraceful Shutdowns
**Severity:** Low
**Status:** ✅ **NOT A BUG**

- **CLI / Migration Scripts** (`delete-edge-and-cameras.mjs`, `scripts/delete-cameras.mjs`, `scripts/test-login.js`): Exiting via `process.exit()` is standard Node.js CLI script pattern.
- **Production Services** (`src/index.ts` Line 176, `src/app.ts` Line 3363): Implements full graceful shutdown on `SIGTERM` and `SIGINT` signals (`gracefulShutdown('SIGTERM')`), ensuring database pools and servers drain and close properly.

---

### 45. Synchronous File Operations Blocking Event Loop
**Severity:** Low
**Status:** ✅ **NOT A BUG**

**Files:** `tmp/finalize-workflow.mjs`, `scratch/patch_analytics.cjs`, `tmp/extend-assurance-workspaces.mjs`, `deploy/gcp/update-edge-release.sh`, `test/recorder-sdk/canonical-driver-runner.ts`
- All synchronous `fs` calls are isolated strictly to build, deployment, maintenance, and test fixture setup scripts. No synchronous file I/O runs in the runtime request path of the production server.

---

### 46. Dangerous eval() and new Function() Usage
**Severity:** Low
**Status:** ✅ **NOT A BUG / SAFE PEER LOADER**

**Files:**
- `src/media/cluster/camera-lease.service.ts`, `src/alerts/services/alert-deduplication.service.ts`, `src/ha/services/camera-lease-manager.service.ts`:
  Standard Redis `client.eval()` executing atomic server-side Lua scripts.
- `src/integrations/connectors/saml-connector.ts`:
  Line 50: `const dynamicImport = new Function('moduleName', 'return import(moduleName)'); const module = await dynamicImport('@node-saml/node-saml');`
  Dynamically imports only a static constant string `'@node-saml/node-saml'` to allow build success when the optional peer dependency is not installed. No user-controlled input is ever evaluated.

---

### 47. React dangerouslySetInnerHTML Usage
**Severity:** Medium
**Status:** ✅ **RESOLVED**

**Files:**
- `dashboard/components/ai-video-search/natural-language-search.tsx` (Line 291):
  ✅ **FIXED** — Removed `dangerouslySetInnerHTML`; rendered safely as direct React child.
- `dashboard/app/layout.tsx`:
  ✅ **NOT A BUG** — Static constant theme initialization script (`THEME_SCRIPT`) necessary to prevent flash of unstyled content before hydration.
- `dashboard/components/camera-annotation-panel.tsx`:
  ✅ **NOT A BUG** — Static inline styling.

---

## Async/Promise Issues

### 48. Async Functions in Array.map() Without Promise.all
**Severity:** Low
**Status:** ✅ **NOT A BUG**

**Files:** `src/routes/dashboard.routes.ts`, `src/alerts/notification-dispatcher.ts`, `analytics-engine/src/industrial/rules/rule-engine.ts`
- All verified as properly wrapped in `Promise.all(...)` or `Promise.allSettled(...)`.

---

### 49. Unhandled Promise Rejections Risk
**Severity:** Medium
**Status:** ✅ **RESOLVED**
- Dynamic `import()` promises in `analytics-engine/src/app.ts` now have explicit `.catch()` handlers.
- Production error boundaries and global unhandledRejection listeners catch and log unexpected exceptions.

---

## Console Statements in Production Code

### 50. Console.log Left in Production Code
**Severity:** Low
**Status:** ⚠️ **INFORMATIONAL / NON-BLOCKING**
- Present mostly in one-off scripts, initialization banners (`src/index.ts`), and CLI tooling where console output is expected.

---

## Resource Management Issues (Continued)

### 51. Missing Cleanup for Zero-Delay Timers
**Severity:** Low
**Status:** ✅ **NOT A BUG**

**File:** `dashboard/components/global-alert-center.tsx`
- Verified: `useEffect` unmount returns cleanup function:
  ```typescript
  return () => {
    events.close();
    window.clearInterval(timer);
    if (notificationTimer.current) window.clearTimeout(notificationTimer.current);
  };
  ```
- All timers and SSE connections are cleared and closed on unmount.

---

## Database and Query Issues

### 52. Complex SQL in Single Lines (Maintainability)
**Severity:** Low
**Status:** ⚠️ **INFORMATIONAL / CODE STYLE**
- Parameterized CTE queries in `operational-report-repository.ts` are functional and valid; no functional defect.

---

### 53. Potential SQL Injection Patterns
**Severity:** High (Audit)
**Status:** ✅ **NOT A BUG**
- Repositories audited utilize parameterized `$1, $2` inputs. No user-controlled dynamic SQL concatenation found.

---

## Configuration Issues (Additional)

### 54. Missing API Key Protection
**Severity:** Medium
**Status:** ✅ **NOT A BUG**
- `access-control-connector.ts`: Retrieves configured credentials from secure internal store.
- `hsm-signing.routes.ts`: Secured with API key header inspection.

---

### 55. Password Type Enums and Constants
**Severity:** Low
**Status:** ✅ **NOT A BUG**
- Type definitions and password rotation policies are secure and correctly typed.

---

### 56. Hardcoded Credentials in Scripts
**Severity:** Medium
**Status:** ⚠️ **NON-PRODUCTION / SEED DATA**
- `scripts/update-sample-passwords.ps1` is a local development script setting dev sample account hashes.

---

## Testing and QA Issues

### 57. Test Data in Production Files
**Severity:** Low
**Status:** ✅ **NOT A BUG**
- Artifacts reside in `qa-artifacts/` test folder.

---

### 58. Loopback Detection Tests
**Severity:** N/A
**Status:** ✅ **NOT A BUG** (Test file)

---

## Buffer Usage Issues

### 59. Buffer Constructor Usage
**Severity:** Low
**Status:** ✅ **NOT A BUG**
- Codebase uses modern `Buffer.from()`, `Buffer.concat()`, and `Buffer.isBuffer()`. No deprecated `new Buffer()` usage.

---

## TypeScript and Type Safety (Additional)

### 60. Long Method Chains That Could Fail
**Severity:** Low
**Status:** ✅ **NOT A BUG**
- Root TypeScript compilation (`npx tsc --noEmit`) passes with exit code 0.

---

## Summary Statistics - Part 3

- **Root TypeScript Check:** ✅ **0 errors (Exit code 0)**
- **Security Fixes Applied:**
  1. XSS in `public/app.js`: Added `escapeHtml()`, sanitized table and error outputs
  2. XSS in `public/bulk-upload.js`: Added `escapeHtml()`, sanitized error and validation reports
  3. XSS in `natural-language-search.tsx`: Replaced `dangerouslySetInnerHTML` with safe text rendering
  4. Insecure random in `crowd-repository.ts`: Replaced `Math.random()` with `randomBytes(4)`
  5. Insecure random in `durable-alert.repository.ts`: Replaced `Math.random()` with `randomBytes(3)`
- **Confirmed Not A Bug / Stale:** 15 categories (Graceful shutdown, timers cleanup, parameterized SQL, Redis eval, compose templates, script exits, Buffer usage, etc.)
