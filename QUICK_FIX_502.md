# 🚨 502 ERROR - 5 MINUTE QUICK FIX

## Problem: Your backend services crashed

## Solution: 3 Steps

### **STEP 1: Go to Render Dashboard**
1. Open: https://dashboard.render.com
2. Find service: **sentinel-grid-control-plane**
3. Click on it

### **STEP 2: Check the Logs**
1. Click "Logs" tab (left sidebar)
2. Scroll to bottom
3. Look for errors

**What to look for:**
```
❌ "Error: connect ECONNREFUSED"
   → Database is down or unreachable
   
❌ "password authentication failed"
   → Database credentials wrong
   
❌ "database 'sentinel_grid' does not exist"  
   → Need to run migrations
   
❌ "FATAL ERROR: JavaScript heap out of memory"
   → Need bigger server (upgrade to Standard plan)
   
❌ "MEDIA_GATEWAY_SHARED_KEY is required"
   → Missing environment variable
```

### **STEP 3: Fix Based on Error**

#### **FIX A: Database Not Reachable**
```
1. In Render Dashboard → Click "sentinel-grid-db"
2. Check status - should be green "Available"
3. If red/yellow → wait for it to start
4. If green → check connection string:
   - Click "Info" tab
   - Copy "Internal Connection String"
5. Go back to "sentinel-grid-control-plane"
6. Click "Environment" tab
7. Find DATABASE_URL → verify it matches the connection string
8. If different → update it
9. Click "Manual Deploy" → "Deploy latest commit"
```

#### **FIX B: Database Exists but Empty (No Tables)**
```
1. In Render Dashboard → "sentinel-grid-control-plane"
2. Click "Shell" tab (top right)
3. Type: npm run migrate
4. Press Enter
5. Wait for "Migrations complete"
6. Go back to your dashboard and refresh
```

#### **FIX C: Out of Memory**
```
1. In Render Dashboard → "sentinel-grid-control-plane"
2. Click "Settings" tab
3. Under "Plan" → Click "Change"
4. Select "Standard" ($25/month, 2GB RAM)
5. Click "Save"
6. Service will auto-restart with more memory
```

#### **FIX D: Missing Environment Variable**
```
1. In Render Dashboard → "sentinel-grid-control-plane"  
2. Click "Environment" tab
3. Click "Add Environment Variable"
4. Add these if missing:

   EDGE_BRIDGE_SHARED_KEY = random-32-character-secret-here
   
   (Generate random: https://1password.com/password-generator/)
   
5. Click "Save Changes"
6. Service will auto-restart
```

---

## 🎯 **After Fixing - Verify It Works:**

1. **Check service status:**
   - In Render Dashboard → sentinel-grid-control-plane
   - Status should be green "Live" (not red/yellow)

2. **Check logs for success:**
   - Logs tab should show: "Listening on http://0.0.0.0:8080"
   - No error messages

3. **Test your dashboard:**
   - Open your Sentinel Grid dashboard
   - Refresh the page (Ctrl+F5)
   - Errors should be gone

---

## 🆘 **Still Not Working?**

**Copy the last 50 lines of logs and share them:**

1. In Render → sentinel-grid-control-plane → Logs tab
2. Scroll to bottom
3. Copy last 50 lines
4. Share with me

**I'll tell you exactly what's wrong!**

---

## 📞 **Fastest Way to Contact Me:**

Just paste the error logs from Render and I'll diagnose immediately.

**Format:**
```
I'm seeing this in Render logs:

[paste logs here]

And my database status is: [Available/Starting/Failed]
```

