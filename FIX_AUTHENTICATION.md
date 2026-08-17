# Fix Authentication Issues

## Current Status

✅ **TypeError Fixed:** The `status-badge.tsx` component now safely handles non-string status values.

✅ **User Creation Foreign Key Fixed:** The `assigned_by_user_id` foreign key constraint issue has been resolved.

⚠️ **401 Authentication Error:** You need to authenticate to access the dashboard.

---

## Recent Fixes

### User Creation Foreign Key Constraint Error (FIXED)

**Problem:** When creating a new user, the system threw this error:
```
insert or update on table "user_organizational_assignments" violates foreign key constraint "user_organizational_assignments_assigned_by_user_id_fkey"
```

**Root Cause:** The `assignOrganization` method in `infrastructure-repository.ts` was attempting to insert a `assigned_by_user_id` value that didn't exist in the users table. This happened when:
1. The current user's ID was passed as `createdBy` but didn't exist in the database yet
2. The code didn't validate if the `assigned_by_user_id` actually referenced an existing user

**Solution:** Updated the `assignOrganization` method to:
1. Validate that the `assignedBy` user ID exists in the database before using it
2. Set `assigned_by_user_id` to `NULL` if the user doesn't exist (the column allows NULL values)
3. Check both UUID and non-UUID formats for the assignedBy parameter

**Files Changed:**
- ✅ `src/database/infrastructure-repository.ts` - Fixed `assignOrganization` method to validate user existence

---

## Root Cause

The 401 errors occur because:
1. No valid authentication session exists
2. The browser has no `sentinel_access` cookie or valid `accessToken` in localStorage
3. The backend requires JWT authentication for protected API endpoints

---

## Solution: Authenticate Your Session

### Option 1: Create Admin User (Production)

If you don't have an account yet, you need to create one using the backend:

1. **Access the backend control plane** (either locally or on Render):
   - Local: `http://localhost:8080`
   - Render: `https://sentinel-grid-control-plane-ocn1.onrender.com`

2. **Create a super admin user** using the database or a setup script:

```bash
# Connect to your PostgreSQL database
# Then run this SQL to create an admin user:

INSERT INTO users (
  id, 
  tenant_id, 
  username, 
  email, 
  password_hash, 
  role, 
  status, 
  created_at, 
  updated_at
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants LIMIT 1),
  'admin',
  'admin@yourdomain.com',
  -- This is bcrypt hash for password 'admin123' (you should change this!)
  '$2b$10$rZ0QJHd5KGqv5OYV4h3hJ.xB7VDQz8kN1YNJy2sJ9KHxN0lqE9R4S',
  'super_admin',
  'active',
  NOW(),
  NOW()
);
```

### Option 2: Use Development Mode

For local development, bypass authentication:

1. **Set environment variable** in `dashboard/.env`:
```env
DASHBOARD_DEV_USER_ID=user-global-admin
CONTROL_PLANE_INTERNAL_URL=http://localhost:8080
```

2. **Restart the dashboard server**:
```bash
cd dashboard
npm run dev
```

### Option 3: Check for Existing Users

Query your database to see if you already have users:

```sql
SELECT id, username, email, role, status FROM users;
```

If you find a user, try logging in with their credentials at:
- `https://sentinel-grid-monitoring-vhid.onrender.com/login`

---

## Quick Verification Steps

### 1. Check if Backend is Running
```bash
curl https://sentinel-grid-control-plane-ocn1.onrender.com/health
```

Expected response:
```json
{"status":"ok","service":"sentinel-control-plane"}
```

### 2. Test Login Endpoint
```bash
curl -X POST https://sentinel-grid-control-plane-ocn1.onrender.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'
```

### 3. Check Database Connection
```bash
# If using PostgreSQL locally
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
```

---

## After Authentication

Once you've logged in successfully:

1. **The 401 errors will disappear**
2. **Organization tree will load**
3. **All dashboard features will be accessible**

The session will be maintained via:
- HttpOnly cookies (`sentinel_access`, `sentinel_refresh`)
- localStorage (`accessToken`, `refreshToken`, `user`)
- Automatic token refresh every 60 seconds

---

## Security Notes

**⚠️ IMPORTANT:**
- Change default passwords immediately
- Never commit passwords or tokens to Git
- Use strong, unique passwords for production
- Enable HTTPS in production
- Set secure environment variables on Render

---

## Troubleshooting

### Issue: "Cannot connect to server"
**Solution:** Ensure the backend is running and accessible. Wake Render services:
```bash
.\scripts\verify-render-urls.ps1 -WakeServices
```

### Issue: "Invalid username or password"
**Solution:** Reset the password using the database or create a new user.

### Issue: "Session expired" immediately after login
**Solution:** Check that:
- Cookies are enabled in browser
- CORS is configured correctly
- `CONTROL_PLANE_INTERNAL_URL` matches the backend URL

### Issue: Still getting 401 after login
**Solution:** 
1. Clear browser cache and cookies
2. Open DevTools → Application → Clear all storage
3. Try logging in again

---

## Next Steps

1. ✅ Create or identify an admin user
2. ✅ Log in at `/login`
3. ✅ Verify dashboard loads without 401 errors
4. ✅ Set up organization structure if needed
5. ✅ Configure branches and cameras

---

## Files Changed

1. ✅ `dashboard/components/ui/status-badge.tsx` - Fixed TypeError
2. ✅ This guide created to help with authentication

For more details on the authentication architecture, see `ERROR_FIX_SUMMARY.md`.
