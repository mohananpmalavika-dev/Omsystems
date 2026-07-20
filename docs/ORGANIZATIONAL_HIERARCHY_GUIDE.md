# Organizational Hierarchy & Access Control System

## Overview

This document describes the hierarchical company infrastructure and granular camera access permission system implemented for the OM Systems surveillance platform.

## Table of Contents

1. [Organizational Hierarchy](#organizational-hierarchy)
2. [User Roles](#user-roles)
3. [Permission System](#permission-system)
4. [Camera Sensitivity Levels](#camera-sensitivity-levels)
5. [API Endpoints](#api-endpoints)
6. [Database Migrations](#database-migrations)
7. [Authentication Flow](#authentication-flow)

---

## Organizational Hierarchy

The system supports a six-level hierarchical structure:

```
Company
  └── Headquarters (HQ)
        └── Zone
              └── Region
                    └── Area
                          └── Branch
                                └── Camera
```

### Node Types

- **Company**: Root organizational entity
- **Headquarters (HQ)**: Main administrative office
- **Zone**: Geographic or business zone grouping
- **Region**: Regional division within a zone
- **Area**: Smaller geographic area within a region
- **Branch**: Physical location (bank branch, office, etc.)
- **Camera-Group**: Logical grouping of cameras
- **Camera**: Individual surveillance device

### Key Features

- **Hierarchical Permissions**: Access granted at any level cascades down
- **Multi-tenancy**: Each company is isolated as a tenant
- **Flexible Structure**: Supports both new (HQ-based) and legacy (Division-based) hierarchies
- **Metadata Rich**: Each node can store address, contact info, and custom metadata

---

## User Roles

The system defines 11 distinct roles with different permission levels:

### Administrative Roles

1. **super_admin**: Complete system access across all tenants
2. **company_admin**: Full access to all company resources
3. **hq_admin**: Headquarters-level administration

### Management Roles

4. **zone_manager**: Manage zone and below
5. **region_manager**: Manage region and below
6. **area_manager**: Manage area and below
7. **branch_manager**: Manage single branch

### Operational Roles

8. **operator**: Standard camera operations (view, PTZ control)
9. **security_officer**: Security-focused access (live view, evidence export)
10. **viewer**: Read-only camera access
11. **auditor**: Audit log and recording review access

### Role Hierarchy

```
super_admin
  └── company_admin
        └── hq_admin
              └── zone_manager
                    └── region_manager
                          └── area_manager
                                └── branch_manager
                                      └── operator / security_officer / viewer / auditor
```

---

## Permission System

The permission system operates on multiple layers with the following priority:

### 1. Permission Layers (Highest to Lowest Priority)

1. **Super Admin Override**: `super_admin` role has unrestricted access
2. **Explicit Camera Denies**: Camera-specific deny rules
3. **Camera Sensitivity Checks**: Based on camera sensitivity level and user role
4. **Role-based Auto-Deny**: Camera's `auto_deny_roles` field
5. **Role-based Allow List**: Camera's `allowed_roles` field (if specified)
6. **Time-based Restrictions**: Schedule-based access controls
7. **Explicit Camera Allows**: Camera-specific allow grants
8. **Access Group Membership**: Bulk permission via camera groups
9. **Hierarchical Permissions**: Access via organizational assignment
10. **Default Deny**: No access granted

### 2. Camera Sensitivity Levels

| Level | Description | Default Access |
|-------|-------------|----------------|
| **public** | Publicly visible areas (parking, entrance) | All roles |
| **internal** | Internal areas (corridors, lobby) | All roles except viewer |
| **restricted** | Restricted areas (cash counter, vault entrance) | Manager roles and above |
| **highly_restricted** | Highly sensitive (strong room, manager cabin) | Admin roles only |
| **sensitive** | Private areas (locker room, restroom) | Super admin, company admin, hq admin only |

### 3. Access Request Workflow

For restricted and highly_restricted cameras with `requires_approval = true`:

```
User → Request Access (with justification)
  ↓
Pending Review
  ↓
Manager/Admin Reviews → Approve/Reject
  ↓
If Approved: Temporary access granted (time-limited)
```

### 4. Time-based Restrictions

Access can be restricted by:
- Day of week (0=Sunday, 6=Saturday)
- Time range (e.g., 18:00-06:00 for after-hours)
- Applied to individual cameras or entire organizational nodes

### 5. Camera Access Groups

Bulk permission management:
```
Access Group
  ├── Cameras (multiple)
  └── Users (multiple)
       └── Effect (allow/deny)
```

---

## API Endpoints

### Authentication

```
POST   /v1/auth/login                     # Login with username/password
POST   /v1/auth/refresh                   # Refresh access token
POST   /v1/auth/logout                    # Logout current session
POST   /v1/auth/logout-all                # Logout all sessions
GET    /v1/auth/me                        # Get current user info
POST   /v1/auth/request-password-reset    # Request password reset
POST   /v1/auth/reset-password            # Reset password with token
GET    /v1/auth/sessions                  # List active sessions
DELETE /v1/auth/sessions/:id              # Revoke session
```

### Organization Management

```
GET    /v1/organization/tree              # Get org hierarchy tree
GET    /v1/organization/statistics        # Get org statistics
GET    /v1/organization/nodes             # List nodes (with filters)
POST   /v1/organization/nodes             # Create node
GET    /v1/organization/nodes/:id         # Get node details
PATCH  /v1/organization/nodes/:id         # Update node
DELETE /v1/organization/nodes/:id         # Deactivate node
GET    /v1/organization/nodes/:id/path    # Get hierarchy path
GET    /v1/organization/nodes/:id/descendants  # Get child nodes
POST   /v1/organization/validate-hierarchy     # Validate parent-child relationship
```

### User Management

```
GET    /v1/users                          # List users
POST   /v1/users                          # Create user
GET    /v1/users/:id                      # Get user details
PATCH  /v1/users/:id                      # Update user
DELETE /v1/users/:id                      # Deactivate user
POST   /v1/users/:id/organizations        # Assign to org node
DELETE /v1/users/:id/organizations/:nodeId # Remove org assignment
POST   /v1/users/:id/change-password      # Change password
POST   /v1/users/:id/reset-password       # Admin reset password
POST   /v1/users/:id/unlock               # Unlock account
GET    /v1/users/:id/camera-access        # Get camera access overview
GET    /v1/users/:id/audit-log            # Get user audit log
```

### Camera Permissions

```
# Camera-specific grants
GET    /v1/users/:userId/camera-grants    # List user's grants
GET    /v1/cameras/:cameraId/grants       # List camera grants
POST   /v1/camera-grants                  # Create grant (allow/deny)
DELETE /v1/camera-grants/:id              # Revoke grant

# Access requests
GET    /v1/camera-access-requests         # List requests (for approval)
GET    /v1/me/camera-access-requests      # My requests
POST   /v1/camera-access-requests         # Request camera access
POST   /v1/camera-access-requests/:id/review  # Approve/reject request
POST   /v1/camera-access-requests/:id/revoke  # Revoke request

# Time restrictions
GET    /v1/time-restrictions              # List restrictions
POST   /v1/time-restrictions              # Create restriction
DELETE /v1/time-restrictions/:id          # Delete restriction

# Access groups
GET    /v1/camera-access-groups           # List groups
POST   /v1/camera-access-groups           # Create group
GET    /v1/camera-access-groups/:id       # Get group details
POST   /v1/camera-access-groups/:id/cameras      # Add camera to group
DELETE /v1/camera-access-groups/:id/cameras/:cameraId  # Remove camera
POST   /v1/camera-access-groups/:id/users        # Assign user to group
DELETE /v1/camera-access-groups/:id/users/:userId    # Remove user

# Camera configuration
PATCH  /v1/cameras/:id/sensitivity        # Update sensitivity settings
GET    /v1/cameras/:id/check-access       # Check access for current user
GET    /v1/cameras/:id/access-summary     # Get access summary
```

---

## Database Migrations

### Migration 007: Organizational Hierarchy Enhancement

**File**: `database/migrations/007_organizational_hierarchy.sql`

**Features**:
- Adds `headquarters`, `zone`, and `area` node types
- Creates `organizational_hierarchy_rules` table for validation
- Adds metadata fields to `resource_nodes` (code, description, address, contact_info)
- Creates helper functions: `get_node_hierarchy_path()`, `get_descendant_nodes()`
- Creates view: `organizational_hierarchy_view` with statistics

### Migration 008: Employee Management & Authentication

**File**: `database/migrations/008_employee_management_and_auth.sql`

**Features**:
- Enhances `users` table with authentication fields
- Creates `user_role` enum (11 roles)
- Creates `user_status` enum (active, inactive, suspended, locked, pending_activation)
- Adds employee information fields (employee_id, department, designation, dates)
- Creates `user_sessions` table for JWT authentication
- Creates `password_reset_tokens` table
- Creates `user_organizational_assignments` table (multi-level assignments)
- Creates `role_permissions` table with default permissions
- Implements account lockout mechanism (5 attempts = 30min lock)
- Auto-grants role-based permissions via trigger

### Migration 009: Granular Camera Permissions

**File**: `database/migrations/009_granular_camera_permissions.sql`

**Features**:
- Creates `camera_sensitivity_level` enum
- Adds sensitivity and access control fields to `cameras` table
- Creates `camera_specific_grants` table (allow/deny overrides)
- Creates `camera_access_requests` table (approval workflow)
- Creates `access_request_status` enum
- Creates `time_based_access_restrictions` table
- Creates `camera_access_groups` and related tables
- Implements `check_camera_access()` function (layered permission check)
- Creates views: `camera_access_summary`, `user_camera_access_overview`

---

## Authentication Flow

### Login Flow

```
1. User submits username + password
   ↓
2. System validates credentials
   ↓
3. Check account status (active/locked/suspended)
   ↓
4. Verify password hash (scrypt)
   ↓
5. Generate access token (64 bytes, SHA256 hash)
   ↓
6. Generate refresh token (64 bytes, SHA256 hash)
   ↓
7. Create session in database
   ↓
8. Record successful login (reset attempt counter)
   ↓
9. Return tokens + user info
```

### Account Lockout

- **Max attempts**: 5 failed logins
- **Lockout duration**: 30 minutes
- **Reset**: Successful login or manual unlock by admin

### Token Lifecycle

- **Access Token**: 1 hour expiration
- **Refresh Token**: 7 days expiration (sliding window)
- **Storage**: Only SHA256 hash stored in database
- **Transmission**: Bearer token in Authorization header

### Session Management

- **Multiple sessions**: Users can have multiple active sessions
- **Activity tracking**: Last activity timestamp updated on each request
- **Revocation**: Users can revoke individual or all sessions
- **Cleanup**: Expired sessions automatically cleaned up

---

## Security Considerations

### Password Security

- Minimum 8 characters
- Bcrypt hashing (cost factor 12)
- Password change enforcement on first login
- Password reset with time-limited tokens (1 hour)

### Access Control

- Deny takes precedence over allow
- Sensitive cameras require explicit role membership
- Time-based restrictions cannot be bypassed
- All access decisions are audited

### Rate Limiting

- Login endpoint: 5 attempts per 15 minutes per IP
- Rate limit headers included in responses
- Automatic cleanup of expired rate limit entries

### Audit Trail

- All state-changing operations logged
- Includes: actor, action, resource, outcome, IP, timestamp
- Failed access attempts recorded
- Compliance with regulatory requirements

---

## Example Use Cases

### Use Case 1: Branch Manager Cannot See Locker Camera

```sql
-- Set locker camera as sensitive
UPDATE cameras
SET 
  sensitivity_level = 'sensitive',
  location_type = 'locker-room'
WHERE id = 'camera-uuid';

-- Branch manager will be denied access due to sensitivity check
-- Only super_admin, company_admin, or hq_admin can access
```

### Use Case 2: Temporary Access to Restricted Camera

```sql
-- User requests access
INSERT INTO camera_access_requests (...)
VALUES (..., 'Need to review incident', ...);

-- Manager approves
UPDATE camera_access_requests
SET status = 'approved', reviewed_by_user_id = 'manager-uuid'
WHERE id = 'request-uuid';

-- User can now access camera until requested_until timestamp
```

### Use Case 3: After-Hours Restriction

```sql
-- Restrict access to all branch cameras 18:00-06:00
INSERT INTO time_based_access_restrictions (
  tenant_id,
  scope_node_id,
  time_from,
  time_until,
  effect,
  description
)
VALUES (
  'tenant-uuid',
  'branch-uuid',
  '18:00:00',
  '06:00:00',
  'deny',
  'After-hours access restriction'
);
```

### Use Case 4: Bulk Permission via Access Group

```sql
-- Create access group for "Cash Counter Cameras"
INSERT INTO camera_access_groups (tenant_id, name)
VALUES ('tenant-uuid', 'Cash Counter Cameras');

-- Add cameras to group
INSERT INTO camera_access_group_members (access_group_id, camera_id)
VALUES ('group-uuid', 'camera1-uuid'), ('group-uuid', 'camera2-uuid');

-- Assign users to group
INSERT INTO user_access_group_assignments (access_group_id, user_id, effect)
VALUES ('group-uuid', 'user-uuid', 'allow');

-- User now has access to all cameras in group
```

---

## Implementation Checklist

### Backend (Completed)

- [x] Database migrations (005, 006, 007)
- [x] Control plane store interface updates
- [x] Organization management routes
- [x] User management routes
- [x] Authentication routes
- [x] Camera permission routes
- [x] Authentication middleware
- [x] Permission checker utility
- [x] Rate limiter
- [x] Audit middleware

### Frontend (Pending)

- [ ] Login page
- [ ] Organization hierarchy tree view
- [ ] Organization node CRUD forms
- [ ] User management interface
- [ ] User role assignment
- [ ] Camera permission management
- [ ] Access request workflow UI
- [ ] Time restriction configuration
- [ ] Access group management
- [ ] Session management

### Store Implementation (Pending)

- [ ] Implement all new store methods in PostgresStore
- [ ] Create repository classes for new tables
- [ ] Write unit tests for permission logic
- [ ] Integration tests for auth flow

---

## Next Steps

1. **Implement Store Methods**: Create repository implementations for all new database tables
2. **Frontend Development**: Build React components for org management and user administration
3. **Testing**: Comprehensive test coverage for permission logic
4. **Documentation**: API documentation with Swagger/OpenAPI
5. **Migration Scripts**: Production deployment scripts
6. **Monitoring**: Add logging and metrics for permission checks

---

## Support

For questions or issues, please refer to:
- Project README: `../README.md`
- Architecture docs: `./architecture.md`
- API reference: (To be created)
