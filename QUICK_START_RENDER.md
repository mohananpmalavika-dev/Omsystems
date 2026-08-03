# Quick Start: Deploy to Render in 5 Minutes

## Prerequisites
- ✅ Code in GitHub repository
- ✅ Render account (free signup at https://render.com)

## Step-by-Step Deployment

### 1️⃣ Run Pre-deployment Check (Windows)

```powershell
cd analytics-engine
.\scripts\deploy-render.ps1
```

This will:
- ✅ Check Node.js and npm versions
- ✅ Test TypeScript compilation
- ✅ Verify all required files exist
- ✅ Generate secure API keys
- ✅ Display environment variables needed

### 2️⃣ Push to GitHub

```bash
git add .
git commit -m "Add analog camera AI features - ready for deployment"
git push origin main
```

### 3️⃣ Deploy on Render

1. **Go to Render Dashboard**
   - Visit: https://dashboard.render.com
   - Click **"New +"** → **"Web Service"**

2. **Connect Repository**
   - Select your GitHub account
   - Choose repository: `Omsystems`
   - Click **"Connect"**

3. **Configure Service**
   ```
   Name: sentinel-analytics-engine
   Region: Oregon (or closest to you)
   Branch: main
   Root Directory: analytics-engine
   Runtime: Node
   Build Command: npm install && npm run build
   Start Command: npm start
   Instance Type: Starter ($7/month) or higher
   ```

4. **Add Environment Variables**
   
   Copy from the deploy script output:
   ```bash
   NODE_ENV=production
   PORT=3000
   ANALYTICS_SOURCE_SHARED_KEY=[from script output]
   CONTROL_PLANE_SHARED_KEY=[from script output]
   
   # Enable Analog Camera AI
   ENABLE_ANALOG_VIDEO_QUALITY=true
   ENABLE_CAMERA_AGING_PREDICTION=true
   ENABLE_CAMERA_TYPE_CLASSIFIER=true
   ENABLE_DVR_CHANNEL_HEALTH=true
   
   # Model Config
   ANALYTICS_REQUIRE_MODELS=false
   MODEL_CACHE_SIZE_MB=2048
   ```

5. **Deploy**
   - Click **"Create Web Service"**
   - Wait 3-5 minutes for deployment
   - Look for "Live" status

### 4️⃣ Test Your Deployment

Once deployed, you'll get a URL like:
```
https://sentinel-analytics-engine.onrender.com
```

**Test with curl**:

```bash
# Health check
curl https://your-app.onrender.com/health

# Analog Camera Dashboard
curl https://your-app.onrender.com/v1/analog/dashboard

# Detectors Status
curl https://your-app.onrender.com/v1/detectors/health

# Quality Issues
curl https://your-app.onrender.com/v1/analog/quality/issues

# Upgrade Recommendations
curl https://your-app.onrender.com/v1/analog/upgrade/summary
```

**Expected Response** (health check):
```json
{
  "status": "ok",
  "service": "sentinel-analytics-engine",
  "pipeline": {
    "initialized": true,
    "detectors": {
      "analog-video-quality": { "status": "healthy" },
      "camera-aging": { "status": "healthy" },
      "camera-type-classifier": { "status": "healthy" },
      "dvr-channel-health": { "status": "healthy" }
    }
  }
}
```

## 🎉 You're Live!

Your Sentinel Grid Analytics Engine with Analog Camera AI is now running on Render!

## Next Steps

### Configure Your Cameras

Send camera streams to your Render URL:

```javascript
// Example: Configure DVR to send streams
const analyticsUrl = "https://sentinel-analytics-engine.onrender.com";

// Your camera configuration
const camera = {
  cameraId: "entrance-cam-1",
  streamUrl: "rtsp://dvr-ip:554/channel1",
  analyticsEndpoint: `${analyticsUrl}/internal/detections`
};
```

### Monitor Performance

- **Render Dashboard**: https://dashboard.render.com
- **View Logs**: Click on your service → "Logs" tab
- **Check Metrics**: Monitor CPU, Memory, Request count

### Set Up Alerts

In Render Dashboard:
1. Go to your service → "Settings" → "Notifications"
2. Add email or Slack webhook
3. Configure alerts for:
   - Service down
   - High error rate
   - Memory usage > 80%

## Common Commands

```bash
# View real-time logs
render logs -f sentinel-analytics-engine

# Restart service
render service restart sentinel-analytics-engine

# Check service status
render service status sentinel-analytics-engine

# Update environment variable
render env set KEY=VALUE -s sentinel-analytics-engine
```

## Scaling

### Add More Resources

If you need more power:

1. **Upgrade Instance Type**:
   - Render Dashboard → Service → Settings → Instance Type
   - Choose: Standard ($25) or Pro ($85)

2. **Add Horizontal Scaling** (Pro plan):
   - Settings → Scaling
   - Set min/max instances
   - Configure autoscaling rules

### Add Database (Optional)

For persistent storage:

```yaml
# In render.yaml, add:
- type: pserv
  name: sentinel-db
  runtime: postgres
  plan: starter

# Then add to service:
DATABASE_URL=[from database]
```

## Cost Estimate

| Plan | Cost/Month | Suitable For |
|------|------------|-------------|
| Free | $0 | Testing only |
| Starter | $7 | < 10 cameras |
| Standard | $25 | 10-50 cameras |
| Pro | $85 | 50-200 cameras |

**Recommended for Production**: Standard ($25) + Database ($7) = **$32/month**

## Troubleshooting

### Issue: Build Fails

**Check**:
1. TypeScript compilation: `npm run build`
2. All dependencies installed: `npm install`
3. Node.js version >= 18

### Issue: Health Check Fails

**Check**:
1. `/health` endpoint returns 200
2. `ANALYTICS_REQUIRE_MODELS=false` (unless models are loaded)
3. Logs for initialization errors

### Issue: Slow Response

**Solutions**:
1. Upgrade to larger instance
2. Enable Redis caching
3. Reduce `MODEL_CACHE_SIZE_MB`

## Support

- **Render Docs**: https://render.com/docs
- **Full Guide**: See `RENDER_DEPLOYMENT_GUIDE.md`
- **API Docs**: See `analytics-engine/docs/ANALOG_CAMERA_AI.md`
- **Render Support**: support@render.com

## API Endpoints

Your analytics engine provides these endpoints:

### Health & Status
- `GET /health` - Service health check
- `GET /v1/detectors/health` - All detectors status

### Analog Camera AI
- `GET /v1/analog/dashboard` - Complete dashboard
- `GET /v1/analog/quality/:cameraId` - Video quality
- `GET /v1/analog/quality/issues` - All quality issues
- `GET /v1/analog/aging/:cameraId` - Camera aging metrics
- `GET /v1/analog/aging/priority` - Replacement priorities
- `GET /v1/analog/classification/:cameraId` - Camera type
- `GET /v1/analog/upgrade/:cameraId` - Upgrade recommendation
- `GET /v1/analog/upgrade/summary` - Upgrade summary
- `POST /v1/analog/upgrade/plan` - Generate upgrade plan
- `GET /v1/analog/dvr/:dvrId/health` - DVR health

### Detection APIs
- `GET /v1/detections/persons/tracks` - Person tracking
- `GET /v1/detections/vehicles/tracks` - Vehicle tracking
- `GET /v1/analytics/heatmap` - Heat map data
- `GET /v1/analytics/crowd/metrics` - Crowd metrics

See full API documentation in `docs/ANALOG_CAMERA_AI.md`

---

**Deployment Time**: ~5 minutes
**Total Setup Time**: ~15 minutes
**Production Ready**: ✅ Yes

**Happy Deploying! 🚀**
