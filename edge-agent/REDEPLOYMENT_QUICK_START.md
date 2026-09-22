# 🚀 Quick Start After Control Plane Redeployment

## ✅ Control Plane Status: HEALTHY

Your control plane at **http://3.7.216.169:8080** is running and ready!

---

## 🎯 What You Need to Do (5 Minutes)

Since the control plane was redeployed, all previous registrations are gone. Here's the quick fix:

### 1️⃣ Open Dashboard (1 min)
```
http://3.7.216.169:8080
```
- Login (or complete first-time setup if needed)
- Navigate to your branch (or create one)

### 2️⃣ Generate Activation Code (1 min)
- Go to: **Edge Agents** → **Register New Scanner**
- Name: `KryptonLogic Central Scanner`
- Click **"Generate Activation Code"**
- **COPY the code** (starts with `sgact_`)

### 3️⃣ Update Edge Agent (30 seconds)
Run this in PowerShell:
```powershell
cd edge-agent
.\update-activation-code.ps1
```
Paste your activation code when prompted.

### 4️⃣ Restart (1 min)
```batch
.\START_SCANNER_SIMPLE.bat
```

### 5️⃣ Verify (30 seconds)
Check logs:
```powershell
Get-Content logs\edge-agent.log -Tail 10
```

Look for: ✅ `Successfully registered with control plane`

---

## 🎉 Done!

Your edge agent should now be connected and working!

Check the dashboard - you should see:
- ✅ Edge agent: **Online**
- ✅ Cameras: **Discovered and monitoring**
- ✅ Analytics: **Active**

---

## 🔄 Have Multiple Edge Agents?

Repeat steps 2-4 for each edge agent:
1. Generate new activation code (one per agent)
2. Update `.env` file
3. Restart agent

---

## 💡 Prevent This in the Future

To avoid losing registrations on redeployment:

### Option 1: Use Persistent Database
Update your control plane deployment to use PostgreSQL with persistent storage:

```yaml
# docker-compose.yml or similar
services:
  postgres:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: kryptonlogic
      POSTGRES_USER: ...
      POSTGRES_PASSWORD: ...

volumes:
  postgres_data:
```

### Option 2: Regular Backups
Set up automatic database backups:
```bash
# Daily backup script
pg_dump -h localhost -U dbuser kryptonlogic > backup-$(date +%Y%m%d).sql
```

### Option 3: Configuration as Code
Store edge agent configurations in version control and use deployment scripts.

---

## 📞 Need Help?

- **Detailed Guide**: `EDGE_AGENT_FIX_GUIDE.md`
- **Setup Wizard**: `node setup-after-redeploy.mjs`
- **Auto Updater**: `.\update-activation-code.ps1`

---

**Quick Links:**
- Dashboard: http://3.7.216.169:8080
- Health Check: http://3.7.216.169:8080/health
- Edge Agent Local: http://127.0.0.1:8090/health
