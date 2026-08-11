# Recipient Resolution System

Complete recipient resolution architecture for the notification system. Replaces incomplete TODO implementations with production-ready, tenant-scoped resolution.

## Overview

This module solves the critical problem of converting **notification intent** into **concrete, verified delivery endpoints** while maintaining proper tenant boundaries, audit trails, and user preferences.

### The Problem

The original implementation had incomplete recipient resolution:

```typescript
// TODO: Implement full recipient resolution with user lookup
// TODO: Implement user lookup
// TODO: Load push devices
```

This led to:
- Ambiguous recipient strings (`"branch_manager"`)
- No tenant scoping (cross-tenant leakage risk)
- Missing verification checks
- No provenance tracking (can't answer "why did I receive this?")
- No preference filtering
- Incomplete escalation support

### The Solution

Three-stage resolution pipeline:

```
Notification Intent
        ↓
RecipientResolver
        ↓
Resolved Principals (WHO)
        ↓
EndpointResolver
        ↓
Verified Endpoints (WHERE)
        ↓
RecipientPolicyService
        ↓
Filtered Endpoints
        ↓
Notification Outbox
```

## Architecture

### Core Concepts

1. **RecipientSelector**: Describes WHY someone should receive a notification
2. **ResolvedPrincipal**: Identifies WHO will receive it
3. **DeliveryEndpoint**: Specifies WHERE to send it

This separation enables:
- Composable recipient selection (roles, incidents, on-call, escalations)
- Tenant-scoped resolution with audit trails
- Verification and preference filtering
- Time-aware on-call resolution
- Escalation policy expansion

### Components

#### 1. RecipientResolver

Converts selectors to principals with tenant scoping:

```typescript
const result = await recipientResolver.resolve(
  [
    { type: 'BRANCH_ROLE', branchId: 'b1', role: 'branch_manager' },
    { type: 'INCIDENT_ASSIGNEE', incidentId: 'inc1' },
  ],
  {
    tenantId: 'tenant1',
    notificationType: 'security_alert',
    now: new Date(),
  }
);

// result.principals contains deduplicated users with provenance
```

**Supported Selectors:**
- `USER`: Explicit user ID
- `EMAIL`: External email address
- `PHONE`: External phone number
- `BRANCH_ROLE`: Users with role in branch
- `TENANT_ROLE`: Users with tenant-wide role
- `ON_CALL`: Current on-call assignment
- `INCIDENT_ASSIGNEE`: Current incident owner
- `ESCALATION_POLICY`: Policy with nested selectors

#### 2. EndpointResolver

Converts principals to verified delivery endpoints:

```typescript
const result = await endpointResolver.resolve(
  principals,
  context
);

// result.endpoints contains verified email/SMS/push with lifecycle checks
```

**Features:**
- Email verification check (`emailVerifiedAt`, `emailStatus`)
- Phone verification check (`phoneVerifiedAt`, `phoneStatus`)
- Push device lookup with staleness filtering
- Deduplication (same phone/email from multiple sources)
- Lifecycle management (invalidated, disabled, stale)

#### 3. RecipientPolicyService

Authorization and preference filtering:

```typescript
// Authorization
const authResult = await policyService.authorize({
  context: { tenantId, purpose: 'SECURITY', ... },
  selectors: [...],
});

// Preference filtering
const filtered = await policyService.filterEndpoints({
  tenantId,
  userId,
  notificationType: 'security_alert',
  severity: 'CRITICAL',
  endpoints: [...],
});
```

**Features:**
- External recipient authorization (prevent exfiltration)
- Channel-level preferences
- Event-type preferences
- Quiet hours
- Emergency overrides for critical notifications
- Tenant policy enforcement

## Usage

### Basic Example

```typescript
import { Pool } from 'pg';
import {
  RecipientResolver,
  EndpointResolver,
  RecipientPolicyService,
  UserRepository,
  MembershipRepository,
  // ... other repositories
} from './recipient/index.js';

// Initialize repositories
const pool = new Pool({ /* ... */ });
const userRepo = new UserRepository(pool);
const membershipRepo = new MembershipRepository(pool);
// ... initialize other repos

// Initialize resolvers
const recipientResolver = new RecipientResolver(
  userRepo,
  membershipRepo,
  branchRepo,
  incidentRepo,
  onCallService,
  escalationPolicyService
);

const endpointResolver = new EndpointResolver(
  userRepo,
  pushDeviceRepo,
  preferenceRepo
);

const policyService = new RecipientPolicyService(
  preferenceRepo
);

// Use in notification service
const notificationService = new NotificationServiceV2(
  notificationRepo,
  recipientResolver,
  endpointResolver,
  policyService
);

// Enqueue notification
await notificationService.enqueue({
  tenantId: 'tenant1',
  type: 'security_alert',
  purpose: 'SECURITY',
  severity: 'CRITICAL',
  channels: ['EMAIL', 'SMS', 'PUSH'],
  recipients: [
    { type: 'BRANCH_ROLE', branchId: 'b1', role: 'branch_manager' },
    { type: 'ESCALATION_POLICY', policyId: 'ep1', level: 1 },
  ],
  subject: 'Security Alert',
  body: 'Unauthorized access detected',
});
```

### Branch Role Example

```typescript
// Notifies all active branch managers in branch b1
recipients: [
  {
    type: 'BRANCH_ROLE',
    branchId: 'b1',
    role: 'branch_manager',
  },
]
```

SQL enforces tenant + branch scoping:
```sql
SELECT u.*
FROM users u
JOIN branch_memberships bm ON bm.user_id = u.id
JOIN tenant_memberships tm ON tm.user_id = u.id
WHERE
    bm.branch_id = $1
AND bm.role = $2
AND bm.status = 'ACTIVE'
AND tm.tenant_id = $3
AND tm.status = 'ACTIVE'
AND u.status = 'ACTIVE'
```

### Escalation Example

```typescript
// Escalation policy with fallback
const policy: EscalationPolicy = {
  id: 'ep1',
  tenantId: 'tenant1',
  name: 'Security Escalation',
  enabled: true,
  levels: [
    {
      level: 1,
      recipients: [
        { type: 'INCIDENT_ASSIGNEE', incidentId: 'inc1' },
      ],
      waitAfterDeliveryMs: 600000, // 10 minutes
      onEmpty: 'USE_FALLBACK',
      fallbackRecipients: [
        { type: 'BRANCH_ROLE', branchId: 'b1', role: 'branch_manager' },
      ],
    },
    {
      level: 2,
      recipients: [
        { type: 'TENANT_ROLE', role: 'security_head' },
        { type: 'ON_CALL', scheduleId: 'sched1' },
      ],
      waitAfterDeliveryMs: 1800000, // 30 minutes
      onEmpty: 'FAIL',
    },
  ],
};
```

### Provenance Tracking

Every principal carries provenance explaining how it was selected:

```typescript
{
  type: 'USER',
  userId: 'u123',
  displayName: 'Alice Manager',
  provenance: [
    {
      source: 'BRANCH_ROLE',
      selector: 'branch_manager',
      branchId: 'b1',
      resolvedAt: '2024-01-15T10:30:00Z',
    },
    {
      source: 'ESCALATION_POLICY',
      selector: 'ep1',
      policyId: 'ep1',
      escalationLevel: 2,
      resolvedAt: '2024-01-15T10:40:00Z',
    },
  ],
}
```

This answers: "Why did Alice receive this notification?"
- She's the branch manager of branch b1
- She's also in escalation level 2

## Security

### Tenant Scoping

**Every query enforces tenant boundaries:**

```typescript
// WRONG (global lookup)
await pool.query('SELECT * FROM users WHERE id = $1', [userId]);

// RIGHT (tenant-scoped)
await pool.query(
  'SELECT u.* FROM users u JOIN tenant_memberships tm ON tm.user_id = u.id WHERE u.id = $1 AND tm.tenant_id = $2',
  [userId, tenantId]
);
```

### External Recipient Authorization

External email/phone selectors are restricted by purpose:

```typescript
// Allowed for informational
{ purpose: 'INFORMATIONAL', recipients: [{ type: 'EMAIL', email: 'external@example.com' }] }

// BLOCKED for security
{ purpose: 'SECURITY', recipients: [{ type: 'EMAIL', email: 'external@example.com' }] }
// Error: External EMAIL recipients not allowed for SECURITY notifications
```

### Endpoint Security

- Never log raw email/phone/push tokens
- Use `hashEndpoint()` for logging
- Encrypt endpoint addresses in outbox
- Separate endpoint ID from address

## Database Schema

Required tables:

```sql
-- Users with contact info
CREATE TABLE users (
  id UUID PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT,
  email_verified_at TIMESTAMP,
  email_status TEXT, -- ACTIVE, UNVERIFIED, BOUNCED, OPTEDOUT
  phone_number TEXT,
  phone_verified_at TIMESTAMP,
  phone_status TEXT,
  status TEXT NOT NULL, -- ACTIVE, INACTIVE, SUSPENDED
  metadata JSONB
);

-- Tenant memberships
CREATE TABLE tenant_memberships (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  tenant_id UUID NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL, -- ACTIVE, INACTIVE
  UNIQUE(user_id, tenant_id)
);

-- Branch memberships
CREATE TABLE branch_memberships (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  branch_id UUID NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  UNIQUE(user_id, branch_id, role)
);

-- Push devices
CREATE TABLE push_devices (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL, -- FCM, APNS, WEB_PUSH
  platform TEXT, -- ANDROID, IOS, WEB
  token TEXT NOT NULL,
  device_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  registered_at TIMESTAMP NOT NULL,
  last_seen_at TIMESTAMP,
  invalidated_at TIMESTAMP,
  metadata JSONB,
  UNIQUE(provider, token)
);

-- Notification preferences
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  channels JSONB NOT NULL, -- { email: { enabled, minimumSeverity }, ... }
  event_filters JSONB NOT NULL, -- { event_type: { enabled, channels, ... }, ... }
  quiet_hours JSONB,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  UNIQUE(tenant_id, user_id)
);

-- Escalation policies
CREATE TABLE escalation_policies (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  levels JSONB NOT NULL, -- Array of escalation levels
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

-- On-call schedules
CREATE TABLE on_call_schedules (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

-- On-call rotations
CREATE TABLE on_call_rotations (
  id UUID PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES on_call_schedules(id),
  priority INTEGER NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

-- On-call rotation members
CREATE TABLE on_call_rotation_members (
  id UUID PRIMARY KEY,
  rotation_id UUID NOT NULL REFERENCES on_call_rotations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  position INTEGER NOT NULL
);

-- On-call overrides
CREATE TABLE on_call_overrides (
  id UUID PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES on_call_schedules(id),
  user_id UUID NOT NULL REFERENCES users(id),
  tenant_id UUID NOT NULL,
  effective_from TIMESTAMP NOT NULL,
  effective_until TIMESTAMP NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  override_id UUID
);
```

## Testing

Key test scenarios:

1. **Tenant isolation**: User from tenant A cannot be resolved for tenant B notification
2. **Role resolution**: Branch role returns all active members
3. **Deduplication**: Same user selected multiple ways appears once
4. **Verification**: Unverified email/phone filtered out
5. **Preferences**: User preference blocks channel
6. **Emergency override**: Critical notification bypasses preferences
7. **Escalation**: Policy expands recursively
8. **Circular policy**: Detected and prevented
9. **Stale devices**: Push devices > 180 days filtered
10. **Provenance**: Full audit trail maintained

## Migration from Old System

Old code:
```typescript
const resolved: ResolvedRecipient = {
  userId: recipient.userId,
  email: recipient.email,
  // TODO: Implement user lookup
  // TODO: Load push devices
};
```

New code:
```typescript
const principalResult = await recipientResolver.resolve(
  [{ type: 'USER', userId: recipient.userId }],
  context
);

const endpointResult = await endpointResolver.resolve(
  principalResult.principals,
  context
);

const filtered = await policyService.filterEndpoints({
  tenantId,
  userId,
  endpoints: endpointResult.endpoints,
  // ...
});
```

## Audit and Compliance

All resolution activities emit structured audit events:

- `notification.recipient.resolved`
- `notification.recipient.unresolved`
- `notification.endpoint.resolved`
- `notification.preference.applied`
- `notification.escalation.triggered`

These events contain:
- Tenant ID
- Notification ID and type
- Principal IDs and display names
- Resolution sources (provenance)
- Timestamps
- **No sensitive endpoint data**

## Performance

**Optimizations:**
- Batch user lookups
- Single query for branch role resolution
- Push device query with indexes
- Preference lookup cached per user
- Deduplication in-memory

**Expected performance:**
- Simple resolution (explicit users): < 50ms
- Branch role resolution: < 100ms
- Complex escalation policy: < 200ms
- 1000 recipients: < 500ms

## Future Enhancements

- [ ] Notification groups (mailing lists)
- [ ] Dynamic on-call rotation calculation
- [ ] Multi-tenant user support
- [ ] Webhook recipient type
- [ ] SMS carrier detection and routing
- [ ] Email domain verification
- [ ] Push token auto-invalidation on provider errors
- [ ] Preference inheritance (team defaults)
- [ ] A/B testing recipient selection

## Related Documentation

- [Notification System Architecture](../README.md)
- [AI Capability Rule](../../../../.kiro/AI_CAPABILITIES.md) - Defines notification scope
- [Escalation Policies](./services/escalation-policy.service.ts)
- [On-Call Schedules](./services/on-call.service.ts)
