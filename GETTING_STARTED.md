# Getting Started - 3 Easy Paths

Choose the path that fits your needs:

## 🎯 Path 1: Test with Your 2 Cameras (20 minutes)

**Perfect for:** Trying the system with real cameras right now

```powershell
# Run the one-click deployment
.\deploy\one-click-deploy.ps1

# Choose option 4: Test local cameras
# Then follow the prompts
```

**What you get:**
- ✅ System running locally
- ✅ Automatic camera discovery
- ✅ Live video viewing
- ✅ No cloud deployment needed

**Detailed guide:** See `QUICK_START_2_CAMERAS.md`

---

## 🚀 Path 2: Deploy to Cloud (2 hours)

**Perfect for:** Remote access, multiple branches, production use

### Option A: Vercel + Railway (Easiest)

```powershell
# 1. Deploy backend to Railway
npm install -g @railway/cli
railway login
railway init
railway up

# 2. Deploy dashboard to Vercel
cd dashboard
npm install -g vercel
vercel

# 3. Configure edge agents at each branch
# See edge-agent/.env.example
```

**What you get:**
- ✅ Dashboard on Vercel (fast, global)
- ✅ Backend on Railway (managed database)
- ✅ Access from anywhere
- ✅ ~$20-30/month

### Option B: AWS/GCP (More Control)

```bash
# See DEPLOYMENT_OPTIONS.md for detailed AWS/GCP instructions
```

**Detailed guide:** See `DEPLOYMENT_OPTIONS.md`

---

## 🏠 Path 3: Self-Hosted (30 minutes)

**Perfect for:** Single location, all local, no cloud costs

```powershell
# One command deployment
.\deploy\one-click-deploy.ps1

# Choose option 3: Self-hosted
```

**What you get:**
- ✅ Everything runs locally
- ✅ No cloud costs
- ✅ Complete control
- ✅ Works offline

---

## 📋 Prerequisites

### All Paths
- ✅ Windows 10/11 or Linux/Mac
- ✅ Node.js 22+ ([download](https://nodejs.org))
- ✅ Git

### Path 1 & 3 (Local)
- ✅ Docker Desktop ([download](https://docker.com))
- ✅ FFmpeg/FFprobe ([download](https://ffmpeg.org))

### Path 2 (Cloud)
- ✅ Vercel account (free tier OK)
- ✅ Railway account (free trial available)

---

## 🎬 Quick Start Commands

### Install Dependencies
```powershell
cd c:\Omsystems
npm install
```

### Generate Strong Secrets
```powershell
node -e "console.log('MEDIA_GATEWAY_SHARED_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
```

### Start Locally
```powershell
# Option 1: All-in-one
docker-compose up -d

# Option 2: Individual services
npm run dev              # Control plane
npm run media:dev        # Media gateway
npm run dashboard:dev    # Dashboard
npm run edge:dev         # Edge agent (for cameras)
```

### Deploy to Cloud
```powershell
# One-click deployment
.\deploy\one-click-deploy.ps1

# Manual deployment
vercel --prod                    # Dashboard
railway up                       # Backend
```

---

## 🗺️ What Happens Next?

### After Local Setup (Path 1 or 3)
1. Services start at:
   - Dashboard: http://localhost:3000
   - API: http://localhost:8080
   - Media: http://localhost:8090

2. Edge agent discovers cameras automatically

3. View live streams in dashboard

### After Cloud Deployment (Path 2)
1. Get your URLs:
   - Dashboard: `https://your-app.vercel.app`
   - API: `https://your-app.railway.app`

2. Configure edge agents at each branch with cloud URLs

3. Access from anywhere

---

## 🔧 Configuration Files

### For Local Testing

**edge-agent/.env** (camera discovery)
```bash
CONTROL_PLANE_URL=http://localhost:8080
BRANCH_ID=branch-home-001
EDGE_AGENT_NAME=Home-Agent
CAMERA_USERNAME=admin
CAMERA_PASSWORD=your_camera_password
```

### For Cloud Deployment

**Vercel Environment Variables**
```
CONTROL_PLANE_INTERNAL_URL=https://your-api.railway.app
MEDIA_GATEWAY_INTERNAL_URL=https://your-media.railway.app
```

**Railway Environment Variables**
```
DATABASE_URL=<auto-provided-by-railway>
MEDIA_GATEWAY_SHARED_KEY=<generate-strong-key>
ALLOWED_ORIGINS=https://your-app.vercel.app
NODE_ENV=production
```

---

## 🎯 Decision Matrix

| Scenario | Recommended Path | Time | Cost |
|----------|-----------------|------|------|
| Just testing with 2 cameras | Path 1 | 20 min | $0 |
| Small office (1 location) | Path 3 | 30 min | $0 |
| Multiple branches | Path 2 | 2 hours | $30/mo |
| Need remote access | Path 2 | 2 hours | $30/mo |
| Testing before production | Path 1 → Path 2 | 3 hours | $0 → $30/mo |

---

## 📚 Documentation Guide

| Document | When to Read | Time |
|----------|-------------|------|
| **This file** | Start here | 5 min |
| QUICK_START_2_CAMERAS.md | Testing with real cameras | 10 min |
| DEPLOYMENT_OPTIONS.md | Choosing cloud platform | 15 min |
| CRITICAL_FIXES_CHECKLIST.md | Before production | 30 min |
| PRODUCTION_READINESS_GAPS.md | Understanding risks | 30 min |

---

## 🆘 Troubleshooting

### Services won't start
```powershell
# Check if ports are in use
netstat -ano | findstr ":8080"
netstat -ano | findstr ":3000"

# Check Docker
docker ps
docker-compose logs
```

### Cameras not discovered
```powershell
# Verify camera network
ping <camera-ip>

# Test ONVIF port
Test-NetConnection -ComputerName <camera-ip> -Port 80

# Check edge agent logs
npm run edge:dev
```

### Can't access dashboard
```powershell
# Verify services are running
curl http://localhost:8080/health
curl http://localhost:8090/health
curl http://localhost:3000

# Check firewall
New-NetFirewallRule -DisplayName "Sentinel" -Direction Inbound -LocalPort 3000,8080,8090 -Protocol TCP -Action Allow
```

### Deployment fails
```powershell
# Check prerequisites
node --version    # Should be 22+
npm --version
docker --version

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

---

## ✅ Success Checklist

### Local Setup (Path 1 or 3)
- [ ] Docker running
- [ ] Services started (green health checks)
- [ ] Dashboard accessible at http://localhost:3000
- [ ] Edge agent discovers cameras
- [ ] Live video playing

### Cloud Deployment (Path 2)
- [ ] Dashboard deployed to Vercel
- [ ] Backend deployed to Railway
- [ ] Database created and connected
- [ ] Environment variables configured
- [ ] Edge agents can reach cloud API
- [ ] Live video streaming

---

## 🚀 Next Steps After Setup

1. **Test the system** with your cameras
2. **Review security** (see CRITICAL_FIXES_CHECKLIST.md)
3. **Set up monitoring** (basic metrics)
4. **Configure backups** (database)
5. **Plan production rollout**

---

## 💡 Tips

### For Best Results
- ✅ Start with Path 1 (local testing)
- ✅ Verify cameras work before cloud deployment
- ✅ Use strong secrets (generate with crypto)
- ✅ Enable camera ONVIF before discovery
- ✅ Run on same network as cameras

### Common Mistakes to Avoid
- ❌ Don't use default secrets in production
- ❌ Don't skip security checklist
- ❌ Don't deploy without testing locally first
- ❌ Don't forget to configure edge agents
- ❌ Don't use demo mode in production

---

## 📞 Need Help?

1. Check troubleshooting section above
2. Review relevant documentation
3. Check logs: `docker-compose logs -f`
4. Verify configuration files
5. Test each component individually

---

## 🎉 Ready to Start?

Choose your path and run:

```powershell
# Quick test with cameras
.\deploy\one-click-deploy.ps1

# Or start manually
npm install
docker-compose up -d
npm run dev
```

**Let's go! 🚀**
