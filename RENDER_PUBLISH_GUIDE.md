# 🚀 How to Publish Sentinel Grid Monitor to Render

**Complete Step-by-Step Guide**

---

## 📋 Prerequisites

Before publishing to Render, ensure:
- ✅ All bugs are fixed (see `BUG_FIX_SUMMARY.md`)
- ✅ Code is committed to Git
- ✅ You have a Render.com account
- ✅ Your GitHub/GitLab repository is accessible

---

## 🎯 Deployment Options

### Option 1: Blueprint Deployment (Recommended - Deploy All Services at Once)
### Option 2: Manual Service-by-Service Deployment

---

## 🚀 Option 1: Blueprint Deployment (RECOMMENDED)

This deploys **ALL 5 services** automatically using the `render.yaml` blueprint.

### Step 1: Connect Your Repository

1. Go to https://dashboard.render.com/
2. Click **"New +"** → **"Blueprint"**
3. Connect your GitHub/GitLab repository:
   - If first time: Click **"Connect Account"**
   - Select your **Omsystems** repository
   - Grant Render access

### Step 2: Deploy Blueprint

1. Render will detect `render.yaml` automatically
2. Click **"Apply"** or **"Create Resources"**
3. Wait for all services to provision (5-10 minutes)

### Step 3: What Gets Deployed

The blueprint creates:

```
1. 📦 sentinel-grid-db (PostgreSQL Database)
   - 100GB storage with auto-scaling
   - Basic plan (recommended for production)

2. 🌐 sentinel-grid-control-plane (Main API)
   - Docker-based deployment
   - Port: 8080
   - Health check: /ready

3. 💻 sentinel-grid-dashboard (Web UI)
   - Next.js dashboard
   - Port: 10000
   - Health check: /api/health

4. 📹 sentinel-grid-media-gateway (Video Streaming)
   - MediaMTX + custom gateway
   - Port: 8090
   - Health check: /health

5. 💾 sentinel-grid-recording-engine (Recording Manager)
   - 100GB persistent disk
   - Port: 8091
   - Private service (not publicly accessible)

6. 🤖 sentinel-grid-analytics-engine (AI Analytics)
   - Port: 8092
   - Private service (not publicly accessible)
```

### Step 4: Configure Additional Environment Variables

After blueprint deployment, you need to add these **manually**:

#### For Control Plane Service:
1. Go to **sentinel-grid-control-plane** service
2. Click **"Environment"** tab
3. Add these variables:

```bash
# Required
JWT_SECRET=745b0b187a3725780bb1f9cd05bb0b977205a4c31e84ffe0bf0f9d1b2978d5d6

# Optional (only if using Redis)
REDIS_URL=redis://your-redis-url:6379

# Optional (only if using Cloudflare tunnels)
CLOUDFLARE_ACCOUNT_ID=your_32_char_account_id
CLOUDFLARE_ZONE_ID=your_32_char_zone_id
CLOUDFLARE_API_TOKEN=your_cloudflare_token
EDGE_MEDIA_BASE_DOMAIN=cameras.yourdomain.com
EDGE_MANAGED_TUNNEL_REQUIRED=true

# Optional (only if using voice/SMS alerts)
ALERT_VOICE_CALLBACK_SECRET=9821bfeb8b36618b879bb02e6066b518096fb9b37004c2e96d231e2166e4540b
ALERT_VOICE_PROVIDER=twilio
ALERT_PUBLIC_BASE_URL=https://your-control-plane-url.onrender.com
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_FROM_NUMBER=+1234567890

# Optional (only if using email alerts)
ALERT_EMAIL_PROVIDER=ses
ALERT_EMAIL_FROM=alerts@yourdomain.com
ALERT_AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret

# Optional (only if using S3 evidence storage)
EVIDENCE_S3_BUCKET=sentinel-evidence
EVIDENCE_S3_REGION=us-east-1
EVIDENCE_S3_ACCESS_KEY_ID=your_s3_key
EVIDENCE_S3_SECRET_ACCESS_KEY=your_s3_secret
```

4. Click **"Save Changes"**

### Step 5: Verify Deployment

Check each service's logs:

1. **Control Plane:**
   ```
   ✅ Production secret validation passed
   ✓ Database connection verified
   ✓ Server listening on 0.0.0.0:8080
   ```

2. **Dashboard:**
   ```
   ✓ Next.js started successfully
   ✓ Server running on port 10000
   ```

3. **Media Gateway:**
   ```
   ✓ MediaMTX started
   ✓ Gateway listening on 8090
   ```

4. **Recording Engine:**
   ```
   ✓ Storage initialized: /recordings
   ✓ Recording engine ready
   ```

5. **Analytics Engine:**
   ```
   ✓ Analytics engine initialized
   ✓ Ready to process frames
   ```

---

## 🔧 Option 2: Manual Service-by-Service Deployment

If you prefer manual control or want to deploy services individually:

### Service 1: PostgreSQL Database

1. Go to https://dashboard.render.com/
2. Click **"New +"** → **"PostgreSQL"**
3. Configure:
   ```
   Name: sentinel-grid-db
   Database: sentinel_grid
   User: sentinel_admin
   Region: Singapore (or your preferred region)
   Plan: Basic (1GB) or higher
   ```
4. Click **"Create Database"**
5. **Copy the Internal Database URL** (you'll need it for other services)

### Service 2: Control Plane (Main API)

1. Click **"New +"** → **"Web Service"**
2. Connect your repository
3. Configure:
   ```
   Name: sentinel-grid-control-plane
   Region: Singapore
   Branch: main
   Root Directory: . (leave empty)
   Runtime: Docker
   Dockerfile Path: ./Dockerfile
   Health Check Path: /ready
   Plan: Starter ($7/month) or higher
   ```

4. Add Environment Variables:
   ```bash
   NODE_ENV=production
   AUTH_MODE=session
   HOST=0.0.0.0
   PORT=8080
   DATABASE_URL=<paste-internal-database-url>
   JWT_SECRET=745b0b187a3725780bb1f9cd05bb0b977205a4c31e84ffe0bf0f9d1b2978d5d6
   MEDIA_GATEWAY_SHARED_KEY=<generate-with-command-below>
   REPORT_DOWNLOAD_SECRET=<generate-with-command-below>
   RECORDING_ENGINE_SHARED_KEY=<generate-with-command-below>
   ANALYTICS_ENGINE_SHARED_KEY=<generate-with-command-below>
   ANALYTICS_SOURCE_SHARED_KEY=<generate-with-command-below>
   ```

   Generate secrets:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

5. Click **"Create Web Service"**
6. **Copy the service URL** (you'll need it for other services)

### Service 3: Dashboard (Web UI)

1. Click **"New +"** → **"Web Service"**
2. Connect your repository
3. Configure:
   ```
   Name: sentinel-grid-dashboard
   Region: Singapore
   Branch: main
   Root Directory: . (leave empty)
   Runtime: Docker
   Dockerfile Path: ./dashboard/Dockerfile
   Health Check Path: /api/health
   Plan: Starter ($7/month) or higher
   ```

4. Add Environment Variables:
   ```bash
   NODE_ENV=production
   HOST=0.0.0.0
   PORT=10000
   DASHBOARD_DEMO_MODE=false
   CONTROL_PLANE_INTERNAL_URL=<control-plane-internal-url>
   CONTROL_PLANE_PUBLIC_URL=<control-plane-public-url>
   NEXT_PUBLIC_API_BASE=/api/control
   ```

5. Click **"Create Web Service"**

### Service 4: Media Gateway (Video Streaming)

1. Click **"New +"** → **"Web Service"**
2. Connect your repository
3. Configure:
   ```
   Name: sentinel-grid-media-gateway
   Region: Singapore
   Branch: main
   Root Directory: . (leave empty)
   Runtime: Docker
   Dockerfile Path: ./media-gateway/Dockerfile
   Health Check Path: /health
   Plan: Starter ($7/month) or higher
   ```

4. Add Environment Variables:
   ```bash
   HOST=0.0.0.0
   PORT=8090
   CONTROL_PLANE_URL=<control-plane-internal-url>
   MEDIA_GATEWAY_SHARED_KEY=<same-as-control-plane>
   MEDIAMTX_API_URL=http://127.0.0.1:9997
   MEDIAMTX_HLS_URL=http://127.0.0.1:8888
   STREAM_SECRETS_JSON={}
   ```

5. Click **"Create Web Service"**

### Service 5: Recording Engine

1. Click **"New +"** → **"Private Service"**
2. Connect your repository
3. Configure:
   ```
   Name: sentinel-grid-recording-engine
   Region: Singapore
   Branch: main
   Root Directory: . (leave empty)
   Runtime: Docker
   Dockerfile Path: ./recording-engine/Dockerfile
   Plan: Starter ($7/month) or higher
   ```

4. **Add Persistent Disk:**
   ```
   Name: recording-event-cache
   Mount Path: /recordings
   Size: 100GB
   ```

5. Add Environment Variables:
   ```bash
   HOST=0.0.0.0
   PORT=8091
   CONTROL_PLANE_URL=<control-plane-internal-url>
   RECORDING_ENGINE_SHARED_KEY=<same-as-control-plane>
   RECORDING_ROOT=/recordings
   STORAGE_NODE_EXTERNAL_ID=render-event-cache-01
   STORAGE_NODE_NAME=Cloud event recording cache
   RETENTION_SWEEP_SECONDS=300
   MIN_FREE_STORAGE_BYTES=5368709120
   STREAM_SECRETS_JSON={}
   ```

6. Click **"Create Private Service"**

### Service 6: Analytics Engine

1. Click **"New +"** → **"Private Service"**
2. Connect your repository
3. Configure:
   ```
   Name: sentinel-grid-analytics-engine
   Region: Singapore
   Branch: main
   Root Directory: . (leave empty)
   Runtime: Docker
   Dockerfile Path: ./analytics-engine/Dockerfile
   Plan: Starter ($7/month) or higher
   ```

4. Add Environment Variables:
   ```bash
   NODE_ENV=production
   HOST=0.0.0.0
   PORT=8092
   CONTROL_PLANE_URL=<control-plane-internal-url>
   ANALYTICS_ENGINE_SHARED_KEY=<same-as-control-plane>
   ANALYTICS_SOURCE_SHARED_KEY=<same-as-control-plane>
   ANALYTICS_REQUIRE_MODELS=false
   LOG_TO_FILE=false
   ```

5. Click **"Create Private Service"**

---

## 🔗 Configure Service URLs

After all services are deployed, update these in Control Plane:

1. Go to **sentinel-grid-control-plane** service
2. Click **"Environment"** tab
3. Add/update:
   ```bash
   CONTROL_PLANE_PUBLIC_URL=https://sentinel-grid-control-plane-XXXX.onrender.com
   RECORDING_ENGINE_URL=<recording-engine-internal-url>:8091
   ANALYTICS_ENGINE_URL=<analytics-engine-internal-url>:8092
   ```

---

## ✅ Post-Deployment Checklist

- [ ] All 6 services show "Live" status
- [ ] Database migrations completed
- [ ] Control plane health check passes: `/ready`
- [ ] Dashboard accessible at your dashboard URL
- [ ] Can login to dashboard
- [ ] Camera discovery works (if applicable)
- [ ] Video streaming works through media gateway
- [ ] Check logs for any errors

---

## 🔍 Testing Your Deployment

### 1. Test Control Plane:
```bash
curl https://your-control-plane-url.onrender.com/ready
# Should return: {"status":"ready"}
```

### 2. Test Dashboard:
Visit: `https://your-dashboard-url.onrender.com`
- Should see login page
- Login with admin credentials
- Verify dashboard loads

### 3. Test Video Streaming:
- Add a camera through dashboard
- Check if live video works
- Verify recording functionality

---

## 💰 Cost Estimation

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| PostgreSQL Database | Basic (1GB) | $7 |
| Control Plane | Starter | $7 |
| Dashboard | Starter | $7 |
| Media Gateway | Starter | $7 |
| Recording Engine | Starter + 100GB Disk | $7 + $10 = $17 |
| Analytics Engine | Starter | $7 |
| **Total** | | **~$52/month** |

**Optional Add-ons:**
- Redis (if needed): $10/month
- Additional storage: $0.10/GB/month
- Larger plans for high traffic: $21-$85/service

---

## 🚨 Troubleshooting

### Issue: Services won't start

**Check:**
1. All environment variables are set correctly
2. No typos in service URLs
3. Database URL is correct
4. All shared keys match between services

### Issue: "Port already in use"

**Solution:** Each service should use its designated port:
- Control Plane: 8080
- Dashboard: 10000
- Media Gateway: 8090
- Recording Engine: 8091
- Analytics Engine: 8092

### Issue: Database connection failed

**Solution:**
1. Use **Internal Database URL** (not external)
2. Check database is in same region as services
3. Verify database user has correct permissions

### Issue: Services can't communicate

**Solution:**
1. Use **Internal Service URLs** for inter-service communication
2. Format: `https://service-name:port` (Render provides this)
3. Check all `_SHARED_KEY` variables match

---

## 📚 Additional Resources

- **Render Documentation:** https://render.com/docs
- **Blueprint Spec:** https://render.com/docs/blueprint-spec
- **Docker on Render:** https://render.com/docs/docker
- **Environment Variables:** https://render.com/docs/environment-variables
- **Persistent Disks:** https://render.com/docs/disks

---

## 🔄 Updating Your Deployment

### Auto-Deploy (Recommended):
1. Commit changes to your Git repository
2. Push to main branch
3. Render automatically deploys changes

### Manual Deploy:
1. Go to your service in Render dashboard
2. Click **"Manual Deploy"** → **"Deploy latest commit"**

---

## 🎯 Production Checklist

Before going live:

- [ ] All secrets rotated from development values
- [ ] HTTPS enabled (Render does this automatically)
- [ ] Custom domain configured (optional)
- [ ] SSL certificates active
- [ ] Monitoring/alerts configured
- [ ] Backup strategy in place
- [ ] Load testing completed
- [ ] Security audit passed
- [ ] Documentation updated
- [ ] Team trained on operations

---

**Created:** August 18, 2026  
**Version:** 1.0  
**Status:** ✅ Ready to Deploy
