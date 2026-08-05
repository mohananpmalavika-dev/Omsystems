# Render 502 Error - Diagnostic and Fix Summary

## What Was Wrong

Your Sentinel Grid application on Render was returning 502 Bad Gateway errors. The root cause was a **graceful failure pattern** in the startup sequence:

1. **Migration script would skip** database connectivity failures with a warning
2. **Application would start anyway** without a working database
3. **Health check (`/ready`) would fail** because it requires database connectivity
4. **Render would mark the service as down** → 502 errors to users

## Changes Made

### 1. Fixed Migration Script (CRITICAL)

**File:** `scripts/run-migrations.mjs`

Changed the database connection error handler from gracefully skipping to **failing fast**:

```javascript
// BEFORE: Silently continued without database
if (error instanceof Error && /getaddrinfo|ECONNREFUSED|.../) {
  console.warn(`Skipping migrations because the database is unavailable: ${error.message}`);
  return; // ❌ Wrong: continues without DB
}

// AFTER: Fails immediately with clear error
if (error instanceof Error && /getaddrinfo|ECONNREFUSED|.../) {
  console.error(`FATAL: Database connection failed - ${error.message}`);
  console.error(`DATABASE_URL: ${databaseUrl ? databaseLabel(databaseUrl) : 'NOT SET'}`);
  console.error(`The service cannot start without database connectivity.`);
  console.error(`Verify that DATABASE_URL is correct and the database service is available.`);
  process.exit(1); // ✅ Correct: fails fast
}
```

**Why this matters:** Render will now show a clear deployment failure if the database is unavailable, rather than marking the service as "Live" but failing health checks.

### 2. Enhanced Startup Logging

**File:** `src/index.ts`

Added diagnostic logging and upfront database connectivity verification:

```typescript
// Log configuration at startup
console.log('🚀 Sentinel Grid Control Plane starting...');
console.log('Configuration check:');
console.log('  - Database:', config.DATABASE_URL ? '✓ configured' : '✗ MISSING');
console.log('  - Redis:', config.REDIS_URL ? '✓ configured' : 'ℹ optional (not set)');
console.log('  - Auth mode:', config.AUTH_MODE);
console.log('  - Host:', config.HOST);
console.log('  - Port:', config.PORT);

// Test database connection BEFORE building the app
if (config.DATABASE_URL) {
  console.log('Verifying database connectivity...');
  const testPool = createPool(config.DATABASE_URL);
  try {
    await testPool.query('SELECT 1');
    console.log('✓ Database connection verified');
  } catch (error) {
    console.error('✗ FATAL: Cannot connect to database');
    console.error('Error:', error instanceof Error ? error.message : error);
    console.error('The control plane requires a working database connection.');
    process.exit(1);
  } finally {
    await testPool.end();
  }
}
```

**Benefits:**
- Clear logs show what's configured at startup
- Database is tested before the app tries to use it
- Faster failure with better error messages

### 3. Fixed Corrupted render.yaml

**File:** `render.yaml`

Fixed a line corruption in the recording-engine service definition:

```yaml
# BEFORE (corrupted):
runtime: docker   22wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww31

# AFTER (fixed):
runtime: docker
```

### 4. Added Diagnostic Tools

Created three new diagnostic scripts to help debug Render deployments:

#### `scripts/diagnose-render-502.md`
Comprehensive troubleshooting guide covering:
- Root cause analysis
- Step-by-step diagnostic procedures
- Common fixes
- Prevention strategies

#### `scripts/test-render-health.mjs`
Automated health check testing:
```bash
node scripts/test-render-health.mjs https://your-app.onrender.com
```
Tests multiple endpoints and provides diagnostic output.

#### `scripts/check-render-config.mjs`
Configuration validator:
```bash
node scripts/check-render-config.mjs
```
Validates render.yaml for common issues.

### 5. Added Package.json Scripts

**File:** `package.json`

Added convenient npm scripts:
```json
"render:check": "node scripts/check-render-config.mjs",
"render:test-health": "node scripts/test-render-health.mjs",
"render:diagnose": "node scripts/diagnose-render-502.md || type scripts\\diagnose-render-502.md"
```

## What To Do Next

### Immediate Actions (Do These Now)

1. **Check Render Dashboard Service Status**
   - Go to https://dashboard.render.com
   - Check if `sentinel-grid-db` database is "Available"
   - Check if `sentinel-grid-control-plane` service is "Live"

2. **Review Service Logs**
   - Click on `sentinel-grid-control-plane` service
   - Go to "Logs" tab
   - Look for the new diagnostic output we added
   - Look for errors related to database connection

3. **Verify Database Configuration**
   - In control-plane service → Environment
   - Verify `DATABASE_URL` is set
   - Should be auto-linked from `sentinel-grid-db`

4. **Test Health Endpoints Manually**
   Try these URLs in your browser:
   - https://sentinel-grid-monitoring1.onrender.com/health
   - https://sentinel-grid-monitoring1.onrender.com/ready
   
   Expected responses:
   - `/health`: `{"status":"ok","service":"sentinel-control-plane"}`
   - `/ready`: `{"status":"ready","database":"connected","liveState":"database"}`

### If Still Seeing 502 Errors

#### Option A: Redeploy with fixes
```bash
git add .
git commit -m "Fix Render 502: Fail fast on database errors, add diagnostics"
git push
```

This will trigger a new Render deployment with the fixes.

#### Option B: Manual Restart
In Render dashboard:
1. Go to `sentinel-grid-control-plane`
2. Click "Manual Deploy" → "Clear build cache & deploy"

#### Option C: Check Database
If database is the issue:
1. Go to `sentinel-grid-db` in Render dashboard
2. Check "Info" tab for connection issues
3. Try "Restart Database" if it's stuck

### After Resolution

Run the health check script to verify:
```bash
npm run render:test-health
```

Or remotely:
```bash
node scripts/test-render-health.mjs https://sentinel-grid-monitoring1.onrender.com
```

## Expected Behavior After Fixes

### Before (Bad)
1. Migrations skip database errors ❌
2. App starts without database ❌
3. Health checks fail ❌
4. Users see 502 ❌

### After (Good)
1. Migrations fail if database unavailable ✅
2. Deployment fails with clear error message ✅
3. Service only marked "Live" when actually healthy ✅
4. Users see working app or deployment in progress ✅

## Prevention

These changes ensure **fail-fast behavior**:
- Services won't start without required dependencies
- Errors are logged clearly at startup
- Health checks accurately reflect service state
- Deployment failures are visible, not silent

## Common Root Causes Reference

If you continue to see issues, check:

1. **Database not provisioned yet**
   - New Render databases take 2-5 minutes to provision
   - Check database status in dashboard

2. **DATABASE_URL not set**
   - Should be auto-linked in render.yaml
   - Verify in service Environment tab

3. **Database connection limit reached**
   - Basic plan: 20 connections
   - Check if other services are using connections
   - Reduce pool size if needed

4. **Network connectivity**
   - Services must be in same region as database
   - Current config: all in Singapore region ✅

5. **SSL/TLS issues**
   - Migration script auto-enables SSL for *.render.com ✅
   - No additional configuration needed

## Files Modified

- ✅ `render.yaml` - Fixed corruption
- ✅ `src/index.ts` - Added startup diagnostics
- ✅ `scripts/run-migrations.mjs` - Fail-fast on DB errors
- ✅ `package.json` - Added diagnostic scripts
- ➕ `scripts/diagnose-render-502.md` - Troubleshooting guide
- ➕ `scripts/test-render-health.mjs` - Health check tester
- ➕ `scripts/check-render-config.mjs` - Config validator

## Testing Locally

Before pushing, test the migration script behavior:

```bash
# Test with missing database
unset DATABASE_URL
node scripts/run-migrations.mjs
# Should exit with error code 1

# Test with valid database
export DATABASE_URL=postgresql://...
node scripts/run-migrations.mjs
# Should run migrations successfully
```

## Support

If you continue to see 502 errors after these fixes:

1. Share the control-plane service logs (last 100 lines)
2. Share database status from Render dashboard
3. Run: `npm run render:test-health` and share output

The new diagnostic logging will make it much easier to identify the root cause.
