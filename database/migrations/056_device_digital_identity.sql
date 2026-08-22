-- Canonical physical-device identity. Network addresses are observations, not
-- identity keys, so DHCP, VPN, and tunnel address changes never create a new
-- logical camera when a stable hardware claim is available.

CREATE TABLE device_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_node_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  camera_id uuid UNIQUE REFERENCES cameras(id) ON DELETE SET NULL,
  device_type text NOT NULL DEFAULT 'ip-camera'
    CHECK (device_type IN ('ip-camera', 'analog-dvr-channel', 'nvr-channel')),
  hardware_serial text,
  manufacturer text,
  model text,
  firmware_version text,
  mac_address macaddr,
  current_ip_address inet,
  onvif_uuid text,
  dvr_serial_number text,
  channel integer CHECK (channel IS NULL OR channel BETWEEN 1 AND 65535),
  certificate_ref text,
  certificate_fingerprint text,
  credential_ref text,
  edge_agent_id uuid REFERENCES edge_agents(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (last_seen_at >= first_seen_at)
);

CREATE INDEX device_identities_branch_idx
  ON device_identities (tenant_id, branch_node_id, last_seen_at DESC);
CREATE INDEX device_identities_agent_idx
  ON device_identities (edge_agent_id, last_seen_at DESC)
  WHERE edge_agent_id IS NOT NULL;
CREATE INDEX device_identities_serial_idx
  ON device_identities (tenant_id, hardware_serial)
  WHERE hardware_serial IS NOT NULL;

CREATE TABLE device_identity_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_identity_id uuid NOT NULL REFERENCES device_identities(id) ON DELETE CASCADE,
  claim_type text NOT NULL
    CHECK (claim_type IN ('onvif-uuid', 'mac-address', 'hardware-serial', 'recorder-channel', 'hardware-id')),
  normalized_value text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, claim_type, normalized_value)
);

CREATE INDEX device_identity_claims_identity_idx
  ON device_identity_claims (device_identity_id, claim_type);

CREATE TABLE device_ip_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_identity_id uuid NOT NULL REFERENCES device_identities(id) ON DELETE CASCADE,
  ip_address inet NOT NULL,
  edge_agent_id uuid REFERENCES edge_agents(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  observation_count bigint NOT NULL DEFAULT 1 CHECK (observation_count > 0),
  UNIQUE (device_identity_id, ip_address)
);

CREATE INDEX device_ip_history_address_idx
  ON device_ip_history (ip_address, last_seen_at DESC);
CREATE INDEX device_ip_history_identity_idx
  ON device_ip_history (device_identity_id, last_seen_at DESC);

ALTER TABLE camera_discoveries
  ADD COLUMN device_identity_id uuid REFERENCES device_identities(id) ON DELETE RESTRICT,
  ADD COLUMN mac_address macaddr,
  ADD COLUMN onvif_endpoint_reference text,
  ADD COLUMN onvif_uuid text,
  ADD COLUMN certificate_ref text,
  ADD COLUMN certificate_fingerprint text;

CREATE INDEX camera_discoveries_identity_idx
  ON camera_discoveries (device_identity_id, discovered_at DESC)
  WHERE device_identity_id IS NOT NULL;

ALTER TABLE cameras
  ADD COLUMN device_identity_id uuid UNIQUE REFERENCES device_identities(id) ON DELETE RESTRICT,
  ADD COLUMN onvif_uuid text,
  ADD COLUMN certificate_ref text,
  ADD COLUMN certificate_fingerprint text,
  ADD COLUMN first_seen_at timestamptz,
  ADD COLUMN identity_last_seen_at timestamptz;

INSERT INTO device_identities (
  tenant_id, branch_node_id, camera_id, device_type, hardware_serial,
  manufacturer, model, firmware_version, mac_address, current_ip_address,
  dvr_serial_number, channel, credential_ref, edge_agent_id,
  first_seen_at, last_seen_at, created_at, updated_at
)
SELECT branch.tenant_id, camera.branch_node_id, camera.id, camera.source_type,
       camera.serial_number, camera.vendor, camera.model,
       camera.firmware_version, camera.mac_address, camera.ip_address,
       camera.recorder_serial_number, camera.recorder_channel,
       camera.connection_secret_ref, camera.edge_agent_id,
       camera.created_at, COALESCE(camera.last_seen_at, camera.created_at),
       camera.created_at, now()
FROM cameras camera
JOIN resource_nodes branch ON branch.id = camera.branch_node_id;

UPDATE cameras camera
SET device_identity_id = identity.id,
    first_seen_at = identity.first_seen_at,
    identity_last_seen_at = identity.last_seen_at
FROM device_identities identity
WHERE identity.camera_id = camera.id;

ALTER TABLE cameras ALTER COLUMN device_identity_id SET NOT NULL;
ALTER TABLE cameras ALTER COLUMN first_seen_at SET NOT NULL;
ALTER TABLE cameras ALTER COLUMN identity_last_seen_at SET NOT NULL;

WITH matched AS (
  SELECT DISTINCT ON (discovery.id)
         discovery.id AS discovery_id, identity.id AS identity_id
  FROM camera_discoveries discovery
  JOIN device_identities identity
    ON identity.tenant_id = discovery.tenant_id
   AND identity.branch_node_id = discovery.branch_node_id
   AND (
     (discovery.recorder_serial_number IS NOT NULL
      AND identity.dvr_serial_number IS NOT NULL
      AND upper(btrim(discovery.recorder_serial_number)) = upper(btrim(identity.dvr_serial_number))
      AND discovery.recorder_channel = identity.channel)
     OR
     (discovery.serial_number IS NOT NULL
      AND identity.hardware_serial IS NOT NULL
      AND upper(btrim(discovery.serial_number)) = upper(btrim(identity.hardware_serial)))
   )
  ORDER BY discovery.id, (identity.camera_id IS NOT NULL) DESC, identity.created_at
)
UPDATE camera_discoveries discovery
SET device_identity_id = matched.identity_id
FROM matched
WHERE discovery.id = matched.discovery_id;

CREATE TEMP TABLE device_identity_legacy_discovery_map ON COMMIT DROP AS
SELECT discovery.id AS discovery_id, gen_random_uuid() AS identity_id
FROM camera_discoveries discovery
WHERE discovery.device_identity_id IS NULL;

INSERT INTO device_identities (
  id, tenant_id, branch_node_id, device_type, hardware_serial,
  manufacturer, model, firmware_version, current_ip_address,
  dvr_serial_number, channel, edge_agent_id, first_seen_at, last_seen_at
)
SELECT mapping.identity_id, discovery.tenant_id, discovery.branch_node_id,
       discovery.source_type, discovery.serial_number, discovery.manufacturer,
       discovery.model, discovery.firmware_version, discovery.ip_address,
       discovery.recorder_serial_number,
       NULLIF(discovery.recorder_channel, 0), discovery.edge_agent_id,
       discovery.discovered_at, discovery.discovered_at
FROM device_identity_legacy_discovery_map mapping
JOIN camera_discoveries discovery ON discovery.id = mapping.discovery_id;

UPDATE camera_discoveries discovery
SET device_identity_id = mapping.identity_id
FROM device_identity_legacy_discovery_map mapping
WHERE discovery.id = mapping.discovery_id;

ALTER TABLE camera_discoveries ALTER COLUMN device_identity_id SET NOT NULL;

INSERT INTO device_identity_claims (
  tenant_id, device_identity_id, claim_type, normalized_value,
  first_seen_at, last_seen_at
)
SELECT identity.tenant_id, identity.id, 'mac-address',
       regexp_replace(lower(identity.mac_address::text), '[^0-9a-f]', '', 'g'),
       identity.first_seen_at, identity.last_seen_at
FROM device_identities identity
WHERE identity.mac_address IS NOT NULL
ON CONFLICT (tenant_id, claim_type, normalized_value) DO NOTHING;

INSERT INTO device_identity_claims (
  tenant_id, device_identity_id, claim_type, normalized_value,
  first_seen_at, last_seen_at
)
SELECT identity.tenant_id, identity.id, 'hardware-serial',
       lower(btrim(COALESCE(identity.manufacturer, 'unknown'))) || '|' ||
       lower(btrim(COALESCE(identity.model, 'unknown'))) || '|' ||
       upper(btrim(identity.hardware_serial)),
       identity.first_seen_at, identity.last_seen_at
FROM device_identities identity
WHERE identity.hardware_serial IS NOT NULL
  AND btrim(identity.hardware_serial) <> ''
ON CONFLICT (tenant_id, claim_type, normalized_value) DO NOTHING;

INSERT INTO device_identity_claims (
  tenant_id, device_identity_id, claim_type, normalized_value,
  first_seen_at, last_seen_at
)
SELECT identity.tenant_id, identity.id, 'recorder-channel',
       upper(btrim(identity.dvr_serial_number)) || '|channel|' || identity.channel::text,
       identity.first_seen_at, identity.last_seen_at
FROM device_identities identity
WHERE identity.dvr_serial_number IS NOT NULL
  AND btrim(identity.dvr_serial_number) <> ''
  AND identity.channel IS NOT NULL
ON CONFLICT (tenant_id, claim_type, normalized_value) DO NOTHING;

INSERT INTO device_ip_history (
  device_identity_id, ip_address, edge_agent_id, first_seen_at, last_seen_at
)
SELECT id, current_ip_address, edge_agent_id, first_seen_at, last_seen_at
FROM device_identities
WHERE current_ip_address IS NOT NULL;

CREATE OR REPLACE FUNCTION ensure_camera_device_identity()
RETURNS trigger AS $$
DECLARE
  generated_identity_id uuid;
BEGIN
  NEW.first_seen_at := COALESCE(NEW.first_seen_at, NEW.created_at, now());
  NEW.identity_last_seen_at := COALESCE(
    NEW.identity_last_seen_at,
    NEW.last_seen_at,
    NEW.first_seen_at
  );
  IF NEW.device_identity_id IS NULL THEN
    INSERT INTO device_identities (
      tenant_id, branch_node_id, device_type, hardware_serial,
      manufacturer, model, firmware_version, mac_address,
      current_ip_address, dvr_serial_number, channel, credential_ref,
      edge_agent_id, first_seen_at, last_seen_at
    )
    SELECT branch.tenant_id, NEW.branch_node_id, NEW.source_type,
           NEW.serial_number, NEW.vendor, NEW.model, NEW.firmware_version,
           NEW.mac_address, NEW.ip_address, NEW.recorder_serial_number,
           NEW.recorder_channel, NEW.connection_secret_ref, NEW.edge_agent_id,
           NEW.first_seen_at, NEW.identity_last_seen_at
    FROM resource_nodes branch
    WHERE branch.id = NEW.branch_node_id
    RETURNING id INTO generated_identity_id;
    NEW.device_identity_id := generated_identity_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_camera_device_identity()
RETURNS trigger AS $$
DECLARE
  identity_tenant_id uuid;
BEGIN
  UPDATE device_identities
  SET camera_id = NEW.id,
      branch_node_id = NEW.branch_node_id,
      device_type = NEW.source_type,
      hardware_serial = COALESCE(NEW.serial_number, hardware_serial),
      manufacturer = COALESCE(NEW.vendor, manufacturer),
      model = COALESCE(NEW.model, model),
      firmware_version = COALESCE(NEW.firmware_version, firmware_version),
      mac_address = COALESCE(NEW.mac_address, mac_address),
      current_ip_address = COALESCE(NEW.ip_address, current_ip_address),
      onvif_uuid = COALESCE(NEW.onvif_uuid, onvif_uuid),
      dvr_serial_number = COALESCE(NEW.recorder_serial_number, dvr_serial_number),
      channel = COALESCE(NEW.recorder_channel, channel),
      certificate_ref = COALESCE(NEW.certificate_ref, certificate_ref),
      certificate_fingerprint = COALESCE(NEW.certificate_fingerprint, certificate_fingerprint),
      credential_ref = COALESCE(NEW.connection_secret_ref, credential_ref),
      edge_agent_id = COALESCE(NEW.edge_agent_id, edge_agent_id),
      last_seen_at = GREATEST(NEW.identity_last_seen_at, last_seen_at),
      updated_at = now()
  WHERE id = NEW.device_identity_id
  RETURNING tenant_id INTO identity_tenant_id;

  IF NEW.ip_address IS NOT NULL THEN
    INSERT INTO device_ip_history (
      device_identity_id, ip_address, edge_agent_id,
      first_seen_at, last_seen_at
    )
    VALUES (
      NEW.device_identity_id, NEW.ip_address, NEW.edge_agent_id,
      NEW.first_seen_at, NEW.identity_last_seen_at
    )
    ON CONFLICT (device_identity_id, ip_address) DO UPDATE
    SET edge_agent_id = COALESCE(EXCLUDED.edge_agent_id, device_ip_history.edge_agent_id),
        first_seen_at = LEAST(EXCLUDED.first_seen_at, device_ip_history.first_seen_at),
        last_seen_at = GREATEST(EXCLUDED.last_seen_at, device_ip_history.last_seen_at);
  END IF;

  IF NEW.onvif_uuid IS NOT NULL AND btrim(NEW.onvif_uuid) <> '' THEN
    INSERT INTO device_identity_claims (
      tenant_id, device_identity_id, claim_type, normalized_value
    ) VALUES (
      identity_tenant_id, NEW.device_identity_id, 'onvif-uuid',
      lower(regexp_replace(btrim(NEW.onvif_uuid), '^(urn:)?uuid:', '', 'i')) ||
      CASE WHEN NEW.source_type <> 'ip-camera' AND NEW.recorder_channel > 0
        THEN '|channel|' || NEW.recorder_channel::text ELSE '' END
    ) ON CONFLICT (tenant_id, claim_type, normalized_value) DO NOTHING;
  END IF;
  IF NEW.mac_address IS NOT NULL THEN
    INSERT INTO device_identity_claims (
      tenant_id, device_identity_id, claim_type, normalized_value
    ) VALUES (
      identity_tenant_id, NEW.device_identity_id, 'mac-address',
      regexp_replace(lower(NEW.mac_address::text), '[^0-9a-f]', '', 'g') ||
      CASE WHEN NEW.source_type <> 'ip-camera' AND NEW.recorder_channel > 0
        THEN '|channel|' || NEW.recorder_channel::text ELSE '' END
    ) ON CONFLICT (tenant_id, claim_type, normalized_value) DO NOTHING;
  END IF;
  IF NEW.serial_number IS NOT NULL AND btrim(NEW.serial_number) <> '' THEN
    INSERT INTO device_identity_claims (
      tenant_id, device_identity_id, claim_type, normalized_value
    ) VALUES (
      identity_tenant_id, NEW.device_identity_id, 'hardware-serial',
      lower(btrim(COALESCE(NEW.vendor, 'unknown'))) || '|' ||
      lower(btrim(COALESCE(NEW.model, 'unknown'))) || '|' ||
      upper(btrim(NEW.serial_number)) ||
      CASE WHEN NEW.source_type <> 'ip-camera' AND NEW.recorder_channel > 0
        THEN '|channel|' || NEW.recorder_channel::text ELSE '' END
    ) ON CONFLICT (tenant_id, claim_type, normalized_value) DO NOTHING;
  END IF;
  IF NEW.recorder_serial_number IS NOT NULL
     AND btrim(NEW.recorder_serial_number) <> ''
     AND NEW.recorder_channel IS NOT NULL THEN
    INSERT INTO device_identity_claims (
      tenant_id, device_identity_id, claim_type, normalized_value
    ) VALUES (
      identity_tenant_id, NEW.device_identity_id, 'recorder-channel',
      upper(btrim(NEW.recorder_serial_number)) || '|channel|' || NEW.recorder_channel::text
    ) ON CONFLICT (tenant_id, claim_type, normalized_value) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_camera_device_identity_before_insert
  BEFORE INSERT ON cameras
  FOR EACH ROW EXECUTE FUNCTION ensure_camera_device_identity();

CREATE TRIGGER sync_camera_device_identity_after_write
  AFTER INSERT OR UPDATE OF device_identity_id, branch_node_id, edge_agent_id,
    serial_number, vendor, model, firmware_version, mac_address, ip_address,
    onvif_uuid, recorder_serial_number, recorder_channel, certificate_ref,
    certificate_fingerprint, connection_secret_ref, identity_last_seen_at
  ON cameras
  FOR EACH ROW EXECUTE FUNCTION sync_camera_device_identity();

COMMENT ON TABLE device_identities IS
  'Stable digital identity for a physical camera or recorder channel; IP addresses are mutable observations.';
COMMENT ON TABLE device_identity_claims IS
  'Normalized immutable hardware claims used to resolve repeated discoveries to one device identity.';
COMMENT ON TABLE device_ip_history IS
  'Complete observed IP-address history for each stable physical device identity.';
