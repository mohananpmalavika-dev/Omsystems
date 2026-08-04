# Test Branch Delete Fix

## After Render Deploys (Wait 2-5 minutes)

### Option 1: Test in Browser Console

Open your Sentinel Grid dashboard and run this in the browser console:

```javascript
// Test 1: Try to delete branch without cascade (should get helpful error)
fetch('https://sentinel-grid-monitoring1.onrender.com/api/admin/system/branches/00000000-0000-4000-8000-000000000104', {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token') // Adjust if you store token differently
  }
})
.then(r => r.json())
.then(console.log)
.catch(console.error);

// If error says "has active children", try cascade delete:
fetch('https://sentinel-grid-monitoring1.onrender.com/api/admin/system/branches/00000000-0000-4000-8000-000000000104?cascade=true', {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token')
  }
})
.then(r => {
  if (r.status === 204) {
    console.log('✅ Branch deleted successfully!');
  } else {
    return r.json();
  }
})
.then(console.log)
.catch(console.error);
```

### Option 2: Test with curl (Windows PowerShell)

```powershell
# Get your auth token first (from browser localStorage or login)
$token = "YOUR_AUTH_TOKEN_HERE"

# Test 1: Delete without cascade (should get 400 with helpful error)
curl -X DELETE `
  "https://sentinel-grid-monitoring1.onrender.com/api/admin/system/branches/00000000-0000-4000-8000-000000000104" `
  -H "Authorization: Bearer $token" `
  -v

# Test 2: Delete with cascade (should succeed with 204)
curl -X DELETE `
  "https://sentinel-grid-monitoring1.onrender.com/api/admin/system/branches/00000000-0000-4000-8000-000000000104?cascade=true" `
  -H "Authorization: Bearer $token" `
  -v
```

### Option 3: Use the UI

1. Go to your branch management page
2. Try to delete the branch: `00000000-0000-4000-8000-000000000104`
3. You should now see a proper error message instead of 500
4. Check the Render logs for detailed information

---

## Expected Results

### Before (OLD - 500 Error) ❌
```
DELETE .../branches/xxx
Response: 500 Internal Server Error
(No error details)
```

### After (NEW - Fixed) ✅

**First attempt (no cascade):**
```json
Status: 400 Bad Request
{
  "error": "node_has_active_children",
  "message": "Cannot delete node with 5 active children. Use ?cascade=true to delete all descendants, or deactivate children first.",
  "details": {
    "childCount": 5,
    "childTypes": ["camera", "branch"],
    "descendantIds": ["uuid1", "uuid2", "uuid3", "uuid4", "uuid5"],
    "hint": "Add ?cascade=true to the URL to delete this node and all its descendants"
  }
}
```

**With cascade:**
```
Status: 204 No Content
(Branch and all children deleted successfully)
```

---

## Check Render Logs

1. Go to: https://dashboard.render.com/
2. Select your service: `sentinel-grid-monitoring1`
3. Click "Logs" tab
4. Look for:
   - "Error deleting organization node:" - Shows caught errors
   - "Delete error details:" - Shows full context
   - Successful deletes will show audit entries

---

## Verify Deployment

Check that your changes deployed:

```powershell
# Check if new version is deployed
curl "https://sentinel-grid-monitoring1.onrender.com/health" | ConvertFrom-Json

# Should see recent deployment time
```

---

## If Still Getting 500 Error

1. **Wait for Render to deploy** (check deploy logs)
2. **Check Render logs** for the actual error message
3. **Verify branch ID** is correct
4. **Check if you have permission** to delete the branch
5. **Try a different branch** to see if it's branch-specific

---

## Rollback (If Needed)

If the fix causes new issues:

```powershell
cd c:\Omsystems
git revert HEAD
git push origin main
```

Render will auto-deploy the rollback.

---

## Success Indicators

✅ No more 500 errors
✅ Clear error messages when branch has children
✅ Cascade delete works with `?cascade=true`
✅ All deletes appear in audit log
✅ Render logs show detailed error information

---

## Next Steps After Testing

Once confirmed working:

1. Update frontend delete button to offer cascade option
2. Add confirmation dialog showing child count
3. Update user documentation
4. Consider adding batch delete feature

---

**Ready to test?** Wait 2-5 minutes for Render to deploy, then try the tests above!
