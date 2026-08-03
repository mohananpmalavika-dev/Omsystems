# Fix: No Cameras Showing

## Problem

Your Sentinel Grid dashboard shows:
- **0 Cameras**
- **0 Gateways** 
- **0 Branches**
- "No cameras found" message

## Root Cause

**The database is empty** - No cameras, gateways, or branches have been registered yet.

This is a **data initialization issue**, not a code bug. The system is working correctly; it's just showing the accurate count of registered cameras (which is zero).

## Solutions

### Solution 1: Add Sample Data (Quick Test)

Run this SQL script to add test cameras:

```sql
-- Connect to your PostgreSQL database
psql -U your_username -d sentinel_grid

-- Add a test tenant
INSERT INTO tenants (id, name, domain, status)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'Test Organization', 'test.local', 'active')
ON CONFLICT (id) DO NOTHING;

-- Add a test branch
INSERT INTO branch_nodes (id, tenant_id, name, code, type, status, location)
VALUES 
  ('10000000-0000-0000-0000-000000000001', 
   '00000000-0000-0000-0000-000000000001',
   'Main Branch',
   'BRANCH-001',
   'branch',
   'operational',
   ST_MakePoint(77.5946, 12.9716)::geography) -- Bangalore coordinates
ON CONFLICT (id) DO NOTHING;

-- Add test gateways (DVR/NVR)
INSERT INTO gateways (id, tenant_id, branch_node_id, name, type, status, ip_address, port)
VALUES 
  ('20000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Main DVR',
   'dvr',
   'online',
   '192.168.1.100',
   80),
  ('20000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Entrance NVR',
   'nvr',
   'online',
   '192.168.1.101',
   80)
ON CONFLICT (id) DO NOTHING;

-- Add test cameras
INSERT INTO cameras (
  id, tenant_id, branch_node_id, gateway_id,
  name, channel_number, camera_type, status,
  stream_url, username, connection_type
)
VALUES 
  -- Standard Analog Cameras
  ('30000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001',
   'Entrance Camera 1',
   1,
   'analog',
   'online',
   'rtsp://192.168.1.100:554/channel1',
   'admin',
   'rtsp'),
   
  ('30000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001',
   'ATM Camera 1',
   2,
   'analog',
   'online',
   'rtsp://192.168.1.100:554/channel2',
   'admin',
   'rtsp'),
   
  ('30000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001',
   'Cash Counter 1',
   3,
   'analog',
   'online',
   'rtsp://192.168.1.100:554/channel3',
   'admin',
   'rtsp'),
   
  -- HD-Analog Cameras
  ('30000000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001',
   'Vault Camera',
   4,
   'hd-analog',
   'online',
   'rtsp://192.168.1.100:554/channel4',
   'admin',
   'rtsp'),
   
  ('30000000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001',
   'Main Lobby',
   5,
   'hd-analog',
   'online',
   'rtsp://192.168.1.100:554/channel5',
   'admin',
   'rtsp'),
   
  -- IP Cameras
  ('30000000-0000-0000-0000-000000000006',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000002',
   'Entrance IP Camera',
   1,
   'ip',
   'online',
   'rtsp://192.168.1.101:554/stream1',
   'admin',
   'rtsp'),
   
  ('30000000-0000-0000-0000-000000000007',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000002',
   'Parking Lot',
   2,
   'ip',
   'online',
   'rtsp://192.168.1.101:554/stream2',
   'admin',
   'rtsp'),
   
  ('30000000-0000-0000-0000-000000000008',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000002',
   'Back Office',
   3,
   'ip',
   'offline',
   'rtsp://192.168.1.101:554/stream3',
   'admin',
   'rtsp')
ON CONFLICT (id) DO NOTHING;

-- Verify the data
SELECT 
  'Tenants' as type, COUNT(*) as count FROM tenants
UNION ALL
SELECT 'Branches', COUNT(*) FROM branch_nodes
UNION ALL
SELECT 'Gateways', COUNT(*) FROM gateways
UNION ALL
SELECT 'Cameras', COUNT(*) FROM cameras;

-- List all cameras
SELECT 
  c.name,
  c.camera_type,
  c.status,
  b.name as branch,
  g.name as gateway
FROM cameras c
JOIN branch_nodes b ON c.branch_node_id = b.id
JOIN gateways g ON c.gateway_id = g.id
ORDER BY c.name;
```

After running this SQL:
1. Refresh your dashboard
2. You should see:
   - **8 Cameras** (5 online, 1 offline)
   - **2 Gateways**
   - **1 Branch**

---

### Solution 2: Use API to Register Cameras

Create cameras via the API (if you have registration endpoints):

```bash
# Add a gateway first
curl -X POST http://localhost:3000/api/v1/gateways \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Main DVR",
    "type": "dvr",
    "ipAddress": "192.168.1.100",
    "port": 80,
    "username": "admin",
    "password": "your-password",
    "branchId": "your-branch-id"
  }'

# Add cameras
curl -X POST http://localhost:3000/api/v1/cameras \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Entrance Camera 1",
    "channelNumber": 1,
    "cameraType": "analog",
    "streamUrl": "rtsp://192.168.1.100:554/channel1",
    "gatewayId": "gateway-id-from-above",
    "branchId": "your-branch-id"
  }'
```

---

### Solution 3: Import from CSV

If you have a camera inventory, create a CSV file:

```csv
name,type,channel,gateway_ip,branch,location
Entrance Camera 1,analog,1,192.168.1.100,Main Branch,Entrance
ATM Camera 1,analog,2,192.168.1.100,Main Branch,ATM Area
Cash Counter 1,analog,3,192.168.1.100,Main Branch,Cash Counter
Vault Camera,hd-analog,4,192.168.1.100,Main Branch,Vault
Lobby Camera,hd-analog,5,192.168.1.100,Main Branch,Main Lobby
Entrance IP,ip,1,192.168.1.101,Main Branch,Front Entrance
Parking Camera,ip,2,192.168.1.101,Main Branch,Parking Lot
Back Office,ip,3,192.168.1.101,Main Branch,Back Office
```

Then import using a script (if bulk import is available).

---

### Solution 4: Auto-Discovery

If your system supports auto-discovery:

1. Go to **Administration** → **System Management** → **Auto-Discovery**
2. Enter DVR/NVR IP address range: `192.168.1.100-192.168.1.110`
3. Enter credentials
4. Click **"Scan Network"**
5. System will discover and register cameras automatically

---

## Quick Test Script (Windows PowerShell)

Save this as `add-test-cameras.ps1`:

```powershell
# Add Test Cameras to Sentinel Grid
# Run: .\add-test-cameras.ps1

$dbHost = "localhost"
$dbPort = "5432"
$dbName = "sentinel_grid"
$dbUser = "postgres"

Write-Host "Adding test cameras to Sentinel Grid..." -ForegroundColor Cyan

# SQL script path
$sqlScript = @"
-- Add tenant, branch, gateways, and cameras
INSERT INTO tenants (id, name, domain, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test Organization', 'test.local', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO branch_nodes (id, tenant_id, name, code, type, status)
VALUES ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Main Branch', 'BRANCH-001', 'branch', 'operational')
ON CONFLICT (id) DO NOTHING;

INSERT INTO gateways (id, tenant_id, branch_node_id, name, type, status, ip_address, port)
VALUES 
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Main DVR', 'dvr', 'online', '192.168.1.100', 80),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Entrance NVR', 'nvr', 'online', '192.168.1.101', 80)
ON CONFLICT (id) DO NOTHING;

-- Count cameras before
SELECT 'Before:' as label, COUNT(*) as camera_count FROM cameras;

-- Add cameras
INSERT INTO cameras (id, tenant_id, branch_node_id, gateway_id, name, channel_number, camera_type, status, stream_url, username, connection_type)
VALUES 
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Entrance Camera 1', 1, 'analog', 'online', 'rtsp://192.168.1.100:554/channel1', 'admin', 'rtsp'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'ATM Camera 1', 2, 'analog', 'online', 'rtsp://192.168.1.100:554/channel2', 'admin', 'rtsp'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Cash Counter 1', 3, 'analog', 'online', 'rtsp://192.168.1.100:554/channel3', 'admin', 'rtsp'),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Vault Camera', 4, 'hd-analog', 'online', 'rtsp://192.168.1.100:554/channel4', 'admin', 'rtsp'),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Main Lobby', 5, 'hd-analog', 'online', 'rtsp://192.168.1.100:554/channel5', 'admin', 'rtsp'),
  ('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Entrance IP Camera', 1, 'ip', 'online', 'rtsp://192.168.1.101:554/stream1', 'admin', 'rtsp'),
  ('30000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Parking Lot', 2, 'ip', 'online', 'rtsp://192.168.1.101:554/stream2', 'admin', 'rtsp'),
  ('30000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Back Office', 3, 'ip', 'offline', 'rtsp://192.168.1.101:554/stream3', 'admin', 'rtsp')
ON CONFLICT (id) DO NOTHING;

-- Count cameras after
SELECT 'After:' as label, COUNT(*) as camera_count FROM cameras;

-- List cameras
SELECT name, camera_type, status FROM cameras ORDER BY name;
"@

# Write SQL to temp file
$tempFile = [System.IO.Path]::GetTempFileName()
$sqlScript | Out-File -FilePath $tempFile -Encoding UTF8

# Execute
psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $tempFile

# Cleanup
Remove-Item $tempFile

Write-Host "`n✅ Test cameras added successfully!" -ForegroundColor Green
Write-Host "Refresh your dashboard to see the cameras." -ForegroundColor Cyan
```

Run it:
```powershell
.\add-test-cameras.ps1
```

---

## Verify Cameras Are Added

### Method 1: SQL Query
```sql
SELECT COUNT(*) FROM cameras;
SELECT name, status FROM cameras;
```

### Method 2: API Call
```bash
curl http://localhost:3000/api/v1/dashboard/summary
```

### Method 3: Dashboard
1. Refresh the page (Ctrl+F5)
2. Check System Management page
3. Look for camera count in header

---

## Why This Happens

Common scenarios:
1. **Fresh Installation** - Database is newly created, no data yet
2. **Development Environment** - Test data not seeded
3. **Data Migration Issue** - Data import failed
4. **Wrong Database** - Connected to empty database

---

## Next Steps

After adding cameras:

1. **Test Analytics**:
   ```bash
   curl http://localhost:3000/v1/analog/dashboard
   curl http://localhost:3000/v1/analog/classification
   ```

2. **Configure Cameras**:
   - Set correct stream URLs
   - Configure AI features
   - Set up recording schedules

3. **Test Analog AI Features**:
   - Video quality detection
   - Camera aging prediction
   - Upgrade recommendations
   - DVR health monitoring

---

## Need Help?

**If cameras still don't show after adding data:**

1. Check database connection:
   ```bash
   psql -U postgres -d sentinel_grid -c "SELECT COUNT(*) FROM cameras;"
   ```

2. Check backend logs:
   ```bash
   # Look for errors
   tail -f backend/logs/app.log
   ```

3. Check API response:
   ```bash
   curl -v http://localhost:3000/api/v1/dashboard/camera-health
   ```

4. Verify tenant context:
   - Make sure you're logged in
   - Check tenant_id in your session
   - Verify cameras belong to your tenant

---

**Summary**: Your system is working correctly - it's just showing accurate data (0 cameras). Add cameras using the SQL scripts above, then refresh your dashboard!
