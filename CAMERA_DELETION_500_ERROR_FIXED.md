# Camera Deletion 500 Error - Fixed

## Summary

Fixed the camera deletion 500 Internal Server Error by implementing proper PostgreSQL error handling and returning appropriate HTTP status codes for different error scenarios.

## Problem

When attempting to delete cameras via `DELETE /api/admin/system/cameras/{cameraId}`, the system returned:
- ❌ **500 Internal Server Error** for all error conditions (missing cameras, constraint violations, etc.)
- ❌ Database errors exposed sensitive information in error messages
- ❌ Missing table errors caused transaction failures

## Solution

### 1. Created PostgreSQL Error Utilities

**File:** `src/utils/pg-error-utils.ts`

New utility module with functions to identify PostgreSQL error types:
- `isPgError()` - Type guard for PostgreSQL errors
- `isConstraintViolation()` - Detects constraint violations (23xxx error codes)
- `isTableMissing()` - Detects missing table errors (42P01)
- `sanitizeErrorMessage()` - Removes sensitive database information

### 2. Updated Camera Deletion Routes

**File:** `src/routes/admin-camera-management.routes.ts`

Enhanced error handling in both DELETE endpoints:
- `DELETE /v1/admin/cameras/:id` 
- `POST /v1/admin/cameras/delete`

**Changes:**
- ✅ Returns **404 Not Found** when camera doesn't exist (instead of 500)
- ✅ Returns **409 Conflict** for constraint violations (instead of 500)
- ✅ Handles missing tables gracefully using error codes (not string matching)
- ✅ Sanitizes error messages to hide sensitive database information
- ✅ Fixed `node_type` column reference (was incorrectly using `type`)

### 3. Error Handling Logic

```typescript
// Missing camera check (before any operations)
if (cameraRow.rowCount === 0) {
  await client.query('ROLLBACK');
  return reply.code(404).send({ error: 'camera_not_found' });
}

// Missing table detection (during cleanup)
for (const table of dependentTables) {
  try {
    await client.query(`DELETE FROM ${table} WHERE camera_id = $1`, [id]);
  } catch (err) {
    // Non-fatal if table missing (PostgreSQL error code 42P01)
    if (!isTableMissing(err)) throw err;
  }
}

// Constraint violation detection (in catch block)
if (isPgError(error)) {
  if (isConstraintViolation(error.code)) {
    app.log.error({ error, cameraId: id }, 'Camera deletion failed due to constraint violation');
    return reply.code(409).send({
      error: 'deletion_constrained',
      message: 'Cannot delete camera due to database constraints',
      constraint: error.constraint || 'unknown'
    });
  }
}

// Generic error with sanitized message
app.log.error({ error, cameraId: id }, 'Camera deletion failed');
return reply.code(500).send({ 
  error: 'camera_deletion_failed', 
  message: 'An unexpected error occurred during deletion'
});
```

## HTTP Status Codes

| Scenario | Before | After |
|----------|--------|-------|
| Camera not found | 500 | **404 Not Found** |
| Constraint violation | 500 | **409 Conflict** |
| Missing table | 500 (transaction fails) | **Continues gracefully** |
| Unexpected error | 500 (exposes details) | **500 (sanitized message)** |
| Successful deletion | 204 | 204 (unchanged) |

## Response Examples

### 404 - Camera Not Found
```json
{
  "error": "camera_not_found"
}
```

### 409 - Constraint Violation
```json
{
  "error": "deletion_constrained",
  "message": "Cannot delete camera due to database constraints",
  "constraint": "analytics_alerts_camera_id_fkey"
}
```

### 500 - Unexpected Error (Sanitized)
```json
{
  "error": "camera_deletion_failed",
  "message": "An unexpected error occurred during deletion"
}
```

## Dashboard Integration

The fix applies to the backend endpoints that the dashboard proxies to:

**Frontend Request:**
```
DELETE /api/admin/system/cameras/{id}
```

**Dashboard Proxy:**
```typescript
// dashboard/app/api/admin/system/cameras/[id]/route.ts
POST /api/control/v1/admin/cameras/delete
```

**Backend Handler:**
```typescript
// src/routes/admin-camera-management.routes.ts
POST /v1/admin/cameras/delete  ← Fixed here
```

## Testing

The fix has been implemented and includes:
- ✅ PostgreSQL error utility tests (all passing)
- ✅ Bug condition exploration tests (validates fix)
- ✅ Preservation tests (ensures no regressions)

## Deployment

To deploy the fix:

```bash
# Build the application
npm run build

# Deploy to Render (triggers automatic deployment)
git add .
git commit -m "fix: camera deletion 500 error with proper error handling"
git push origin main
```

## Files Modified

1. **src/utils/pg-error-utils.ts** (new file)
   - PostgreSQL error detection utilities

2. **src/routes/admin-camera-management.routes.ts**
   - Enhanced error handling in DELETE endpoints
   - Fixed database column references

3. **test/pg-error-utils.test.ts** (new file)
   - Unit tests for error utilities

4. **test/camera-deletion-error-handling.test.ts**
   - Integration tests for deletion error scenarios

## Verification

After deployment, verify the fix:

1. **Test 404 - Non-existent camera:**
   ```bash
   curl -X DELETE https://sentinel-grid-monitoring1.onrender.com/api/admin/system/cameras/00000000-0000-0000-0000-000000000000 \
     -H "Cookie: <your-session-cookie>"
   ```
   Expected: `404 {"error":"camera_not_found"}`

2. **Test successful deletion:**
   ```bash
   curl -X DELETE https://sentinel-grid-monitoring1.onrender.com/api/admin/system/cameras/<valid-camera-id> \
     -H "Cookie: <your-session-cookie>"
   ```
   Expected: `204 No Content`

3. **Test in UI:**
   - Go to System Management → Cameras
   - Click delete on a camera
   - Should see appropriate success/error messages

## Security Improvements

- ✅ Error messages no longer expose database connection strings
- ✅ Table schemas and internal details are hidden from responses
- ✅ Full error details are logged for debugging but not returned to clients

## Related Issues

This fix addresses the core issue where all deletion errors returned 500. The proper error codes now allow the frontend to:
- Display user-friendly messages for different scenarios
- Handle 404 errors gracefully (camera already deleted)
- Show meaningful constraint violation messages
- Distinguish between client errors (4xx) and server errors (5xx)
