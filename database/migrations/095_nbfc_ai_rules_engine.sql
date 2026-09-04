-- 095_nbfc_ai_rules_engine.sql
-- NBFC AI Analytics + Visual Rule Engine & Zone Designer Schema

-- 1. Authoritative Zones Table
CREATE TABLE IF NOT EXISTS nbfc_analytics_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id text NOT NULL,
  camera_id text NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN (
    'CUSTOMER_AREA', 'QUEUE_AREA', 'CASH_COUNTER', 'STAFF_AREA',
    'RESTRICTED_AREA', 'LOCKER', 'STRONG_ROOM', 'SERVER_ROOM',
    'ENTRANCE', 'EXIT', 'CASH_VAN_AREA', 'ATM_AREA', 'CUSTOM'
  )),
  polygon jsonb NOT NULL, -- Array of {x: number, y: number} normalized 0.0 to 1.0
  enabled boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nbfc_zones_camera ON nbfc_analytics_zones(camera_id);
CREATE INDEX IF NOT EXISTS idx_nbfc_zones_tenant_branch ON nbfc_analytics_zones(tenant_id, branch_id);

-- 2. Authoritative Rules Table
CREATE TABLE IF NOT EXISTS nbfc_analytics_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN (
    'ACTIVE', 'SHADOW', 'INACTIVE', 'PENDING', 'COOLDOWN', 'SUPPRESSED'
  )),
  branch_ids jsonb NOT NULL DEFAULT '[]'::jsonb, -- Empty array means all branches or inherited
  camera_ids jsonb NOT NULL DEFAULT '[]'::jsonb, -- Empty array means all cameras in branch
  zone_id uuid REFERENCES nbfc_analytics_zones(id) ON DELETE SET NULL,
  detector_type text NOT NULL,
  condition jsonb NOT NULL, -- Compound condition tree with metrics, operators, values, AND/OR logic
  duration_ms integer NOT NULL DEFAULT 0, -- Time threshold condition must persist before trigger
  schedule_id uuid,
  schedule jsonb NOT NULL DEFAULT '{"type": "24X7"}'::jsonb, -- Schedule definition
  severity text NOT NULL CHECK (severity IN ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  cooldown_ms integer NOT NULL DEFAULT 60000, -- Minimum time before rule re-alerts
  actions jsonb NOT NULL DEFAULT '["CREATE_ALERT"]'::jsonb, -- Array of actions
  version integer NOT NULL DEFAULT 1,
  template_id text, -- ID of source template if created from template
  scope_type text NOT NULL DEFAULT 'CAMERA' CHECK (scope_type IN ('CAMERA', 'BRANCH', 'REGION', 'GLOBAL')),
  parent_rule_id uuid REFERENCES nbfc_analytics_rules(id) ON DELETE SET NULL, -- For inheritance/overrides
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nbfc_rules_tenant_state ON nbfc_analytics_rules(tenant_id, state);
CREATE INDEX IF NOT EXISTS idx_nbfc_rules_detector ON nbfc_analytics_rules(detector_type);
CREATE INDEX IF NOT EXISTS idx_nbfc_rules_zone ON nbfc_analytics_rules(zone_id);

-- 3. Rule Version History (Audit Log of Modifications)
CREATE TABLE IF NOT EXISTS nbfc_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES nbfc_analytics_rules(id) ON DELETE CASCADE,
  version integer NOT NULL,
  rule_snapshot jsonb NOT NULL,
  change_reason text,
  changed_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nbfc_rule_versions_rule ON nbfc_rule_versions(rule_id, version);

-- 4. Distributed Runtime Rule State (Authoritative Deduplication & Monotonic Fencing)
CREATE TABLE IF NOT EXISTS nbfc_rule_state (
  rule_id uuid NOT NULL REFERENCES nbfc_analytics_rules(id) ON DELETE CASCADE,
  entity_key text NOT NULL, -- e.g. '{camera_id}' or '{camera_id}:{zone_id}'
  current_status text NOT NULL DEFAULT 'IDLE' CHECK (current_status IN (
    'IDLE', 'CONDITION_MET_PENDING_DURATION', 'ACTIVE_ALERTING', 'COOLDOWN', 'RESOLVED', 'SUPPRESSED'
  )),
  first_condition_met_at timestamptz,
  last_evaluated_at timestamptz NOT NULL DEFAULT now(),
  last_triggered_at timestamptz,
  active_alert_id uuid,
  fencing_token bigint NOT NULL DEFAULT 0,
  current_metrics jsonb DEFAULT '{}'::jsonb,
  PRIMARY KEY (rule_id, entity_key)
);

CREATE INDEX IF NOT EXISTS idx_nbfc_rule_state_status ON nbfc_rule_state(current_status);

-- 5. False Positive Feedback
CREATE TABLE IF NOT EXISTS nbfc_rule_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES nbfc_analytics_rules(id) ON DELETE SET NULL,
  alert_id text,
  camera_id text,
  reason text NOT NULL CHECK (reason IN (
    'reflection', 'poster_or_image', 'staff_movement', 'camera_angle_issue',
    'threshold_too_sensitive', 'lighting_change', 'other'
  )),
  comment text,
  submitted_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nbfc_feedback_rule ON nbfc_rule_feedback(rule_id);

-- 6. Rule Historical Simulation / Test Results
CREATE TABLE IF NOT EXISTS nbfc_rule_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES nbfc_analytics_rules(id) ON DELETE CASCADE,
  tested_by text NOT NULL,
  time_range_start timestamptz NOT NULL,
  time_range_end timestamptz NOT NULL,
  trigger_count integer NOT NULL DEFAULT 0,
  longest_event_seconds integer NOT NULL DEFAULT 0,
  potential_false_positives integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Rule Templates Catalog
CREATE TABLE IF NOT EXISTS nbfc_rule_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'VAULT_LOCKER', 'CASH_OPERATIONS', 'ACCESS_PERIMETER',
    'HEALTH_SAFETY', 'HARDWARE_CONTINUITY', 'ANPR_LOGISTICS'
  )),
  description text NOT NULL,
  detector_type text NOT NULL,
  default_condition jsonb NOT NULL,
  default_duration_ms integer NOT NULL DEFAULT 0,
  default_severity text NOT NULL,
  default_cooldown_ms integer NOT NULL DEFAULT 60000,
  default_actions jsonb NOT NULL,
  recommended_zone_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_schedule text NOT NULL DEFAULT 'BUSINESS_HOURS',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Pre-seed All 36 NBFC Templates
INSERT INTO nbfc_rule_templates (
  id, name, category, description, detector_type, default_condition,
  default_duration_ms, default_severity, default_cooldown_ms, default_actions,
  recommended_zone_types, suggested_schedule, metadata
) VALUES
('tmpl-01-locker-max-occupancy', 'Locker / Vault Maximum Occupancy', 'VAULT_LOCKER',
 'Detects when more than allowed persons are present inside the locker or strong-room area.',
 'person', '{"metric": "person_count", "operator": "GREATER_THAN", "value": 2}'::jsonb,
 5000, 'CRITICAL', 60000, '["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "NOTIFY_SOC"]'::jsonb,
 '["LOCKER", "STRONG_ROOM"]'::jsonb, 'BUSINESS_HOURS', '{"targetThreshold": 2, "unit": "persons"}'::jsonb),

('tmpl-02-minimum-personnel', 'Minimum Personnel / Dual Control', 'VAULT_LOCKER',
 'Enforces mandatory dual-control staffing during active locker/vault operations.',
 'person', '{"logical": "AND", "conditions": [{"metric": "vault_operation_active", "operator": "EQUALS", "value": true}, {"metric": "person_count", "operator": "LESS_THAN", "value": 2}]}'::jsonb,
 10000, 'CRITICAL', 60000, '["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "NOTIFY_SOC", "NOTIFY_BRANCH_MANAGER"]'::jsonb,
 '["LOCKER", "STRONG_ROOM"]'::jsonb, 'BUSINESS_HOURS', '{"requiredStaff": 2}'::jsonb),

('tmpl-03-after-hours-person', 'After-Hours Person Detection', 'ACCESS_PERIMETER',
 'Detects presence of any unauthorized person inside the branch or vault outside operating hours.',
 'person', '{"metric": "person_count", "operator": "GREATER_THAN_OR_EQUAL", "value": 1}'::jsonb,
 3000, 'CRITICAL', 30000, '["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "POPUP_LIVE_VIEW", "NOTIFY_SOC"]'::jsonb,
 '["LOCKER", "CASH_COUNTER", "CUSTOMER_AREA", "SERVER_ROOM", "RESTRICTED_AREA"]'::jsonb, 'AFTER_HOURS', '{"threatLevel": "intrusion"}'::jsonb),

('tmpl-04-cash-counter-crowd', 'Cash Counter Crowd Density', 'CASH_OPERATIONS',
 'Detects overcrowding in front of cash counters exceeding service thresholds.',
 'crowd-density', '{"metric": "person_count", "operator": "GREATER_THAN", "value": 5}'::jsonb,
 60000, 'WARNING', 120000, '["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER"]'::jsonb,
 '["QUEUE_AREA", "CASH_COUNTER", "CUSTOMER_AREA"]'::jsonb, 'BUSINESS_HOURS', '{"crowdThreshold": 5}'::jsonb),

('tmpl-05-customer-queue-length', 'Customer Queue Length SLA', 'CASH_OPERATIONS',
 'Alerts branch operations when service queue length exceeds customer service limits.',
 'queue', '{"metric": "queue_length", "operator": "GREATER_THAN", "value": 8}'::jsonb,
 180000, 'MEDIUM', 300000, '["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER"]'::jsonb,
 '["QUEUE_AREA", "CUSTOMER_AREA"]'::jsonb, 'BUSINESS_HOURS', '{"maxQueue": 8}'::jsonb),

('tmpl-06-customer-waiting-time', 'Customer Waiting Time SLA', 'CASH_OPERATIONS',
 'Tracks anonymous customer dwell time between entry into waiting area and service counter.',
 'queue', '{"metric": "waiting_time_seconds", "operator": "GREATER_THAN", "value": 300}'::jsonb,
 0, 'WARNING', 180000, '["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER"]'::jsonb,
 '["QUEUE_AREA", "CUSTOMER_AREA"]'::jsonb, 'BUSINESS_HOURS', '{"maxWaitSeconds": 300}'::jsonb),

('tmpl-07-counter-unattended', 'Cash Counter Unattended', 'CASH_OPERATIONS',
 'Alerts when customers are waiting at cash counter but staff zone remains empty.',
 'person', '{"logical": "AND", "conditions": [{"metric": "customer_waiting_count", "operator": "GREATER_THAN", "value": 0}, {"metric": "staff_zone_count", "operator": "EQUALS", "value": 0}]}'::jsonb,
 120000, 'WARNING', 180000, '["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER"]'::jsonb,
 '["CASH_COUNTER", "STAFF_AREA"]'::jsonb, 'BUSINESS_HOURS', '{"maxUnattendedSeconds": 120}'::jsonb),

('tmpl-08-restricted-cash-area-entry', 'Restricted Cash Area Intrusion', 'CASH_OPERATIONS',
 'Detects any person crossing from public customer hall directly into secure cash/teller enclosure.',
 'zone', '{"metric": "transition", "operator": "ENTERED_ZONE", "value": "RESTRICTED_AREA"}'::jsonb,
 0, 'HIGH', 60000, '["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "NOTIFY_SOC"]'::jsonb,
 '["RESTRICTED_AREA", "STAFF_AREA"]'::jsonb, 'BUSINESS_HOURS', '{"direction": "public_to_staff"}'::jsonb),

('tmpl-09-tailgating', 'Tailgating Detection', 'ACCESS_PERIMETER',
 'Detects an unauthorized follower trailing behind an authorized access event.',
 'tailgating', '{"metric": "follower_gap_ms", "operator": "LESS_THAN_OR_EQUAL", "value": 2000}'::jsonb,
 0, 'HIGH', 30000, '["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "NOTIFY_SOC"]'::jsonb,
 '["ENTRANCE", "LOCKER", "SERVER_ROOM", "STAFF_AREA"]'::jsonb, '24X7', '{"visionFallback": true}'::jsonb),

('tmpl-10-loitering', 'Zone Loitering', 'ACCESS_PERIMETER',
 'Identifies individuals lingering in high-risk zones (ATM, locker corridor) beyond threshold.',
 'zone', '{"metric": "dwell_time_seconds", "operator": "GREATER_THAN", "value": 300}'::jsonb,
 300000, 'MEDIUM', 180000, '["CREATE_ALERT", "CAPTURE_SNAPSHOT", "NOTIFY_BRANCH_MANAGER"]'::jsonb,
 '["ATM_AREA", "ENTRANCE", "LOCKER"]'::jsonb, '24X7', '{"dwellSeconds": 300}'::jsonb),

('tmpl-11-restricted-zone-intrusion', 'Restricted Zone Intrusion', 'ACCESS_PERIMETER',
 'Immediate alarm when unauthorized presence is detected inside defined restricted security perimeter.',
 'zone', '{"metric": "intrusion_detected", "operator": "EQUALS", "value": true}'::jsonb,
 0, 'CRITICAL', 30000, '["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "POPUP_LIVE_VIEW", "NOTIFY_SOC"]'::jsonb,
 '["RESTRICTED_AREA", "LOCKER", "SERVER_ROOM"]'::jsonb, '24X7', '{}'::jsonb),

('tmpl-12-line-crossing', 'Directional Line Crossing', 'ACCESS_PERIMETER',
 'Triggers when an entity crosses a virtual boundary in a restricted direction (A->B, B->A, Both).',
 'zone', '{"metric": "line_crossing", "operator": "CROSSED_LINE", "value": "A_TO_B"}'::jsonb,
 0, 'HIGH', 30000, '["CREATE_ALERT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP"]'::jsonb,
 '["ENTRANCE", "LOCKER", "RESTRICTED_AREA"]'::jsonb, '24X7', '{"direction": "A_TO_B"}'::jsonb),

('tmpl-13-door-held-open', 'Door Held Open Alarm', 'ACCESS_PERIMETER',
 'Detects secure vault, server room, or perimeter door remaining open beyond policy limit.',
 'zone', '{"metric": "door_open_seconds", "operator": "GREATER_THAN", "value": 60}'::jsonb,
 60000, 'MEDIUM', 120000, '["CREATE_ALERT", "NOTIFY_SOC", "NOTIFY_BRANCH_MANAGER"]'::jsonb,
 '["LOCKER", "SERVER_ROOM", "ENTRANCE"]'::jsonb, '24X7', '{"maxOpenSeconds": 60}'::jsonb),

('tmpl-14-camera-tamper', 'Camera Tampering / Scene Shift', 'HARDWARE_CONTINUITY',
 'Identifies sudden camera redirection, spray paint, cloth obstruction, or heavy blur.',
 'camera-tamper', '{"metric": "tamper_detected", "operator": "EQUALS", "value": true}'::jsonb,
 5000, 'HIGH', 60000, '["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "NOTIFY_SOC"]'::jsonb,
 '["ALL"]'::jsonb, '24X7', '{}'::jsonb),

('tmpl-15-camera-obstruction', 'Camera Optical Obstruction', 'HARDWARE_CONTINUITY',
 'Detects persistent physical objects blocking more than configured percentage of camera frame.',
 'camera-tamper', '{"metric": "obstruction_percent", "operator": "GREATER_THAN", "value": 70}'::jsonb,
 10000, 'HIGH', 120000, '["CREATE_ALERT", "CAPTURE_SNAPSHOT", "NOTIFY_SOC"]'::jsonb,
 '["ALL"]'::jsonb, '24X7', '{"obstructionThreshold": 70}'::jsonb),

('tmpl-16-camera-offline-business-hours', 'Camera Offline in Business Hours', 'HARDWARE_CONTINUITY',
 'Immediate critical alert if a CCTV camera drops offline during active business hours.',
 'health', '{"metric": "health_status", "operator": "EQUALS", "value": "OFFLINE"}'::jsonb,
 30000, 'CRITICAL', 60000, '["CREATE_ALERT", "CREATE_INCIDENT", "NOTIFY_SOC", "NOTIFY_BRANCH_MANAGER"]'::jsonb,
 '["LOCKER", "CASH_COUNTER", "CUSTOMER_AREA", "ALL"]'::jsonb, 'BUSINESS_HOURS', '{}'::jsonb),

('tmpl-17-recording-failure', 'Continuous Recording Failure', 'HARDWARE_CONTINUITY',
 'Alerts within seconds if video segment write stream fails on critical security camera.',
 'recording', '{"metric": "recording_gap_seconds", "operator": "GREATER_THAN", "value": 15}'::jsonb,
 15000, 'CRITICAL', 60000, '["CREATE_ALERT", "CREATE_INCIDENT", "NOTIFY_SOC"]'::jsonb,
 '["LOCKER", "CASH_COUNTER", "ALL"]'::jsonb, '24X7', '{"maxGapSeconds": 15}'::jsonb),

('tmpl-18-person-fall', 'Person Fall / Medical Event', 'HEALTH_SAFETY',
 'Detects rapid downward vertical trajectory and sustained immobility indicating a fall.',
 'fall', '{"metric": "fall_detected", "operator": "EQUALS", "value": true}'::jsonb,
 5000, 'HIGH', 60000, '["CREATE_ALERT", "POPUP_LIVE_VIEW", "NOTIFY_BRANCH_MANAGER"]'::jsonb,
 '["CUSTOMER_AREA", "STAFF_AREA"]'::jsonb, 'BUSINESS_HOURS', '{"validationStatus": "EXPERIMENTAL"}'::jsonb),

('tmpl-19-smoke-fire', 'Optical Smoke / Flame Detection', 'HEALTH_SAFETY',
 'Supplementary early optical smoke/fire detection across branches (auxiliary to physical alarms).',
 'smoke-fire', '{"metric": "flame_or_smoke_detected", "operator": "EQUALS", "value": true}'::jsonb,
 3000, 'CRITICAL', 30000, '["CREATE_ALERT", "CREATE_INCIDENT", "POPUP_LIVE_VIEW", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "NOTIFY_SOC"]'::jsonb,
 '["LOCKER", "SERVER_ROOM", "CUSTOMER_AREA", "ALL"]'::jsonb, '24X7', '{"auxiliaryOnly": true}'::jsonb),

('tmpl-20-left-object', 'Unattended Baggage / Left Object', 'ACCESS_PERIMETER',
 'Detects static packages, bags, or items left unattended in public or secure corridors.',
 'unattended-object', '{"metric": "stationary_duration_seconds", "operator": "GREATER_THAN", "value": 300}'::jsonb,
 300000, 'MEDIUM', 300000, '["CREATE_ALERT", "CAPTURE_SNAPSHOT", "NOTIFY_BRANCH_MANAGER"]'::jsonb,
 '["CUSTOMER_AREA", "LOCKER", "ATM_AREA", "ENTRANCE"]'::jsonb, '24X7', '{"minDwellSeconds": 300}'::jsonb),

('tmpl-21-object-removal', 'Protected Asset Removal', 'ACCESS_PERIMETER',
 'Alerts when high-value IT equipment, safe, or hardware asset disappears from monitored ROI.',
 'object', '{"metric": "object_state", "operator": "OBJECT_REMOVED", "value": "protected_asset"}'::jsonb,
 5000, 'HIGH', 120000, '["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "NOTIFY_SOC"]'::jsonb,
 '["SERVER_ROOM", "STAFF_AREA"]'::jsonb, '24X7', '{}'::jsonb),

('tmpl-22-cash-counter-object', 'Cash Counter Handover Event', 'CASH_OPERATIONS',
 'Monitors package, bag, or cash pouch placement on teller trays for transaction correlation.',
 'object', '{"metric": "handover_event", "operator": "EQUALS", "value": true}'::jsonb,
 0, 'INFO', 10000, '["AUDIT_EVENT"]'::jsonb,
 '["CASH_COUNTER"]'::jsonb, 'BUSINESS_HOURS', '{"noCurrencyAmountEstimation": true}'::jsonb),

('tmpl-23-cash-movement-escort', 'Cash Movement Escort Verification', 'CASH_OPERATIONS',
 'Ensures mandatory two-guard armed escort protocol is maintained throughout internal cash movement.',
 'person', '{"logical": "AND", "conditions": [{"metric": "cash_movement_in_progress", "operator": "EQUALS", "value": true}, {"metric": "person_count", "operator": "LESS_THAN", "value": 2}]}'::jsonb,
 5000, 'CRITICAL', 60000, '["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "NOTIFY_SOC"]'::jsonb,
 '["CASH_COUNTER", "LOCKER", "RESTRICTED_AREA"]'::jsonb, 'BUSINESS_HOURS', '{}'::jsonb),

('tmpl-24-cash-van-arrival', 'Scheduled Cash Van Arrival', 'ANPR_LOGISTICS',
 'Matches arriving armored logistics van license plate against expected branch transfer schedule.',
 'anpr', '{"metric": "vehicle_authorized", "operator": "EQUALS", "value": true}'::jsonb,
 0, 'INFO', 300000, '["CREATE_ALERT", "AUDIT_EVENT"]'::jsonb,
 '["CASH_VAN_AREA"]'::jsonb, 'BUSINESS_HOURS', '{"correlateWorkflow": true}'::jsonb),

('tmpl-25-unknown-cash-van', 'Unregistered Vehicle in Cash Bay', 'ANPR_LOGISTICS',
 'Alerts when an unrecognized vehicle enters the secure cash transfer/loading bay during operations.',
 'anpr', '{"logical": "AND", "conditions": [{"metric": "vehicle_in_bay", "operator": "EQUALS", "value": true}, {"metric": "plate_authorized", "operator": "EQUALS", "value": false}]}'::jsonb,
 10000, 'HIGH', 120000, '["CREATE_ALERT", "CAPTURE_SNAPSHOT", "NOTIFY_SOC", "NOTIFY_BRANCH_MANAGER"]'::jsonb,
 '["CASH_VAN_AREA"]'::jsonb, '24X7', '{}'::jsonb),

('tmpl-26-cash-van-dwell-time', 'Cash Van Excessive Bay Dwell Time', 'ANPR_LOGISTICS',
 'Monitors armored logistics van dwell time in loading bay to ensure rapid turnaround policy.',
 'vehicle', '{"metric": "dwell_time_seconds", "operator": "GREATER_THAN", "value": 1200}'::jsonb,
 1200000, 'WARNING', 300000, '["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER"]'::jsonb,
 '["CASH_VAN_AREA"]'::jsonb, 'BUSINESS_HOURS', '{"maxDwellMinutes": 20}'::jsonb),

('tmpl-27-opening-staff-count', 'Branch Opening Dual-Staff Verification', 'CASH_OPERATIONS',
 'Verifies minimum required staff are present together during designated morning branch opening window.',
 'person', '{"logical": "AND", "conditions": [{"metric": "opening_window_active", "operator": "EQUALS", "value": true}, {"metric": "staff_count", "operator": "LESS_THAN", "value": 2}]}'::jsonb,
 300000, 'WARNING', 600000, '["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER"]'::jsonb,
 '["ENTRANCE", "CUSTOMER_AREA"]'::jsonb, 'BRANCH_OPENING', '{"requiredOpeningStaff": 2}'::jsonb),

('tmpl-28-branch-closing-check', 'Branch Closing Clearance Verification', 'CASH_OPERATIONS',
 'Runs automated checklist verifying locker, cash counters, and customer areas are vacated at closing.',
 'person', '{"metric": "person_count", "operator": "GREATER_THAN", "value": 0}'::jsonb,
 60000, 'HIGH', 180000, '["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER"]'::jsonb,
 '["CUSTOMER_AREA", "LOCKER", "RESTRICTED_AREA"]'::jsonb, 'BRANCH_CLOSING', '{}'::jsonb),

('tmpl-29-people-counting', 'Branch Occupancy & Traffic Counting', 'CASH_OPERATIONS',
 'Maintains real-time entry count, exit count, current branch headcount, and peak occupancy.',
 'person', '{"metric": "current_occupancy", "operator": "GREATER_THAN", "value": 50}'::jsonb,
 0, 'INFO', 300000, '["AUDIT_EVENT"]'::jsonb,
 '["ENTRANCE", "EXIT", "CUSTOMER_AREA"]'::jsonb, 'BUSINESS_HOURS', '{}'::jsonb),

('tmpl-30-crowd-density-roi', 'Crowd Density Threshold', 'CASH_OPERATIONS',
 'Evaluates region of interest (ROI) bounding box occupancy to trigger crowd escalation.',
 'crowd-density', '{"metric": "density_level", "operator": "EQUALS", "value": "CROWDED"}'::jsonb,
 30000, 'WARNING', 120000, '["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER"]'::jsonb,
 '["CUSTOMER_AREA", "QUEUE_AREA"]'::jsonb, 'BUSINESS_HOURS', '{}'::jsonb),

('tmpl-31-suspicious-repeated-entry', 'Suspicious Repeated Zone Re-entry', 'ACCESS_PERIMETER',
 'Flags anonymous tracked subject repeatedly entering and exiting high-security corridor within short window.',
 'zone', '{"metric": "reentry_count_10m", "operator": "GREATER_THAN", "value": 3}'::jsonb,
 600000, 'MEDIUM', 300000, '["CREATE_ALERT", "CAPTURE_SNAPSHOT", "NOTIFY_SOC"]'::jsonb,
 '["LOCKER", "RESTRICTED_AREA", "ATM_AREA"]'::jsonb, '24X7', '{"anonymousTrackingOnly": true}'::jsonb),

('tmpl-32-staff-only-zone', 'Staff-Only Zone Unauthorized Entry', 'ACCESS_PERIMETER',
 'Triggers when a person enters staff workspace without accompanying access credential pulse.',
 'zone', '{"logical": "AND", "conditions": [{"metric": "person_in_staff_zone", "operator": "EQUALS", "value": true}, {"metric": "access_credential_validated", "operator": "EQUALS", "value": false}]}'::jsonb,
 3000, 'HIGH', 60000, '["CREATE_ALERT", "CAPTURE_SNAPSHOT", "NOTIFY_BRANCH_MANAGER"]'::jsonb,
 '["STAFF_AREA"]'::jsonb, 'BUSINESS_HOURS', '{}'::jsonb),

('tmpl-33-unusual-locker-occupancy', 'Unusual Multi-Factor Locker Anomaly', 'VAULT_LOCKER',
 'Compound anomaly: Occupancy violation OR off-hours entry OR missing dual-control personnel.',
 'person', '{"logical": "OR", "conditions": [{"metric": "person_count", "operator": "GREATER_THAN", "value": 2}, {"metric": "off_hours_presence", "operator": "EQUALS", "value": true}]}'::jsonb,
 5000, 'CRITICAL', 60000, '["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "POPUP_LIVE_VIEW", "NOTIFY_SOC"]'::jsonb,
 '["LOCKER", "STRONG_ROOM"]'::jsonb, '24X7', '{}'::jsonb),

('tmpl-34-safe-door-sensor-correlation', 'Safe / Locker Door Open Mode', 'VAULT_LOCKER',
 'Triggers high-security continuous surveillance and forensic recording priority when safe door opens.',
 'zone', '{"metric": "safe_door_state", "operator": "EQUALS", "value": "OPEN"}'::jsonb,
 0, 'CRITICAL', 30000, '["CREATE_ALERT", "START_HIGH_PRIORITY_RECORDING", "CAPTURE_SNAPSHOT", "BOOKMARK_RECORDING", "NOTIFY_SOC"]'::jsonb,
 '["LOCKER", "STRONG_ROOM"]'::jsonb, '24X7', '{}'::jsonb),

('tmpl-35-locker-dwell-time', 'Excessive Locker Visit Dwell Time', 'VAULT_LOCKER',
 'Warns when an authorized locker visit exceeds normal operating limits (e.g. > 15 minutes).',
 'person', '{"metric": "locker_session_duration_seconds", "operator": "GREATER_THAN", "value": 900}'::jsonb,
 900000, 'WARNING', 300000, '["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER", "NOTIFY_SOC"]'::jsonb,
 '["LOCKER", "STRONG_ROOM"]'::jsonb, 'BUSINESS_HOURS', '{"maxLockerVisitMinutes": 15}'::jsonb),

('tmpl-36-server-room-access', 'Server / DVR Room Unauthorized Access', 'ACCESS_PERIMETER',
 'Alerts on server or DVR rack room entry when no active IT maintenance ticket is approved.',
 'person', '{"logical": "AND", "conditions": [{"metric": "person_in_server_room", "operator": "EQUALS", "value": true}, {"metric": "maintenance_ticket_active", "operator": "EQUALS", "value": false}]}'::jsonb,
 3000, 'HIGH', 60000, '["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "NOTIFY_SOC"]'::jsonb,
 '["SERVER_ROOM"]'::jsonb, '24X7', '{}'::jsonb),

('tmpl-37-helmet-face-cover', 'Helmet / Face Cover Inside Branch/ATM', 'ACCESS_PERIMETER',
 'Detects persons entering branch lobby, ATM kiosk, cash counter, or vault area wearing a motorcycle helmet, full-face visor, or concealment gear.',
 'helmet-worn', '{"metric": "helmet_detected", "operator": "EQUALS", "value": true}'::jsonb,
 1000, 'HIGH', 60000, '["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "NOTIFY_SOC", "POPUP_LIVE_VIEW"]'::jsonb,
 '["ENTRANCE", "ATM_AREA", "CASH_COUNTER", "LOCKER", "CUSTOMER_AREA"]'::jsonb, '24X7', '{"threatType": "identity_concealment", "securityMandate": "RBI_NBFC_PHYSICAL_SECURITY"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  default_condition = EXCLUDED.default_condition,
  default_duration_ms = EXCLUDED.default_duration_ms,
  default_severity = EXCLUDED.default_severity,
  default_cooldown_ms = EXCLUDED.default_cooldown_ms,
  default_actions = EXCLUDED.default_actions,
  recommended_zone_types = EXCLUDED.recommended_zone_types,
  suggested_schedule = EXCLUDED.suggested_schedule,
  metadata = EXCLUDED.metadata;
