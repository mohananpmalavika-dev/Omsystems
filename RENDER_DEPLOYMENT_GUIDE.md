# Render Deployment Guide

Complete guide to deploy Sentinel Grid with CCTV Infrastructure to Render.

---

> **Current pilot topology:** `render.yaml` deploys one `sentinel-grid-ops`
> dashboard/BFF service. The control-plane API and camera media stay on the
> branch/network host and are connected through the tunnel URLs managed by
> `deploy/publish-render-live.ps1`. The separate database/API/dashboard steps
> later in this guide describe an optional standalone-cloud topology; they are
> not created by the current blueprint.

## 🚀 Quick Deploy (5 Minutes)

### Prerequisites
- GitHub account
- Render account (free tier available)
- Git repository with this code

### One-Click Deploy

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Add CCTV infrastructure"
   git push origin main
   ```

2. **Connect to Render**
   - Go to [render.com](https://render.com)
   - Click "New" → "Blueprint"
   - Connect your GitHub repository
   - Select this repository
   - Render will automatically detect `render.yaml`

3. **Deploy**
   - Click "Apply"
   - Render will create the `sentinel-grid-ops` dashboard/BFF service.
   - Keep the control-plane and media tunnel environment variables configured
     on that service.
   - Wait 5-10 minutes for deployment

4. **Verify**
   - Check health: `https://<your-service>.onrender.com/api/health`
   - Open the dashboard: `https://<your-service>.onrender.com`

---

## 📋 What Gets Deployed

### Services in the Current Blueprint

1. **sentinel-grid-ops** (Dashboard and BFF)
   - Node.js 22 and Next.js
   - Health check at `/api/health`
   - Proxies authenticated control-plane calls without exposing the bridge key
   - Connects to the existing control-plane and media tunnels

### Optional Standalone API Migration Execution

When you deploy the optional standalone API service, its startup process:
1. Creates database schema
2. Runs all migrations in order:
   - `001_initial.sql` - Base tables
   - `002_edge_and_media_contract.sql` - Edge agent support
   - `003_pilot_seed.sql` - Demo data
   - `004_cctv_infrastructure.sql` - **CCTV infrastructure tables**
   - `005_cctv_infrastructure_seed.sql` - **CCTV seed data**
   - `006_organizational_node_types.sql` - Organizational node enum values
   - `007_organizational_hierarchy.sql` - Org enhancements
   - `008_employee_management_and_auth.sql` - Auth tables
   - `009_granular_camera_permissions.sql` - Permissions
   - `010_recording_storage.sql` - Recording, storage tiers and evidence holds
3. Tracks executed migrations to prevent re-runs
4. Shows execution time and status

---

## 🔧 Manual Deployment Steps

If you prefer manual control:

### Step 1: Create PostgreSQL Database

1. Go to Render Dashboard
2. Click "New" → "PostgreSQL"
3. Configure:
   - **Name**: `sentinel-grid-db`
   - **Database**: `sentinel_grid`
   - **User**: `sentinel_admin`
   - **Region**: Singapore (or closest to you)
   - **Plan**: Free
4. Click "Create Database"
5. Copy the **Internal Database URL** (starts with `postgresql://`)

### Step 2: Deploy Backend API

1. Click "New" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Name**: `sentinel-grid-api`
   - **Region**: Singapore
   - **Branch**: main
   - **Runtime**: Node
   - **Build Command**: `npm ci && npm run build && npm run migrate`
   - **Start Command**: `npm run start`
   - **Plan**: Free
4. Add Environment Variables:
   ```
   NODE_VERSION=22
   NODE_ENV=production
   DATABASE_URL=<paste internal database URL>
   PORT=8080
   AUTH_MODE=development
   MEDIA_GATEWAY_SHARED_KEY=<generate random key>
   EDGE_BRIDGE_SHARED_KEY=<generate random key>
   ```
5. Set Health Check Path: `/health`
6. Click "Create Web Service"

### Step 3: Deploy Dashboard

1. Click "New" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Name**: `sentinel-grid-dashboard`
   - **Region**: Singapore
   - **Branch**: main
   - **Runtime**: Node
   - **Build Command**: `npm ci && npm run dashboard:build`
   - **Start Command**: `npm run start --workspace @sentinel/dashboard -- --hostname 0.0.0.0 --port $PORT`
   - **Plan**: Free
4. Add Environment Variables:
   ```
   NODE_VERSION=22
   NODE_ENV=production
   DASHBOARD_DEMO_MODE=false
   CONTROL_PLANE_INTERNAL_URL=https://sentinel-grid-api.onrender.com
   DASHBOARD_DEV_USER_ID=user-global-admin
   ```
5. Set Health Check Path: `/api/health`
6. Click "Create Web Service"

---

## 🔑 Generate Secure Keys

Generate secure random keys for production:

```bash
# On Windows PowerShell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Or use this script multiple times for different keys
node -e "console.log('MEDIA_GATEWAY_SHARED_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('EDGE_BRIDGE_SHARED_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
```

---

## 🗄️ Database Migration Details

### How Migrations Work

1. **During Deployment**: `npm run migrate` executes automatically
2. **Migration Script**: `scripts/run-migrations.mjs`
3. **Tracking**: Uses `schema_migrations` table
4. **Safe**: Only runs new migrations, skips already executed ones

### Check Migration Status

After deployment, you can check which migrations ran:

```bash
# Connect to your Render database
psql $DATABASE_URL

# Check executed migrations
SELECT filename, executed_at, execution_time_ms 
FROM schema_migrations 
ORDER BY executed_at;

# Count tables created
SELECT count(*) FROM information_schema.tables 
WHERE table_schema = 'public';

# List CCTV infrastructure tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'camera%' OR table_name LIKE 'branch_camera%';
```

Expected tables:
- `camera_specifications`
- `camera_installation_compliance`
- `branch_camera_requirements`
- Plus views: `branch_camera_coverage_gaps`, `camera_compliance_summary`

### Manual Migration Run

If you need to run migrations manually:

```bash
# SSH into your Render service (if enabled)
# Or use Render Shell

# Run migrations
npm run migrate

# Check status
npm run migrate:status
```

---

## 🧪 Testing Your Deployment

### 1. Test Backend API

```bash
# Health check
curl https://sentinel-grid-api.onrender.com/health

# Expected: {"status":"ok","service":"sentinel-control-plane"}

# Get branches (as admin)
curl https://sentinel-grid-api.onrender.com/v1/branches \
  -H "x-user-id: user-global-admin"

# Expected: {"data":[...]}

# Check CCTV endpoints
curl https://sentinel-grid-api.onrender.com/v1/branches/{branchId}/camera-requirements \
  -H "x-user-id: user-global-admin"
```

### 2. Test Dashboard

Open `https://sentinel-grid-dashboard.onrender.com` in your browser.

Expected:
- Branch selection screen
- Camera grid view
- Live streaming interface (demo mode if no cameras)

### 3. Test Database

Connect to your database:

```bash
# Get connection string from Render dashboard
psql $DATABASE_URL

# Check CCTV tables exist
\dt camera*
\dt branch_camera*

# Check views
\dv

# Count cameras
SELECT COUNT(*) FROM cameras;

# Check camera specifications
SELECT COUNT(*) FROM camera_specifications;
```

---

## 🔍 Troubleshooting

### Migration Failed

**Symptom**: Build succeeds but service won't start, logs show migration errors

**Solution**:
1. Check Render logs: Dashboard → Service → Logs
2. Look for SQL errors in migration output
3. Common issues:
   - **"relation already exists"**: Migration partially ran before. Check `schema_migrations` table.
   - **"permission denied"**: Database user needs proper permissions
   - **"syntax error"**: SQL syntax issue in migration file

**Fix**:
```bash
# Connect to database
psql $DATABASE_URL

# Check which migrations ran
SELECT * FROM schema_migrations ORDER BY executed_at;

# If a migration partially failed, remove its entry and re-deploy
DELETE FROM schema_migrations WHERE filename = '004_cctv_infrastructure.sql';

# Then trigger new deploy in Render
```

### Service Won't Start

**Symptom**: "Service failed to start" or "Application error"

**Solutions**:
1. Check environment variables are set correctly
2. Verify `DATABASE_URL` is the **Internal Database URL**
3. Ensure `NODE_VERSION=22` is set
4. Check build logs for compilation errors

### Database Connection Failed

**Symptom**: "Connection refused" or "ECONNREFUSED"

**Solutions**:
1. Use **Internal Database URL** from Render dashboard
2. Don't use External Database URL for services
3. Ensure database and API are in the same region
4. Check database is running (green status in Render)

### CCTV Tables Not Created

**Symptom**: API works but CCTV endpoints return 500 errors

**Solution**:
```bash
# Connect to database
psql $DATABASE_URL

# Manually run CCTV migrations
\i database/migrations/004_cctv_infrastructure.sql
\i database/migrations/005_cctv_infrastructure_seed.sql

# Verify tables exist
\dt camera*

# Re-deploy service
```

### Slow Performance

**Symptom**: Queries take >1 second

**Solutions**:
- Free tier has limited resources
- Upgrade to Starter plan ($7/month) for better performance
- Add database indexes (already included in migrations)
- Enable query caching
- Use connection pooling

---

## 🚀 Production Recommendations

### Before Going Live

1. **Security**
   - [ ] Change `AUTH_MODE` from `development` to `oidc`
   - [ ] Set up OIDC provider (Auth0, Okta, Azure AD)
   - [ ] Generate new secure keys
   - [ ] Enable SSL certificate verification
   - [ ] Restrict database IP allowlist

2. **Scalability**
   - [ ] Upgrade to Starter plan ($7/month minimum)
   - [ ] Enable auto-scaling
   - [ ] Set up CDN for dashboard
   - [ ] Configure database backups

3. **Monitoring**
   - [ ] Set up uptime monitoring
   - [ ] Configure error tracking (Sentry, LogRocket)
   - [ ] Enable query performance monitoring
   - [ ] Set up alerts for failures

4. **Data**
   - [ ] Initialize branch requirements for all branches
   - [ ] Populate camera specifications
   - [ ] Set up compliance tracking
   - [ ] Configure backup retention

### Upgrade Database

For production workloads:

1. Go to Database Settings
2. Click "Upgrade Plan"
3. Choose plan based on needs:
   - **Starter ($7/month)**: 256 MB RAM, 1 GB storage, 5 GB transfer
   - **Standard ($20/month)**: 1 GB RAM, 10 GB storage, 25 GB transfer
   - **Pro ($50/month)**: 4 GB RAM, 50 GB storage, 100 GB transfer

### Enable Backups

1. Go to Database Settings
2. Enable "Automatic Backups"
3. Set retention period (7-30 days)
4. Test restore procedure

---

## 📊 Monitoring and Logs

### View Logs

1. Go to Render Dashboard
2. Click on service (API or Dashboard)
3. Click "Logs" tab
4. Filter by:
   - **All**: All logs
   - **Deploy**: Build and deploy logs
   - **Runtime**: Application logs

### Monitor Migrations

Migration logs show:
```
🚀 Starting database migrations...
ℹ️  Database: postgresql://****@****
ℹ️  Migrations directory: /opt/render/project/src/database/migrations

✅ Connected to database

ℹ️  Found 0 previously executed migrations
ℹ️  Found 10 total migration files

📋 Executing 10 pending migration(s):

   Running: 001_initial.sql... ✅ 001_initial.sql (245ms)
   Running: 002_edge_and_media_contract.sql... ✅ 002_edge_and_media_contract.sql (123ms)
   Running: 003_pilot_seed.sql... ✅ 003_pilot_seed.sql (89ms)
   Running: 004_cctv_infrastructure.sql... ✅ 004_cctv_infrastructure.sql (312ms)
   Running: 005_cctv_infrastructure_seed.sql... ✅ 005_cctv_infrastructure_seed.sql (45ms)
   ...

✨ Successfully executed 10 migration(s) in 1329ms
✅ Database is up to date! 🎉
```

### Health Checks

Render automatically monitors:
- `/health` endpoint every 30 seconds
- Service restarts if health check fails 3 times
- Shows status in dashboard (green = healthy)

### Database Metrics

View in Database dashboard:
- CPU usage
- Memory usage
- Connection count
- Query performance
- Storage usage

---

## 🔄 Continuous Deployment

### Automatic Deploys

When you push to GitHub:
1. Render detects changes
2. Pulls latest code
3. Runs build command (includes migrations)
4. Deploys new version
5. Zero-downtime deployment

### Manual Deploy

To manually trigger deploy:
1. Go to service in Render dashboard
2. Click "Manual Deploy"
3. Select branch
4. Click "Deploy"

### Rollback

If deployment fails:
1. Go to service → "Events"
2. Click on previous successful deploy
3. Click "Rollback"
4. Confirm

**Note**: Rollback doesn't undo migrations. Database changes are forward-only.

---

## 💰 Cost Estimation

### Free Tier (Testing)
- PostgreSQL: Free (256 MB, 1 GB storage)
- API Service: Free (spins down after 15 min inactivity)
- Dashboard: Free (spins down after 15 min inactivity)
- **Total: $0/month**
- **Limitations**: 
  - Slow cold starts (30-60 seconds)
  - Limited resources
  - Services spin down when idle

### Starter Tier (Production)
- PostgreSQL: $7/month
- API Service: $7/month (always on)
- Dashboard: $7/month (always on)
- **Total: $21/month**
- **Benefits**:
  - No cold starts
  - Better performance
  - Always available

### Production Tier (High Traffic)
- PostgreSQL Standard: $20/month
- API Service Standard: $25/month
- Dashboard Standard: $25/month
- Media Gateway: $25/month
- **Total: $95/month**
- **Benefits**:
  - High availability
  - Auto-scaling
  - Better performance
  - More storage

---

## 📚 Additional Resources

### Render Documentation
- [Render Blueprints](https://render.com/docs/blueprint-spec)
- [PostgreSQL Guide](https://render.com/docs/databases)
- [Node.js Deployment](https://render.com/docs/deploy-node-express-app)

### Project Documentation
- [CCTV Infrastructure Integration](CCTV_INFRASTRUCTURE_INTEGRATION.md)
- [CCTV Implementation Summary](CCTV_IMPLEMENTATION_SUMMARY.md)
- [CCTV Standards Guide](docs/cctv-infrastructure-standards.md)
- [Main README](README.md)

### Support
- Render Support: support@render.com
- Render Community: https://community.render.com

---

## ✅ Post-Deployment Checklist

After successful deployment:

- [ ] Verify all services are running (green status)
- [ ] Check migration logs show all 10 migrations executed
- [ ] Test backend API health endpoint
- [ ] Test dashboard loads correctly
- [ ] Verify database tables exist (including CCTV tables)
- [ ] Test CCTV endpoints
- [ ] Initialize branch camera requirements
- [ ] Set up monitoring and alerts
- [ ] Configure backups
- [ ] Document service URLs
- [ ] Update DNS if using custom domain
- [ ] Test with real cameras (if available)

---

## 🎯 Next Steps

1. **Initialize CCTV Requirements**
   ```bash
   # For each branch, initialize standard requirements
   curl -X POST https://sentinel-grid-api.onrender.com/v1/branches/{branchId}/camera-requirements/initialize \
     -H "x-user-id: user-global-admin"
   ```

2. **Add Camera Details**
   - Use the CCTV API endpoints to add specifications
   - Record compliance status
   - Track coverage gaps

3. **Set Up Authentication**
   - Configure OIDC provider
   - Update `AUTH_MODE` to `oidc`
   - Remove development user headers

4. **Enable Media Gateway**
   - Uncomment media gateway in `render.yaml`
   - Deploy media gateway service
   - Connect to MediaMTX

5. **Monitor and Optimize**
   - Watch logs for errors
   - Monitor query performance
   - Optimize slow queries
   - Add caching if needed

---

**Deployment Time**: ~10 minutes  
**Migration Time**: ~2-3 seconds  
**First Deploy**: May take longer (15-20 min) for Docker builds

**Ready to deploy?** → Push to GitHub and connect to Render!
