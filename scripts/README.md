# Scripts Directory

Utility scripts for database migrations, deployment, and testing.

---

## 📋 Available Scripts

### Migration Scripts

#### `run-migrations.mjs`
Automatic database migration runner for Render deployment.

**Usage:**
```bash
# Run all pending migrations
npm run migrate

# Check migration status
npm run migrate:status

# Direct usage
node scripts/run-migrations.mjs
node scripts/run-migrations.mjs status
```

**Features:**
- ✅ Runs migrations in order
- ✅ Tracks executed migrations
- ✅ Prevents re-running migrations
- ✅ Shows execution time
- ✅ Colored output for easy reading
- ✅ Production-ready error handling

**Environment Variables:**
- `DATABASE_URL` (required) - PostgreSQL connection string

**Output Example:**
```
🚀 Starting database migrations...
✅ Connected to database
ℹ️  Found 0 previously executed migrations
📋 Executing 10 pending migration(s):
✅ 001_initial.sql (245ms)
✅ 002_edge_and_media_contract.sql (123ms)
✅ 004_cctv_infrastructure.sql (312ms) ← CCTV tables
✅ 005_cctv_infrastructure_seed.sql (45ms) ← CCTV seed
✅ 010_recording_storage.sql (95ms) ← Recording and storage
✨ Successfully executed 10 migration(s) in 1250ms
```

---

#### `test-migrations-local.mjs`
Test migrations locally using Docker before deploying.

**Usage:**
```bash
# Test migrations with Docker
npm run migrate:test

# Direct usage
node scripts/test-migrations-local.mjs
```

**Requirements:**
- Docker installed and running
- PostgreSQL 16 image (auto-downloaded)

**What it does:**
1. Starts temporary PostgreSQL container
2. Runs all migrations
3. Verifies tables and views created
4. Shows what's missing (if any)
5. Stops and removes container

**Output Example:**
```
🧪 Testing Migrations Locally
✅ Test database started
🚀 Running migrations...
✅ All 8 migrations executed
📋 Created Tables:
   ✅ cameras
   ✅ camera_specifications
   ✅ camera_installation_compliance
   ✅ branch_camera_requirements
📊 Created Views:
   ✅ branch_camera_coverage_gaps
   ✅ camera_compliance_summary
✨ All tests passed!
```

---

### Deployment Scripts

#### `init-render-deployment.ps1`
Initialize CCTV infrastructure after Render deployment.

**Usage:**
```powershell
# Initialize all branches
.\scripts\init-render-deployment.ps1 -ApiUrl "https://sentinel-grid-api.onrender.com"

# With custom user
.\scripts\init-render-deployment.ps1 -ApiUrl "https://your-api.onrender.com" -UserId "admin-user"
```

**What it does:**
1. Tests API connectivity
2. Fetches all branches
3. Initializes camera requirements for each branch
4. Verifies requirements were created
5. Checks coverage gaps
6. Shows next steps

**Output Example:**
```
🚀 Sentinel Grid - Render Deployment Initialization
✅ API is healthy
✅ Found 5 branch(es)
   Processing: Downtown Branch ✅
   Processing: Airport Branch ✅
   Processing: Mall Branch ✅
✅ 5 branch(es) initialized successfully
✅ Camera requirements verified (found 13 location types)
```

---

## 🚀 Quick Start

### First Time Setup (Local Development)

1. **Set up local database:**
   ```bash
   # Option 1: Use Docker
   docker run -d --name sentinel-db \
     -e POSTGRES_PASSWORD=yourpassword \
     -e POSTGRES_DB=sentinel_dev \
     -p 5432:5432 \
     postgres:16-alpine
   
   # Option 2: Use existing PostgreSQL
   createdb sentinel_dev
   ```

2. **Set environment variable:**
   ```bash
   # Windows PowerShell
   $env:DATABASE_URL="postgresql://user:pass@localhost:5432/sentinel_dev"
   
   # Linux/Mac
   export DATABASE_URL="postgresql://user:pass@localhost:5432/sentinel_dev"
   ```

3. **Run migrations:**
   ```bash
   npm run migrate
   ```

4. **Verify:**
   ```bash
   npm run migrate:status
   ```

---

### Render Deployment

1. **Test locally first (recommended):**
   ```bash
   npm run migrate:test
   ```

2. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Add CCTV infrastructure"
   git push origin main
   ```

3. **Deploy to Render:**
   - Connect repository to Render
   - Render automatically runs migrations during build
   - Check logs for migration output

4. **Initialize branches:**
   ```powershell
   .\scripts\init-render-deployment.ps1 -ApiUrl "https://your-api.onrender.com"
   ```

---

## 🔧 Troubleshooting

### Migration Failed: "relation already exists"

**Cause:** Migration was partially executed before.

**Solution:**
```bash
# Check which migrations ran
psql $DATABASE_URL -c "SELECT * FROM schema_migrations;"

# Remove failed migration entry
psql $DATABASE_URL -c "DELETE FROM schema_migrations WHERE filename = '004_cctv_infrastructure.sql';"

# Re-run migrations
npm run migrate
```

---

### Migration Failed: "permission denied"

**Cause:** Database user lacks permissions.

**Solution:**
```bash
# Grant necessary permissions
psql $DATABASE_URL -c "GRANT ALL PRIVILEGES ON DATABASE sentinel_dev TO your_user;"
psql $DATABASE_URL -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;"
```

---

### Docker Test Fails: "Cannot connect to Docker"

**Cause:** Docker not running or not installed.

**Solutions:**
1. **Start Docker Desktop** (Windows/Mac)
2. **Start Docker service** (Linux):
   ```bash
   sudo systemctl start docker
   ```
3. **Skip Docker test** and use manual database:
   ```bash
   # Set up local PostgreSQL
   DATABASE_URL="postgresql://user:pass@localhost:5432/test_db" npm run migrate
   ```

---

### Init Script Fails: "Cannot connect to API"

**Cause:** API service not running or URL incorrect.

**Solutions:**
1. **Check API is running:** Visit `https://your-api.onrender.com/health`
2. **Verify URL:** Ensure it's the correct Render URL
3. **Check Render status:** Make sure service is not sleeping (free tier)

---

## 📖 Migration Files

Located in `database/migrations/`:

| File | Purpose | Creates |
|------|---------|---------|
| `001_initial.sql` | Base schema | tenants, users, resource_nodes, cameras, etc. |
| `002_edge_and_media_contract.sql` | Edge agents | edge_agents, camera_discoveries, live_sessions |
| `003_pilot_seed.sql` | Demo data | Sample branches and cameras |
| `004_cctv_infrastructure.sql` | **CCTV tables** | camera_specifications, compliance, requirements |
| `005_cctv_infrastructure_seed.sql` | **CCTV seeds** | Standard requirements function |
| `006_organizational_node_types.sql` | Org node types | Adds headquarters, zone, and area enum values |
| `007_organizational_hierarchy.sql` | Org hierarchy | Enhanced organization structure |
| `008_employee_management_and_auth.sql` | Auth | Employee and authentication tables |
| `009_granular_camera_permissions.sql` | Permissions | Camera-level permissions |
| `010_recording_storage.sql` | Recording | Policies, segments, storage nodes, legal holds, replication and health |

---

## 🧪 Testing Checklist

Before deploying:

- [ ] Run `npm run migrate:test` successfully
- [ ] All tables verified
- [ ] All views verified
- [ ] No syntax errors in SQL
- [ ] Migration tracking works
- [ ] Rollback tested (if needed)

After deploying:

- [ ] Check Render build logs
- [ ] Verify all 10 migrations ran
- [ ] Test API health endpoint
- [ ] Run init script
- [ ] Verify CCTV tables exist
- [ ] Test CCTV endpoints

---

## 📚 Related Documentation

- **[RENDER_DEPLOYMENT_GUIDE.md](../RENDER_DEPLOYMENT_GUIDE.md)** - Complete Render deployment guide
- **[DEPLOYMENT_CHECKLIST.md](../DEPLOYMENT_CHECKLIST.md)** - Step-by-step checklist
- **[CCTV_INFRASTRUCTURE_INTEGRATION.md](../CCTV_INFRASTRUCTURE_INTEGRATION.md)** - CCTV API documentation
- **[database/migrations/](../database/migrations/)** - Migration SQL files

---

## 🔑 Environment Variables

### Required

- `DATABASE_URL` - PostgreSQL connection string
  - **Format:** `postgresql://user:password@host:port/database`
  - **Local:** `postgresql://localhost:5432/sentinel_dev`
  - **Render:** Automatically set by Render

### Optional

- `NODE_ENV` - Environment (production/development/test)
- `SSL_REQUIRE` - Require SSL for database (true for production)

---

## 💡 Tips

### Speed Up Migrations

```bash
# Run migrations in parallel for multiple databases (development only)
DATABASE_URL=db1 npm run migrate &
DATABASE_URL=db2 npm run migrate &
wait
```

### Backup Before Migration

```bash
# Create backup before running migrations
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Run migrations
npm run migrate

# Restore if needed
psql $DATABASE_URL < backup_20260721_120000.sql
```

### Monitor Migration Performance

```bash
# Check execution times
psql $DATABASE_URL -c "
  SELECT filename, execution_time_ms, executed_at
  FROM schema_migrations
  ORDER BY execution_time_ms DESC;
"
```

### Reset Database (Development Only)

```bash
# ⚠️  WARNING: This deletes all data!
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
npm run migrate
```

---

## 🆘 Support

If you encounter issues:

1. **Check logs:** Render Dashboard → Service → Logs
2. **Verify database:** Connect with psql and check tables
3. **Test locally:** Use `npm run migrate:test`
4. **Read documentation:** See guides in project root
5. **Check GitHub issues:** Search for similar problems

---

**Last Updated:** 2026-07-21  
**Maintainer:** Sentinel Grid Team
