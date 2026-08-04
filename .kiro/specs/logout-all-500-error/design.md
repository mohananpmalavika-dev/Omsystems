# Logout-All 500 Error Bugfix Design

## Overview

The `/api/control/v1/auth/logout-all` endpoint returns a 500 Internal Server Error instead of successfully logging out all user sessions. The bug occurs in the authentication middleware when it attempts to update session activity timestamps during logout operations. The middleware calls `updateSessionActivity` for all authenticated requests, including logout endpoints where the session is about to be deleted. This creates a race condition or constraint violation when the session record is being modified/deleted during the logout process.

The fix will make the authentication middleware skip session activity updates for logout-related endpoints, allowing these endpoints to proceed with their cleanup operations without interference from the middleware.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when a user calls `/v1/auth/logout-all` with a valid token and the authentication middleware attempts to update session activity before the logout handler deletes the sessions
- **Property (P)**: The desired behavior when logout-all is called - all user sessions should be deleted successfully and the endpoint should return `{ success: true }` with status 200
- **Preservation**: Existing authentication, session activity updates, and single-session logout behavior that must remain unchanged by the fix
- **authMiddleware**: The authentication middleware function in `src/middleware/auth.middleware.ts` that validates tokens and updates session activity for all authenticated requests
- **updateSessionActivity**: The store method that updates the `lastActivityAt` timestamp for a session, called by auth middleware on every authenticated request
- **logout-related endpoints**: The routes `/v1/auth/logout` and `/v1/auth/logout-all` that invalidate user sessions

## Bug Details

### Bug Condition

The bug manifests when a user with a valid access token calls the `/v1/auth/logout-all` endpoint. The authentication middleware successfully validates the token and finds the active session, but then attempts to update the session's activity timestamp via `updateSessionActivity(session.id)`. This update operation either conflicts with the subsequent session deletion in the logout-all handler or fails because the session is being deleted, causing the entire request to return a 500 error before reaching the route handler.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type HTTPRequest
  OUTPUT: boolean
  
  RETURN input.url CONTAINS '/v1/auth/logout-all'
         AND input.headers['authorization'] IS validBearerToken
         AND sessionExists(extractToken(input))
         AND authMiddleware calls updateSessionActivity(sessionId)
         AND updateSessionActivity throws error OR conflicts with deleteAllUserSessions
END FUNCTION
```

### Examples

- **Logout-all with valid token**: User calls `POST /v1/auth/logout-all` with valid bearer token → 500 Internal Server Error (should return 200 with `{ success: true }`)
- **Logout-all from dashboard**: User clicks "Logout All Devices" in dashboard settings → Error shown to user (should show success message and log out)
- **Logout-all after token validation**: Auth middleware validates token successfully, calls `updateSessionActivity`, then route handler calls `deleteAllUserSessions` → Conflict/error occurs (should skip session update for logout endpoints)
- **Edge case - Logout single session**: User calls `POST /v1/auth/logout` → May also fail with 500 if same issue exists (should return 200 with `{ success: true }`)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Authentication middleware must continue to validate tokens and populate `request.currentUser` for all authenticated endpoints
- Session activity timestamps must continue to be updated for all non-logout authenticated requests (e.g., GET /cameras, POST /incidents, GET /auth/me)
- Single session logout endpoint `/v1/auth/logout` must continue to invalidate only the current session
- Routes marked with `noAuth: true` must continue to skip authentication entirely
- The health check endpoint `/health` must continue to bypass authentication
- 401 errors must continue to be returned for invalid, expired, or missing tokens on authenticated endpoints

**Scope:**
All inputs that do NOT involve the logout endpoints (`/v1/auth/logout` and `/v1/auth/logout-all`) should be completely unaffected by this fix. This includes:
- All other authenticated API requests
- Token validation logic
- User permission checking
- Rate limiting on login endpoint
- Password reset flows

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely issues are:

1. **Race Condition in Session Updates**: The authentication middleware calls `updateSessionActivity(session.id)` immediately before the logout-all handler calls `deleteAllUserSessions(request.currentUser.id)`. The session update may be in progress when the deletion occurs, causing a database constraint violation or lock timeout.

2. **Session Update Failure During Deletion**: The `updateSessionActivity` method may fail when trying to update a session that is being deleted or has just been deleted by another concurrent request, throwing an unhandled exception that propagates as a 500 error.

3. **Unnecessary Session Activity Tracking for Logout**: Updating session activity timestamps for logout endpoints is semantically incorrect - if the user is about to delete their sessions, there's no value in recording that the session was "last active" at logout time.

4. **Missing Error Handling**: The auth middleware line `await store.updateSessionActivity(session.id);` has no try-catch block, so any error thrown by this operation will propagate to the client as a 500 error instead of being handled gracefully.

## Correctness Properties

Property 1: Bug Condition - Logout-All Succeeds for Valid Tokens

_For any_ HTTP request where the URL is `/v1/auth/logout-all`, the authorization header contains a valid bearer token, and the authentication middleware successfully validates the token, the fixed authentication middleware SHALL skip session activity updates, allow the request to proceed to the route handler, and the route handler SHALL successfully delete all user sessions and return `{ success: true }` with status 200.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Non-Logout Requests Continue Session Tracking

_For any_ HTTP request where the URL is NOT `/v1/auth/logout` or `/v1/auth/logout-all`, and the request requires authentication (not marked with `noAuth: true`), the fixed authentication middleware SHALL continue to update session activity timestamps exactly as the original middleware did, preserving the existing session tracking behavior for all non-logout authenticated requests.

**Validates: Requirements 3.2, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/middleware/auth.middleware.ts`

**Function**: `authMiddleware` (created by `createAuthMiddleware`)

**Specific Changes**:
1. **Add Logout Endpoint Detection**: After successfully validating the token and user (around line 94, after checking user status), add a check to determine if the current request is for a logout endpoint.
   - Check if `request.url` includes `/auth/logout` or `/auth/logout-all`
   - Use a conditional to skip session activity updates for these endpoints

2. **Skip Session Activity Update for Logout**: Wrap the `updateSessionActivity` call in a conditional that only executes for non-logout endpoints.
   - Original: `await store.updateSessionActivity(session.id);`
   - Modified: Only call this if request is not for logout endpoints
   - This prevents the race condition and unnecessary updates

3. **Preserve Token Validation and User Attachment**: Ensure that token validation, user lookup, and request context population (`request.currentUser`, `request.sessionId`) still occur for logout endpoints - only skip the activity update.

4. **Add Explanatory Comment**: Document why session activity updates are skipped for logout endpoints to prevent future developers from "fixing" this intentional behavior.

5. **Alternative Approach (if needed)**: If the simple URL check is insufficient, consider adding a route configuration option like `skipActivityUpdate: true` that can be set on logout routes, similar to the existing `noAuth` option.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write integration tests that call the `/v1/auth/logout-all` endpoint with valid authentication tokens and observe the response. Run these tests on the UNFIXED code to observe 500 errors and understand the root cause by examining error logs.

**Test Cases**:
1. **Basic Logout-All Test**: Create a user session, call `/v1/auth/logout-all` with valid token (will fail with 500 on unfixed code)
2. **Multiple Sessions Logout-All**: Create 3 sessions for the same user, call `/v1/auth/logout-all` from one session (will fail with 500 on unfixed code)
3. **Single Session Logout Test**: Call `/v1/auth/logout` with valid token to verify if same issue exists (may fail with 500 on unfixed code)
4. **Concurrent Logout Test**: Call `/v1/auth/logout-all` twice simultaneously to observe race conditions (will fail on unfixed code)

**Expected Counterexamples**:
- HTTP 500 errors returned from logout-all endpoint
- Possible causes: `updateSessionActivity` throwing error, database constraint violation, unhandled promise rejection in auth middleware

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := authMiddleware_fixed(input) THEN logoutAllHandler(input)
  ASSERT result.statusCode = 200
  ASSERT result.body = { success: true }
  ASSERT allUserSessionsDeleted(input.userId)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT authMiddleware_original(input) = authMiddleware_fixed(input)
  ASSERT updateSessionActivity WAS called for authenticated non-logout requests
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-logout authenticated inputs

**Test Plan**: Observe behavior on UNFIXED code first for various authenticated endpoints, confirm that session activity is updated, then write property-based tests capturing that behavior and verify it continues after the fix.

**Test Cases**:
1. **GET Endpoint Preservation**: Observe that GET /auth/me updates session activity on unfixed code, then verify this continues after fix
2. **POST Endpoint Preservation**: Observe that POST /incidents updates session activity on unfixed code, then verify this continues after fix
3. **Other Authenticated Endpoints**: Verify that GET /cameras, GET /auth/sessions, DELETE /auth/sessions/:id all continue to update session activity
4. **Token Validation Preservation**: Verify that 401 errors are still returned for invalid tokens on all endpoints including logout endpoints

### Unit Tests

- Test that `authMiddleware` skips `updateSessionActivity` when request URL contains `/auth/logout`
- Test that `authMiddleware` skips `updateSessionActivity` when request URL contains `/auth/logout-all`
- Test that `authMiddleware` still calls `updateSessionActivity` for other authenticated endpoints (e.g., `/auth/me`, `/cameras`)
- Test that `request.currentUser` and `request.sessionId` are still populated correctly for logout endpoints
- Test edge cases: URLs with query parameters (e.g., `/auth/logout?foo=bar`), case sensitivity, path variations

### Property-Based Tests

- Generate random authenticated API requests (excluding logout endpoints) and verify session activity is updated for all of them
- Generate random logout endpoint requests with valid tokens and verify they all succeed with 200 status
- Generate random combinations of valid/invalid tokens across all endpoints and verify error handling is preserved

### Integration Tests

- Test full logout-all flow: login → create multiple sessions → call logout-all → verify all sessions deleted and 200 returned
- Test logout-all doesn't affect other users: create sessions for user A and B → user A calls logout-all → verify only A's sessions deleted
- Test that after successful logout-all, subsequent authenticated requests with old tokens return 401 errors
- Test single logout endpoint continues to work and only deletes current session
- Test that calling other endpoints (e.g., GET /auth/me) after the fix still updates session activity timestamps
