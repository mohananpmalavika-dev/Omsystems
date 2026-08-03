# Render Deployment Guide - Sentinel Grid Analytics Engine

Complete guide to deploy the Sentinel Grid Analytics Engine with Analog Camera AI features to Render.

## Prerequisites

1. **Render Account**: Sign up at https://render.com
2. **GitHub Account**: Your code should be in a GitHub repository
3. **FFmpeg**: Pre-installed on Render (no action needed)
4. **Node.js 20+**: Pre-configured in render.yaml

## Deployment Methods

### Method 1: Deploy via Render Dashboard (Recommended for First Time)

#### Step 1: Prepare Your Repository

1. **Push your code to GitHub**:
```bash
cd /path/to/Omsystems
git add .
git commit -m "Add analog camera AI features"
git push origin main
```

2. **Ensure these files are in your repo**:
   - `analytics-engine/render.yaml` ✅
   - `analytics-engine/package.json` ✅
   - `analytics-engine/tsconfig.json` ✅
   - `analytics-engine/src/` directory ✅

#### Step 2: Create New Web Service on Render

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Select the repository: `Omsystems`

#### Step 3: Configure Service Settings

**Basic Settings**:
- **Name**: `sentinel-analytics-engine`
- **Region**: Select closest to your users (e.g., Oregon, Frankfurt)
- **Branch**: `main` (or your deployment branch)
- **Root Directory**: `analytics-engine`
- **Runtime**: `Node`

**Build & Deploy**:
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`

**Instance Type**:
- **Free Tier**: Limited resources, good for testing
- **Starter ($7/month)**: 512 MB RAM, suitable for small deployments
- **Standard ($25/month)**: 2 GB RAM, recommended for production
- **Pro ($85/month)**: 4 GB RAM, for high-traffic deployments

#### Step 4: Configure Environment Variables

In the Render dashboard, add these environment variables:

**Required**:
```bash
NODE_ENV=production
PORT=3000
ANALYTICS_SOURCE_SHARED_KEY=[auto-generate or set secure key]
CONTROL_PLANE_SHARED_KEY=[your-secure-key]
```

**Optional (Analog Camera AI)**:
```bash
ENABLE_ANALOG_VIDEO_QUALITY=true
ENABLE_CAMERA_AGING_PREDICTION=true
ENABLE_CAMERA_TYPE_CLASSIFIER=true
ENABLE_DVR_CHANNEL_HEALTH=true
```

**Model Configuration**:
```bash
ANALYTICS_REQUIRE_MODELS=false
MODEL_CACHE_SIZE_MB=2048
ENABLE_GPU_ACCELERATION=false
```

**FFmpeg Configuration**:
```bash
ANALYTICS_FRAME_WIDTH=640
ANALYTICS_FRAME_HEIGHT=640
ANALYTICS_FRAME_TIMEOUT_MS=10000
FFMPEG_PATH=/usr/bin/ffmpeg
```

#### Step 5: Deploy

1. Click **"Create Web Service"**
2. Render will:
   - Clone your repository
   - Install dependencies
   - Build TypeScript
   - Start the service
3. Monitor deployment logs in real-time
4. Wait for "Live" status (usually 3-5 minutes)

#### Step 6: Verify Deployment

Once deployed, test your endpoints:

```bash
# Get your Render URL (e.g., https://sentinel-analytics-engine.onrender.com)
RENDER_URL="https://your-app.onrender.com"

# Check health
curl $RENDER_URL/health

# Check analog dashboard
curl $RENDER_URL/v1/analog/dashboard

# Check detectors health
curl $RENDER_URL/v1/detectors/health
```

---

### Method 2: Deploy via Blueprint (Infrastructure as Code)

#### Step 1: Use render.yaml Blueprint

Your `render.yaml` file is already configured. Render will automatically detect it.

1. Go to **Dashboard** → **"New +"** → **"Blueprint"**
2. Connect your GitHub repository
3. Select the repository: `Omsystems`
4. Render will automatically detect `analytics-engine/render.yaml`
5. Click **"Apply"**

This will deploy everything defined in your `render.yaml` file.

---

### Method 3: Deploy via Render CLI

#### Step 1: Install Render CLI

```bash
npm install -g @render/cli
```

#### Step 2: Login to Render

```bash
render login
```

#### Step 3: Deploy

```bash
cd analytics-engine
render blueprint deploy
```

---

## Configuration Details

### Environment Variables Reference

#### Security & Authentication
```bash
ANALYTICS_SOURCE_SHARED_KEY=your-secure-key-here
CONTROL_PLANE_SHARED_KEY=your-control-plane-key
CONTROL_PLANE_URL=https://your-control-plane.onrender.com
```

#### Analog Camera AI Features (All default to true)
```bash
ENABLE_ANALOG_VIDEO_QUALITY=true
ENABLE_CAMERA_AGING_PREDICTION=true
ENABLE_CAMERA_TYPE_CLASSIFIER=true
ENABLE_DVR_CHANNEL_HEALTH=true
```

#### Quality Detection Thresholds
```bash
ANALOG_NOISE_THRESHOLD_LOW=15        # Low noise warning
ANALOG_NOISE_THRESHOLD_HIGH=30       # High noise alert
ANALOG_SHARPNESS_THRESHOLD=20        # Minimum acceptable sharpness
```

#### Camera Aging Thresholds
```bash
CAMERA_HIGH_RISK_AGE_YEARS=7         # Age for high-risk classification
CAMERA_CRITICAL_RISK_AGE_YEARS=10    # Age for critical replacement
CAMERA_DEGRADATION_THRESHOLD=5       # Quality decline per month
```

#### AI Confidence Thresholds
```bash
HELMET_CONFIDENCE_THRESHOLD=0.7
FIRE_CONFIDENCE_THRESHOLD=0.65
FACE_CONFIDENCE_THRESHOLD=0.75
ANPR_PLATE_CONFIDENCE_THRESHOLD=0.7
ANPR_CONFIDENCE_THRESHOLD=0.8
ANPR_COUNTRY_CODE=IN
```

#### Model Configuration
```bash
ANALYTICS_REQUIRE_MODELS=false       # false = runs without models
MODEL_CACHE_SIZE_MB=2048            # Model cache size
MODELS_DIR=/opt/render/project/src/analytics-engine/models
ENABLE_GPU_ACCELERATION=false       # Enable on GPU-enabled plans
```

#### Frame Processing
```bash
ANALYTICS_FRAME_WIDTH=640
ANALYTICS_FRAME_HEIGHT=640
ANALYTICS_FRAME_TIMEOUT_MS=10000
FFMPEG_PATH=/usr/bin/ffmpeg
```

---

## Persistent Storage for Models

### Option 1: Use Render Disks (Recommended)

Already configured in `render.yaml`:

```yaml
disk:
  name: analytics-models
  mountPath: /opt/render/project/src/analytics-engine/models
  sizeGB: 10
```

**Benefits**:
- Persistent across deployments
- Survives service restarts
- 10GB free with paid plans

**Upload Models**:
1. Deploy service first
2. Use Render Shell:
   ```bash
   # In Render dashboard, click "Shell" tab
   cd /opt/render/project/src/analytics-engine/models
   
   # Download models (example)
   wget https://your-model-storage/yolov8n.onnx
   ```

### Option 2: External Storage (S3, GCS, Azure Blob)

Set environment variable:
```bash
MODELS_STORAGE_URL=https://your-bucket.s3.amazonaws.com/models/
```

Update code to download models on startup.

---

## Custom Domain Setup

### Step 1: Add Custom Domain in Render

1. Go to your service → **Settings** → **Custom Domains**
2. Click **"Add Custom Domain"**
3. Enter your domain: `analytics.yourdomain.com`

### Step 2: Configure DNS

Add CNAME record in your DNS provider:

```
Type: CNAME
Name: analytics
Value: sentinel-analytics-engine.onrender.com
TTL: 3600
```

### Step 3: Enable HTTPS

Render automatically provides free SSL certificates via Let's Encrypt.

---

## Scaling & Performance

### Horizontal Scaling

**Render Dashboard**:
1. Go to service → **Settings** → **Scaling**
2. Set instance count: 1-10
3. Configure autoscaling rules (Pro plan)

**render.yaml** (requires Pro plan):
```yaml
scaling:
  minInstances: 2
  maxInstances: 5
  targetMemoryPercent: 80
  targetCPUPercent: 80
```

### Vertical Scaling

Upgrade instance type:
- Free: 512 MB RAM, 0.1 CPU
- Starter: 512 MB RAM, 0.5 CPU
- Standard: 2 GB RAM, 1 CPU
- Pro: 4 GB RAM, 2 CPU
- Pro Plus: 8 GB RAM, 4 CPU
- Pro Max: 16 GB RAM, 8 CPU

### Performance Optimization

**1. Enable Redis Caching** (optional):

Add to `render.yaml`:
```yaml
- type: redis
  name: sentinel-cache
  plan: starter
```

Add to service environment:
```bash
REDIS_URL=[from redis service]
```

**2. Use PostgreSQL for Persistence** (optional):

Add to `render.yaml`:
```yaml
- type: pserv
  name: sentinel-db
  runtime: postgres
  plan: starter
```

**3. Configure CDN** (optional):

Use Cloudflare or similar in front of Render for:
- Static asset caching
- DDoS protection
- Geographic distribution

---

## Monitoring & Logging

### Built-in Render Monitoring

Render provides:
- **Real-time logs**: Dashboard → Logs tab
- **Metrics**: CPU, memory, request count
- **Health checks**: Automatic with `/health` endpoint
- **Alerts**: Configure in dashboard

### Custom Monitoring

Add monitoring service (optional):

**1. Add Sentry for Error Tracking**:
```bash
npm install @sentry/node
```

Environment variable:
```bash
SENTRY_DSN=your-sentry-dsn
```

**2. Add Datadog/New Relic** (Enterprise):
```bash
DATADOG_API_KEY=your-key
NEW_RELIC_LICENSE_KEY=your-key
```

### Log Aggregation

Render logs are available via:
- Dashboard (last 7 days)
- Log streams (webhook to external service)
- Render CLI: `render logs -f`

---

## Troubleshooting

### Common Issues

#### 1. Build Fails

**Error**: `npm ERR! code ELIFECYCLE`

**Solution**:
```bash
# Check build command in render.yaml
buildCommand: npm install && npm run build

# Ensure tsconfig.json is correct
# Ensure all TypeScript files compile locally first
```

#### 2. Health Check Fails

**Error**: Service marked as unhealthy

**Solution**:
```bash
# Check /health endpoint returns 200
# Verify ANALYTICS_REQUIRE_MODELS is false if models not loaded
# Check logs for initialization errors
```

#### 3. Out of Memory

**Error**: `JavaScript heap out of memory`

**Solution**:
- Upgrade to larger instance (Standard or Pro)
- Reduce `MODEL_CACHE_SIZE_MB`
- Enable model lazy loading

#### 4. FFmpeg Not Found

**Error**: `FFmpeg could not start`

**Solution**:
```bash
# Set correct path
FFMPEG_PATH=/usr/bin/ffmpeg

# Or use auto-detection
FFMPEG_PATH=ffmpeg
```

#### 5. Slow Cold Starts

**Issue**: First request takes 30+ seconds

**Solution**:
- Keep service warm with cron job:
  ```bash
  # Use cron-job.org or similar
  curl https://your-app.onrender.com/health
  ```
- Upgrade to paid plan (faster cold starts)
- Enable "Always On" (paid plans)

### Debug Mode

Enable verbose logging:
```bash
DEBUG=sentinel:*
LOG_LEVEL=debug
```

View logs:
```bash
render logs --tail 100 sentinel-analytics-engine
```

---

## Cost Estimation

### Monthly Costs (USD)

| Configuration | Cost | Suitable For |
|--------------|------|-------------|
| **Free Tier** | $0 | Testing, POC |
| **Starter** | $7/month | Small deployments (< 10 cameras) |
| **Standard** | $25/month | Medium deployments (10-50 cameras) |
| **Pro** | $85/month | Large deployments (50-200 cameras) |
| **Pro + Disk** | $85 + $0.25/GB | With persistent models |
| **Pro + Database** | $85 + $7 | With PostgreSQL |
| **Pro + Redis** | $85 + $10 | With caching |

**Estimated for 50-camera banking branch**:
- Service: Standard ($25)
- Disk: 10GB ($2.50)
- Database: Starter ($7)
- **Total**: ~$35/month

---

## Production Checklist

Before going live:

- [ ] Set secure `ANALYTICS_SOURCE_SHARED_KEY`
- [ ] Set secure `CONTROL_PLANE_SHARED_KEY`
- [ ] Configure `CONTROL_PLANE_URL`
- [ ] Enable HTTPS with custom domain
- [ ] Set up monitoring/alerts
- [ ] Configure autoscaling (if needed)
- [ ] Test all analog camera endpoints
- [ ] Set up database backup (if using PostgreSQL)
- [ ] Configure log retention
- [ ] Set up error tracking (Sentry)
- [ ] Enable health check monitoring
- [ ] Test failover/recovery
- [ ] Document API endpoints for team
- [ ] Set up API rate limiting (if needed)
- [ ] Configure CORS if needed

---

## API Access After Deployment

Your analytics API will be available at:

```
https://sentinel-analytics-engine.onrender.com
```

### Test Endpoints

```bash
# Base URL
BASE_URL="https://sentinel-analytics-engine.onrender.com"

# Health check
curl $BASE_URL/health

# Analog camera dashboard
curl $BASE_URL/v1/analog/dashboard

# Get quality issues
curl $BASE_URL/v1/analog/quality/issues

# Get upgrade recommendations
curl $BASE_URL/v1/analog/upgrade/summary

# Get detector health
curl $BASE_URL/v1/detectors/health
```

### Authentication

Add header to authenticated requests:
```bash
curl -H "x-analytics-source-key: YOUR_KEY" \
  $BASE_URL/internal/detections
```

---

## Support & Resources

- **Render Documentation**: https://render.com/docs
- **Render Community**: https://community.render.com
- **Render Status**: https://status.render.com
- **Support**: support@render.com

For Sentinel Grid specific issues:
- Check logs: `render logs -f sentinel-analytics-engine`
- Review health: `curl https://your-app.onrender.com/health`
- API docs: `analytics-engine/docs/ANALOG_CAMERA_AI.md`

---

## Next Steps

1. **Deploy to Render** following Method 1 above
2. **Test all endpoints** using curl or Postman
3. **Configure your cameras** to send streams to deployed URL
4. **Monitor performance** in Render dashboard
5. **Scale as needed** based on camera count

---

**Last Updated**: August 2, 2026
**Deployment Method**: Render Platform
**Project**: Sentinel Grid Analytics Engine with Analog Camera AI
