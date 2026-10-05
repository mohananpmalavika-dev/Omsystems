-- Provision opening controls atomically on every insertion path, including
-- manual registration, discovery, imports and direct recorder-channel inserts.
-- Existing branch overrides and camera rules are never rewritten here.
UPDATE nbfc_rule_templates
SET metadata = COALESCE(metadata, '{}'::jsonb) ||
  '{"defaultOpeningStart":"08:00","defaultOpeningEnd":"11:00","defaultOpeningTimezone":"Asia/Kolkata","defaultOpeningDays":[1,2,3,4,5,6],"defaultOpeningEnabled":true}'::jsonb
WHERE id = 'tmpl-27-opening-staff-count';

CREATE OR REPLACE FUNCTION ensure_default_branch_opening_policy(p_tenant_id uuid, p_branch_id uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  policy nbfc_analytics_rules%ROWTYPE;
  template nbfc_rule_templates%ROWTYPE;
  snapshot jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM resource_nodes
    WHERE id=p_branch_id AND tenant_id=p_tenant_id AND node_type='branch') THEN
    RAISE EXCEPTION 'Opening policy requires a branch in the same tenant';
  END IF;
  -- Serialize two simultaneous camera additions in a pre-existing branch.
  PERFORM pg_advisory_xact_lock(hashtextextended('opening-default:' || p_branch_id::text, 0));
  SELECT * INTO policy FROM nbfc_analytics_rules
    WHERE tenant_id=p_tenant_id AND template_id='tmpl-27-opening-staff-count'
      AND branch_ids @> jsonb_build_array(p_branch_id::text)
    ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN policy.id; END IF;
  SELECT * INTO STRICT template FROM nbfc_rule_templates WHERE id='tmpl-27-opening-staff-count';
  INSERT INTO nbfc_analytics_rules (
    tenant_id,name,description,enabled,state,branch_ids,camera_ids,detector_type,
    condition,duration_ms,schedule,severity,cooldown_ms,actions,template_id,scope_type,created_by,updated_by
  ) VALUES (
    p_tenant_id,template.name,template.description,true,'ACTIVE',jsonb_build_array(p_branch_id::text),'[]'::jsonb,'person',
    '{"metric":"staff_count","operator":"LESS_THAN","value":2}'::jsonb,0,
    jsonb_build_object('type','BRANCH_OPENING',
      'start',COALESCE(template.metadata->>'defaultOpeningStart','08:00'),
      'end',COALESCE(template.metadata->>'defaultOpeningEnd','11:00'),
      'timezone',COALESCE(template.metadata->>'defaultOpeningTimezone','Asia/Kolkata'),
      'days',COALESCE(template.metadata->'defaultOpeningDays','[1,2,3,4,5,6]'::jsonb)),
    'CRITICAL',600000,template.default_actions,template.id,'BRANCH','automatic-opening-default','automatic-opening-default'
  ) RETURNING * INTO policy;
  snapshot := jsonb_build_object(
    'id',policy.id,'tenantId',policy.tenant_id,'name',policy.name,'description',policy.description,
    'enabled',policy.enabled,'state',policy.state,'branchIds',policy.branch_ids,'cameraIds',policy.camera_ids,
    'detectorType',policy.detector_type,'condition',policy.condition,'durationMs',policy.duration_ms,
    'schedule',policy.schedule,'severity',policy.severity,'cooldownMs',policy.cooldown_ms,'actions',policy.actions,
    'version',policy.version,'templateId',policy.template_id,'scopeType',policy.scope_type,
    'createdBy',policy.created_by,'updatedBy',policy.updated_by,'createdAt',policy.created_at,'updatedAt',policy.updated_at,
    'triggersToday',0,'falsePositivesToday',0);
  INSERT INTO nbfc_rule_versions (rule_id,version,rule_snapshot,change_reason,changed_by)
    VALUES (policy.id,policy.version,snapshot,'Default opening policy for a new branch or camera','automatic-opening-default');
  INSERT INTO audit_events (tenant_id,action,outcome,details)
    VALUES (p_tenant_id,'branch_opening_policy.default_created','success',
      jsonb_build_object('branchId',p_branch_id,'ruleId',policy.id,'rule',snapshot));
  RETURN policy.id;
END;
$$;

CREATE OR REPLACE FUNCTION provision_new_branch_opening_default()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ensure_default_branch_opening_policy(NEW.tenant_id,NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION provision_new_camera_opening_default()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  branch_tenant uuid;
  new_rule_id uuid;
BEGIN
  SELECT branch.tenant_id INTO STRICT branch_tenant
    FROM resource_nodes branch JOIN resource_nodes camera_node
      ON camera_node.id=NEW.resource_node_id AND camera_node.tenant_id=branch.tenant_id
    WHERE branch.id=NEW.branch_node_id AND branch.node_type='branch';
  PERFORM ensure_default_branch_opening_policy(branch_tenant,NEW.branch_node_id);
  IF NOT EXISTS (SELECT 1 FROM analytics_rules WHERE tenant_id=branch_tenant
    AND camera_id=NEW.id AND detection_type='dual-control-verification' AND archived_at IS NULL) THEN
    INSERT INTO analytics_rules (tenant_id,camera_id,name,detection_type,enabled,object_classes,
      min_confidence,min_duration_seconds,direction,severity,cooldown_seconds,recipients,
      recording_policy,pre_roll_seconds,post_roll_seconds)
    VALUES (branch_tenant,NEW.id,'Banking AI - Dual control verification','dual-control-verification',true,
      '[]'::jsonb,0.65,0,'any','P1',30,'[]'::jsonb,'protect-window',30,120)
    RETURNING id INTO new_rule_id;
    INSERT INTO audit_events (tenant_id,action,outcome,details)
      VALUES (branch_tenant,'branch_opening_alert.default_created','success',
        jsonb_build_object('branchId',NEW.branch_node_id,'cameraId',NEW.id,'ruleId',new_rule_id,'severity','P1'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provision_branch_opening_default ON resource_nodes;
CREATE TRIGGER provision_branch_opening_default AFTER INSERT ON resource_nodes
  FOR EACH ROW WHEN (NEW.node_type='branch') EXECUTE FUNCTION provision_new_branch_opening_default();
DROP TRIGGER IF EXISTS provision_camera_opening_default ON cameras;
CREATE TRIGGER provision_camera_opening_default AFTER INSERT ON cameras
  FOR EACH ROW EXECUTE FUNCTION provision_new_camera_opening_default();
