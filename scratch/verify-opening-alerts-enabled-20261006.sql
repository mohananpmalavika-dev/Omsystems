BEGIN READ ONLY;
SELECT n.name AS branch,p.enabled AS opening_enabled,p.state,p.schedule,
  count(r.id) AS camera_alert_rules,bool_and(r.enabled) AS all_camera_alerts_enabled,
  bool_and(r.severity='P1') AS all_p1
FROM resource_nodes n
JOIN nbfc_analytics_rules p ON p.tenant_id=n.tenant_id AND p.branch_ids=jsonb_build_array(n.id::text)
  AND p.template_id='tmpl-27-opening-staff-count'
JOIN cameras c ON c.branch_node_id=n.id
JOIN analytics_rules r ON r.camera_id=c.id AND r.tenant_id=n.tenant_id
  AND r.detection_type='dual-control-verification' AND r.archived_at IS NULL
WHERE n.tenant_id='00000000-0000-4000-8000-000000000001'
  AND n.id IN ('d7b23dee-9814-48c9-8805-48b61b33e3a9','921d336d-baa9-4b25-9f9f-f6542bba94cc',
    'd8467a57-dae8-4012-ba5e-c3254075aa61','6ddee070-9050-4f55-aaa1-1190654bbc6b')
GROUP BY n.name,p.enabled,p.state,p.schedule ORDER BY n.name;
COMMIT;
