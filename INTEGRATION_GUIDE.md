# Integration Guide - Branch Operational Health System

## Backend Integration

The new branch operational health system is designed to work **alongside** your existing operational health telemetry system. The existing system (`src/routes/operational-health.routes.ts`) handles real-time telemetry ingestion from edge agents, while the new system provides the HO control-room dashboard.

### Step 1: Add New Routes to src/app.ts

Since your project uses Fastify's direct route registration pattern, add the new operational health routes to your app.ts file.

**Find this section in `src/app.ts`** (around line 1200-1400 where imports are):

```typescript
import { registerOperationalHealthRoutes } from "./routes/operational-health.routes.js";
```

**Add this import after it:**

```typescript
import { createOperationalHealthRoutes } from "./operational-health/routes/operational-health.routes.js";
```

**Find where routes are registered** (search for similar patterns like `registerOperationalHealthRoutes`):

```typescript
// Existing telemetry routes (keep these!)
await registerOperationalHealthRoutes(app, store);
```

**Add after the existing operational health routes:**

```typescript
// NEW: Branch operational health dashboard routes
const pool = (store as any).pool; // Get database pool from store
if (pool) {
  const branchHealthRoutes = createOperationalHealthRoutes(pool);
  app.register(async (fastify) => {
    fastify.register(branchHealthRoutes, { prefix: '/v1/operational-health' });
  });
  console.log('✅ Branch operational health dashboard routes registered');
}
```

**Alternative approach if app.register doesn't work:**

Since I see your existing routes might use a different pattern, you can also manually mount the routes:

```typescript
import { IntegratedOperationalHealthService } from "./operational-health/services/integrated-operational-health.service.js";

const pool = (store as any).pool;
if (pool) {
  const healthService = new IntegratedOperationalHealthService(pool);
  
  // Dashboard summary
  app.get('/v1/operational-health/dashboard', async (request, reply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      if (!tenantId) return reply.code(401).send({ error: 'Unauthorized' });
      
      const summary = await healthService.getDashboardSummary(tenantId);
      return { success: true, data: summary };
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ error: 'Failed to get dashboard summary' });
    }
  });
  
  // Branch mosaic
  app.get('/v1/operational-health/branches', async (request, reply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      if (!tenantId) return reply.code(401).send({ error: 'Unauthorized' });
      
      const { states, search } = request.query as any;
      const filter: any = {};
      if (states) filter.states = Array.isArray(states) ? states : [states];
      if (search) filter.search = search;
      
      const branches = await healthService.getBranchMosaicItems(tenantId, filter);
      return { success: true, data: { branches, total: branches.length } };
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ error: 'Failed to get branch health' });
    }
  });
  
  // Single branch health
  app.get('/v1/operational-health/branches/:branchId', async (request, reply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      const { branchId } = request.params as any;
      if (!tenantId) return reply.code(401).send({ error: 'Unauthorized' });
      
      const health = await healthService.getBranchHealth(tenantId, branchId);
      if (!health) return reply.code(404).send({ error: 'Branch not found' });
      
      return { success: true, data: health };
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ error: 'Failed to get branch health' });
    }
  });
  
  // Refresh branch health
  app.post('/v1/operational-health/branches/:branchId/refresh', async (request, reply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      const { branchId } = request.params as any;
      if (!tenantId) return reply.code(401).send({ error: 'Unauthorized' });
      
      const health = await healthService.refreshBranchHealth(tenantId, branchId);
      return { success: true, data: health };
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ error: 'Failed to refresh branch health' });
    }
  });
  
  console.log('✅ Branch operational health dashboard routes registered (manual)');
}
```

### Step 2: Run Database Migration

```bash
# Run the migration SQL script
psql $DATABASE_URL -f backend/prisma/migrations/20260815_branch_operational_health_cache.sql

# Verify tables created
psql $DATABASE_URL -c "\dt branch_*"
```

### Step 3: Initial Data Population

After starting your server, populate the initial health data:

```bash
# Trigger initial computation for all branches
curl -X POST http://localhost:3000/v1/operational-health/refresh-all \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

## Frontend Integration

Your frontend appears to be a Next.js application in the `dashboard` folder.

### Step 1: Add Navigation Link

**Find your navigation component** (likely in `dashboard/app/` or `dashboard/components/`):

Look for files like:
- `dashboard/app/layout.tsx`
- `dashboard/components/navigation.tsx`
- `dashboard/components/sidebar.tsx`

**Add the navigation item:**

```tsx
// In your navigation array
{
  name: 'Operations',
  href: '/operations',
  icon: MonitorIcon, // or whatever icon you use
  description: 'Branch operational health dashboard'
}
```

### Step 2: Create Operations Page

**Create: `dashboard/app/operations/page.tsx`**

```tsx
import { OperationalDashboard } from '@/components/operational-health/operational-dashboard';

export default function OperationsPage() {
  return <OperationalDashboard />;
}
```

### Step 3: Configure Environment Variables

**Create or update: `dashboard/.env.local`**

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/v1
NEXT_PUBLIC_WS_URL=ws://localhost:3000/ws
```

### Step 4: Verify Components Are Available

The components should already be in place at:
- `dashboard/components/operational-health/operational-dashboard.tsx`
- `dashboard/components/operational-health/summary/operational-summary-kpis.tsx`
- `dashboard/components/operational-health/mosaic/branch-health-mosaic.tsx`
- `dashboard/components/operational-health/branch-detail/branch-detail-view.tsx`

## Testing the Integration

### 1. Test Backend API

```bash
# Start your backend
npm run dev

# Test dashboard endpoint
curl http://localhost:3000/v1/operational-health/dashboard \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected response:
{
  "success": true,
  "data": {
    "generatedAt": "2026-08-15T...",
    "branches": {
      "total": 400,
      "healthy": 348,
      ...
    },
    ...
  }
}
```

### 2. Test Frontend

```bash
# Start dashboard
cd dashboard
npm run dev

# Open browser
open http://localhost:3001/operations
```

You should see:
- ✅ Summary KPI cards at the top
- ✅ Branch mosaic grid below
- ✅ "Needs Attention" / "All Branches" toggle
- ✅ Auto-refresh every 30 seconds

### 3. Test Branch Detail View

- Click any branch card in the mosaic
- Should open full-screen detail view
- Should show component health panels
- Should display camera wall

## Troubleshooting

### Backend Issues

**Problem: "Cannot find module './operational-health/routes/operational-health.routes.js'"**

Solution: The file path should be relative to your src directory. Try:
```typescript
import { createOperationalHealthRoutes } from "../operational-health/routes/operational-health.routes.js";
```

**Problem: "pool is undefined"**

Solution: Extract pool from your PostgresStore:
```typescript
const pool = (store as any).pool || (store as any)._pool;
```

**Problem: Database tables don't exist**

Solution: Run the migration:
```bash
psql $DATABASE_URL -f backend/prisma/migrations/20260815_branch_operational_health_cache.sql
```

### Frontend Issues

**Problem: "Module not found: Can't resolve '@/components/operational-health'"**

Solution: Check your TypeScript paths in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./"]
    }
  }
}
```

**Problem: API returns 401 Unauthorized**

Solution: Ensure auth token is being sent. Check browser DevTools Network tab.

**Problem: No data showing in dashboard**

Solution:
1. Check API is returning data: `curl http://localhost:3000/v1/operational-health/dashboard`
2. Trigger initial health computation: `curl -X POST http://localhost:3000/v1/operational-health/refresh-all`
3. Check browser console for errors

## Next Steps

Once integrated:

1. ✅ Verify all 400 branches display correctly
2. ✅ Test filtering and search functionality
3. ✅ Click through to branch detail views
4. ✅ Configure auto-refresh intervals if needed
5. ✅ Set up monitoring for health computation performance
6. ✅ Train your operations team on the new dashboard

## Support

- Backend Documentation: `backend/src/operational-health/README.md`
- Frontend Documentation: `dashboard/components/operational-health/README.md`
- Quick Start: `QUICK_START_GUIDE.md`
- Implementation Summary: `IMPLEMENTATION_SUMMARY.md`

## Notes

- The new system works **alongside** your existing telemetry system
- Existing edge agent telemetry routes remain unchanged
- The new routes provide dashboard/UI endpoints only
- Both systems use the same database (PostgreSQL)
- Migration adds new tables without affecting existing ones
