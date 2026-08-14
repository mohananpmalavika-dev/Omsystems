# Organization Visibility Issue - Complete Solution Package

## 🎯 Problem Summary

**What you saw:**
- Error message: "An organization already exists. Only one organization is allowed per system."
- No organization visible in the UI at `/admin`

**Root cause:**
- Organization exists in database ✅
- Your user account lacks permission to see it ❌
- API filters out nodes you can't access 🔒

---

## ⚡ Quick Fix (Choose One)

### Option 1: NPM Script (Recommended)
```bash
npm run fix:org-visibility
```

### Option 2: Node Script
```bash
node fix-org-visibility.mjs
# Or with specific username:
node fix-org-visibility.mjs your_username
```

### Option 3: SQL Script
```bash
psql -d your_database_name -f fix-organization-visibility.sql
```

### Option 4: Direct SQL
```sql
UPDATE users SET role = 'company_admin' 
WHERE username = 'your_username';
```

**After running ANY fix**: Refresh your browser!

---

## 📦 Complete Solution Package

### 🛠️ Automated Tools

| Tool | Purpose | Command |
|------|---------|---------|
| `fix-org-visibility.mjs` | One-click fix with diagnostics | `npm run fix:org-visibility` |
| `fix-organization-visibility.sql` | Database fix script | `psql -d db -f fix-organization-visibility.sql` |
| `diagnose-org-issue.sql` | Show what's wrong | `npm run diagnose:org` |

### 🌐 Web-Based Tools

| Tool | Purpose | Access |
|------|---------|--------|
| Debug API Endpoint | Real-time diagnostic | `/api/v1/organization/debug` |
| UI Diagnostic Component | Visual warning + fix steps | Shown on `/admin` automatically |

### 📚 Documentation

| Document | Purpose | Audience |
|----------|---------|----------|
| `QUICK_FIX_GUIDE.md` | 30-second solution | Everyone |
| `README_ORG_FIX.md` | Step-by-step guide | End users |
| `ORGANIZATION_VISIBILITY_FIX.md` | Complete technical reference | Administrators |
| `ORGANIZATION_VISIBILITY_SOLUTION.md` | Technical implementation details | Developers |

---

## 🔍 How to Diagnose

### Method 1: Web Browser
Visit: `http://localhost:3000/api/v1/organization/debug`

Look for:
```json
{
  "debug": {
    "visibleCompanyNodes": 0,  // ← Problem!
    "companyNodes": 1          // ← Organization exists
  },
  "recommendation": "Organization exists but you have no permissions..."
}
```

### Method 2: CLI Tool
```bash
node fix-org-visibility.mjs
```

Shows:
- ✅ Organizations in database
- ✅ Your user info
- ✅ Current permissions
- ✅ Applies fix automatically

### Method 3: SQL Queries
```bash
npm run diagnose:org
# Or:
psql -d your_database_name -f diagnose-org-issue.sql
```

---

## 🎓 Understanding the Fix

### What Changed

**Before Fix:**
```
User Role: operator (or branch_admin)
   ↓
Cannot see organization nodes
   ↓
Organization appears to not exist
```

**After Fix:**
```
User Role: company_admin
   ↓
Can see ALL nodes in tenant
   ↓
Organization is visible ✅
```

### Why `company_admin`?

The `company_admin` role:
- ✅ Is tenant-scoped (secure)
- ✅ Is the standard admin role
- ✅ Grants access to all organization nodes
- ✅ Is designed for this exact use case
- ✅ All actions are audited

---

## ✅ Verification Checklist

After applying the fix:

- [ ] Ran the fix command/script
- [ ] Refreshed browser (Ctrl+F5 or Cmd+Shift+R)
- [ ] Logged out and logged back in
- [ ] Can see organization at `/admin`
- [ ] Can create child nodes (branches, regions, etc.)

### If Still Not Working

1. **Check debug endpoint**: `/api/v1/organization/debug`
2. **Verify role updated**:
   ```sql
   SELECT username, role FROM users WHERE username = 'your_username';
   ```
3. **Check tenant_id matches**:
   ```sql
   SELECT u.tenant_id as user_tenant, n.tenant_id as org_tenant
   FROM users u
   CROSS JOIN resource_nodes n
   WHERE u.username = 'your_username' AND n.node_type = 'company';
   ```
4. **Clear all cookies and cache**
5. **Try incognito/private window**

---

## 🔐 Security Considerations

### Is This Fix Safe?

**Yes!** Because:
1. ✅ Only affects users in their own tenant
2. ✅ Uses standard role (not a hack)
3. ✅ All actions are audit-logged
4. ✅ Can be reverted if needed
5. ✅ Follows the platform's permission model

### Alternative: Granular Permissions

If you don't want full admin access:

```sql
-- Grant access to specific organization node only
INSERT INTO role_node_assignments (user_id, node_id, role, assigned_by)
SELECT u.id, n.id, 'node_admin', u.id
FROM users u
CROSS JOIN resource_nodes n
WHERE u.username = 'your_username'
  AND n.node_type = 'company'
ON CONFLICT (user_id, node_id) DO UPDATE SET role = 'node_admin';
```

---

## 🚨 Prevention Tips

To avoid this issue in the future:

1. **During Initial Setup**
   - Create first user as `company_admin`
   - Verify they can see the organization before creating more users

2. **When Creating Organizations**
   - Assign at least one `company_admin` user
   - Test visibility immediately after creation

3. **When Creating Users**
   - Use the UI's user creation form (handles permissions automatically)
   - Or manually assign them to organization nodes

4. **Maintenance**
   - Keep at least one `company_admin` active at all times
   - Document who has admin access

---

## 📁 File Structure

```
/ (project root)
├── fix-org-visibility.mjs               ← Automated CLI fix tool
├── fix-organization-visibility.sql      ← SQL fix script  
├── diagnose-org-issue.sql               ← SQL diagnostic queries
├── QUICK_FIX_GUIDE.md                   ← 30-second solution
├── README_ORG_FIX.md                    ← User guide
├── ORGANIZATION_VISIBILITY_FIX.md       ← Admin reference
├── ORGANIZATION_VISIBILITY_SOLUTION.md  ← Technical details
├── ORGANIZATION_FIX_COMPLETE.md         ← This file
│
├── src/routes/
│   └── organization.routes.ts           ← Added /debug endpoint
│
└── dashboard/
    ├── app/admin/page.tsx               ← Shows diagnostic UI
    └── components/
        └── organization-visibility-fix.tsx  ← Diagnostic component
```

---

## 🆘 Support

### Quick Help

**Problem**: Fix didn't work  
**Solution**: Run diagnostics and check the output
```bash
npm run diagnose:org
```

**Problem**: Organization still not visible  
**Solution**: Check `/api/v1/organization/debug` for details

**Problem**: Need to undo the fix  
**Solution**: 
```sql
UPDATE users SET role = 'operator' WHERE username = 'your_username';
```

### Getting More Help

1. Check `/api/v1/organization/debug` endpoint
2. Run `node fix-org-visibility.mjs` for detailed diagnostics
3. Review application logs for permission errors
4. Check database for tenant_id mismatches

---

## 📊 Technical Architecture

### Permission System

The platform has a two-tier permission system:

**Tier 1: Role-Based (Global)**
```
super_admin → Full system access
company_admin → Full tenant access  ← This fix grants this
branch_admin → Branch + children
operator → Limited access
```

**Tier 2: Node-Based (Granular)**
```
role_node_assignments table
  ├── user_id
  ├── node_id
  └── role (node_admin, node_operator, viewer)
```

### API Filtering

```typescript
GET /v1/organization/tree
  ↓
Store.getOrganizationTree(tenantId)  // Gets all nodes
  ↓
visibleOrganizationNodeIds(user)     // Checks permissions
  ↓
filterOrganizationTree(nodes, visible)  // Removes hidden nodes
  ↓
Return filtered tree
```

**The fix**: Grants `company_admin` role → User passes permission checks → All nodes visible

---

## 🎉 Success Criteria

Your fix is complete when:

- ✅ No error message when trying to create organization
- ✅ Organization visible at `/admin` page
- ✅ Can see organization tree with nodes
- ✅ Can create child nodes (branches, regions, etc.)
- ✅ Debug endpoint shows `visibleCompanyNodes > 0`
- ✅ User role is `company_admin` or has node assignment

---

## 🔄 Rollback Plan

If you need to undo the fix:

```sql
-- Revert to original role
UPDATE users 
SET role = 'operator'  -- or whatever the original role was
WHERE username = 'your_username';

-- Or remove node assignment
DELETE FROM role_node_assignments
WHERE user_id = (SELECT id FROM users WHERE username = 'your_username');
```

---

## 📈 Next Steps After Fix

Once the organization is visible:

1. **Create Branch Structure**
   - Add headquarters, zones, regions, areas, branches
   - Assign cameras to branches

2. **Configure Users**
   - Create additional users with appropriate roles
   - Assign users to specific branches/regions

3. **Set Up Cameras**
   - Register cameras under branches
   - Configure analytics rules

4. **Test Permissions**
   - Verify users can only see their assigned nodes
   - Test branch-level access controls

---

## 🏁 Summary

| Aspect | Details |
|--------|---------|
| **Problem** | Organization exists but invisible due to permissions |
| **Root Cause** | User lacks `company_admin` role or node assignment |
| **Quick Fix** | `npm run fix:org-visibility` |
| **Verification** | Refresh browser, check `/admin` page |
| **Prevention** | Always create first user as `company_admin` |
| **Rollback** | Revert user role if needed |

---

**Ready to fix?** Run this command:

```bash
npm run fix:org-visibility
```

Then refresh your browser. That's it! 🎉
