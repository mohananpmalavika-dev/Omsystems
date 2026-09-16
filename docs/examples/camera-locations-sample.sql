-- Sample SQL to add GPS coordinates to branches for camera location mapping
-- This script demonstrates how to configure branch locations in the database

-- Example 1: Update branch metadata with GPS coordinates (JSON format)
-- Format: {"location": {"latitude": decimal, "longitude": decimal}}

-- Bangalore branches
UPDATE resource_nodes 
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{location}',
  '{"latitude": 12.9716, "longitude": 77.5946}'::jsonb
)
WHERE type = 'branch' 
  AND name = 'Bangalore Main Branch';

UPDATE resource_nodes 
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{location}',
  '{"latitude": 12.9350, "longitude": 77.6245}'::jsonb
)
WHERE type = 'branch' 
  AND name = 'Bangalore Airport Branch';

-- Mumbai branches
UPDATE resource_nodes 
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{location}',
  '{"latitude": 19.0760, "longitude": 72.8777}'::jsonb
)
WHERE type = 'branch' 
  AND name = 'Mumbai Central Branch';

UPDATE resource_nodes 
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{location}',
  '{"latitude": 19.0896, "longitude": 72.8656}'::jsonb
)
WHERE type = 'branch' 
  AND name = 'Mumbai Andheri Branch';

-- Delhi branches
UPDATE resource_nodes 
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{location}',
  '{"latitude": 28.6139, "longitude": 77.2090}'::jsonb
)
WHERE type = 'branch' 
  AND name = 'Delhi Connaught Place';

UPDATE resource_nodes 
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{location}',
  '{"latitude": 28.5355, "longitude": 77.3910}'::jsonb
)
WHERE type = 'branch' 
  AND name = 'Delhi Noida Branch';

-- Chennai branches
UPDATE resource_nodes 
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{location}',
  '{"latitude": 13.0827, "longitude": 80.2707}'::jsonb
)
WHERE type = 'branch' 
  AND name = 'Chennai Anna Nagar';

-- Hyderabad branches
UPDATE resource_nodes 
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{location}',
  '{"latitude": 17.3850, "longitude": 78.4867}'::jsonb
)
WHERE type = 'branch' 
  AND name = 'Hyderabad Hitech City';

-- Pune branches
UPDATE resource_nodes 
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{location}',
  '{"latitude": 18.5204, "longitude": 73.8567}'::jsonb
)
WHERE type = 'branch' 
  AND name = 'Pune Koregaon Park';

-- Kolkata branches
UPDATE resource_nodes 
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{location}',
  '{"latitude": 22.5726, "longitude": 88.3639}'::jsonb
)
WHERE type = 'branch' 
  AND name = 'Kolkata Park Street';


-- Example 2: Query to verify GPS coordinates are set
SELECT 
  id,
  name,
  type,
  metadata->>'location' as location,
  (metadata->'location'->>'latitude')::float as latitude,
  (metadata->'location'->>'longitude')::float as longitude
FROM resource_nodes 
WHERE type = 'branch' 
  AND metadata->'location' IS NOT NULL
ORDER BY name;


-- Example 3: Count cameras per branch with location data
SELECT 
  rn.name as branch_name,
  (rn.metadata->'location'->>'latitude')::float as latitude,
  (rn.metadata->'location'->>'longitude')::float as longitude,
  COUNT(c.id) as camera_count,
  COUNT(CASE WHEN c.status = 'online' THEN 1 END) as online_cameras,
  COUNT(CASE WHEN c.status = 'offline' THEN 1 END) as offline_cameras
FROM resource_nodes rn
LEFT JOIN cameras c ON c.branch_id = rn.id
WHERE rn.type = 'branch'
  AND rn.metadata->'location' IS NOT NULL
GROUP BY rn.id, rn.name, latitude, longitude
ORDER BY camera_count DESC;


-- Example 4: Alternative format (using lat/lng instead of latitude/longitude)
UPDATE resource_nodes 
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{location}',
  '{"lat": 12.9716, "lng": 77.5946}'::jsonb
)
WHERE type = 'branch' 
  AND name = 'Example Branch with lat/lng format';


-- Example 5: Bulk update using a CTE for multiple branches
WITH branch_coordinates AS (
  SELECT 
    'Branch A' as branch_name,
    12.9716 as lat,
    77.5946 as lng
  UNION ALL
  SELECT 'Branch B', 13.0827, 80.2707
  UNION ALL
  SELECT 'Branch C', 19.0760, 72.8777
)
UPDATE resource_nodes rn
SET metadata = jsonb_set(
  COALESCE(rn.metadata, '{}'::jsonb),
  '{location}',
  jsonb_build_object('latitude', bc.lat, 'longitude', bc.lng)
)
FROM branch_coordinates bc
WHERE rn.type = 'branch' 
  AND rn.name = bc.branch_name;


-- Example 6: Find branches without GPS coordinates
SELECT 
  id,
  name,
  type,
  COALESCE(metadata, '{}'::jsonb) as metadata
FROM resource_nodes 
WHERE type = 'branch'
  AND (
    metadata IS NULL 
    OR metadata->'location' IS NULL
    OR metadata->'location'->>'latitude' IS NULL
    OR metadata->'location'->>'longitude' IS NULL
  )
ORDER BY name;


-- Example 7: Validate GPS coordinates are within valid ranges
SELECT 
  id,
  name,
  (metadata->'location'->>'latitude')::float as latitude,
  (metadata->'location'->>'longitude')::float as longitude,
  CASE 
    WHEN (metadata->'location'->>'latitude')::float < -90 
      OR (metadata->'location'->>'latitude')::float > 90 THEN 'Invalid latitude'
    WHEN (metadata->'location'->>'longitude')::float < -180 
      OR (metadata->'location'->>'longitude')::float > 180 THEN 'Invalid longitude'
    ELSE 'Valid'
  END as validation_status
FROM resource_nodes 
WHERE type = 'branch'
  AND metadata->'location' IS NOT NULL;


-- Example 8: Add address along with GPS coordinates
UPDATE resource_nodes 
SET metadata = metadata 
  || '{"location": {"latitude": 12.9716, "longitude": 77.5946}}'::jsonb
  || '{"address": "123 MG Road, Bangalore, Karnataka 560001"}'::jsonb
WHERE type = 'branch' 
  AND name = 'Bangalore MG Road Branch';


-- Example 9: Remove GPS coordinates (if needed)
UPDATE resource_nodes 
SET metadata = metadata - 'location'
WHERE type = 'branch' 
  AND name = 'Branch to remove location from';
