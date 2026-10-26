-- ==============================================================================
-- 20261025: Stop Dual Control Violations On Non-Vault Cameras
-- ==============================================================================
-- Dual-control / minimum-personnel enforcement (2-person rule) is strictly a
-- vault, strong-room, and locker security control in BFSI / banking operations.
-- On all other cameras (entrances, cash counters, customer areas, teller desks,
-- and perimeters), dual control rules cause false alarms whenever a single
-- person is present.
--
-- 1. Disable dual-control rules on all non-vault cameras in analytics_rules.
--    Keep enabled only on cameras whose name, zone, parent group, or channel
--    corresponds to a vault / strong-room / locker / safe.
-- ==============================================================================

UPDATE analytics_rules
SET enabled = false, updated_at = NOW()
WHERE detection_type IN ('dual-control-verification', 'dual-control-violation');

UPDATE analytics_rules
SET enabled = true, updated_at = NOW()
WHERE detection_type IN ('dual-control-verification', 'dual-control-violation')
  AND camera_id IN (
    SELECT c.id
    FROM cameras c
    LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
    LEFT JOIN resource_nodes branch ON branch.id = c.branch_node_id
    WHERE c.id IN (
      'ca035670-aeee-481e-b47c-3eea98344fc6', -- Bettaih Ch 1
      'e79e2f24-7adf-4908-93fb-6438b2ceb24f', -- Hajipur Ch 6
      'b9522b23-506b-4eb2-9b24-bb05fb0148db', -- KOLLAM Ch 4
      '541745ca-3aa1-4a3a-ad79-9e36d9f74fe8', -- PERAVARUNI Ch 7
      '4d74d7ad-6922-4af0-9f36-420b84879425'  -- Rajkot Ch 8
    )
    OR rn.name ~* 'vault|strong\s*room|strongroom|locker|safe\s*room|safe\s*door|currency\s*chest'
    OR (branch.name ~* 'Bettaih' AND c.channel = 1)
    OR (branch.name ~* 'Hajipur' AND c.channel = 6)
    OR (branch.name ~* 'KOLLAM' AND c.channel = 4)
    OR (branch.name ~* 'PERAVARUNI|Peravurani' AND c.channel = 7)
    OR (branch.name ~* 'Rajkot' AND c.channel = 8)
  );

-- 2. Update provision_new_camera_opening_default trigger function to only enable
--    dual-control-verification rules for vault cameras.
CREATE OR REPLACE FUNCTION provision_new_camera_opening_default()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  branch_tenant uuid;
  new_rule_id uuid;
  is_vault_cam boolean := false;
  camera_rec cameras%ROWTYPE;
  node_rec resource_nodes%ROWTYPE;
  branch_rec resource_nodes%ROWTYPE;
BEGIN
  SELECT branch.tenant_id INTO STRICT branch_tenant
    FROM resource_nodes branch JOIN resource_nodes camera_node
      ON camera_node.id=NEW.resource_node_id AND camera_node.tenant_id=branch.tenant_id
    WHERE branch.id=NEW.branch_node_id AND branch.node_type='branch';
  PERFORM ensure_default_branch_opening_policy(branch_tenant,NEW.branch_node_id);

  SELECT * INTO camera_rec FROM cameras WHERE id = NEW.id;
  SELECT * INTO node_rec FROM resource_nodes WHERE id = NEW.resource_node_id;
  SELECT * INTO branch_rec FROM resource_nodes WHERE id = NEW.branch_node_id;

  IF (
    NEW.id IN (
      'ca035670-aeee-481e-b47c-3eea98344fc6',
      'e79e2f24-7adf-4908-93fb-6438b2ceb24f',
      'b9522b23-506b-4eb2-9b24-bb05fb0148db',
      '541745ca-3aa1-4a3a-ad79-9e36d9f74fe8',
      '4d74d7ad-6922-4af0-9f36-420b84879425'
    )
    OR node_rec.name ~* 'vault|strong\s*room|strongroom|locker|safe\s*room|safe\s*door|currency\s*chest'
    OR (branch_rec.name ~* 'Bettaih' AND camera_rec.channel = 1)
    OR (branch_rec.name ~* 'Hajipur' AND camera_rec.channel = 6)
    OR (branch_rec.name ~* 'KOLLAM' AND camera_rec.channel = 4)
    OR (branch_rec.name ~* 'PERAVARUNI|Peravurani' AND camera_rec.channel = 7)
    OR (branch_rec.name ~* 'Rajkot' AND camera_rec.channel = 8)
  ) THEN
    is_vault_cam := true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM analytics_rules WHERE tenant_id=branch_tenant
    AND camera_id=NEW.id AND detection_type='dual-control-verification' AND archived_at IS NULL) THEN
    INSERT INTO analytics_rules (tenant_id,camera_id,name,detection_type,enabled,object_classes,
      min_confidence,min_duration_seconds,direction,severity,cooldown_seconds,recipients,
      recording_policy,pre_roll_seconds,post_roll_seconds)
    VALUES (branch_tenant,NEW.id,'Banking AI - Dual control verification','dual-control-verification',is_vault_cam,
      '[]'::jsonb,0.65,0,'any','P1',30,'[]'::jsonb,'protect-window',30,120)
    RETURNING id INTO new_rule_id;
    INSERT INTO audit_events (tenant_id,action,outcome,details)
      VALUES (branch_tenant,'branch_opening_alert.default_created','success',
        jsonb_build_object('branchId',NEW.branch_node_id,'cameraId',NEW.id,'ruleId',new_rule_id,'severity','P1','enabled',is_vault_cam));
  END IF;
  RETURN NEW;
END;
$$;
