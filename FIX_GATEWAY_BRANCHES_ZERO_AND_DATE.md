# Fix for Gateway/Branches Showing 0 and Wrong Created Date

## Issues Found
1. **Gateway count showing 0** - Stats endpoint not counting gateways correctly
2. **Branch count showing 0** - Stats endpoint not counting branches correctly  
3. **Gateway created date showing "1/1/1970"** - Backend SQL queries don't include `created_at` field

## Root Causes

### Issue 1 & 2: Stats Showing 0
**File:** `dashboard/app/api/admin/system/stats/route.ts`

**Problem:** The stats endpoint was trying to fetch from a non-existent `/v1/admin/cameras/count` endpoint and had TODO comments for gateways and branches.

**Solution:** Fetch actual data from the correct endpoints and count them.

### Issue 3: Wrong Created Date
**File:** `src/database/edge-agent-repository.ts`

**Problem:** The SQL SELECT queries in `listByBranch()`, `get()`, `heartbeat()`, and `register()` methods don't include the `created_at` column, even though it exists in the database.

**Current Query:**
```sql
SELECT id::text, branch_node_id::text, name, version,
       CASE WHEN last_seen_at < now() - interval '90 seconds'
         THEN 'offline'::edge_agent_status ELSE status END AS status,
       last_seen_at, public_media_url, device_uuid,
       credential_issued_at, credential_revoked_at
FROM edge_agents
WHERE branch_node_id = $1
ORDER BY name, created_at
```

**Missing:** `created_at` in the SELECT clause (it's used in ORDER BY but not returned)

## Required Changes

### 1. Update AgentRow Type Definition
**File:** `src/database/edge-agent-repository.ts` (Line ~5-16)

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
  created_at: Date;  // ADD THIS LINE
};
```

### 2. Update mapAgent Function
**File:** `src/database/edge-agent-repository.ts` (Line ~18-31)

```typescript
function mapAgent(row: AgentRow): EdgeAgent {
  return {
    id: row.id,
    branchId: row.branch_node_id,
    name: row.name,
    version: row.version,
    status: row.status,
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),  // ADD THIS LINE
    ...(row.public_media_url ? { publicMediaUrl: row.public_media_url } : {}),
    ...(row.device_uuid ? { deviceUuid: row.device_uuid } : {}),
    credentialStatus: row.credential_revoked_at ? "revoked" : row.credential_issued_at ? "active" : "not-enrolled",
    ...(row.credential_issued_at ? { credentialIssuedAt: row.credential_issued_at.toISOString() } : {}),
    ...(row.credential_revoked_at ? { credentialRevokedAt: row.credential_revoked_at.toISOString() } : {}),
  };
}
```

### 3. Update All SQL SELECT Queries

**A. listByBranch() method** (Line ~78-90)
```typescript
async listByBranch(branchId: string) {
  const result = await this.pool.query<AgentRow>(
    `SELECT id::text, branch_node_id::text, name, version,
            CASE WHEN last_seen_at < now() - interval '90 seconds'
              THEN 'offline'::edge_agent_status ELSE status END AS status,
            last_seen_at, public_media_url, device_uuid,
            credential_issued_at, credential_revoked_at, created_at  // ADD created_at HERE
     FROM edge_agents
     WHERE branch_node_id = $1
     ORDER BY name, created_at`,
    [branchId],
  );
  return result.rows.map(mapAgent);
}
```

**B. get() method** (Line ~92-102)
```typescript
async get(id: string) {
  const result = await this.pool.query<AgentRow>(
    `SELECT id::text, branch_node_id::text, name, version,
            CASE WHEN last_seen_at < now() - interval '90 seconds'
              THEN 'offline'::edge_agent_status ELSE status END AS status,
            last_seen_at, public_media_url, device_uuid,
            credential_issued_at, credential_revoked_at, created_at  // ADD created_at HERE
     FROM edge_agents WHERE id = $1`,
    [id],
  );
  return result.rows[0] ? mapAgent(result.rows[0]) : undefined;
}
```

**C. heartbeat() method** (Line ~104-117)
```typescript
async heartbeat(id: string, version: string, publicMediaUrl?: string) {
  const result = await this.pool.query<AgentRow>(
    `UPDATE edge_agents
     SET version = $2, status = 'online', last_seen_at = now(),
         public_media_url = COALESCE($3, public_media_url)
     WHERE id = $1
     RETURNING id::text, branch_node_id::text, name, version, status,
               last_seen_at, public_media_url, device_uuid,
               credential_issued_at, credential_revoked_at, created_at`,  // ADD created_at HERE
    [id, version, publicMediaUrl ?? null],
  );
  return result.rows[0] ? mapAgent(result.rows[0]) : undefined;
}
```

**D. register() method** (Line ~64-76)
```typescript
async register(branchId: string, name: string, version: string) {
  const result = await this.pool.query<AgentRow>(
    `INSERT INTO edge_agents (tenant_id, branch_node_id, name, version)
     SELECT tenant_id, id, $2, $3
     FROM resource_nodes
     WHERE id = $1 AND node_type = 'branch'
     RETURNING id::text, branch_node_id::text, name, version, status,
               last_seen_at, public_media_url, device_uuid,
               credential_issued_at, credential_revoked_at, created_at`,  // ADD created_at HERE
    [branchId, name, version],
  );
  if (!result.rows[0]) throw new Error("invalid_branch");
  return mapAgent(result.rows[0]);
}
```

### 4. Update EdgeAgent Interface (if needed)
**File:** `src/domain/models.ts` (Line ~517)

Check if `createdAt` needs to be added to the EdgeAgent interface:
```typescript
interface EdgeAgent {
  id: string;
  branchId: string;
  name: string;
  version: string;
  status: "pending" | "online" | "offline";
  lastSeenAt: string | null;
  createdAt?: string;  // ADD THIS IF NOT EXISTS
  publicMediaUrl?: string;
  deviceUuid?: string;
  credentialStatus?: "not-enrolled" | "active" | "revoked";
  credentialIssuedAt?: string;
  credentialRevokedAt?: string;
}
```

### 5. Update Dashboard Gateway Route (Already Fixed)
**File:** `dashboard/app/api/admin/system/gateways/route.ts`

Already updated to handle both `createdAt` and `created_at` field names:
```typescript
created_at: agent.createdAt || agent.created_at || new Date().toISOString(),
```

### 6. Stats Route (Already Fixed)
**File:** `dashboard/app/api/admin/system/stats/route.ts`

Already updated to fetch real data from correct endpoints and count properly.

## Testing Steps

1. **Deploy Backend Changes:**
   - Update `src/database/edge-agent-repository.ts` with all the SQL query changes
   - Deploy to Render (control-plane service)

2. **Verify Gateway List:**
   - Go to Admin → System Management → Gateways tab
   - Should see actual count in the stats card (not 0)
   - Should see correct creation date (not 1/1/1970)

3. **Verify Branches List:**
   - Go to Admin → System Management → Branches tab
   - Should see actual count in the stats card (not 0)

4. **Check Network Tab:**
   - Open browser DevTools → Network
   - Refresh the page
   - Check `/api/admin/system/stats` response - should have correct counts
   - Check `/api/admin/system/gateways` response - should have `created_at` with proper dates

## Expected Results After Fix

✅ Gateway count shows actual number (e.g., 1 instead of 0)
✅ Branch count shows actual number  
✅ Gateway created date shows correct date (e.g., "2/1/2026" instead of "1/1/1970")
✅ Stats endpoint returns accurate counts
✅ All tabs load without errors

## Files to Modify

1. `src/database/edge-agent-repository.ts` - Add `created_at` to all queries and type/mapper
2. `src/domain/models.ts` - Add `createdAt?` to EdgeAgent interface (if not exists)
3. `dashboard/app/api/admin/system/stats/route.ts` - ✅ Already fixed
4. `dashboard/app/api/admin/system/gateways/route.ts` - ✅ Already fixed
5. `dashboard/app/api/admin/system/branches/route.ts` - ✅ Already fixed

## Priority

🔴 **HIGH PRIORITY** - The missing `created_at` field affects:
- System Management UI showing wrong dates
- Audit trails and compliance
- Troubleshooting when agents were registered
- Sorting and filtering by creation date
