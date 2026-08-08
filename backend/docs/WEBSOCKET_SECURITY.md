# WebSocket Authentication Security

## Overview

The WebSocket Manager implements comprehensive JWT-based authentication to secure real-time communication channels for the surveillance platform. This prevents unauthorized access to sensitive data including camera events, alerts, branch information, and operational state.

## Security Architecture

### Authentication Flow

```
Client Connection Request
    ↓
JWT Token Extraction (from auth.token or Authorization header)
    ↓
JWT Signature Validation (HMAC algorithms only)
    ↓
Issuer & Audience Verification
    ↓
Token Expiry Check
    ↓
Session Verification (database check if sessionId present)
    ↓
Tenant Validation
    ↓
User Status Check (must be active)
    ↓
Role Extraction
    ↓
Branch/Region Permission Loading
    ↓
Connection Established
    ↓
Channel Subscription (validated per request)
```

## JWT Requirements

### Required Claims

All JWT tokens must include the following claims:

```typescript
{
  userId: string;           // User identifier
  tenantId: string;         // Tenant identifier (multi-tenancy)
  username: string;         // Username
  email: string;            // User email
  role: string;             // User role (super_admin, company_admin, etc.)
  iat: number;              // Issued at timestamp
  exp: number;              // Expiration timestamp
  iss: string;              // Issuer (must match JWT_ISSUER)
  aud: string;              // Audience (must match JWT_AUDIENCE)
}
```

### Optional Claims

```typescript
{
  globalUserId: string;              // Global user ID for federated auth
  sessionId: string;                 // Session ID for revocation checks
  canAccessAllRegions: boolean;      // Global access flag
  accessibleRegions: string[];       // List of accessible regions
}
```

## Configuration

### Environment Variables

```bash
# Required
JWT_SECRET=<your-secret-key>              # Secret for JWT signing/verification
ALLOWED_ORIGINS=http://localhost:3000     # CORS allowed origins (comma-separated)

# Optional (with defaults)
JWT_ISSUER=sentinel-grid                  # JWT issuer name
JWT_AUDIENCE=sentinel-grid-api            # JWT audience name
```

### Constructor Usage

```typescript
import { WebSocketManager } from './services/websocket-manager.service';

const wsManager = new WebSocketManager(
  httpServer,
  postgresPool,
  process.env.JWT_SECRET  // Optional, falls back to env vars
);
```

## Permission Model

### Role Hierarchy

1. **super_admin** - Full system access
2. **company_admin** - Company-wide access
3. **hq_admin** - Headquarters access
4. **region_manager** - Regional access
5. **branch_manager** - Branch-specific access
6. **security_officer** - Security operations
7. **it_admin** - IT operations
8. **operator** - Basic operations

### Channel Access Control

#### Branch-Specific Channels

Format: `branch:<branchId>`

**Access Rules:**
- Global admins (super_admin, company_admin, hq_admin): ✅ All branches
- Other users: ✅ Only assigned branches (from user_branch_assignments table)

**Example:**
```typescript
// User can only subscribe to branches they're assigned to
socket.emit('subscribe', ['branch:branch-123']);
```

#### Region-Specific Channels

Format: `region:<regionId>`

**Access Rules:**
- Global admins: ✅ All regions
- Other users: ✅ Only regions where they have branch assignments

#### Camera-Specific Channels

Format: `camera:<cameraId>`

**Access Rules:**
- Global admins: ✅ All cameras
- Other users: ✅ Only cameras in assigned branches

#### Global Channels

| Channel | Allowed Roles |
|---------|--------------|
| `global-dashboard` | super_admin, company_admin, hq_admin |
| `central-monitoring` | super_admin, company_admin, hq_admin |
| `alerts` | super_admin, company_admin, hq_admin, region_manager, branch_manager, security_officer |
| `incidents` | super_admin, company_admin, hq_admin, region_manager, branch_manager, security_officer |
| `cameras` | super_admin, company_admin, hq_admin, region_manager, branch_manager, security_officer, operator |
| `branch-health` | super_admin, company_admin, hq_admin, region_manager, branch_manager |
| `storage` | super_admin, company_admin, hq_admin, region_manager, branch_manager, it_admin |
| `network` | super_admin, company_admin, hq_admin, region_manager, branch_manager, it_admin |
| `edge-agents` | super_admin, company_admin, hq_admin, region_manager, branch_manager, it_admin |
| `map-updates` | super_admin, company_admin, hq_admin, region_manager, branch_manager, security_officer, operator |

## Client Integration

### Connection Example

```typescript
import { io } from 'socket.io-client';

// Obtain JWT token from login
const token = await login(username, password);

// Connect with authentication
const socket = io('https://api.example.com', {
  auth: {
    token: token  // JWT token
  },
  transports: ['websocket', 'polling']
});

// Handle connection events
socket.on('connected', (data) => {
  console.log('Connected:', data.socketId);
  
  // Subscribe to channels
  socket.emit('subscribe', [
    'alerts',
    'branch:branch-123',
    'cameras'
  ]);
});

socket.on('subscribed', (data) => {
  console.log('Subscribed to:', data.channels);
});

socket.on('update', (event) => {
  console.log('Event:', event.type, event.data);
});

socket.on('error', (error) => {
  console.error('WebSocket error:', error);
});
```

### Alternative: Authorization Header

```typescript
const socket = io('https://api.example.com', {
  extraHeaders: {
    Authorization: `Bearer ${token}`
  }
});
```

## Security Features

### 1. JWT Signature Validation

- Only HMAC algorithms (HS256, HS384, HS512) are allowed
- Prevents algorithm confusion attacks
- Validates signature against JWT_SECRET

### 2. Issuer & Audience Validation

- Ensures token was issued by trusted authority
- Prevents token reuse across different services
- Configurable via environment variables

### 3. Token Expiry

- Automatic expiry check with 30-second clock tolerance
- Prevents use of expired tokens
- Expires_at validated against current time

### 4. Session Revocation

- Optional session ID verification in database
- Supports real-time session revocation
- Checks for `revoked_at` and `expires_at` in `global_user_sessions` table

### 5. User Status Validation

- Verifies user exists in database
- Checks user account status is 'active'
- Prevents suspended/deleted accounts from connecting

### 6. Permission Validation

- Loads user's branch and region assignments from database
- Never trusts client-provided permissions
- Enforces role-based access control (RBAC)

### 7. Channel Subscription Validation

- Each subscription request is validated
- Client cannot subscribe to unauthorized channels
- Failed subscriptions are logged with user context

### 8. Fail-Closed Security

- Unknown channels are denied by default
- Errors result in connection rejection
- All permission checks log denials for audit

## Audit Logging

All security-relevant events are logged:

### Successful Authentication
```typescript
logger.info('WebSocket authentication successful', {
  socketId: socket.id,
  userId: userContext.userId,
  tenantId: userContext.tenantId,
  role: userContext.role
});
```

### Failed Authentication
```typescript
logger.warn('WebSocket connection attempt with invalid token', {
  socketId: socket.id,
  ip: socket.handshake.address
});
```

### Denied Channel Subscription
```typescript
logger.warn('Channel subscription denied', {
  socketId: socket.id,
  userId: client.userId,
  channel: channel,
  role: client.role
});
```

### Client Disconnect
```typescript
logger.info('WebSocket client disconnected', {
  socketId: socketId,
  userId: client.userId,
  tenantId: client.tenantId
});
```

## Database Schema Requirements

### global_user_sessions table

```sql
CREATE TABLE global_user_sessions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  global_user_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  revoked_reason TEXT,
  created_at TIMESTAMP DEFAULT now()
);
```

### users table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT now()
);
```

### user_branch_assignments table

```sql
CREATE TABLE user_branch_assignments (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(user_id, branch_id)
);
```

### branches table

```sql
CREATE TABLE branches (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  region TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT now()
);
```

## Testing

### Unit Test Example

```typescript
describe('WebSocket Authentication', () => {
  it('should reject connection without token', async () => {
    const socket = io('http://localhost:3000', {
      auth: {} // No token
    });

    await expect(socket).toReject('Authentication token required');
  });

  it('should reject connection with invalid token', async () => {
    const socket = io('http://localhost:3000', {
      auth: { token: 'invalid-token' }
    });

    await expect(socket).toReject('Invalid or expired authentication token');
  });

  it('should accept connection with valid token', async () => {
    const token = generateValidToken();
    const socket = io('http://localhost:3000', {
      auth: { token }
    });

    await expect(socket).toConnect();
  });
});
```

## Threat Model

### Threats Mitigated

✅ **Unauthorized Access** - JWT validation prevents unauthenticated connections
✅ **Token Forgery** - Signature validation prevents forged tokens
✅ **Token Replay** - Expiry and session revocation prevent replay attacks
✅ **Privilege Escalation** - Role and permission validation prevents unauthorized access
✅ **Cross-Tenant Access** - Tenant validation prevents cross-tenant data leaks
✅ **Channel Injection** - Channel validation prevents unauthorized subscriptions
✅ **Algorithm Confusion** - Only HMAC algorithms allowed

### Remaining Considerations

⚠️ **Rate Limiting** - Consider adding connection rate limits per IP/user
⚠️ **DDoS Protection** - Consider adding connection limits per tenant
⚠️ **Token Rotation** - Implement short-lived tokens with refresh mechanism
⚠️ **Anomaly Detection** - Monitor for unusual connection patterns

## Best Practices

1. **Use Short-Lived Tokens** - Set JWT expiry to 1-24 hours
2. **Implement Token Refresh** - Use refresh tokens for seamless UX
3. **Rotate JWT_SECRET** - Periodically rotate the secret key
4. **Monitor Failed Auth** - Alert on high failed authentication rates
5. **Audit Permissions** - Regularly review user branch assignments
6. **Use TLS/SSL** - Always use encrypted connections in production
7. **Log Everything** - Comprehensive logging for security audits

## Troubleshooting

### Client Cannot Connect

**Check:**
1. JWT_SECRET is configured correctly
2. Token is not expired
3. User account is active
4. User exists in the correct tenant

### Client Cannot Subscribe to Channel

**Check:**
1. User role has permission for the channel
2. User has branch/region assignment for scoped channels
3. Channel name format is correct
4. Check server logs for denial reason

### Token Validation Fails

**Check:**
1. JWT_SECRET matches between token generation and validation
2. Token includes all required claims
3. Issuer and audience match configured values
4. Token has not expired

## References

- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [Socket.IO Authentication](https://socket.io/docs/v4/middlewares/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
