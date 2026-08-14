# Organization Visibility Issue - Quick Start Guide

## The Problem

You see this error:
> **"An organization already exists. Only one organization is allowed per system."**

But no organization shows in the UI.

**Why?** Your user account doesn't have permission to see the existing organization.

---

## Quick Fixes (Pick One)

### 🚀 Option 1: Run the Automated Fix Script (Easiest)

```bash
node fix-org-visibility.mjs
```

This will:
- Find the first active user
- Grant them `company_admin` role
- Make the organization visible

**With a specific username:**
```bash
node fix-org-visibility.mjs your_username
```

---

### 🗃️ Option 2: Run SQL Script

```bash
psql -d your_database_name -f fix-organization-visibility.sql
```

Then refresh your browser.

---

### 🖥️ Option 3: Manual SQL Command

Connect to your database and run:

```sql
-- Replace 'your_username' with your actual username
UPDATE users
SET role = 'company_admin'
WHERE username = 'your_username'
  AND is_active = true;
```

---

### 🌐 Option 4: Use the Web Interface

1. Go to `/admin` in your application
2. You'll see a yellow warning: "Organization Permission Issue Detected"
3. Click "Technical Details (for administrators)"
4. Copy the SQL command shown
5. Run it in your database
6. Click "Check Again"

---

## Verification

After applying any fix:

### Check 1: API Endpoint
Visit: `http://localhost:3000/api/v1/organization/debug`

Look for:
```json
{
  "debug": {
    "visibleCompanyNodes": 1  // Should be 1 or more
  }
}
```

### Check 2: Database Query
```sql
SELECT username, role
FROM users
WHERE username = 'your_username';
-- Should show role = 'company_admin'
```

### Check 3: Refresh Browser
Refresh the `/admin` page. The organization should now be visible.

---

## Diagnostic Tools

### 1. Web Diagnostic
**URL:** `/api/v1/organization/debug`

Shows:
- Your user info
- How many organizations exist
- How many you can see
- Why you can't see hidden ones

### 2. CLI Diagnostic
```bash
node fix-org-visibility.mjs
```

Shows:
- Organizations in database
- User roles
- Current permissions
- Applies fix automatically

### 3. SQL Diagnostic
```bash
psql -d your_database_name -f diagnose-org-issue.sql
```

Shows:
- All organizations
- All users and roles
- All role-node assignments
- Diagnosis of the issue

---

## Understanding the Solution

### What's the `company_admin` Role?

Users with `company_admin` role can:
- ✅ See all organization nodes in their tenant
- ✅ Create, edit, and delete organization nodes
- ✅ Manage users and permissions
- ✅ Access all branches and cameras

### Is This Secure?

Yes! The `company_admin` role is:
- **Tenant-scoped**: Can only see their own company's data
- **Standard role**: Designed for organization administrators
- **Audited**: All actions are logged in the audit trail

### Alternative: Node-Specific Access

If you don't want full admin access, use this instead:

```sql
-- Grant access to specific organization node only
INSERT INTO role_node_assignments (user_id, node_id, role, assigned_by)
SELECT 
    u.id,
    n.id,
    'node_admin',
    u.id
FROM users u
CROSS JOIN resource_nodes n
WHERE u.username = 'your_username'
  AND n.node_type = 'company'
ON CONFLICT (user_id, node_id) DO UPDATE
SET role = 'node_admin';
```

---

## Files Reference

| File | Purpose | How to Use |
|------|---------|------------|
| `fix-org-visibility.mjs` | Automated CLI fix | `node fix-org-visibility.mjs` |
| `fix-organization-visibility.sql` | SQL fix script | `psql -d db -f fix-organization-visibility.sql` |
| `diagnose-org-issue.sql` | SQL diagnostic queries | `psql -d db -f diagnose-org-issue.sql` |
| `ORGANIZATION_VISIBILITY_FIX.md` | Complete documentation | Read for detailed explanation |
| `ORGANIZATION_VISIBILITY_SOLUTION.md` | Solution summary | Read for technical details |
| `/api/v1/organization/debug` | Web diagnostic endpoint | Visit in browser while logged in |

---

## Troubleshooting

### Fix didn't work?

1. **Clear browser cache and cookies**
   - Log out and log back in
   - Or use incognito/private window

2. **Check tenant_id matches**
   ```sql
   SELECT u.username, u.tenant_id as user_tenant, n.name, n.tenant_id as org_tenant
   FROM users u
   CROSS JOIN resource_nodes n
   WHERE u.username = 'your_username'
     AND n.node_type = 'company';
   -- user_tenant and org_tenant should match!
   ```

3. **Check organization is active**
   ```sql
   SELECT name, is_active
   FROM resource_nodes
   WHERE node_type = 'company';
   -- is_active should be true
   ```

4. **Check the debug endpoint**
   Visit `/api/v1/organization/debug` and look at the `recommendation` field

### Still having issues?

Run all diagnostics and share the output:

```bash
# Save diagnostic output
node fix-org-visibility.mjs > diagnostic.txt 2>&1

# Or
psql -d your_database -f diagnose-org-issue.sql > diagnostic.txt
```

---

## Prevention

To avoid this issue in the future:

1. ✅ **During initial setup**: Create the first user as `company_admin`
2. ✅ **When creating users**: Use the UI's user creation form (handles permissions automatically)
3. ✅ **Maintain at least one company_admin**: Always keep one user with full admin access
4. ✅ **Document your setup**: Keep track of admin users and organization structure

---

## Quick Command Reference

```bash
# Run automated fix
node fix-org-visibility.mjs

# Run SQL fix
psql -d your_database_name -f fix-organization-visibility.sql

# Run diagnostic
psql -d your_database_name -f diagnose-org-issue.sql

# Check from web
curl http://localhost:3000/api/v1/organization/debug -b cookies.txt

# Manual SQL fix
psql -d your_database_name -c "UPDATE users SET role = 'company_admin' WHERE username = 'your_username';"
```

---

## Need More Help?

- 📖 Read `ORGANIZATION_VISIBILITY_FIX.md` for complete details
- 🔍 Visit `/api/v1/organization/debug` for real-time diagnostic
- 🛠️ Run `node fix-org-visibility.mjs` for automated fix
- 💬 Check application logs for permission errors

---

**TL;DR:** Run `node fix-org-visibility.mjs` and refresh your browser. 🎉
