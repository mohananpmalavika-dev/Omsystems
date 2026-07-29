#!/bin/bash

###############################################################################
# 400-Branch Scalability Test Setup Script
#
# This script generates test data for scalability testing:
# - 400 branches (distributed across 20 regions)
# - 6,000 cameras (12-25 per branch, 80% online)
# - 540 DVR/NVR devices
# - 90 days of recording history
# - 100 test user accounts
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BRANCH_COUNT=${BRANCH_COUNT:-400}
MIN_CAMERAS_PER_BRANCH=${MIN_CAMERAS:-12}
MAX_CAMERAS_PER_BRANCH=${MAX_CAMERAS:-25}
RECORDING_DAYS=${RECORDING_DAYS:-90}
USER_COUNT=${USER_COUNT:-100}
DATABASE_URL=${DATABASE_URL:-"postgresql://postgres:postgres@localhost:5432/vms_test"}

echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  400-Branch Scalability Test Data Setup${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "Configuration:"
echo "  Branches: $BRANCH_COUNT"
echo "  Cameras per branch: $MIN_CAMERAS_PER_BRANCH-$MAX_CAMERAS_PER_BRANCH"
echo "  Recording history: $RECORDING_DAYS days"
echo "  Test users: $USER_COUNT"
echo "  Database: $DATABASE_URL"
echo ""

# Check dependencies
echo -e "${YELLOW}Checking dependencies...${NC}"
command -v node >/dev/null 2>&1 || { echo -e "${RED}ERROR: node is required but not installed.${NC}" >&2; exit 1; }
command -v psql >/dev/null 2>&1 || { echo -e "${RED}ERROR: psql is required but not installed.${NC}" >&2; exit 1; }
echo -e "${GREEN}✓ Dependencies OK${NC}"
echo ""

# Test database connection
echo -e "${YELLOW}Testing database connection...${NC}"
psql "$DATABASE_URL" -c "SELECT version();" > /dev/null 2>&1 || {
  echo -e "${RED}ERROR: Cannot connect to database${NC}" >&2
  echo "Please check DATABASE_URL: $DATABASE_URL"
  exit 1
}
echo -e "${GREEN}✓ Database connection OK${NC}"
echo ""

# Create temporary data generation script
echo -e "${YELLOW}Creating data generation script...${NC}"
cat > /tmp/generate-test-data.sql <<'EOF'
-- 400-Branch Scalability Test Data Generation

BEGIN;

-- 1. Generate 20 regions
INSERT INTO regions (id, name, created_at, updated_at)
SELECT 
  'region-' || LPAD(i::TEXT, 2, '0'),
  'Region ' || i,
  NOW(),
  NOW()
FROM generate_series(1, 20) AS i
ON CONFLICT (id) DO NOTHING;

-- 2. Generate 400 branches
INSERT INTO branches (id, name, region_id, address, latitude, longitude, status, created_at, updated_at)
SELECT 
  'branch-' || LPAD(i::TEXT, 4, '0'),
  'Branch ' || i,
  'region-' || LPAD(((i - 1) % 20 + 1)::TEXT, 2, '0'),
  i || ' Test Street, City ' || ((i - 1) % 20 + 1),
  28.6139 + (RANDOM() * 10 - 5),  -- Random lat around Delhi
  77.2090 + (RANDOM() * 10 - 5),  -- Random lng around Delhi
  CASE WHEN RANDOM() < 0.95 THEN 'active' ELSE 'inactive' END,
  NOW() - (RANDOM() * 365 || ' days')::INTERVAL,
  NOW()
FROM generate_series(1, 400) AS i
ON CONFLICT (id) DO NOTHING;

-- 3. Generate DVR/NVR devices (540 total, ~1.35 per branch)
INSERT INTO recorders (id, branch_id, name, brand, model, ip_address, port, username, status, created_at, updated_at)
SELECT 
  'recorder-' || LPAD(i::TEXT, 4, '0'),
  'branch-' || LPAD(((i - 1) % 400 + 1)::TEXT, 4, '0'),
  'DVR/NVR ' || i,
  CASE (i % 3)
    WHEN 0 THEN 'hikvision'
    WHEN 1 THEN 'dahua'
    ELSE 'cpplus'
  END,
  CASE (i % 3)
    WHEN 0 THEN 'DS-7616NI-K2'
    WHEN 1 THEN 'DHI-NVR5216-16P-4KS2E'
    ELSE 'CP-UNR-4K3604-P16'
  END,
  '192.168.' || ((i / 256) + 1) || '.' || (i % 256),
  CASE (i % 3)
    WHEN 0 THEN 80
    WHEN 1 THEN 80
    ELSE 37777
  END,
  'admin',
  CASE WHEN RANDOM() < 0.90 THEN 'online' ELSE 'offline' END,
  NOW() - (RANDOM() * 180 || ' days')::INTERVAL,
  NOW()
FROM generate_series(1, 540) AS i
ON CONFLICT (id) DO NOTHING;

-- 4. Generate cameras (12-25 per branch = ~6000 total)
INSERT INTO cameras (id, branch_id, recorder_id, name, rtsp_url, status, location, created_at, updated_at)
SELECT 
  'camera-' || LPAD(ROW_NUMBER() OVER ()::TEXT, 5, '0'),
  b.id,
  r.id,
  'Camera ' || ROW_NUMBER() OVER (PARTITION BY b.id),
  'rtsp://admin:password@' || r.ip_address || ':554/stream' || ROW_NUMBER() OVER (PARTITION BY b.id),
  CASE 
    WHEN RANDOM() < 0.80 THEN 'online'
    WHEN RANDOM() < 0.90 THEN 'offline'
    ELSE 'error'
  END,
  CASE (ROW_NUMBER() OVER (PARTITION BY b.id) % 5)
    WHEN 0 THEN 'entrance'
    WHEN 1 THEN 'exit'
    WHEN 2 THEN 'parking'
    WHEN 3 THEN 'counter'
    ELSE 'storage'
  END,
  NOW() - (RANDOM() * 180 || ' days')::INTERVAL,
  NOW()
FROM 
  branches b
  CROSS JOIN LATERAL (
    SELECT * FROM recorders r 
    WHERE r.branch_id = b.id 
    LIMIT 1
  ) r
  CROSS JOIN generate_series(1, 12 + FLOOR(RANDOM() * 14)::INT) AS cam_num
ON CONFLICT (id) DO NOTHING;

-- 5. Generate recording segments (90 days, hourly segments)
-- This is memory-intensive, so we'll generate a smaller sample
INSERT INTO recording_segments (
  id, camera_id, recorder_id, start_time, end_time, 
  file_path, file_size, duration, status, created_at
)
SELECT 
  gen_random_uuid(),
  c.id,
  c.recorder_id,
  start_time,
  start_time + '1 hour'::INTERVAL,
  '/recordings/' || c.id || '/' || TO_CHAR(start_time, 'YYYY-MM-DD/HH') || '.mp4',
  FLOOR(RANDOM() * 500000000 + 100000000)::BIGINT, -- 100-600 MB
  3600, -- 1 hour
  CASE WHEN RANDOM() < 0.98 THEN 'completed' ELSE 'corrupted' END,
  start_time
FROM 
  cameras c
  CROSS JOIN LATERAL (
    SELECT generate_series(
      NOW() - '90 days'::INTERVAL,
      NOW(),
      '6 hours'::INTERVAL  -- Every 6 hours to reduce data volume
    ) AS start_time
  ) times
WHERE c.status = 'online'
  AND RANDOM() < 0.9  -- 90% recording availability
ON CONFLICT DO NOTHING;

-- 6. Generate test users (100 users)
INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'test.user' || i || '@company.com',
  '$2b$10$' || MD5(RANDOM()::TEXT),  -- Dummy hash
  'Test' || i,
  'User',
  CASE 
    WHEN i <= 5 THEN 'admin'
    WHEN i <= 30 THEN 'operator'
    ELSE 'viewer'
  END,
  'active',
  NOW() - (RANDOM() * 365 || ' days')::INTERVAL,
  NOW()
FROM generate_series(1, 100) AS i
ON CONFLICT (email) DO NOTHING;

-- 7. Generate analytics rules (50 rules across branches)
INSERT INTO analytics_rules (
  id, name, type, severity, enabled, 
  configuration, created_at, updated_at
)
SELECT 
  gen_random_uuid(),
  CASE (i % 10)
    WHEN 0 THEN 'Intrusion Detection'
    WHEN 1 THEN 'Loitering Alert'
    WHEN 2 THEN 'Crowd Detection'
    WHEN 3 THEN 'Vehicle Parking Violation'
    WHEN 4 THEN 'Abandoned Object'
    WHEN 5 THEN 'Face Recognition'
    WHEN 6 THEN 'License Plate Recognition'
    WHEN 7 THEN 'Fire/Smoke Detection'
    WHEN 8 THEN 'PPE Compliance'
    ELSE 'Perimeter Breach'
  END || ' ' || i,
  CASE (i % 10)
    WHEN 0 THEN 'intrusion'
    WHEN 1 THEN 'loitering'
    WHEN 2 THEN 'crowd'
    WHEN 3 THEN 'parking'
    WHEN 4 THEN 'abandoned_object'
    WHEN 5 THEN 'face_recognition'
    WHEN 6 THEN 'anpr'
    WHEN 7 THEN 'fire_smoke'
    WHEN 8 THEN 'ppe'
    ELSE 'perimeter'
  END,
  CASE 
    WHEN i % 4 = 0 THEN 'P1'
    WHEN i % 4 = 1 THEN 'P2'
    WHEN i % 4 = 2 THEN 'P3'
    ELSE 'P4'
  END,
  RANDOM() < 0.8,
  jsonb_build_object(
    'threshold', 0.7,
    'duration', 30,
    'zones', ARRAY['zone-1', 'zone-2']
  ),
  NOW() - (RANDOM() * 180 || ' days')::INTERVAL,
  NOW()
FROM generate_series(1, 50) AS i
ON CONFLICT DO NOTHING;

-- 8. Generate alert history (last 30 days)
INSERT INTO analytics_alerts (
  id, rule_id, camera_id, severity, status, 
  detected_at, acknowledged_at, acknowledged_by,
  snapshot_url, clip_url, metadata, created_at
)
SELECT 
  gen_random_uuid(),
  (SELECT id FROM analytics_rules ORDER BY RANDOM() LIMIT 1),
  (SELECT id FROM cameras WHERE status = 'online' ORDER BY RANDOM() LIMIT 1),
  CASE (i % 4)
    WHEN 0 THEN 'P1'
    WHEN 1 THEN 'P2'
    WHEN 2 THEN 'P3'
    ELSE 'P4'
  END,
  CASE 
    WHEN RANDOM() < 0.70 THEN 'resolved'
    WHEN RANDOM() < 0.85 THEN 'acknowledged'
    ELSE 'active'
  END,
  detected_time,
  CASE WHEN RANDOM() < 0.85 THEN detected_time + (RANDOM() * 1800 || ' seconds')::INTERVAL ELSE NULL END,
  CASE WHEN RANDOM() < 0.85 THEN (SELECT id FROM users ORDER BY RANDOM() LIMIT 1) ELSE NULL END,
  'https://storage.company.com/snapshots/' || gen_random_uuid() || '.jpg',
  'https://storage.company.com/clips/' || gen_random_uuid() || '.mp4',
  jsonb_build_object(
    'confidence', 0.8 + RANDOM() * 0.2,
    'object_count', FLOOR(RANDOM() * 10) + 1
  ),
  detected_time
FROM generate_series(
  NOW() - '30 days'::INTERVAL,
  NOW(),
  '15 minutes'::INTERVAL
) AS detected_time
CROSS JOIN generate_series(1, FLOOR(RANDOM() * 3)::INT) AS i  -- 0-3 alerts per 15min
WHERE RANDOM() < 0.1  -- 10% of time slots have alerts
LIMIT 50000;  -- Cap at 50K alerts

COMMIT;

-- Analyze tables for query optimization
ANALYZE branches;
ANALYZE cameras;
ANALYZE recorders;
ANALYZE recording_segments;
ANALYZE analytics_rules;
ANALYZE analytics_alerts;
ANALYZE users;

-- Create summary statistics
SELECT 
  'Test Data Generation Complete' AS status,
  (SELECT COUNT(*) FROM branches) AS branches,
  (SELECT COUNT(*) FROM cameras) AS cameras,
  (SELECT COUNT(*) FROM recorders) AS recorders,
  (SELECT COUNT(*) FROM recording_segments) AS recording_segments,
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM analytics_alerts) AS alerts;
EOF

echo -e "${GREEN}✓ Data generation script created${NC}"
echo ""

# Execute data generation
echo -e "${YELLOW}Generating test data (this may take 5-10 minutes)...${NC}"
psql "$DATABASE_URL" -f /tmp/generate-test-data.sql

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Test data generated successfully${NC}"
else
  echo -e "${RED}ERROR: Data generation failed${NC}" >&2
  exit 1
fi
echo ""

# Create indexes for performance
echo -e "${YELLOW}Creating performance indexes...${NC}"
psql "$DATABASE_URL" <<'EOF'
-- Indexes for scalability testing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cameras_branch_status 
  ON cameras(branch_id, status) WHERE status != 'offline';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cameras_recorder 
  ON cameras(recorder_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recording_segments_camera_time 
  ON recording_segments(camera_id, start_time DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_severity_status_time 
  ON analytics_alerts(severity, status, detected_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_camera 
  ON analytics_alerts(camera_id, detected_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recorders_branch 
  ON recorders(branch_id, status);
EOF

echo -e "${GREEN}✓ Indexes created${NC}"
echo ""

# Cleanup
rm -f /tmp/generate-test-data.sql

# Display summary
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "Test environment is ready for scalability testing."
echo ""
echo "Next steps:"
echo "  1. Deploy application to test cluster:"
echo "     kubectl apply -f k8s/test-environment/"
echo ""
echo "  2. Start monitoring dashboard:"
echo "     npm run monitor:start"
echo ""
echo "  3. Run baseline tests:"
echo "     npm run test:scalability:baseline"
echo ""
echo "  4. Run full test suite:"
echo "     npm run test:scalability:full"
echo ""
echo -e "${YELLOW}Important:${NC} Test data is generated in database: $DATABASE_URL"
echo "To clean up after testing, run: npm run test:scalability:cleanup"
echo ""
