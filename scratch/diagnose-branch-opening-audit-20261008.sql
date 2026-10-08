BEGIN READ ONLY;
SELECT occurred_at AT TIME ZONE 'Asia/Kolkata' AS time_ist,action,outcome,details FROM audit_events WHERE occurred_at>='2026-10-07 15:30:00+05:30' AND occurred_at<'2026-10-07 15:31:00+05:30' AND action <> 'edge_agent.discovery_bootstrap_requested' ORDER BY occurred_at;
SELECT updated_by,count(*) FROM nbfc_analytics_rules WHERE updated_at>='2026-10-07 15:30:00+05:30' AND updated_at<'2026-10-07 15:31:00+05:30' GROUP BY updated_by;
COMMIT;