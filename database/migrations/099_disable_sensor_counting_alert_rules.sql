-- ==============================================================================
-- 099: Disable Non-Threat Counting and Sensor Alert Rules & Resolve False Alarms
-- ==============================================================================

-- 1. Disable informational counting and generic sensor detector rules in analytics_rules
UPDATE analytics_rules
SET enabled = false, updated_at = NOW()
WHERE detection_type IN (
  'footfall',
  'person-counting',
  'occupancy-counting',
  'object',
  'person',
  'vehicle',
  'face'
);

-- 2. Mark existing active counting/sensor metric alerts as false_alarm with audit justification
UPDATE analytics_alerts
SET status = 'false_alarm',
    false_alarm_reason = 'Automated sensor / counting metric suppressed as false security alarm',
    resolved_at = NOW(),
    updated_at = NOW()
WHERE status IN ('new', 'acknowledged', 'investigating')
  AND title IN (
    'Footfall detected',
    'Person detected',
    'Occupancy counting detected',
    'Person counting detected',
    'Object detected',
    'Vehicle detected',
    'Face detected'
  );
