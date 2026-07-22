# Incident Management Permissions Guide

## Overview

The Aditi Sentinel incident management module uses a granular, role-based permission system that controls access to incident operations, investigation activities, and evidence handling.

## Permission Actions

### Incident Operations

| Permission | Description | Typical Roles |
|-----------|-------------|---------------|
| `incident:create` | Create new incidents | Operators, Branch Managers, Investigators |
| `incident:view` | View incident details | All security staff |
| `incident:update` | Update incident information | Investigators, Managers |
| `incident:assign` | Assign incidents to investigators | Managers, Senior Investigators |
| `incident:escalate` | Escalate incidents to senior management | Managers, Investigators |
| `incident:close` | Close resolved incidents | Managers, Senior Investigators |
| `incident:reopen` | Reopen closed incidents | Managers, Auditors |

### Investigation Operations

| Permission | Description | Typical Roles |
|-----------|-------------|---------------|
| `investigation:view` | View investigation details | Investigators, Managers, Evidence Officers |
| `investigation:manage` | Manage investigation workflow | Investigators, Senior Investigators |
| `investigation:enhance` | Perform video enhancement | Forensic Analysts, Senior Investigators |

### Evidence Management

| Permission | Description | Typical Roles |
|-----------|-------------|---------------|
| `evidence:create` | Add evidence items | Investigators, Evidence Officers |
| `evidence:view` | View evidence | Investigators, Managers, Legal Team |
| `evidence:preserve` | Preserve video evidence | Investigators, Evidence Officers |
| `evidence:export-package` | Create evidence packages | Evidence Officers |
| `evidence:approve` | Approve evidence packages | Senior Managers, Legal Team |
| `evidence:share` | Share evidence with authorities | Evidence Officers, Managers |
| `evidence:legal-hold` | Apply legal holds | Evidence Officers, Legal Team |
| `evidence:release-hold` | Release legal holds | Legal Team, Compliance Officers |

### Authority Coordination

| Permission | Description | Typical Roles |
|-----------|-------------|---------------|
| `police:update` | Manage police intimation records | Branch Managers, Evidence Officers |
| `insurance:update` | Manage insurance claims | Branch Managers, Finance Team |
| `incident-report:approve` | Approve final incident reports | Senior Managers, Legal Team |

## Common Role Configurations

### Control Room Operator

**Permissions:**
- `incident:create` - Create incidents from live monitoring
- `incident:view` - View ongoing incidents
- `live:view` - Monitor live cameras
- `recording:view` - Review recordings
- `alerts:acknowledge` - Acknowledge alerts

**Use Case:** First responder who creates initial incident records from alerts or live observations.

### Security Investigator

**Permissions:**
- `incident:create`, `incident:view`, `incident:update`, `incident:assign`
- `investigation:view`, `investigation:manage`
- `evidence:view`, `evidence:create`, `evidence:preserve`
- `live:view`, `recording:view`

**Use Case:** Conducts investigations, collects evidence, manages investigation workflow.

### Evidence Officer

**Permissions:**
- `incident:view`
- `investigation:view`
- `evidence:view`, `evidence:create`, `evidence:preserve`, `evidence:export-package`, `evidence:approve`
- `evidence:legal-hold`, `evidence:release-hold`
- `police:update`, `insurance:update`

**Use Case:** Manages evidence custody, creates packages for authorities, handles legal holds.

### Branch Manager

**Permissions:**
- `incident:view`, `incident:create`, `incident:update`, `incident:assign`, `incident:escalate`
- `investigation:view`
- `evidence:view`
- `police:update`, `insurance:update`

**Use Case:** Oversees branch-level incidents, coordinates with authorities, manages escalations.

### Senior Manager / Legal Team

**Permissions:**
- `incident:view`, `incident:close`, `incident:reopen`
- `investigation:view`
- `evidence:view`, `evidence:approve`, `evidence:share`
- `evidence:legal-hold`, `evidence:release-hold`
- `incident-report:approve`

**Use Case:** Reviews and approves evidence packages, manages legal compliance, approves final reports.

## Permission Hierarchy Examples

### Example 1: Regional Access

```typescript
{
  userId: "regional-security-manager",
  scopeNodeId: "region-south",
  actions: [
    "incident:view", "incident:assign", "incident:escalate",
    "investigation:view",
    "evidence:view",
  ],
  effect: "allow"
}
```

This grant allows the regional manager to:
- View all incidents in South Region
- Assign incidents to investigators
- Escalate critical incidents
- View investigations and evidence
- But NOT create evidence packages or approve reports

### Example 2: Sensitive Area Restrictions

```typescript
// Grant access to branch
{
  userId: "branch-operator",
  scopeNodeId: "branch-blr-001",
  actions: ["incident:create", "incident:view", "live:view"],
  effect: "allow"
}

// Deny access to vault cameras
{
  userId: "branch-operator",
  scopeNodeId: "vault-camera-group",
  actions: ["incident:create", "incident:view", "live:view"],
  effect: "deny"
}
```

The operator can create incidents for most cameras, but vault incidents require elevated permissions.

## Workflow-Based Permission Requirements

### Incident Creation Workflow

1. **Detection** → Requires: `incident:create`
2. **Triage** → Requires: `incident:view`, `incident:update`
3. **Assignment** → Requires: `incident:assign`
4. **Investigation** → Requires: `investigation:manage`, `evidence:create`
5. **Evidence Preservation** → Requires: `evidence:preserve`, `evidence:legal-hold`
6. **Package Creation** → Requires: `evidence:export-package`
7. **Package Approval** → Requires: `evidence:approve`
8. **Authority Sharing** → Requires: `evidence:share`, `police:update`
9. **Report Approval** → Requires: `incident-report:approve`
10. **Closure** → Requires: `incident:close`

### Critical Separation of Duties

**Evidence Chain Integrity:**
- Evidence **creation** and **approval** should be separate roles
- Legal hold **application** and **release** should require different authority levels
- Evidence **sharing** should require explicit approval

**Investigation Independence:**
- Incident **investigator** should not approve their own evidence packages
- **Branch managers** should not investigate incidents in their own branches
- **Legal team** should approve final reports independently

## Permission Enforcement

### API Level

All incident endpoints check permissions via the authorization layer:

```typescript
// Example: Creating an incident
const decision = await store.checkAccess(
  user,
  "incident:create",
  branchNodeId
);

if (!decision.allowed) {
  return reply.code(403).send({ error: "permission_denied" });
}
```

### Audit Trail

All permission-sensitive operations are logged:

```typescript
await store.writeAudit({
  tenantId: user.tenantId,
  actorUserId: user.id,
  action: "evidence:approve",
  resourceNodeId: branchId,
  outcome: "success",
  details: { packageId, incidentNumber },
});
```

## Confidentiality Levels

Incidents have confidentiality levels that add an additional access layer:

- **public** - Visible to all with `incident:view`
- **internal** - Visible to organization members only
- **confidential** - Requires `investigation:view`
- **restricted** - Requires explicit grant + `investigation:manage`
- **highly-restricted** - Requires senior management approval

Access checks combine both the permission action AND the confidentiality level.

## Best Practices

1. **Least Privilege:** Grant only the minimum permissions required for a role
2. **Separation of Duties:** Evidence creators should not approve their own packages
3. **Audit Everything:** All evidence operations should be logged with actor and timestamp
4. **Time-Limited Access:** Consider temporary permission grants for external investigators
5. **Regular Review:** Audit permission grants quarterly for compliance
6. **Clear Denial Reasons:** When denying access, provide specific reason codes

## Compliance Considerations

### RBI Guidelines

- **Video retention:** Evidence legal holds override retention policies
- **Audit trail:** All evidence access must be logged with justification
- **Third-party access:** External sharing requires explicit approval and logging

### Data Protection

- **Personal data:** Restrict access to participant details based on role
- **Sensitive incidents:** Employee misconduct requires confidential classification
- **External sharing:** Ensure compliance with data protection laws when sharing with authorities

## Implementation Notes

The permission system is hierarchical - permissions granted at a parent node (e.g., company) automatically apply to all child nodes (regions, branches, cameras) unless explicitly denied.

For implementation details, see:
- `/src/domain/models.ts` - Permission action definitions
- `/src/domain/authorization.ts` - Authorization logic
- `/src/routes/incidents.routes.ts` - API permission checks
