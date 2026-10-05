BEGIN READ ONLY;
SELECT id, name FROM tenants;
SELECT c.id, cn.name, c.branch_node_id, n.name AS branch_name, n.tenant_id, c.status FROM cameras c JOIN resource_nodes n ON n.id=c.branch_node_id JOIN resource_nodes cn ON cn.id=c.resource_node_id ORDER BY n.name, cn.name;
SELECT id, tenant_id, camera_id, name, detection_type, enabled, severity, schedule, zone_id, min_confidence, min_duration_seconds, cooldown_seconds, recipients, recording_policy FROM analytics_rules WHERE detection_type IN ('person', 'after-hours-person', 'person-in-vault-after-hours') ORDER BY camera_id, detection_type;
SELECT tenant_id, branch_id, camera_id, detection_type, suppressed FROM alert_suppression_config WHERE detection_type IN ('person', 'after-hours-person') OR detection_type IS NULL;
SELECT id, tenant_id, name, detector_type, enabled, schedule, severity FROM nbfc_analytics_rules WHERE name ILIKE '%after%hour%';
COMMIT;
