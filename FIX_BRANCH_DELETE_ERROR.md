# Fix: Branch Delete 500 Error

## Error

```
DELETE https://sentinel-grid-monitoring1.onrender.com/api/admin/system/branches/00000000-0000-4000-8000-000000000104 
500 (Internal Server Error)
```

## Root Cause

The endpoint `/api/admin/system/branches/:id` is likely mapped to `/v1/organization/nodes/:id` in the backend.

The DELETE operation is failing because one of these reasons:

1. **Active children exist** - Branch has cameras or sub-nodes that must be deactivated first
2. **Database constraint violation** - Foreign key constraints preventing deletion
3. **Store method error** - `deactivateOrganizationNode()` or `getDescendantNodes()` throwing an error
4. **Permission check failure** - User doesn't have proper access rights

## Quick Fix Option 1: Force Delete with Cascade

Add a query parameter to force delete with cascading:

### Update the DELETE endpoint in `src/routes/organization.routes.ts`:

```typescript
// Soft delete organization node
app.delete("/v1/organization/nodes/:id", async (request, reply) => {
  const { id } = nodeIdSchema.parse(request.params);
  
  // Parse query params
  const query = z.object({
    force: z.coerce.boolean().default(false),
    cascade: z.coerce.boolean().default(false)
  }).parse(request.query);

  // Check permission
  if (!(await requireAccess(request, reply, store, "org:manage", id))) {
    return;
  }

  try {
    // Check if node has active children
    const descendants = await store.getDescendantNodes(id, false);
    
    if (descendants.length > 0) {
      if (!query.force && !query.cascade) {
        return reply.code(400).send({
          error: "node_has_active_children",
          message: "Cannot delete node with active children. Use ?force=true or ?cascade=true to proceed.",
          childCount: descendants.length,
          children: descendants.slice(0, 5).map(c => ({ id: c.id, name: c.name, type: c.type }))
        });
      }
      
      // If cascade=true, deactivate all children first
      if (query.cascade) {
        for (const descendant of descendants) {
          await store.deactivateOrganizationNode(descendant.id);
        }
      }
    }

    // Deactivate the node
    await store.deactivateOrganizationNode(id);

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "organization.node_deleted",
      resourceNodeId: id,
      outcome: "success",
      details: {
        cascade: query.cascade,
        childrenDeleted: descendants.length
      }
    });

    return reply.code(204).send();
    
  } catch (error) {
    // Log the actual error for debugging
    console.error("Error deleting organization node:", error);
    
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "organization.node_deleted",
      resourceNodeId: id,
      outcome: "failure",
      details: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
    
    return reply.code(500).send({
      error: "delete_failed",
      message: error instanceof Error ? error.message : "Failed to delete node",
      details: process.env.NODE_ENV === "development" ? error : undefined
    });
  }
});
```

## Quick Fix Option 2: Frontend Update

Update the frontend to handle the error gracefully and show a better message:

### In your frontend delete handler:

```typescript
async function deleteBranch(branchId: string) {
  try {
    const response = await fetch(
      `/api/admin/system/branches/${branchId}`,
      { 
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      
      if (response.status === 400 && error.error === 'node_has_active_children') {
        // Branch has children - ask user if they want to cascade delete
        const confirmCascade = confirm(
          `This branch has ${error.childCount || 'some'} active items. ` +
          `Delete anyway? This will deactivate all child items.`
        );
        
        if (confirmCascade) {
          // Retry with cascade=true
          const cascadeResponse = await fetch(
            `/api/admin/system/branches/${branchId}?cascade=true`,
            { 
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          if (!cascadeResponse.ok) {
            throw new Error('Failed to delete branch with cascade');
          }
          
          showSuccess('Branch and all child items deleted successfully');
          return;
        }
        
        return; // User cancelled
      }
      
      throw new Error(error.message || 'Failed to delete branch');
    }
    
    showSuccess('Branch deleted successfully');
    
  } catch (error) {
    console.error('Delete branch error:', error);
    showError(error.message || 'Failed to delete branch');
  }
}
```

## Quick Fix Option 3: Database-Level Fix

If the issue is database constraints, check for orphaned records:

```sql
-- Check what's preventing deletion
SELECT 
  'Cameras' as type,
  COUNT(*) as count 
FROM cameras 
WHERE branch_node_id = '00000000-0000-4000-8000-000000000104'

UNION ALL

SELECT 
  'Child Nodes',
  COUNT(*) 
FROM organization_nodes 
WHERE parent_node_id = '00000000-0000-4000-8000-000000000104'

UNION ALL

SELECT 
  'Users',
  COUNT(*) 
FROM user_scope_assignments 
WHERE branch_node_id = '00000000-0000-4000-8000-000000000104';

-- If you want to force delete (USE WITH CAUTION):
-- 1. Deactivate all cameras first
UPDATE cameras 
SET status = 'decommissioned',
    updated_at = NOW()
WHERE branch_node_id = '00000000-0000-4000-8000-000000000104';

-- 2. Deactivate child nodes
UPDATE organization_nodes 
SET is_active = false,
    updated_at = NOW()
WHERE parent_node_id = '00000000-0000-4000-8000-000000000104';

-- 3. Now deactivate the branch
UPDATE organization_nodes 
SET is_active = false,
    updated_at = NOW()
WHERE id = '00000000-0000-4000-8000-000000000104';
```

## Immediate Workaround (No Code Changes)

Use the API directly with cascade parameter:

```bash
# Try delete with cascade
curl -X DELETE \
  'https://sentinel-grid-monitoring1.onrender.com/api/admin/system/branches/00000000-0000-4000-8000-000000000104?cascade=true' \
  -H 'Authorization: Bearer YOUR_TOKEN'

# Or try using the organization nodes endpoint
curl -X DELETE \
  'https://sentinel-grid-monitoring1.onrender.com/v1/organization/nodes/00000000-0000-4000-8000-000000000104?cascade=true' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

## Debug the Actual Error

To see what's really failing, check the backend logs:

```bash
# On Render
# Go to your service → Logs tab
# Look for errors around the time of the DELETE request

# You should see something like:
# Error deleting organization node: <actual error message>
```

## Most Likely Cause

Based on the error pattern, it's most likely:

**The branch has cameras or child nodes that need to be deactivated first.**

### Solution:
1. Deactivate all cameras in the branch first
2. Deactivate any child nodes
3. Then delete the branch

OR

Update the API to support `?cascade=true` parameter to do this automatically.

## Recommended Fix (Best Practice)

Implement a soft-delete with proper cascade:

```typescript
// In your store implementation
async deactivateOrganizationNode(nodeId: string): Promise<void> {
  const client = await this.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get all descendants
    const descendantsResult = await client.query(`
      WITH RECURSIVE node_tree AS (
        SELECT id, parent_node_id, type 
        FROM organization_nodes 
        WHERE id = $1
        
        UNION ALL
        
        SELECT n.id, n.parent_node_id, n.type
        FROM organization_nodes n
        INNER JOIN node_tree nt ON n.parent_node_id = nt.id
        WHERE n.is_active = true
      )
      SELECT id, type FROM node_tree WHERE id != $1
    `, [nodeId]);
    
    // Deactivate all descendant cameras first
    await client.query(`
      UPDATE cameras 
      SET status = 'decommissioned',
          updated_at = NOW()
      WHERE branch_node_id IN (
        WITH RECURSIVE node_tree AS (
          SELECT id FROM organization_nodes WHERE id = $1
          UNION ALL
          SELECT n.id FROM organization_nodes n
          INNER JOIN node_tree nt ON n.parent_node_id = nt.id
        )
        SELECT id FROM node_tree
      )
    `, [nodeId]);
    
    // Deactivate all descendant nodes
    for (const desc of descendantsResult.rows) {
      await client.query(`
        UPDATE organization_nodes 
        SET is_active = false,
            updated_at = NOW()
        WHERE id = $1
      `, [desc.id]);
    }
    
    // Finally deactivate the parent node
    await client.query(`
      UPDATE organization_nodes 
      SET is_active = false,
          updated_at = NOW()
      WHERE id = $1
    `, [nodeId]);
    
    await client.query('COMMIT');
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

## Testing the Fix

After implementing the fix:

```bash
# Test 1: Try delete without cascade (should get friendly error)
DELETE /v1/organization/nodes/:id

# Expected response:
{
  "error": "node_has_active_children",
  "message": "Cannot delete node with active children. Use ?cascade=true",
  "childCount": 5
}

# Test 2: Delete with cascade
DELETE /v1/organization/nodes/:id?cascade=true

# Expected: 204 No Content (success)

# Test 3: Verify deletion
GET /v1/organization/nodes/:id

# Expected: Node should have is_active = false
```

## Summary

**Immediate action**: Check backend logs to see the actual error

**Quick fix**: Update the DELETE endpoint to handle children gracefully with cascade option

**Best fix**: Implement proper soft-delete with recursive cascade in the store method

The error is a **backend API issue**, not the analytics engine we built. It's in the organization management routes.
