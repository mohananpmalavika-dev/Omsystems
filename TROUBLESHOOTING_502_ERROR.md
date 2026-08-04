# 🚨 502 Bad Gateway Error - Troubleshooting Guide

## What's Happening

Your **dashboard (frontend) is working** ✅, but the **backend API services are down/crashed** ❌

Based on your error logs:
```
/api/control/v1/auth/me - 502 ❌
/api/live - 502 ❌  
/api/control/v1/alerts/command-center - 502 ❌
/api/control/v1/branches/.../edge-agents/.../package - 502 ❌
```

All requests to `/api/control/*` and `/api/live/*` are failing → Backend services crashed or not responding.

---

## 🔍 Root Cause Analysis

### Your Current Render Setup:
```yaml
# From render.yaml:
1. sentinel-grid-control-plane (Port 8080) - Main API
2. sentinel-grid-dashboard (Next.js) - Frontend  
3. sentinel-grid-media-gateway (Port 8090) - Live streaming
4. sentinel-grid-recording-engine (Port 8091) - Recordings
5. sentinel-grid-analytics-engine (Port 8092) - AI analytics
6. sentinel-grid-db (PostgreSQL) - Database
```

### Most Likely Causes:

#### **1. Database Connection Failed** ⚠️ **MOST COMMON**
```typescript
// From src/index.ts - Your backend requires DATABASE_URL
const store = config.DATABASE_URL
  ? new PostgresStore(createPool(config.DATABASE_URL))
  : new MemoryStore();
```

**Check:**
- Is `DATABASE_URL` environment variable set correctly on Render?
- Is PostgreSQL database running?
- Can control-plane service reach the database?

**Render Dashboard Steps:**
1. Go to https://dashboard.render.com
2. Click "sentinel-grid-control-plane" service
3. Go to "Logs" tab
4. Look for errors like:
   - `ECONNREFUSED` (database not reachable)
   - `Connection timeout`
   - `password authentication failed`
   - `database "sentinel_grid" does not exist`

#### **2. Services Crashed Due to Missing Environment Variables** ⚠️ **COMMON**
```typescript
// Your app requires these:
MEDIA_GATEWAY_SHARED_KEY
RECORDING_ENGINE_SHARED_KEY
ANALYTICS_ENGINE_SHARED_KEY
EDGE_BRIDGE_SHARED_KEY
```

**If any required env var is missing → service crashes on startup**

#### **3. Out of Memory** ⚠️ **LIKELY WITH RENDER STARTER PLAN**
- Render Starter plan = **512MB RAM**
- Your control-plane + database connections + WebSocket = **can easily exceed 512MB**
- Result: Process killed by OOM (Out of Memory)

#### **4. Database Not Initialized** ⚠️ **IF FIRST DEPLOYMENT**
```bash
# Your migrations need to run first:
npm run migrate
```

If database tables don't exist → queries fail → service crashes.

#### **5. Port Binding Issues**
```typescript
// From src/index.ts:
await app.listen({ host: config.HOST, port: config.PORT });
```

If `HOST=0.0.0.0` or `PORT=8080` not set correctly → service won't start.

---

## 🔧 **IMMEDIATE FIXES**

### **Step 1: Check Render Service Logs** (Do This First!)

1. **Go to Render Dashboard:** https://dashboard.render.com
2. **Click on "sentinel-grid-control-plane"**
3. **Click "Logs" tab**
4. **Look for the last error before crash**

Common error patterns:
```
✅ GOOD (Service running):
Listening on http://0.0.0.0:8080

❌ BAD (Database error):
Error: connect ECONNREFUSED
Error: password authentication failed for user "sentinel_admin"
database "sentinel_grid" does not exist

❌ BAD (Missing env var):
Error: MEDIA_GATEWAY_SHARED_KEY is required
TypeError: Cannot read property 'something' of undefined

❌ BAD (Out of Memory):
<--- Last few GCs --->
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory

❌ BAD (Port binding):
Error: listen EADDRINUSE: address already in use :::8080
```

### **Step 2: Verify Database Connection**

**In Render Dashboard:**
1. Go to "sentinel-grid-db" database
2. Click "Info" → Copy **Internal Connection String**
3. Go to "sentinel-grid-control-plane" service
4. Click "Environment" tab
5. Verify `DATABASE_URL` = connection string from database

**Should look like:**
```
postgresql://sentinel_admin:PASSWORD@dpg-xxxxx-a.singapore-postgres.render.com/sentinel_grid
```

### **Step 3: Run Database Migrations**

If this is first deployment or database is empty:

**Option A - Via Render Shell:**
```bash
# In Render Dashboard → sentinel-grid-control-plane → Shell tab
npm run migrate
```

**Option B - Locally (connect to Render DB):**
```bash
# Copy DATABASE_URL from Render
export DATABASE_URL="postgresql://sentinel_admin:PASSWORD@..."
npm run migrate
```

### **Step 4: Verify Environment Variables**

**In Render Dashboard → sentinel-grid-control-plane → Environment:**

Required variables:
```bash
✅ DATABASE_URL (should be auto-populated from database)
✅ REDIS_URL (if using Redis cache)
✅ CONTROL_PLANE_PUBLIC_URL (your dashboard URL)
✅ MEDIA_GATEWAY_SHARED_KEY (auto-generated)
✅ RECORDING_ENGINE_SHARED_KEY (auto-generated)
✅ ANALYTICS_ENGINE_SHARED_KEY (auto-generated)
✅ EDGE_BRIDGE_SHARED_KEY (needs to be set manually)
✅ JWT_SECRET (auto-generated)
✅ SESSION_SECRET (auto-generated)
```

**Check if any are missing or invalid.**

### **Step 5: Upgrade Render Plan** (If Out of Memory)

Render Starter Plan (512MB RAM) is **too small** for your architecture:
- Control Plane + Database Pool + WebSocket = 300-500MB
- Under load: 500MB+ → **OOM crash**

**Recommended:**
```yaml
# Change in render.yaml:
- type: web
  name: sentinel-grid-control-plane
  plan: standard  # ← Change from 'starter' to 'standard' (2GB RAM)
```

**Render Plans:**
- Starter: $7/month, 512MB RAM ❌ Too small
- Standard: $25/month, 2GB RAM ✅ Minimum for your app
- Pro: $85/month, 4GB RAM ✅ Better for production

### **Step 6: Restart Services**

After fixing env vars or migrations:

**In Render Dashboard:**
1. Go to each service
2. Click "Manual Deploy" → "Deploy latest commit"
3. Or click "Clear build cache & deploy"

**Order matters:**
1. Restart database (if needed)
2. Restart control-plane
3. Restart media-gateway
4. Restart recording-engine
5. Restart analytics-engine
6. Restart dashboard (last)

---

## 🐛 **DEBUGGING COMMANDS**

### **Check if Database Has Tables:**
```bash
# In Render Shell or local psql:
export DATABASE_URL="postgresql://..."

psql $DATABASE_URL -c "\dt"
# Should show tables: tenants, users, cameras, resource_nodes, etc.
# If empty → run migrations
```

### **Check if Control Plane is Reachable:**
```bash
# From your local machine:
curl https://YOUR-APP.onrender.com/ready
# Should return: {"status":"ok"} or similar
# If timeout/502 → service is down
```

### **Check Control Plane Health:**
```bash
curl https://YOUR-APP.onrender.com/api/control/v1/health
# If 502 → service crashed
```

### **View Real-Time Logs:**
```bash
# In Render Dashboard → Service → Logs
# Enable "Auto-scroll" to see live logs
```

---

## 🎯 **QUICK DIAGNOSTIC CHECKLIST**

Run through this list:

```
□ Database "sentinel-grid-db" is running (green status in Render)
□ DATABASE_URL is set in control-plane environment
□ Control-plane service shows "Live" status (not deploying/failed)
□ Control-plane logs show "Listening on http://0.0.0.0:8080"
□ Database has tables (run: npm run migrate if not)
□ All *_SHARED_KEY environment variables are set
□ EDGE_BRIDGE_SHARED_KEY is set (not auto-generated)
□ Memory usage < 80% (upgrade plan if constantly at 90%+)
□ No error logs in control-plane service
□ Can curl /ready endpoint successfully
```

---

## 🔥 **EMERGENCY RECOVERY**

If nothing works, **reset and redeploy:**

### **Step 1: Clear Everything**
```bash
# In Render Dashboard:
1. Suspend all services (except database)
2. Drop and recreate database (⚠️ DELETES DATA)
3. Clear build cache on all services
```

### **Step 2: Redeploy in Order**
```bash
1. Start database
2. Run migrations:
   # In control-plane Shell tab
   npm run migrate

3. Deploy control-plane (wait until "Live")
4. Deploy media-gateway
5. Deploy recording-engine  
6. Deploy analytics-engine
7. Deploy dashboard (last)
```

### **Step 3: Verify Health**
```bash
curl https://YOUR-APP.onrender.com/ready
curl https://YOUR-APP.onrender.com/api/control/v1/health
```

---

## 💰 **COST REALITY CHECK**

Your current Render setup costs:
```
Control Plane: $7/month (Starter) ❌ Too small
Dashboard: $7/month (Starter)
Media Gateway: $7/month (Starter)
Recording Engine: $7/month (Starter)  
Analytics Engine: $7/month (Starter)
Database: $7/month (Basic 1GB)
---------------------------------------
Total: ~$42/month

Problems:
- 512MB RAM per service = will crash under load
- 100GB disk for recordings = fills up in days
- Single instance = no high availability
- Singapore only = no disaster recovery
```

**For 500 branches, you need:**
```
Control Plane: $25/month (Standard, 2GB) × 3 instances = $75
Media Gateway: $25/month × 2 instances = $50  
Recording Engine: $25/month × 2 instances = $50
Analytics Engine: $25/month × 1 instance = $25
Database: $95/month (Standard 8GB) = $95
+ S3 for recordings: $12,000/month
---------------------------------------
Total: ~$12,300/month (realistic for 500 branches)
```

---

## 📱 **HOW TO ACCESS RENDER DASHBOARD**

1. **Go to:** https://dashboard.render.com
2. **Log in** with your account
3. **Click on your services** to see logs and status
4. **Look for:** Red indicators, error messages in logs
5. **Check:** "Metrics" tab for memory usage

---

## 🆘 **NEXT STEPS - TELL ME:**

1. **What do you see in Render control-plane logs?** (last 50 lines)
2. **Is the database status "Available" in Render?**
3. **Can you access:** `https://YOUR-APP.onrender.com/ready`
4. **What's your memory usage?** (check Metrics tab)
5. **Have you run migrations?** (`npm run migrate`)

**Share the logs and I'll help you fix it immediately!**

---

## 🔗 **Useful Render Commands**

```bash
# View logs (from Render CLI):
render logs -s sentinel-grid-control-plane

# SSH into service:
render shell sentinel-grid-control-plane

# Run migrations:
render shell sentinel-grid-control-plane
npm run migrate

# Check env vars:
render env list -s sentinel-grid-control-plane
```

**Install Render CLI:**
```bash
npm install -g @render/cli
render login
```

