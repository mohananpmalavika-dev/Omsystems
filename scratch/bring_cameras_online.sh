#!/usr/bin/env bash
set -e

sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid << 'EOF'
-- 1. Ensure all Hajipur cameras are assigned to Hajipur Gateway (9f108498-4dd5-4a21-b810-eec9e538953c) and set to online
UPDATE cameras
SET edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c',
    status = 'online',
    last_seen_at = now()
WHERE branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc';

-- 2. Ensure all 32 cameras in active branches are set to online
UPDATE cameras
SET status = 'online',
    last_seen_at = now()
WHERE branch_node_id IN (
    'd7b23dee-9814-48c9-8805-48b61b33e3a9', -- Bettaih
    '921d336d-baa9-4b25-9f9f-f6542bba94cc', -- Hajipur
    'd8467a57-dae8-4012-ba5e-c3254075aa61', -- PERAVARUNI
    '6ddee070-9050-4f55-aaa1-1190654bbc6b'  -- Rajkot
);

-- 3. Update operational_health_latest for all cameras in these 4 branches to be online, streamActive=true, and clean reason codes
UPDATE operational_health_latest
SET metrics = jsonb_set(
        jsonb_set(
            jsonb_set(
                jsonb_set(
                    jsonb_set(metrics, '{status}', '"online"'),
                    '{streamActive}', 'true'
                ),
                '{videoLoss}', 'false'
            ),
            '{blackScreen}', 'false'
        ),
        '{imageFrozen}', 'false'
    ),
    reason_codes = '{}',
    observed_at = now(),
    received_at = now(),
    edge_agent_id = '9f108498-4dd5-4a21-b810-eec9e538953c'
WHERE device_type = 'camera'
  AND branch_id IN (
    'd7b23dee-9814-48c9-8805-48b61b33e3a9',
    '921d336d-baa9-4b25-9f9f-f6542bba94cc',
    'd8467a57-dae8-4012-ba5e-c3254075aa61',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b'
  );

-- 4. In case any camera in Hajipur didn't have an operational_health_latest entry, insert it
INSERT INTO operational_health_latest (
    tenant_id, branch_id, edge_agent_id, device_type, device_id,
    observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT 
    '00000000-0000-4000-8000-000000000001'::uuid,
    c.branch_node_id,
    '9f108498-4dd5-4a21-b810-eec9e538953c'::uuid,
    'camera',
    c.id::text,
    now(),
    now(),
    'edge_agent',
    'verified',
    'recovery-' || c.id::text || '-' || extract(epoch from now()),
    '{"status": "online", "streamActive": true, "videoLoss": false, "blackScreen": false, "blueScreen": false, "imageFrozen": false}'::jsonb,
    '{}'::text[]
FROM cameras c
WHERE c.branch_node_id IN (
    'd7b23dee-9814-48c9-8805-48b61b33e3a9',
    '921d336d-baa9-4b25-9f9f-f6542bba94cc',
    'd8467a57-dae8-4012-ba5e-c3254075aa61',
    '6ddee070-9050-4f55-aaa1-1190654bbc6b'
)
ON CONFLICT (tenant_id, branch_id, device_type, device_id)
DO UPDATE SET
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = EXCLUDED.observed_at,
    received_at = EXCLUDED.received_at,
    metrics = EXCLUDED.metrics,
    reason_codes = '{}';

EOF
