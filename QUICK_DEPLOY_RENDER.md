# Quick Deploy to Render (5 Minutes)

## 🚀 Fastest Way to Deploy

### Step 1: Push to GitHub (1 minute)

```bash
git add .
git commit -m "Add CCTV infrastructure and Render deployment"
git push origin main
```

### Step 2: Deploy on Render (3 minutes)

1. Go to https://dashboard.render.com
2. Click **"New"** → **"Blueprint"**
3. **Connect your GitHub repository**
4. **Select this repository**
5. Click **"Apply"**

Render will automatically:
- ✅ Create PostgreSQL database
- ✅ Deploy backend API
- ✅ Deploy frontend dashboard
- ✅ Run all migrations (including CCTV tables)

### Step 3: Initialize CCTV (1 minute)

```powershell
.\scripts\init-render-deployment.ps1 -ApiUrl "https://sentinel-grid-api.onrender.com"
```

Replace with your actual Render URL from dashboard.

---

## ✅ Verify Deployment

### Check API
```bash
curl https://sentinel-grid-api.onrender.com/health
```

Expected: `{"status":"ok","service":"sentinel-control-plane"}`

### Check CCTV
```bash
curl https://sentinel-grid-api.onrender.com/v1/branches \
  -H "x-user-id: user-global-admin"
```

Expected: Branch list with IDs

### Check Dashboard

Open: `https://sentinel-grid-dashboard.onrender.com`

---

## 🎯 What You Get

After 5 minutes, you have:

✅ **PostgreSQL Database** with CCTV infrastructure  
✅ **Backend API** with 11 new CCTV endpoints  
✅ **Frontend Dashboard** for monitoring  
✅ **Automatic Migrations** on every deploy  
✅ **Health Checks** enabled  
✅ **SSL Certificates** automatically provisioned  

---

## 📊 CCTV Features Available

Immediately after deployment:

- ✅ Camera specifications tracking
- ✅ Compliance monitoring
- ✅ Branch requirements management
- ✅ Coverage gap analysis
- ✅ Inspection scheduling
- ✅ 13 location types (entrance, cash counter, ATM, etc.)
- ✅ 10 physical camera types (dome, bullet, PTZ, etc.)

---

## 🔧 Environment Variables (Auto-Set)

Render automatically sets:
- `DATABASE_URL` - From database service
- `NODE_VERSION` - Set to 22
- `NODE_ENV` - Set to production
- `PORT` - Set by Render

You may want to add:
- `MEDIA_GATEWAY_SHARED_KEY` - Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `EDGE_BRIDGE_SHARED_KEY` - Same as above

---

## 📚 Next Steps

1. **Initialize branches:**
   ```powershell
   .\scripts\init-render-deployment.ps1 -ApiUrl "YOUR_URL"
   ```

2. **Add cameras** using discovery workflow

3. **Set camera details:**
   - Location type (entrance, cash counter, etc.)
   - Physical type (dome, bullet, PTZ)
   - Specifications (resolution, frame rate)
   - Compliance status

4. **Monitor coverage gaps**

---

## 🆘 Troubleshooting

### Services Won't Start

**Check:** Render Dashboard → Services → Logs

**Common Issues:**
- Database not ready yet (wait 1-2 minutes)
- Environment variables not set
- Build failed (check Node version)

### Migrations Failed

**Check:** API service build logs for:
```
🚀 Starting database migrations...
```

**If failed:**
1. Check which migrations ran
2. Manually run failed migration
3. Redeploy

### Can't Initialize Branches

**Check:**
- API is running (green status)
- URL is correct
- User ID is valid

---

## 💡 Tips

**Free Tier:**
- Services spin down after 15 min inactivity
- First request may be slow (cold start)
- Perfect for testing

**Upgrade:**
- $7/month per service for always-on
- No cold starts
- Better performance

**Custom Domain:**
- Add custom domain in Render
- Automatic SSL certificates
- Free with any plan

---

## 📖 Full Documentation

- **Complete Guide:** [RENDER_DEPLOYMENT_GUIDE.md](RENDER_DEPLOYMENT_GUIDE.md)
- **Checklist:** [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
- **CCTV Features:** [CCTV_IMPLEMENTATION_SUMMARY.md](CCTV_IMPLEMENTATION_SUMMARY.md)
- **All Docs:** [INDEX.md](INDEX.md)

---

**Deploy Time:** 5 minutes  
**Cold Start:** 30-60 seconds (free tier)  
**Always On:** $21/month (all services)

**Ready? Push to GitHub and deploy!** 🚀
