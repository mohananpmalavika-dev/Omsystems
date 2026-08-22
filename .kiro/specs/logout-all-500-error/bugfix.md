# Bugfix Requirements Document

## Introduction

The `/api/control/v1/auth/logout-all` endpoint is returning a 500 Internal Server Error when called from the dashboard. This bug prevents users from logging out of all sessions simultaneously, which is a critical security feature. The error occurs during the authentication phase before the route handler is executed, preventing the logout operation from completing successfully.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user with a valid access token calls the `/v1/auth/logout-all` endpoint THEN the system returns a 500 Internal Server Error

1.2 WHEN the authentication middleware attempts to access the user's session during the logout-all request THEN the system encounters an error that is not properly handled

1.3 WHEN the error occurs in the authentication middleware THEN the error propagates to the client as a 500 error instead of allowing the logout operation to proceed

### Expected Behavior (Correct)

2.1 WHEN a user with a valid access token calls the `/v1/auth/logout-all` endpoint THEN the system SHALL successfully delete all user sessions and return `{ success: true }` with status 200

2.2 WHEN the authentication middleware processes the logout-all request THEN the system SHALL properly handle any session-related errors without blocking the logout operation

2.3 WHEN a user with an invalid or expired token calls the `/v1/auth/logout-all` endpoint THEN the system SHALL return a 401 error with appropriate error message instead of a 500 error

2.4 WHEN all sessions are successfully deleted THEN the system SHALL write an audit log entry with action "user.logout_all_sessions" and outcome "success"

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user calls the `/v1/auth/logout` endpoint (single session logout) THEN the system SHALL CONTINUE TO invalidate only the current session and return success

3.2 WHEN a user calls any other authenticated endpoint with a valid token THEN the system SHALL CONTINUE TO authenticate the request using the existing authentication middleware

3.3 WHEN a user calls an endpoint marked with `noAuth: true` (such as login, refresh, password reset) THEN the system SHALL CONTINUE TO skip authentication checks

3.4 WHEN the authentication middleware updates session activity timestamps THEN the system SHALL CONTINUE TO do so for all authenticated requests except logout endpoints

3.5 WHEN a user has an expired or invalid token THEN the system SHALL CONTINUE TO return 401 errors for authenticated endpoints (except those marked with noAuth)
