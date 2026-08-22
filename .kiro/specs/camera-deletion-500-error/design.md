# Camera Deletion 500 Error Bugfix Design

## Overview

The camera deletion endpoint (`DELETE /v1/admin/cameras/:id` and `POST /v1/admin/cameras/delete`) currently returns generic 500 errors when encountering various failure scenarios that should be handled with specific status codes. This fix will implement proper error handling to distinguish between different failure modes: missing cameras (404), constraint violations (409), and genuine unexpected errors (500 with sanitized messages). The fix ensures transaction rollback occurs correctly, dependent records are cleaned up gracefully even when tables are missing, and error responses include actionable information.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when the deletion endpoint encounters specific error scenarios (missing camera, constraint violations, unexpected errors) but returns generic 500 responses instead of appropriate status codes
- **Property (P)**: The desired behavior when deletion errors occur - endpoints should return specific HTTP status codes (404, 409, 500) with meaningful error codes and messages
- **Preservation**: Existing successful deletion behavior, transaction management, and dependent record cleanup that must remain unchanged by the fix
- **deleteCameraById**: The DELETE `/v1/admin/cameras/:id` endpoint handler in `src/routes/admin-camera-management.routes.ts` that removes a single camera
- **deleteCameraByPost**: The POST `/v1/admin/cameras/delete` endpoint handler that removes a camera using JSON body
- **Dependent Tables**: Database tables that reference cameras through foreign keys (analytics_alerts, incident_cameras, recording_segments, etc.)
- **Resource Node**: The entry in the `resource_nodes` table that represents the camera in the resource hierarchy
- **Constraint Violation**: A database error caused by foreign key constraints or other integrity rules preventing deletion
- **Transaction Rollback**: The process of undoing all database changes when an error occurs during multi-step deletion

## Bug Details

### Bug Condition

The bug manifests when the camera deletion endpoints encounter error conditions that require specific handling. The current implementation catches all errors with a generic 500 response, making it impossible for clients to distinguish between "camera not found" (should be 404), "cannot delete due to constraints" (should be 409), and "unexpected database error" (legitimate 500).

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { cameraId: string, databaseState: DatabaseState }
  OUTPUT: boolean
  
  RETURN (input.databaseState.cameraExists(input.cameraId) === false AND responseStatusCode === 500)
         OR (input.databaseState.hasConstraintViolation(input.cameraId) AND responseStatusCode === 500)
         OR (input.databaseState.hasMissingTables() AND transactionFails)
         OR (unexpectedError occurs AND errorMessage contains sensitive information)
END FUNCTION
```

### Examples

- **Missing Camera**: Attempting to delete camera ID "cam-123" that doesn't exist returns 500 with error "camera_deletion_failed" instead of 404 with error "camera_not_found"

- **Constraint Violation**: Attempting to delete a camera that has active recordings protected by a constraint returns 500 with generic error instead of 409 with specific constraint information

- **Missing Table**: If the database schema is missing the "camera_specifications" table, the deletion fails completely with 500 instead of gracefully handling the missing table and continuing

- **Sensitive Error Exposure**: Database connection errors expose internal PostgreSQL error messages in 500 responses instead of sanitized user-facing messages

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Successful deletion of cameras with all dependent records must continue to work exactly as before
- Transaction management (BEGIN/COMMIT/ROLLBACK) must continue to function properly
- Database connection acquisition and release must remain unchanged
- The order of dependent table deletion must remain the same
- The bulk delete endpoint (`/v1/admin/cameras/all`) must continue to work independently
- Authentication and authorization checks must remain unchanged

**Scope:**
All inputs that result in successful deletion (camera exists, no constraints, all tables present, database available) should be completely unaffected by this fix. This includes:
- Deleting cameras with no dependent records
- Deleting cameras with many dependent records
- Proper transaction commit on success
- Correct 204 No Content response on success

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely issues are:

1. **Insufficient Error Discrimination**: The catch block captures all errors uniformly and returns 500, without checking if the camera exists first or distinguishing between different error types
   - The camera existence check happens inside the transaction but after BEGIN
   - A missing camera throws no error during the SELECT, but returns zero rows
   - The code correctly handles this case with 404, so the issue must be in other error paths

2. **Database Constraint Error Handling**: When a foreign key constraint or other database integrity rule prevents deletion, the error is caught generically
   - PostgreSQL throws specific error codes for constraint violations (e.g., code "23503" for foreign key violations)
   - The current catch block doesn't inspect error codes to differentiate constraint violations from other errors
   - Should return 409 Conflict instead of 500 for constraint violations

3. **Missing Table Error Propagation**: The code uses `if (!String(err).includes('does not exist')) throw err;` to ignore missing tables
   - This pattern may fail if the error message format is different than expected
   - Could propagate the error when it should be ignored, causing transaction rollback
   - May need more robust error detection using PostgreSQL error codes

4. **Error Message Sanitization**: The catch block returns the raw error message which may expose sensitive database information
   - Uses `error instanceof Error ? error.message : String(error)` without filtering
   - Could expose connection strings, table schemas, or internal database details
   - Should sanitize messages before returning them to clients

## Correctness Properties

Property 1: Bug Condition - Proper Error Status Codes

_For any_ deletion request where error conditions occur (camera not found, constraint violations, missing tables, or unexpected errors), the fixed endpoint SHALL return the appropriate HTTP status code: 404 for missing cameras, 409 for constraint violations, 500 only for truly unexpected errors, and SHALL include specific error codes and actionable error messages.

**Validates: Requirements 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Successful Deletion Behavior

_For any_ deletion request where the camera exists and no constraints prevent deletion, the fixed endpoint SHALL produce exactly the same behavior as the original endpoint: delete all dependent records, delete the camera, delete the resource node, commit the transaction, and return 204 No Content.

**Validates: Requirements 3.1, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/routes/admin-camera-management.routes.ts`

**Function**: Both `app.delete('/v1/admin/cameras/:id')` and `app.post('/v1/admin/cameras/delete')` handlers

**Specific Changes**:

1. **Add PostgreSQL Error Code Detection**: Import or define constants for PostgreSQL error codes
   - Add detection for constraint violation errors (code "23503", "23505", etc.)
   - Add detection for missing relation errors (code "42P01")
   - Use these codes instead of string matching for more reliable error handling

2. **Enhance Missing Table Detection**: Improve the error detection in the dependent table cleanup loop
   ```typescript
   // Current approach:
   if (!String(err).includes('does not exist')) throw err;
   
   // Improved approach:
   const isTableMissing = isPgError(err) && err.code === '42P01';
   if (!isTableMissing) throw err;
   ```

3. **Add Constraint Violation Detection**: In the main catch block, detect constraint violations before returning 500
   ```typescript
   catch (error) {
     await client.query('ROLLBACK');
     app.log.error(error);
     
     // Check for constraint violations
     if (isPgError(error) && isConstraintViolation(error.code)) {
       return reply.code(409).send({
         error: 'deletion_constrained',
         message: 'Cannot delete camera due to database constraints',
         constraint: error.constraint || 'unknown'
       });
     }
     
     // Return sanitized 500 for unexpected errors
     return reply.code(500).send({
       error: 'camera_deletion_failed',
       message: 'An unexpected error occurred during deletion'
     });
   }
   ```

4. **Sanitize Error Messages**: Remove sensitive information from error responses
   - Log full error details with `app.log.error(error)` for debugging
   - Return only sanitized, user-friendly messages in HTTP responses
   - Never expose database connection details, table schemas, or internal implementation details

5. **Add Error Type Helper Functions**: Create utility functions to identify error types
   ```typescript
   function isPgError(error: unknown): error is { code: string; constraint?: string; detail?: string } {
     return typeof error === 'object' && error !== null && 'code' in error;
   }
   
   function isConstraintViolation(code: string): boolean {
     return code.startsWith('23'); // All integrity constraint violations
   }
   ```

6. **Enhance Error Logging**: Add context to error logs to aid debugging
   ```typescript
   app.log.error({ error, cameraId: id }, 'Camera deletion failed');
   ```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code (exploratory testing), then verify the fix works correctly and preserves existing behavior (fix and preservation checking).

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that trigger each error scenario and observe the current incorrect 500 responses. Run these tests on the UNFIXED code to document the bug behavior and validate our understanding of the root causes.

**Test Cases**:
1. **Missing Camera Test**: Call DELETE with a non-existent camera ID (will return 500 instead of 404 on unfixed code)
2. **Constraint Violation Test**: Create a scenario where a camera has protected dependent records, then attempt deletion (will return 500 instead of 409 on unfixed code)
3. **Missing Table Test**: Simulate a database schema where one of the dependent tables is missing (may cause transaction rollback and 500 on unfixed code)
4. **Error Message Exposure Test**: Trigger a database error and inspect the response for sensitive information (may expose database details on unfixed code)

**Expected Counterexamples**:
- All error scenarios return HTTP 500 with error "camera_deletion_failed"
- Error messages may contain sensitive database information
- Missing tables cause transaction failure instead of graceful handling
- Constraint violations are indistinguishable from unexpected errors

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := deleteCameraById_fixed(input)
  ASSERT expectedBehavior(result)
END FOR

WHERE expectedBehavior(result) means:
  IF camera does not exist THEN
    ASSERT result.statusCode === 404
    ASSERT result.body.error === 'camera_not_found'
  ELSE IF constraint violation prevents deletion THEN
    ASSERT result.statusCode === 409
    ASSERT result.body.error === 'deletion_constrained'
  ELSE IF table is missing THEN
    ASSERT deletion continues gracefully
    ASSERT result.statusCode === 204 OR 500 (depending on overall success)
  ELSE IF unexpected error occurs THEN
    ASSERT result.statusCode === 500
    ASSERT result.body.message does not contain sensitive information
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT deleteCameraById_original(input) = deleteCameraById_fixed(input)
END FOR

WHERE NOT isBugCondition(input) means:
  - Camera exists
  - No constraints prevent deletion
  - All tables are present
  - Database is available and healthy
  - No unexpected errors occur
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that successful deletion behavior is unchanged for all valid inputs

**Test Plan**: Observe successful deletion behavior on UNFIXED code first (delete camera with no dependencies, with many dependencies, etc.), then write property-based tests capturing that behavior.

**Test Cases**:
1. **Simple Deletion Preservation**: Delete a camera with no dependent records - verify it returns 204 and removes the camera
2. **Complex Deletion Preservation**: Delete a camera with dependent records in multiple tables - verify all records are removed and 204 is returned
3. **Transaction Commit Preservation**: Verify successful deletions commit the transaction and don't leave orphaned records
4. **Connection Management Preservation**: Verify the database connection is properly released after both success and error cases

### Unit Tests

- Test missing camera detection returns 404 with correct error code
- Test constraint violation detection returns 409 with meaningful message
- Test missing table handling allows deletion to continue for existing tables
- Test error message sanitization removes sensitive database information
- Test successful deletion still returns 204 No Content
- Test transaction rollback occurs on all error paths
- Test database connection is released in all code paths (success, error, rollback)

### Property-Based Tests

- Generate random camera IDs (some existing, some not) and verify correct status codes (404 vs 204/500)
- Generate random database states (with/without constraints, with/without missing tables) and verify appropriate handling
- Generate random error conditions and verify sensitive information is never exposed in responses
- Test that successful deletions always clean up all dependent records across many scenarios

### Integration Tests

- Test full deletion flow with real database for cameras with various dependency configurations
- Test error recovery: trigger errors at different points in the transaction and verify rollback works correctly
- Test concurrent deletions to ensure transaction isolation is maintained
- Test that the dashboard proxy route correctly handles the new status codes from the backend endpoint
