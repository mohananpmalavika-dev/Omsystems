# Render.com Deployment Fix - Missing Environment Variables

## ❌ Current Error

**Latest Error:**
```
PRODUCTION SECRET VALIDATION FAILED

JWT_SECRET is required in production and must be at least 64 characters.
```

**Previous Errors (Now Fixed):**
```
ZodError: AUTH_MODE Required
ZodError: REPORT_DOWNLOAD_SECRET Required
```

**Root Cause:** Your production deployment on Render.com is missing the `JWT_SECRET` environment variable.

---

## ✅ Solution: Add JWT_SECRET to Render Dashboard

### Critical Missing Variable:

You need to add this **immediately** to your Render dashboard:

```bash
JWT_SECRET=745b0b187a3725780bb1f9cd05bb0b977205a4c31e84ffe0bf0f9d1b2978d5d6
```

### Step-by-Step:

1. Go to https://dashboard.render.com/
2. Navigate to your service: **sentinel-grid-control-plane-3i3r** (or ocn1)
3. Click on **Environment** tab
4. Click **Add Environment Variable**
5. Set:
   - **Key:** `JWT_SECRET`
   - **Value:** `745b0b187a3725780bb1f9cd05bb0b977205a4c31e84ffe0bf0f9d1b2978d5d6`
6. Click **Save Changes**
7. Service will auto-redeploy

---

## ✅ Solution: Set Environment Variables in Render Dashboard

### Step 1: Access Render Dashboard

1. Go to https://dashboard.render.com/
2. Navigate to your service: **sentinel-grid-control-plane-ocn1**
3. Click on **Environment** tab

### Step 2: Add Required Environment Variables

Click **Add Environment Variable** and add each of these:

#### 🔴 CRITICAL - Required for Startup

```bash
AUTH_MODE=session
```

```bash
MEDIA_GATEWAY_SHARED_KEY=+yCpbItHfsKn+yk63Z+SoPDQ0WOVvfytLMl/3+kaMyU=
```

```bash
REPORT_DOWNLOAD_SECRET=82ATY61PnvsgpHe90UhbcyBflrdFSio73ZNCaOWL5KmwqDxR
```

#### 🟡 Important - Already in Your .env but May Need to be Set

```bash
NODE_ENV=production
```

```bash
JWT_SECRET=745b0b187a3725780bb1f9cd05bb0b977205a4c31e84ffe0bf0f9d1b2978d5d6
```

```bash
DATABASE_URL=postgresql://omtech_user:uWpzCli9H14xNhMh9m8rA9rpmkE64O84@dpg-d9tmg9id0e5s739i01f0-a.oregon-postgres.render.com/omtech
```

```bash
ANALYTICS_ENGINE_URL=https://sentinel-grid-analytics-engine-j0py.onrender.com
```

```bash
ANALYTICS_ENGINE_SHARED_KEY=KpGDyYCgIlZrOuHXLS5tE0FRe73M9Qj1UAv8csBzJnWTamPV
```

```bash
EDGE_BRIDGE_SHARED_KEY=WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa
```

```bash
CONTROL_PLANE_INTERNAL_URL=https://sentinel-grid-control-plane-ocn1.onrender.com
```

```bash
CONTROL_PLANE_PUBLIC_URL=https://sentinel-grid-control-plane-ocn1.onrender.com
```

```bash
REPORT_WORKER_SHARED_KEY=a5f7c3e9b2d8f1a6e4b9c7d2f8e3a1b5c9d7e4f2a8b6c3e1d9f7a4b2c8e5d1f3
```

```bash
REPORT_PUBLIC_BASE_URL=https://sentinel-grid-control-plane-ocn1.onrender.com
```

```bash
REPORT_ARCHIVE_RETENTION_DAYS=365
```

```bash
RECORDING_ENGINE_SHARED_KEY=b8d4f6a3c1e9b7d5f2a8c6e4b1d9f7a5c3e2b8d6f4a1c9e7b5d3f1a8c6e4b2d9
```

```bash
ALERT_VOICE_CALLBACK_SECRET=9821bfeb8b36618b879bb02e6066b518096fb9b37004c2e96d231e2166e4540b
```

```bash
STREAM_SECRETS_JSON={}
```

```bash
DASHBOARD_DEMO_MODE=false
```

### Step 3: Save and Redeploy

1. Click **Save Changes**
2. Render will automatically redeploy your service
3. Monitor the deployment logs

---

## 🚀 Quick Fix Script (Alternative Method)

If you have the Render CLI installed, you can set all variables at once:

```bash
# Install Render CLI if not already installed
npm install -g @render/cli

# Login
render login

# Set environment variables (replace SERVICE_ID with your actual service ID)
render env set AUTH_MODE=session --service-id=srv-XXXXX
render env set MEDIA_GATEWAY_SHARED_KEY="+yCpbItHfsKn+yk63Z+SoPDQ0WOVvfytLMl/3+kaMyU=" --service-id=srv-XXXXX
render env set REPORT_DOWNLOAD_SECRET=82ATY61PnvsgpHe90UhbcyBflrdFSio73ZNCaOWL5KmwqDxR --service-id=srv-XXXXX
```

---

## 📋 Complete Environment Variable Checklist

Copy this checklist and check off as you add each variable in Render:

### Minimum Required (App Won't Start Without These):
- [ ] `AUTH_MODE=session`
- [ ] `MEDIA_GATEWAY_SHARED_KEY` (from your .env)
- [ ] `REPORT_DOWNLOAD_SECRET` (from your .env)
- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` (from your .env)
- [ ] `DATABASE_URL` (from your .env)

### Important for Functionality:
- [ ] `CONTROL_PLANE_PUBLIC_URL`
- [ ] `REPORT_PUBLIC_BASE_URL`
- [ ] `ANALYTICS_ENGINE_URL`
- [ ] `ANALYTICS_ENGINE_SHARED_KEY`
- [ ] `EDGE_BRIDGE_SHARED_KEY`
- [ ] `REPORT_WORKER_SHARED_KEY`
- [ ] `RECORDING_ENGINE_SHARED_KEY`
- [ ] `ALERT_VOICE_CALLBACK_SECRET`

### Optional:
- [ ] `STREAM_SECRETS_JSON`
- [ ] `DASHBOARD_DEMO_MODE`
- [ ] `REPORT_ARCHIVE_RETENTION_DAYS`

---

## 🔍 Verify Deployment

After setting the environment variables and redeploying:

1. **Check Logs:**
   ```
   Go to Render Dashboard → Your Service → Logs
   ```

2. **Look for Success Message:**
   ```
   ✓ Configuration loaded successfully
   ✓ Production secret validation passed
   Server listening on 0.0.0.0:8080
   ```

3. **Test the Endpoint:**
   ```bash
   curl https://sentinel-grid-control-plane-ocn1.onrender.com/health
   ```

---

## ⚠️ Common Issues

### Issue 1: "Service keeps failing"
**Solution:** Check that all required variables are set correctly (no typos)

### Issue 2: "Still getting validation errors"
**Solution:** Make sure `NODE_ENV=production` is set

### Issue 3: "Database connection errors"
**Solution:** Verify `DATABASE_URL` is correct and database is accessible

---

## 🎯 Why This Happened

The `.env` file in your repository is for **local development only**. 

Cloud platforms like Render.com don't use `.env` files for security reasons. Instead, they require you to set environment variables through their dashboard or API.

This is actually a **security best practice** because:
- Secrets aren't committed to Git
- Each environment (dev/staging/prod) has its own secrets
- Platform manages secret encryption and access control

---

## 📚 Next Steps After Deployment Succeeds

1. ✅ Verify all services are communicating:
   - Control Plane ↔ Analytics Engine
   - Control Plane ↔ Media Gateway
   - Control Plane ↔ Dashboard

2. ✅ Test critical workflows:
   - User login
   - Camera discovery
   - Live video streaming
   - Alert generation

3. ✅ Set up monitoring:
   - Configure Render alerts
   - Set up log aggregation
   - Enable uptime monitoring

---

## 🔐 Security Notes

- Never commit production secrets to Git
- Rotate secrets regularly (every 90 days)
- Use different secrets for each environment (dev/staging/prod)
- Enable Render's secret encryption features
- Set up access logs and audit trails

---

**Generated:** August 18, 2026  
**Status:** Ready to Deploy  
**Action Required:** Set environment variables in Render Dashboard
