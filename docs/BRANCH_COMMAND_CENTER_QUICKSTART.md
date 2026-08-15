# Branch Command Center - Quick Start Guide

## 🚀 Get Started in 15 Minutes

This guide helps you integrate and deploy the Branch Command Center quickly.

---

## Step 1: Database Setup (5 minutes)

### Run Migration

```bash
cd backend
npm run migrate:run -- 012_branch_command_center_tables.sql
```

### Verify Tables Created

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN (
  'branch_health_snapshots',
  'branch_operational_events',
  'operator_audit_log'
);
```

Should return 3 tables.

---

## Step 2: Backend Integration (5 minutes)

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Register Routes

Add to your main Express app (e.g., `backend/src/app.ts` or `backend/src/index.ts`):

```typescript
import { createBranchCommandCenterRoutes } from './routes/branch-command-center.routes';
import { Pool } from 'pg';

// Your existing database pool
const pool = new Pool({
  host: process.env.DB_HOST,
  // ... other config
});

// Register Branch Command Center routes
app.use('/api/v1/branches', createBranchCommandCenterRoutes(pool));
```

### 3. Test Endpoint

```bash
curl http://localhost:3000/api/v1/branches/YOUR_BRANCH_ID/operational-snapshot \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected response:
```json
{
  "success": true,
  "data": {
    "branchId": "...",
    "branchCode": "178",
    "branchName": "Aluva",
    "overallState": "HEALTHY",
    "healthScore": 95,
    "cameras": { ... },
    "storage": { ... },
    ...
  }
}
```

---

## Step 3: Frontend Integration (5 minutes)

### 1. Install Dependencies

```bash
cd dashboard
npm install
```

### 2. Configure API Endpoint

Create or update `dashboard/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### 3. Add Navigation Link

In your HO Dashboard or branch list component:

```tsx
import Link from 'next/link';

<Link href={`/operations/branches/${branch.id}`}>
  <button className="btn-primary">
    View Branch Operations
  </button>
</Link>
```

### 4. Test Page

Navigate to:
```
http://localhost:3001/operations/branches/YOUR_BRANCH_ID
```

You should see the Branch Command Center with:
- Health summary cards
- Camera wall
- Operational timeline

---

## Step 4: Verify Everything Works

### Backend Checklist

```bash
# Test operational snapshot
curl http://localhost:3000/api/v1/branches/BRANCH_ID/operational-snapshot

# Test cameras endpoint
curl http://localhost:3000/api/v1/branches/BRANCH_ID/cameras

# Test events endpoint
curl http://localhost:3000/api/v1/branches/BRANCH_ID/events?limit=10

# Test storage endpoint
curl http://localhost:3000/api/v1/branches/BRANCH_ID/storage

# Test retention endpoint
curl http://localhost:3000/api/v1/branches/BRANCH_ID/retention

# Test network health endpoint
curl http://localhost:3000/api/v1/branches/BRANCH_ID/network-health
```

### Frontend Checklist

- [ ] Page loads without errors
- [ ] Header shows branch name and status
- [ ] 8 health cards display with correct data
- [ ] Camera wall shows camera tiles
- [ ] Camera tiles show correct states (LIVE/OFFLINE/etc.)
- [ ] Clicking a camera opens focus mode
- [ ] Clicking storage card opens storage drill-down
- [ ] Clicking retention card opens retention drill-down
- [ ] Clicking network card opens network drill-down
- [ ] Timeline shows recent events
- [ ] Refresh button updates data

---

## Common Issues & Solutions

### Issue: "Failed to fetch branch snapshot"

**Solution**: Check API endpoint configuration

```typescript
// dashboard/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3000  ✅
NEXT_PUBLIC_API_URL=http://localhost:3000/ ❌ (remove trailing slash)
```

### Issue: "Branch not found"

**Solution**: Verify branch exists in database

```sql
SELECT id, code, name FROM branches WHERE id = 'YOUR_BRANCH_ID';
```

### Issue: CORS errors in browser console

**Solution**: Update CORS configuration

```typescript
// backend/src/index.ts
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3001'); // Your dashboard URL
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});
```

### Issue: "Cannot find module" errors

**Solution**: Rebuild TypeScript

```bash
cd backend
npm run build

cd dashboard
npm run build
```

### Issue: Cameras show "No Stream"

**Solution**: This is expected if you don't have actual live streams configured yet. The UI will work with real RTSP/HLS streams when available.

---

## Next Steps

### For Development

1. **Add real camera data**
   - Configure RTSP/HLS endpoints
   - Test with live video feeds

2. **Customize health thresholds**
   - Edit `backend/src/services/branch-operational-snapshot.service.ts`
   - Adjust scoring in `evaluateOverallHealth()`

3. **Add custom events**
   - Use `snapshotService.recordEvent()` in your code
   - Events automatically appear in timeline

### For Production

1. **Set up authentication**
   - Implement `authenticateToken` middleware
   - Add `validateBranchAccess` middleware

2. **Configure caching**
   - Use Redis instead of in-memory cache
   - Adjust TTL based on your needs

3. **Enable monitoring**
   - Add logging for API calls
   - Set up alerts for errors
   - Track response times

4. **Optimize queries**
   - Add database indexes as needed
   - Monitor slow query log
   - Consider read replicas for large deployments

---

## Sample Data (For Testing)

If you need sample data to test with:

```sql
-- Insert test branch
INSERT INTO branches (id, tenant_id, code, name, region_id)
VALUES (
  '00000000-0000-0000-0000-000000000178',
  'YOUR_TENANT_ID',
  '178',
  'Test Branch - Aluva',
  NULL
);

-- Insert test cameras
INSERT INTO cameras (id, tenant_id, branch_id, name, channel_number, online_status, recording_status)
VALUES
  (gen_random_uuid(), 'YOUR_TENANT_ID', '00000000-0000-0000-0000-000000000178', 'CAM01 - Entrance', '01', 'online', 'recording'),
  (gen_random_uuid(), 'YOUR_TENANT_ID', '00000000-0000-0000-0000-000000000178', 'CAM02 - Vault', '02', 'online', 'recording'),
  (gen_random_uuid(), 'YOUR_TENANT_ID', '00000000-0000-0000-0000-000000000178', 'CAM03 - Counter', '03', 'online', 'stopped'),
  (gen_random_uuid(), 'YOUR_TENANT_ID', '00000000-0000-0000-0000-000000000178', 'CAM04 - ATM', '04', 'offline', 'stopped');

-- Insert test events
INSERT INTO branch_operational_events (tenant_id, branch_id, event_type, severity, title, occurred_at)
VALUES
  ('YOUR_TENANT_ID', '00000000-0000-0000-0000-000000000178', 'CAMERA_STATUS_CHANGED', 'HIGH', 'CAM04 went offline', NOW() - INTERVAL '10 minutes'),
  ('YOUR_TENANT_ID', '00000000-0000-0000-0000-000000000178', 'RECORDING_STATUS_CHANGED', 'CRITICAL', 'CAM03 stopped recording', NOW() - INTERVAL '5 minutes');
```

---

## API Examples

### Get Operational Snapshot

```bash
curl -X GET \
  http://localhost:3000/api/v1/branches/BRANCH_ID/operational-snapshot \
  -H 'Authorization: Bearer TOKEN'
```

### Get Cameras with Filter

```bash
# Get only offline cameras
curl -X GET \
  http://localhost:3000/api/v1/branches/BRANCH_ID/cameras?filter=offline \
  -H 'Authorization: Bearer TOKEN'

# Get cameras not recording
curl -X GET \
  http://localhost:3000/api/v1/branches/BRANCH_ID/cameras?filter=not-recording \
  -H 'Authorization: Bearer TOKEN'
```

### Get Recent Events

```bash
# Get last 20 events
curl -X GET \
  http://localhost:3000/api/v1/branches/BRANCH_ID/events?limit=20 \
  -H 'Authorization: Bearer TOKEN'

# Get critical events only
curl -X GET \
  http://localhost:3000/api/v1/branches/BRANCH_ID/events?severity=CRITICAL \
  -H 'Authorization: Bearer TOKEN'
```

### Force Refresh

```bash
curl -X POST \
  http://localhost:3000/api/v1/branches/BRANCH_ID/refresh \
  -H 'Authorization: Bearer TOKEN'
```

---

## Environment Variables

### Backend

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=surveillance
DB_USER=app_user
DB_PASSWORD=your_password

# Server
PORT=3000
NODE_ENV=development

# CORS
CORS_ORIGIN=http://localhost:3001

# Cache (optional)
REDIS_URL=redis://localhost:6379
CACHE_TTL_SECONDS=30
```

### Frontend

```bash
# API
NEXT_PUBLIC_API_URL=http://localhost:3000

# Feature flags (optional)
NEXT_PUBLIC_ENABLE_REAL_TIME=false
NEXT_PUBLIC_ENABLE_AUDIT_LOG=false
```

---

## Performance Tips

1. **Use the cache**: Don't refresh more often than every 30 seconds
2. **Filter at API level**: Use `?filter=offline` instead of filtering in UI
3. **Paginate events**: Use `?limit=20&offset=0` for large event lists
4. **Lazy load modals**: Drill-downs only load data when opened
5. **Optimize grid**: Start with 4x4 grid, let users choose larger grids

---

## Support

### Documentation
- Full guide: `docs/BRANCH_COMMAND_CENTER_IMPLEMENTATION.md`
- Summary: `BRANCH_COMMAND_CENTER_SUMMARY.md`
- This guide: `docs/BRANCH_COMMAND_CENTER_QUICKSTART.md`

### Code References
- Backend service: `backend/src/services/branch-operational-snapshot.service.ts`
- API routes: `backend/src/routes/branch-command-center.routes.ts`
- Main page: `dashboard/app/operations/branches/[branchId]/page.tsx`
- Types: `backend/src/types/branch-operational-snapshot.types.ts`

### Need Help?
1. Check console logs (browser and server)
2. Verify database tables exist
3. Test API endpoints with cURL
4. Review network tab in browser DevTools
5. Check CORS configuration

---

## Success! 🎉

You now have a fully functional Branch Command Center that provides:
- ✅ Complete operational visibility
- ✅ Real-time health monitoring
- ✅ Drill-down capabilities
- ✅ Operational timeline
- ✅ Camera wall with focus mode

**Time to explore**: Open `/operations/branches/YOUR_BRANCH_ID` and start monitoring!

---

*For advanced features (WebSocket updates, audit logging, capacity management), see the full implementation guide.*
