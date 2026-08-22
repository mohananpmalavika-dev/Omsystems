ALTER TABLE camera_discoveries
  ADD COLUMN discovery_layers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT camera_discoveries_layers_array
    CHECK (jsonb_typeof(discovery_layers) = 'array');

COMMENT ON COLUMN camera_discoveries.discovery_layers IS
  'Ordered outcomes for network, ONVIF, RTSP, vendor-adapter, fingerprint, and registration discovery layers.';

WITH ranked_discoveries AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY branch_node_id, device_identity_id
           ORDER BY CASE status
             WHEN 'rejected' THEN 0
             WHEN 'approved' THEN 1
             ELSE 2
           END,
           discovered_at DESC,
           id
         ) AS duplicate_rank
  FROM camera_discoveries
)
DELETE FROM camera_discoveries discovery
USING ranked_discoveries ranked
WHERE discovery.id = ranked.id
  AND ranked.duplicate_rank > 1;

DROP INDEX camera_discoveries_physical_channel_idx;
DROP INDEX camera_discoveries_identity_idx;

CREATE UNIQUE INDEX camera_discoveries_identity_unique_idx
  ON camera_discoveries (branch_node_id, device_identity_id);
