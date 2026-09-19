-- Test banking analytics queries
\set tenant_id '00000000-0000-4000-8000-000000000001'
\set branch_id '00000000-0000-4000-8000-000000000104'
\set start_date '2026-09-01 00:00:00+00'

-- 1. Rules query
SELECT 
  r.id, r.name, r.detector_type, r.state, r.severity, r.actions,
  (SELECT COUNT(*) FROM nbfc_rule_state WHERE rule_id = r.id AND current_status = 'ACTIVE_ALERTING') as active_alerts,
  (SELECT COUNT(*) FROM nbfc_rule_state WHERE rule_id = r.id AND last_triggered_at >= :'start_date'::timestamptz) as triggers_in_period
FROM nbfc_analytics_rules r
WHERE r.tenant_id = :'tenant_id'::uuid
  AND r.enabled = true
  AND r.state IN ('ACTIVE', 'SHADOW')
  AND r.detector_type IN ('person', 'queue', 'crowd-density', 'anpr', 'zone', 'tailgating')
  AND (r.branch_ids IS NULL OR r.branch_ids = '[]'::jsonb OR r.branch_ids @> '["*"]'::jsonb OR r.branch_ids @> '["ALL"]'::jsonb OR r.branch_ids @> jsonb_build_array(:'branch_id'::text))
ORDER BY r.severity DESC, r.name;

-- 2. Realtime cash counter query
WITH counter_cameras AS (
  SELECT 
    c.id,
    COALESCE(cnode.name, c.model, c.id::text) as name,
    c.branch_node_id as branch_id,
    c.status,
    c.last_seen_at,
    COALESCE(b.name, bnode.name, 'Branch') as branch_name
  FROM cameras c
  JOIN resource_nodes cnode ON cnode.id = c.resource_node_id
  LEFT JOIN branches b ON b.id = c.branch_node_id
  LEFT JOIN resource_nodes bnode ON bnode.id = c.branch_node_id
  WHERE cnode.tenant_id = :'tenant_id'::uuid
    AND (
      cnode.name ~* 'counter|cash|teller'
      OR EXISTS (
        SELECT 1 FROM nbfc_analytics_zones z 
        WHERE z.camera_id = c.id::text 
          AND z.type = 'CASH_COUNTER' 
          AND z.enabled = true
      )
    )
    AND c.branch_node_id = :'branch_id'::uuid
),
latest_metrics AS (
  SELECT 
    rule_id,
    entity_key,
    current_status,
    current_metrics,
    last_evaluated_at,
    last_triggered_at
  FROM nbfc_rule_state
  WHERE last_evaluated_at >= NOW() - INTERVAL '10 minutes'
)
SELECT 
  cc.*,
  lm.current_status,
  lm.current_metrics,
  lm.last_evaluated_at,
  lm.last_triggered_at
FROM counter_cameras cc
LEFT JOIN latest_metrics lm ON lm.entity_key = cc.id::text OR lm.entity_key LIKE cc.id::text || '%'
ORDER BY cc.branch_name, cc.name;

-- 3. Cash Counter Analytics
WITH counter_cameras AS (
  SELECT 
    c.id,
    COALESCE(cnode.name, c.model, c.id::text) as name,
    c.branch_node_id as branch_id,
    c.status,
    COALESCE(b.name, bnode.name, 'Branch') as branch_name,
    CASE 
      WHEN c.status = 'online' THEN true
      ELSE false
    END as is_active
  FROM cameras c
  JOIN resource_nodes cnode ON cnode.id = c.resource_node_id
  LEFT JOIN branches b ON b.id = c.branch_node_id
  LEFT JOIN resource_nodes bnode ON bnode.id = c.branch_node_id
  WHERE cnode.tenant_id = :'tenant_id'::uuid
    AND (
      cnode.name ~* 'counter|cash|teller'
      OR EXISTS (
        SELECT 1 FROM nbfc_analytics_zones z 
        WHERE z.camera_id = c.id::text 
          AND z.type = 'CASH_COUNTER' 
          AND z.enabled = true
      )
    )
    AND c.branch_node_id = :'branch_id'::uuid
),
counter_alerts AS (
  SELECT 
    a.camera_id,
    a.severity,
    a.status,
    a.created_at
  FROM alerts a
  WHERE a.tenant_id = :'tenant_id'::uuid
    AND a.created_at >= :'start_date'::timestamptz
    AND a.alert_type IN ('crowd_density', 'queue_length', 'person_count', 'unattended_counter', 'cash-counter-monitoring', 'teller-presence')
    AND a.branch_id = :'branch_id'::text
)
SELECT 
  COUNT(DISTINCT cc.id) FILTER (WHERE cc.is_active) as active_counters,
  COUNT(DISTINCT ca.camera_id) FILTER (WHERE ca.severity IN ('HIGH', 'CRITICAL', 'P1', 'P2') AND ca.status IN ('open', 'NEW', 'active')) as counters_with_alerts,
  COUNT(*) FILTER (WHERE ca.severity IN ('CRITICAL', 'P1')) as critical_alerts_today,
  COUNT(*) FILTER (WHERE ca.created_at >= NOW() - INTERVAL '1 hour') as alerts_last_hour
FROM counter_cameras cc
LEFT JOIN counter_alerts ca ON ca.camera_id = cc.id::text;

-- 4. Vault & Locker Query
WITH vault_zones AS (
  SELECT 
    z.id,
    z.name,
    z.camera_id,
    z.branch_id,
    z.type,
    z.enabled
  FROM nbfc_analytics_zones z
  WHERE z.tenant_id = :'tenant_id'::uuid
    AND z.type IN ('LOCKER', 'STRONG_ROOM', 'RESTRICTED_AREA')
    AND z.enabled = true
    AND z.branch_id = :'branch_id'::text
),
vault_rules AS (
  SELECT 
    r.id,
    r.name,
    r.zone_id,
    s.current_status,
    s.last_triggered_at,
    s.entity_key
  FROM nbfc_analytics_rules r
  LEFT JOIN nbfc_rule_state s ON s.rule_id = r.id
  WHERE r.tenant_id = :'tenant_id'::uuid
    AND r.enabled = true
    AND r.detector_type IN ('person', 'zone')
    AND (r.zone_id IN (SELECT id FROM vault_zones) OR r.name ~* 'vault|locker|strong')
    AND (r.branch_ids IS NULL OR r.branch_ids = '[]'::jsonb OR r.branch_ids @> '["*"]'::jsonb OR r.branch_ids @> '["ALL"]'::jsonb OR r.branch_ids @> jsonb_build_array(:'branch_id'::text))
),
vault_alerts AS (
  SELECT 
    a.severity,
    a.status,
    a.created_at,
    a.branch_id
  FROM alerts a
  WHERE a.tenant_id = :'tenant_id'::uuid
    AND a.created_at >= :'start_date'::timestamptz
    AND (a.alert_type ~* 'vault|locker|occupancy|after.hours' OR a.zone_type IN ('LOCKER', 'STRONG_ROOM'))
    AND a.branch_id = :'branch_id'::text
)
SELECT 
  (SELECT COUNT(DISTINCT vz.id) FROM vault_zones vz) as total_vault_zones,
  (SELECT COUNT(DISTINCT vr.id) FROM vault_rules vr) as active_vault_rules,
  (SELECT COUNT(DISTINCT vr.entity_key) FROM vault_rules vr WHERE vr.current_status = 'ACTIVE_ALERTING') as zones_in_alert,
  (SELECT COUNT(*) FROM vault_alerts va WHERE va.severity IN ('CRITICAL', 'P1') AND va.status IN ('open', 'NEW', 'active')) as critical_vault_alerts,
  (SELECT COUNT(*) FROM vault_alerts va WHERE va.created_at >= NOW() - INTERVAL '1 hour') as vault_alerts_last_hour,
  (SELECT MAX(vr.last_triggered_at) FROM vault_rules vr) as last_vault_trigger;

-- 5. Queue query
WITH queue_alerts AS (
  SELECT 
    a.camera_id,
    a.severity,
    a.status,
    a.created_at,
    a.metadata
  FROM alerts a
  WHERE a.tenant_id = :'tenant_id'::uuid
    AND a.created_at >= :'start_date'::timestamptz
    AND a.alert_type IN ('queue_length', 'queue_wait_time', 'crowd_density', 'atm-queue')
    AND a.branch_id = :'branch_id'::text
),
queue_rules AS (
  SELECT 
    r.id,
    r.condition,
    s.current_metrics
  FROM nbfc_analytics_rules r
  LEFT JOIN nbfc_rule_state s ON s.rule_id = r.id
  WHERE r.tenant_id = :'tenant_id'::uuid
    AND r.enabled = true
    AND r.detector_type IN ('queue', 'crowd-density')
    AND s.last_evaluated_at >= NOW() - INTERVAL '5 minutes'
    AND (r.branch_ids IS NULL OR r.branch_ids = '[]'::jsonb OR r.branch_ids @> '["*"]'::jsonb OR r.branch_ids @> '["ALL"]'::jsonb OR r.branch_ids @> jsonb_build_array(:'branch_id'::text))
)
SELECT 
  COUNT(DISTINCT qa.camera_id) as cameras_with_queues,
  COUNT(*) FILTER (WHERE qa.severity IN ('HIGH', 'CRITICAL', 'P1', 'P2')) as queue_sla_breaches,
  COUNT(*) FILTER (WHERE qa.status IN ('open', 'NEW', 'active')) as active_queue_alerts,
  COALESCE(AVG(CAST(qa.metadata->>'queue_length' AS INTEGER)) FILTER (WHERE qa.metadata->>'queue_length' IS NOT NULL), 0) as avg_queue_length,
  COALESCE(AVG(CAST(qa.metadata->>'wait_time_seconds' AS INTEGER)) FILTER (WHERE qa.metadata->>'wait_time_seconds' IS NOT NULL), 0) as avg_wait_seconds,
  COALESCE(MAX(CAST(qa.metadata->>'queue_length' AS INTEGER)) FILTER (WHERE qa.metadata->>'queue_length' IS NOT NULL), 0) as peak_queue_length
FROM queue_alerts qa;

-- 6. ATM query
WITH atm_cameras AS (
  SELECT 
    c.id,
    COALESCE(cnode.name, c.model, c.id::text) as name,
    c.branch_node_id as branch_id,
    c.status
  FROM cameras c
  JOIN resource_nodes cnode ON cnode.id = c.resource_node_id
  WHERE cnode.tenant_id = :'tenant_id'::uuid
    AND (
      cnode.name ~* 'atm|kiosk'
      OR EXISTS (
        SELECT 1 FROM nbfc_analytics_zones z 
        WHERE z.camera_id = c.id::text 
          AND z.type = 'ATM_AREA' 
          AND z.enabled = true
      )
    )
    AND c.branch_node_id = :'branch_id'::uuid
),
atm_alerts AS (
  SELECT 
    a.camera_id,
    a.severity,
    a.status,
    a.alert_type,
    a.created_at
  FROM alerts a
  WHERE a.tenant_id = :'tenant_id'::uuid
    AND a.created_at >= :'start_date'::timestamptz
    AND (a.alert_type ~* 'atm|tamper|loiter' OR a.zone_type = 'ATM_AREA')
    AND a.branch_id = :'branch_id'::text
)
SELECT 
  (SELECT COUNT(DISTINCT ac.id) FROM atm_cameras ac) as total_atm_cameras,
  (SELECT COUNT(DISTINCT ac.id) FROM atm_cameras ac WHERE ac.status = 'online') as online_atm_cameras,
  (SELECT COUNT(*) FROM atm_alerts aa WHERE aa.severity IN ('CRITICAL', 'P1') AND aa.status IN ('open', 'NEW', 'active')) as critical_atm_alerts,
  (SELECT COUNT(*) FROM atm_alerts aa WHERE aa.alert_type ~* 'tamper') as tampering_incidents,
  (SELECT COUNT(*) FROM atm_alerts aa WHERE aa.alert_type ~* 'loiter') as loitering_incidents;

-- 7. Security posture query
WITH branch_cameras AS (
  SELECT 
    c.branch_node_id as branch_id,
    COUNT(*) as total_cameras,
    COUNT(*) FILTER (WHERE c.status = 'online') as online_cameras,
    COUNT(*) FILTER (WHERE c.status = 'offline') as offline_cameras
  FROM cameras c
  JOIN resource_nodes cnode ON cnode.id = c.resource_node_id
  WHERE cnode.tenant_id = :'tenant_id'::uuid
    AND c.branch_node_id = :'branch_id'::uuid
  GROUP BY c.branch_node_id
),
branch_alerts AS (
  SELECT 
    a.branch_id,
    COUNT(*) FILTER (WHERE a.severity IN ('CRITICAL', 'P1') AND a.status IN ('open', 'NEW', 'active')) as critical_open,
    COUNT(*) FILTER (WHERE a.severity IN ('HIGH', 'P2') AND a.status IN ('open', 'NEW', 'active')) as high_open,
    COUNT(*) FILTER (WHERE a.created_at >= :'start_date'::timestamptz) as total_in_period
  FROM alerts a
  WHERE a.tenant_id = :'tenant_id'::uuid
    AND a.branch_id = :'branch_id'::text
  GROUP BY a.branch_id
)
SELECT 
  COALESCE(SUM(bc.total_cameras), 0) as total_cameras,
  COALESCE(SUM(bc.online_cameras), 0) as online_cameras,
  COALESCE(SUM(bc.offline_cameras), 0) as offline_cameras,
  COALESCE(SUM(ba.critical_open), 0) as critical_alerts,
  COALESCE(SUM(ba.high_open), 0) as high_alerts,
  COALESCE(SUM(ba.total_in_period), 0) as total_alerts_period,
  ROUND(AVG(CASE WHEN bc.total_cameras > 0 THEN (bc.online_cameras::float / bc.total_cameras * 100) ELSE 0 END)::numeric, 1) as avg_camera_availability
FROM branch_cameras bc
LEFT JOIN branch_alerts ba ON ba.branch_id = bc.branch_id::text;
