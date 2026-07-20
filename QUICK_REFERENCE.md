# Quick Reference Card

## 🎯 One-Line Summary
CCTV monitoring system: Auto-discovers cameras, streams live video, controls access hierarchically. Works but needs security fixes for production.

---

## ⚡ Quick Commands

```powershell
# Test with your 2 cameras (20 min)
.\deploy\one-click-deploy.ps1

# Generate strong secrets
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Start locally
docker-compose up -d

# Deploy to cloud
vercel        # Dashboard
railway up    # Backend
```

---

## 📚 Essential Documents

| Read | When | Time |
|------|------|------|
| [START_HERE.md](START_HERE.md) | First time | 2 min |
| [QUICK_START_2_CAMERAS.md](QUICK_START_2_CAMERAS.md) | Testing | 10 min |
| [PRODUCTION_READINESS_GAPS.md](PRODUCTION_READINESS_GAPS.md) | Before production | 30 min |

---

## 🔴 Top 5 Issues to Fix

1. **Authentication** → Implement OIDC (not dev headers)
2. **Secrets** → Generate strong keys (not defaults)
3. **Rate Limiting** → Add request limits
4. **Backups** → Setup automated backups
5. **Monitoring** → Add metrics & alerts

**Time to fix:** 8-10 hours | **Guide:** CRITICAL_FIXES_CHECKLIST.md

---

## 🚀 Deployment Options

| Option | Time | Cost | Best For |
|--------|------|------|----------|
| **Self-hosted** | 30 min | $0 | Testing, single location |
| **Vercel + Railway** | 2 hours | $30/mo | Multiple branches |
| **AWS/GCP** | 4 hours | $50/mo | Enterprise |

---

## ✅ What Works

- ✅ Camera discovery (ONVIF)
- ✅ Live streaming (HLS/WebRTC)
- ✅ Authorization (hierarchical RBAC)
- ✅ Database schema
- ✅ Dashboard UI

---

## ⚠️ What Needs Work

- ⚠️ Production authentication
- ⚠️ Security hardening
- ⚠️ Monitoring setup
- ⚠️ Backup strategy

---

## 🎯 Decision Matrix

| Scenario | Action | Document |
|----------|--------|----------|
| Just testing | Run one-click deploy | QUICK_START_2_CAMERAS.md |
| Need remote access | Deploy to cloud | DEPLOYMENT_OPTIONS.md |
| Going to production | Fix security first | CRITICAL_FIXES_CHECKLIST.md |
| Deciding timeline | Review gaps | PRODUCTION_READINESS_GAPS.md |

---

## 📊 Status: ⚠️ Working, Needs Hardening

**Architecture:** ✅ Excellent  
**Functionality:** ✅ Works  
**Security:** ⚠️ Needs OIDC  
**Operations:** ⚠️ Needs monitoring  
**Production:** 🔴 Not ready (yet)

**Verdict:** 1 week to production-ready

---

## 💡 Pro Tips

- Start with local testing before cloud
- Enable ONVIF on cameras first
- Use strong secrets (generate with crypto)
- Test with 1-2 cameras before full deployment
- Read PRODUCTION_READINESS_GAPS.md before go-live

---

## 🆘 Troubleshooting

**Services won't start?**
```powershell
docker-compose logs
```

**Cameras not found?**
```powershell
# Check ONVIF enabled
# Verify same network
ping <camera-ip>
```

**Can't access dashboard?**
```powershell
curl http://localhost:8080/health
curl http://localhost:3000
```

---

## 📞 Need More Info?

- **Complete guide:** [COMPLETE_ANALYSIS_SUMMARY.md](COMPLETE_ANALYSIS_SUMMARY.md)
- **Find anything:** [INDEX.md](INDEX.md)
- **Start here:** [START_HERE.md](START_HERE.md)

---

**Ready? Run:** `.\deploy\one-click-deploy.ps1`
