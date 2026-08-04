# Manual Fix Instructions for Gateway/Branches Showing 0 and Wrong Date

## Summary
- Gateway count: 0 → Should show actual count (e.g., 1)
- Branch count: 0 → Should show actual count  
- Gateway created date: 1/1/1970 → Should show actual date

## Files Already Fixed ✅
1. `dashboard/app/api/admin/system/stats/route.ts` - Fetches real counts
2. `dashboard/app/api/admin/system/gateways/route.ts` - Handles created_at properly
3. `dashboard/app/api/admin/system/branches/route.ts` - Fixed endpoint

## Files That Need Manual Fixing ❌

### File: `src/database/edge-agent-repository.ts`

#### Change 1: Add created_at to AgentRow type (Line 5-16)
**Find:**
```typescript
type AgentRow = {
  id: string;
  branch_node_id: string;
  name: string;
  version: string;
  status: EdgeAgent["status"];
  last_seen_at: Date | null;
  public_media_url: string | null;
  device_uuid: string | null;
  credential_issued_at: Date | null;
  credential_revoked_at: Date | null;
};
```

**Replace with:**
```typescript
type AgentRow = {
  id: string;
  branch_node_id: string;
  name: string;
  version: string;
  status: EdgeAgent["status"];
  last_seen_at: Date | null;
  public_media_url: string | null;
  device_uuid: string | null;
  credential_issued_at: Date | null;
  credential_revoked_at: Date | null;
  created_at: Date;
};
```

#### Change 2: Add createdAt to mapAgent function (Line 18-31)
**Find this line:**
```typescript
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
```

**Add this line right after it:**
```typescript
    createdAt: row.created_at.toISOString(),
```

**Full function should look like:**
```typescript
function mapAgent(row: AgentRow): EdgeAgent {
  return {
    id: row.id,
    branchId: row.branch_node_id,
    name: row.name,
    version: row.version,
    status: row.status,
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    ...(row.public_media_url ? { publicMediaUrl: row.public_media_url } : {}),
    ...(row.device_uuid ? { deviceUuid: row.device_uuid } : {}),
    credentialStatus: row.credential_revoked_at ? "revoked" : row.credential_issued_at ? "active" : "not-enrolled",
    ...(row.credential_issued_at ? { credentialIssuedAt: row.credential_issued_at.toISOString() } : {}),
    ...(row.credential_revoked_at ? { credentialRevokedAt: row.credential_revoked_at.toISOString() } : {}),
  };
}
```

#### Change 3: Add created_at to register() SQL query (Line ~69)
**Find:**
```typescript
       RETURNING id::text, branch_node_id::text, name, version, status,
                 last_seen_at, public_media_url, device_uuid,
                 credential_issued_at, credential_revoked_at`,
```

**Replace with:**
```typescript
       RETURNING id::text, branch_node_id::text, name, version, status,
                 last_seen_at, public_media_url, device_uuid,
                 credential_issued_at, credential_revoked_at, created_at`,
```

#### Change 4: Add created_at to listByBranch() SQL query (Line ~83)
**Find:**
```typescript
              last_seen_at, public_media_url, device_uuid,
              credential_issued_at, credential_revoked_at
       FROM edge_agents
```

**Replace with:**
```typescript
              last_seen_at, public_media_url, device_uuid,
              credential_issued_at, credential_revoked_at, created_at
       FROM edge_agents
```

#### Change 5: Add created_at to get() SQL query (Line ~98)
**Find:**
```typescript
              last_seen_at, public_media_url, device_uuid,
              credential_issued_at, credential_revoked_at
       FROM edge_agents WHERE id = $1`,
```

**Replace with:**
```typescript
              last_seen_at, public_media_url, device_uuid,
              credential_issued_at, credential_revoked_at, created_at
       FROM edge_agents WHERE id = $1`,
```

#### Change 6: Add created_at to heartbeat() SQL query (Line ~112)
**Find:**
```typescript
       RETURNING id::text, branch_node_id::text, name, version, status,
                 last_seen_at, public_media_url, device_uuid,
                 credential_issued_at, credential_revoked_at`,
```

**Replace with:**
```typescript
       RETURNING id::text, branch_node_id::text, name, version, status,
                 last_seen_at, public_media_url, device_uuid,
                 credential_issued_at, credential_revoked_at, created_at`,
```

### File: `src/domain/models.ts` (Optional - for TypeScript consistency)

**Find the EdgeAgent interface (around line 517):**
```typescript
interface EdgeAgent {
  id: string;
  branchId: string;
  name: string;
  version: string;
  status: "pending" | "online" | "offline";
  lastSeenAt: string | null;
  publicMediaUrl?: string;
  deviceUuid?: string;
  credentialStatus?: "not-enrolled" | "active" | "revoked";
  credentialIssuedAt?: string;
  credentialRevokedAt?: string;
}
```

**Add `createdAt?` field:**
```typescript
interface EdgeAgent {
  id: string;
  branchId: string;
  name: string;
  version: string;
  status: "pending" | "online" | "offline";
  lastSeenAt: string | null;
  createdAt?: string;  // ADD THIS LINE
  publicMediaUrl?: string;
  deviceUuid?: string;
  credentialStatus?: "not-enrolled" | "active" | "revoked";
  credentialIssuedAt?: string;
  credentialRevokedAt?: string;
}
```

## After Making Changes

1. **Commit the changes:**
   ```bash
   git add src/database/edge-agent-repository.ts
   git add src/domain/models.ts
   git commit -m "fix: include created_at in edge agent queries for proper date display"
   ```

2. **Deploy to Render:**
   ```bash
   git push
   ```

3. **Verify on Dashboard:**
   - Go to Admin → System Management
   - Check Gateway count (should not be 0)
   - Check Branch count (should not be 0)
   - Check Gateway created date (should not be 1/1/1970)

## Why This Happened

The database table `edge_agents` has a `created_at` column, but the SQL SELECT queries in the repository didn't include it in the SELECT clause. The queries used `created_at` in ORDER BY but never returned it to the application, so:
- The TypeScript type didn't include it
- The mapper function didn't map it
- The frontend received `undefined` for created_at
- JavaScript Date converted `undefined` to Unix epoch (1/1/1970)

## Impact

This fix will:
✅ Show accurate gateway/branch counts in stats
✅ Display correct creation dates for edge agents  
✅ Enable proper sorting by creation date
✅ Improve audit trails and compliance reporting
