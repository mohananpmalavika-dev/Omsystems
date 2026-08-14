# 🚀 Quick Fix: Organization Not Visible

## Your Situation

You see: **"An organization already exists. Only one organization is allowed per system."**

But you can't see any organization in the UI.

---

## ⚡ Fastest Fix (One Command)

```bash
npm run fix:org-visibility
```

That's it! This will:
1. Find your user
2. Grant admin permissions
3. Make the organization visible

**Then refresh your browser.** ✅

---

## 🎯 Alternative Methods

### Method 2: With Your Username

```bash
node fix-org-visibility.mjs your_username
```

### Method 3: SQL Script

```bash
psql -d your_database_name -f fix-organization-visibility.sql
```

### Method 4: Manual SQL

```sql
UPDATE users SET role = 'company_admin' 
WHERE username = 'your_username';
```

---

## ✅ Verify It Worked

1. **Refresh browser** → Organization should appear
2. **Check API**: Visit `/api/v1/organization/debug`
3. **Run**: `npm run diagnose:org` to see database state

---

## 📚 More Information

- 📖 **Complete Guide**: `README_ORG_FIX.md`
- 🔧 **Technical Details**: `ORGANIZATION_VISIBILITY_FIX.md`
- 💡 **Solution Summary**: `ORGANIZATION_VISIBILITY_SOLUTION.md`

---

## 🆘 Still Not Working?

1. Clear browser cache and log out/in
2. Run: `npm run diagnose:org`
3. Check `/api/v1/organization/debug` endpoint
4. Verify `tenant_id` matches between user and organization

---

**TL;DR**: Run `npm run fix:org-visibility` → Refresh browser → Done! 🎉
