# 👋 START HERE

Welcome to Sentinel Grid! Here's everything you need to know in 2 minutes.

## What is This?

A **CCTV monitoring system** that:
- 🔍 Discovers cameras automatically (ONVIF)
- 🎥 Streams live video (HLS/WebRTC)
- 🔐 Controls access with hierarchical permissions
- 📊 Works with multiple branches and locations

## I Want To...

### "Test with my 2 cameras right now" (20 min)
```powershell
.\deploy\one-click-deploy.ps1
# Choose option 4
```
Then read: [QUICK_START_2_CAMERAS.md](QUICK_START_2_CAMERAS.md)

### "Deploy to production" (1-7 days)
1. Read: [PRODUCTION_READINESS_GAPS.md](PRODUCTION_READINESS_GAPS.md)
2. Complete: [CRITICAL_FIXES_CHECKLIST.md](CRITICAL_FIXES_CHECKLIST.md)
3. Deploy: [DEPLOYMENT_OPTIONS.md](DEPLOYMENT_OPTIONS.md)

### "Understand the architecture"
Read: [docs/architecture.md](docs/architecture.md)

### "Deploy to cloud (Vercel/Railway)" (2 hours)
```powershell
.\deploy\one-click-deploy.ps1
# Choose option 1, then option 2
```
Then read: [DEPLOYMENT_OPTIONS.md](DEPLOYMENT_OPTIONS.md)

### "Just get it running locally" (30 min)
```powershell
.\deploy\one-click-deploy.ps1
# Choose option 3
```

## What's the Catch?

✅ **Good News:**
- Core functionality works great
- Clean architecture
- Well-tested authorization
- Production-ready code structure

⚠️ **Important:**
- Still using development authentication (not OIDC)
- Missing some production hardening
- See full gap analysis: [PRODUCTION_READINESS_GAPS.md](PRODUCTION_READINESS_GAPS.md)

**Bottom line:** Works great for testing/pilot. Needs security fixes for full production.

## Quick Decision Tree

```
Do you have cameras on your network?
├─ Yes → Start with QUICK_START_2_CAMERAS.md
└─ No → Start with demo mode (GETTING_STARTED.md Path 2)

Is this for testing or production?
├─ Testing → Use one-click local deployment (30 min)
└─ Production → Read PRODUCTION_READINESS_GAPS.md first

Do you need remote access?
├─ Yes → Deploy to cloud (DEPLOYMENT_OPTIONS.md)
└─ No → Self-host locally (one-click option 3)

Are you deploying tomorrow?
├─ Yes → Read CRITICAL_FIXES_CHECKLIST.md NOW
└─ No → Follow standard deployment path
```

## File Guide (What to Read When)

| Want To... | Read This | Time |
|-----------|-----------|------|
| Get started quickly | [GETTING_STARTED.md](GETTING_STARTED.md) | 5 min |
| Test with real cameras | [QUICK_START_2_CAMERAS.md](QUICK_START_2_CAMERAS.md) | 10 min |
| Deploy to cloud | [DEPLOYMENT_OPTIONS.md](DEPLOYMENT_OPTIONS.md) | 15 min |
| Go to production | [PRODUCTION_READINESS_GAPS.md](PRODUCTION_READINESS_GAPS.md) | 30 min |
| Fix security issues | [CRITICAL_FIXES_CHECKLIST.md](CRITICAL_FIXES_CHECKLIST.md) | 10 min |
| Understand architecture | [docs/architecture.md](docs/architecture.md) | 20 min |

## Prerequisites

**Minimum:**
- Windows 10/11, Linux, or Mac
- Node.js 22+
- Git

**For local deployment:**
- Docker Desktop
- FFmpeg (for camera stream validation)

**For cloud deployment:**
- Vercel account (free tier OK)
- Railway/AWS/GCP account

## Common Questions

**Q: Can I use this in production?**  
A: Yes, but complete the security fixes first. See CRITICAL_FIXES_CHECKLIST.md

**Q: Does it work with my cameras?**  
A: If they support ONVIF, yes! Works with Hikvision, Dahua, TP-Link, Axis, Reolink, etc.

**Q: How much does it cost to deploy?**  
A: Local: $0. Cloud: ~$30-50/mo (Vercel + Railway). See DEPLOYMENT_OPTIONS.md

**Q: Can I test without cameras?**  
A: Yes, use demo mode. See GETTING_STARTED.md

**Q: Is it ready for 500 branches and 4000 cameras?**  
A: Architecture supports it, but needs load testing first. Start with pilot.

## Next Step

Choose one:

```powershell
# 1. Quick test with cameras
.\deploy\one-click-deploy.ps1

# 2. Read getting started guide
code GETTING_STARTED.md

# 3. Check production readiness
code PRODUCTION_READINESS_GAPS.md
```

**Ready? Let's go! 🚀**

---

💡 **Tip:** If you're overwhelmed, just run `.\deploy\one-click-deploy.ps1` and choose option 4. You'll have a working system with your cameras in 20 minutes.
