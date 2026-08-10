# Digital Twin Deployment & Testing Guide

## Overview

This guide provides step-by-step instructions for deploying and testing the Digital Twin surveillance infrastructure system.

## Prerequisites

### Database Requirements
- PostgreSQL 12+ with recursive CTE support
- Sufficient storage for asset history (estimate 1GB per 10,000 assets/year)
- Connection pooling configured for concurrent queries

### Network Requirements
- WebSocket support for real-time updates
- CORS configured if frontend and backend on different domains
- Port 3000 (dashboard) and analytics-engine port accessible

### Dependencies Installed
- Backend: All analytics-engine dependencies
- Frontend: reactflow, socket.io-client, recharts, lucide-react

---

## Step 1: Database Setup

### 1.1 Run Schema Migration

Execute the database schema to create all Digital Twin tables:

```bash
cd analytics-engine/src/digital-twin/repositories
psql -U <username> -d <database> -f schema.sql
```

Expected output:
```
CREATE TABLE
CREATE TABLE
CREATE TABLE
CREATE TABLE
CREATE TABLE
CREATE INDEX
CREATE INDEX
...
CREATE TRIGGER
```

### 1.2 Verify Tables Created

```sql
\dt twin_*

-- Should show:
-- twin_assets
-- twin_relationships
-- twin_state_history
-- twin_events
-- twin_issues
```

### 1.3 Grant Permissions

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE 
  twin_assets, 
  twin_relationships, 
  twin_state_history,
  twin_events,
  twin_issues
TO analytics_engine_user;
```

---

## Step 2: Backend Configuration

### 2.1 Environment Variables

Add to `analytics-engine/.env`:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/surveillance_db

# Digital Twin Configuration
DIGITAL_TWIN_ENABLED=true
DIGITAL_TWIN_REFRESH_INTERVAL_MINUTES=15
DIGITAL_TWIN_HISTORY_RETENTION_DAYS=90

# WebSocket
WEBSOCKET_ENABLED=true
WEBSOCKET_PORT=8080
```

### 2.2 Initialize Services

The Digital Twin services are automatically initialized when the analytics-engine starts. Verify in `analytics-engine/src/app.ts`:

```typescript
// Digital Twin routes are registered via dynamic import
void import("./digital-twin/api/index.js").then(module => {
  module.registerDigitalTwinRoutes(app).catch((error) => {
    app.log.error({ err: error }, "Failed to register Digital Twin API routes");
  });
});
```

### 2.3 Initialize Event Handlers

Create initialization file at `analytics-engine/src/initialize-digital-twin.ts`:

```typescript
import { initializeTwinEvents } from './digital-twin/events/index.js';
import { eventBus } from './event-bus.js'; // Your event bus
import { websocketServer } from './websocket-server.js'; // Your WebSocket server

export function initializeDigitalTwin() {
  // Initialize event-driven updates
  initializeTwinEvents(eventBus, websocketServer);
  
  console.log('Digital Twin event handlers initialized');
}
```

Call this in your main startup:

```typescript
// In analytics-engine/src/index.ts or app startup
import { initializeDigitalTwin } from './initialize-digital-twin.js';

await app.listen({ port: 3001, host: '0.0.0.0' });
initializeDigitalTwin();
```

---

## Step 3: Frontend Configuration

### 3.1 API Configuration

Ensure the frontend can reach the backend API. In `dashboard/lib/api-client.ts` or similar:

```typescript
export const API_BASE_URL = 
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const DIGITAL_TWIN_API = `${API_BASE_URL}/api/digital-twin`;
```

### 3.2 WebSocket Configuration

The Digital Twin page initializes WebSocket connections automatically. Verify in `TopologyVisualization.tsx`:

```typescript
useEffect(() => {
  const ws = new WebSocket('ws://localhost:8080');
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'twin.updated') {
      // Refresh topology
    }
  };
  
  return () => ws.close();
}, []);
```

---

## Step 4: Initial Data Population

### 4.1 Run Collectors

Trigger the initial infrastructure discovery:

```bash
curl -X POST http://localhost:3001/api/digital-twin/refresh \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "message": "Digital Twin refresh initiated",
  "assetsDiscovered": 245,
  "relationshipsCreated": 412,
  "duration": "3.4s"
}
```

### 4.2 Verify Assets Discovered

```sql
SELECT type, COUNT(*) as count 
FROM twin_assets 
GROUP BY type;
```

Expected output:
```
     type      | count
---------------+-------
 enterprise    |     1
 region        |     3
 branch        |    12
 camera        |   156
 nvr           |    24
 switch        |    18
 storage       |     6
```

### 4.3 Verify Relationships

```sql
SELECT type, COUNT(*) as count 
FROM twin_relationships 
GROUP BY type;
```

Expected output:
```
      type       | count
-----------------+-------
 contains        |   195
 connected_to    |   174
 records_to      |   156
 stores_on       |    24
 uplink_to       |    18
```

---

## Step 5: Test API Endpoints

### 5.1 Get Enterprise Root

```bash
curl http://localhost:3001/api/digital-twin
```

Expected: Enterprise root asset with health metrics

### 5.2 Get Topology

```bash
curl http://localhost:3001/api/digital-twin/topology
```

Expected: Graph with nodes and edges:
```json
{
  "nodes": [
    {
      "id": "cam_001",
      "type": "camera",
      "label": "Entrance Camera",
      "status": "healthy",
      "health": 95,
      "security": 88
    },
    ...
  ],
  "edges": [
    {
      "source": "cam_001",
      "target": "switch_01",
      "type": "connected_to"
    },
    ...
  ],
  "statistics": {
    "totalNodes": 245,
    "totalEdges": 412,
    "byType": { "camera": 156, "switch": 18, ... }
  }
}
```

### 5.3 Calculate Blast Radius

```bash
curl http://localhost:3001/api/digital-twin/assets/switch_01/blast-radius
```

Expected: Impact analysis with affected assets

### 5.4 Get Security Posture

```bash
curl http://localhost:3001/api/digital-twin/security-posture/branch_001
```

Expected: Security score and vulnerabilities

---

## Step 6: Test Frontend

### 6.1 Navigate to Infrastructure Twin

1. Start the dashboard: `npm run dev` in `dashboard/`
2. Login to the application
3. Navigate to: **Intelligence → Infrastructure twin**
4. Verify the page loads without errors

### 6.2 Test Topology Visualization

**Expected behavior:**
- Interactive graph renders with nodes and edges
- Nodes are color-coded by health status (green/yellow/red/gray)
- Pan and zoom work
- Clicking a node shows details
- Statistics panel displays correct counts

**Test actions:**
1. Click a camera node → verify details appear
2. Zoom in/out → verify graph scales properly
3. Pan around → verify graph moves
4. Double-click a node → should navigate to Blast Radius tab

### 6.3 Test Blast Radius

**Test actions:**
1. Select a switch or network device from topology
2. Navigate to "Blast Radius" tab
3. Verify:
   - Impact severity banner displays (CRITICAL/HIGH/MEDIUM/LOW)
   - Summary cards show affected asset counts
   - Business impact section describes consequences
   - Affected assets list shows dependency paths
   - Expanding an asset shows full dependency chain

### 6.4 Test Security Posture

**Test actions:**
1. Navigate to "Security" tab
2. Verify:
   - Overall security score displays (0-100 with grade)
   - Vulnerabilities breakdown by severity
   - Security issues summary (outdated firmware, exposed devices, etc.)
   - Compliance status with progress bar
   - Weakest assets list with scores
   - Recommendations section with actionable items

### 6.5 Test AI Assistant

**Test natural language queries:**

1. Type: "Are any cameras offline?"
   - Expected: List of offline cameras with details

2. Type: "What happens if Switch-03 fails?"
   - Expected: Blast radius analysis with affected assets

3. Type: "What's our security posture?"
   - Expected: Security score, vulnerabilities, compliance status

4. Type: "Show infrastructure health"
   - Expected: Asset counts by type and status breakdown

---

## Step 7: Test Real-Time Updates

### 7.1 Open Browser DevTools

1. Navigate to Infrastructure Twin page
2. Open Browser Console
3. Look for WebSocket connection:
   ```
   WebSocket connection established
   Subscribed to digital twin updates
   ```

### 7.2 Trigger Infrastructure Event

Simulate a camera going offline:

```sql
UPDATE twin_assets 
SET status = 'offline', updated_at = NOW() 
WHERE type = 'camera' AND id = 'cam_001';

-- Trigger event
INSERT INTO twin_events (asset_id, event_type, severity, title, description)
VALUES ('cam_001', 'status_change', 'warning', 'Camera Offline', 'Camera went offline at ' || NOW());
```

### 7.3 Verify UI Updates

**Expected behavior:**
- Topology graph node color changes from green to red/gray
- Statistics panel updates offline count
- No page refresh required
- Console shows: `Received twin.updated event`

---

## Step 8: Performance Testing

### 8.1 Blast Radius Calculation Performance

Test with large asset counts:

```bash
time curl http://localhost:3001/api/digital-twin/assets/switch_01/blast-radius
```

**Expected performance:**
- < 500ms for 100 assets
- < 2s for 1,000 assets
- < 5s for 10,000 assets

If slower, verify:
- Database indexes exist on twin_relationships (source_id, target_id)
- Recursive CTE query plan is efficient: `EXPLAIN ANALYZE` the query

### 8.2 Topology Query Performance

```bash
time curl http://localhost:3001/api/digital-twin/topology
```

**Expected performance:**
- < 1s for 500 nodes and 1,000 edges
- < 3s for 2,000 nodes and 5,000 edges

### 8.3 Frontend Rendering Performance

Test with Chrome DevTools Performance profiler:

1. Record page load
2. Verify First Contentful Paint < 2s
3. Verify react-flow graph renders < 1s for 500 nodes

---

## Step 9: Troubleshooting

### Issue: API Routes Not Registered

**Symptom:** `404 Not Found` for `/api/digital-twin/*`

**Solution:**
1. Check analytics-engine logs for import errors
2. Verify `registerDigitalTwinRoutes` is called in app.ts
3. Check file exists: `analytics-engine/src/digital-twin/api/index.ts`

### Issue: WebSocket Connection Fails

**Symptom:** Console error: `WebSocket connection failed`

**Solution:**
1. Verify WebSocket server is running on correct port
2. Check CORS configuration allows WebSocket upgrade
3. Verify `WEBSOCKET_ENABLED=true` in environment

### Issue: No Assets Discovered

**Symptom:** Empty topology graph after refresh

**Solution:**
1. Check database tables exist: `\dt twin_*`
2. Verify collectors are running: Check logs for collector errors
3. Manually verify source data exists:
   ```sql
   SELECT COUNT(*) FROM cameras WHERE status = 'online';
   SELECT COUNT(*) FROM device_inventory;
   ```

### Issue: Blast Radius Query Timeout

**Symptom:** Request times out after 30s

**Solution:**
1. Add indexes:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_twin_relationships_source 
     ON twin_relationships(source_id);
   CREATE INDEX IF NOT EXISTS idx_twin_relationships_target 
     ON twin_relationships(target_id);
   ```

2. Check recursive CTE query plan:
   ```sql
   EXPLAIN ANALYZE 
   WITH RECURSIVE blast_radius AS (
     SELECT source_id, target_id, 1 AS depth
     FROM twin_relationships
     WHERE target_id = 'asset_id_here'
     UNION ALL
     SELECT r.source_id, r.target_id, br.depth + 1
     FROM twin_relationships r
     JOIN blast_radius br ON r.target_id = br.source_id
     WHERE br.depth < 10
   )
   SELECT * FROM blast_radius;
   ```

### Issue: Topology Graph Not Rendering

**Symptom:** Blank screen in Topology tab

**Solution:**
1. Open Browser Console → check for React errors
2. Verify react-flow installed: `npm list reactflow`
3. Check API response contains valid nodes/edges structure
4. Verify CSS loaded: Check for `reactflow` styles in Network tab

### Issue: Security Posture Shows All Zeros

**Symptom:** Security scores are 0, no vulnerabilities

**Solution:**
1. Ensure collectors calculate security scores:
   ```typescript
   // In camera.collector.ts
   const securityScore = calculateSecurityScore(camera);
   ```

2. Verify security metadata exists:
   ```sql
   SELECT id, type, metadata->'firmware' 
   FROM twin_assets 
   WHERE type = 'camera' LIMIT 5;
   ```

---

## Step 10: Production Deployment Checklist

### Database
- [ ] Schema migration executed
- [ ] Indexes created
- [ ] Triggers enabled
- [ ] Materialized views created (optional for performance)
- [ ] Backup schedule configured for twin_* tables
- [ ] Retention policy configured (recommended: 90 days history)

### Backend
- [ ] Environment variables configured
- [ ] Digital Twin API routes registered
- [ ] Event handlers initialized
- [ ] WebSocket server running
- [ ] Health endpoint responds: `GET /health`
- [ ] Collectors run on schedule (cron or internal scheduler)

### Frontend
- [ ] react-flow dependency installed
- [ ] API base URL configured for production
- [ ] WebSocket URL configured for production
- [ ] Navigation link added to sidebar
- [ ] Page route created at `/infrastructure-twin`
- [ ] Error boundaries added for resilience

### Monitoring
- [ ] API endpoint response times logged
- [ ] Blast radius calculation performance tracked
- [ ] WebSocket connection count monitored
- [ ] Collector success/failure rates logged
- [ ] Database query performance monitored

### Security
- [ ] API endpoints require authentication
- [ ] WebSocket connections require valid session
- [ ] Rate limiting configured for expensive queries (blast radius)
- [ ] Input validation enabled (Zod schemas)
- [ ] SQL injection protection verified (parameterized queries)

---

## Step 11: Ongoing Maintenance

### Daily Tasks
- Monitor collector execution logs
- Review failed API requests
- Check WebSocket connection stability

### Weekly Tasks
- Review security posture trends
- Analyze blast radius for critical assets
- Verify asset counts match physical inventory

### Monthly Tasks
- Archive old state history (> 90 days)
- Review and optimize slow queries
- Update asset metadata (firmware versions, etc.)
- Validate relationship accuracy

### Quarterly Tasks
- Audit security scores and recommendations
- Review compliance status across branches
- Performance test with production data volume
- Update collector logic for new device types

---

## Appendix A: Sample Data for Testing

### Create Test Assets

```sql
-- Enterprise
INSERT INTO twin_assets (id, type, name, status, health_score, security_score, metadata)
VALUES ('ent_001', 'enterprise', 'Test Enterprise', 'healthy', 92, 85, '{}');

-- Region
INSERT INTO twin_assets (id, type, name, parent_id, status, health_score, security_score, metadata)
VALUES ('reg_001', 'region', 'Test Region', 'ent_001', 'healthy', 90, 84, '{}');

-- Branch
INSERT INTO twin_assets (id, type, name, parent_id, status, health_score, security_score, metadata)
VALUES ('branch_001', 'branch', 'Test Branch', 'reg_001', 'healthy', 88, 82, '{"location": "Mumbai"}');

-- Switch
INSERT INTO twin_assets (id, type, name, parent_id, status, health_score, security_score, metadata)
VALUES ('switch_001', 'switch', 'Main Switch', 'branch_001', 'healthy', 95, 90, 
        '{"ipAddress": "192.168.1.1", "model": "Cisco SG350", "ports": 24}');

-- Cameras
INSERT INTO twin_assets (id, type, name, parent_id, status, health_score, security_score, metadata)
VALUES 
  ('cam_001', 'camera', 'Entrance Camera', 'branch_001', 'healthy', 92, 88, 
   '{"ipAddress": "192.168.1.101", "firmware": "5.7.12", "protocol": "ONVIF"}'),
  ('cam_002', 'camera', 'Parking Camera', 'branch_001', 'warning', 75, 65, 
   '{"ipAddress": "192.168.1.102", "firmware": "4.2.3", "protocol": "RTSP"}');

-- Relationships
INSERT INTO twin_relationships (id, source_id, target_id, type, criticality)
VALUES 
  ('rel_001', 'cam_001', 'switch_001', 'connected_to', 'critical'),
  ('rel_002', 'cam_002', 'switch_001', 'connected_to', 'critical');
```

### Verify Test Data

```sql
SELECT * FROM twin_assets ORDER BY type, name;
SELECT * FROM twin_relationships;
```

---

## Appendix B: API Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/digital-twin` | GET | Get enterprise root |
| `/api/digital-twin/assets/:id` | GET | Get specific asset |
| `/api/digital-twin/assets/:id/children` | GET | Get child assets |
| `/api/digital-twin/assets/:id/dependencies` | GET | Get dependencies |
| `/api/digital-twin/assets/:id/blast-radius` | GET | Calculate impact |
| `/api/digital-twin/topology` | GET | Get visualization graph |
| `/api/digital-twin/simulate` | POST | Simulate failure |
| `/api/digital-twin/refresh` | POST | Trigger collectors |
| `/api/digital-twin/security-posture/:id` | GET | Get security score |

---

## Support

For issues or questions:
1. Check logs: `analytics-engine/logs/digital-twin.log`
2. Review API documentation: `analytics-engine/src/digital-twin/api/API_DOCUMENTATION.md`
3. Check implementation summary: `analytics-engine/src/digital-twin/IMPLEMENTATION_SUMMARY.md`

---

**Deployment Guide Version:** 1.0  
**Last Updated:** 2026-08-11  
**Compatible With:** Analytics Engine v2.0+, Dashboard v1.0+
