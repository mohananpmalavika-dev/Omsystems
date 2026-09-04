-- 094_portable_cameras.sql
-- Portable and Software Camera Subsystem (Laptop, Mobile, Browser, USB Capture)

-- 1. Update source_type check constraints to support portable cameras
ALTER TABLE cameras DROP CONSTRAINT IF EXISTS cameras_source_type_check;
ALTER TABLE cameras ADD CONSTRAINT cameras_source_type_check 
  CHECK (source_type IN (
    'ip-camera', 'analog-dvr-channel', 'nvr-channel',
    'laptop-camera', 'usb-webcam', 'usb-capture-card',
    'android-camera', 'ios-camera', 'browser-camera'
  ));

ALTER TABLE camera_discoveries DROP CONSTRAINT IF EXISTS camera_discoveries_source_type_check;
ALTER TABLE camera_discoveries ADD CONSTRAINT camera_discoveries_source_type_check 
  CHECK (source_type IN (
    'ip-camera', 'analog-dvr-channel', 'nvr-channel',
    'laptop-camera', 'usb-webcam', 'usb-capture-card',
    'android-camera', 'ios-camera', 'browser-camera'
  ));

-- 2. Enrolled portable devices table (persistent hardware identity)
CREATE TABLE IF NOT EXISTS portable_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_type text NOT NULL CHECK (device_type IN ('ANDROID', 'IOS', 'WINDOWS', 'BROWSER')),
  device_name text NOT NULL,
  enrolled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  credential_id text NOT NULL UNIQUE,
  credential_hash text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE', 'REVOKED', 'LOST', 'EXPIRED')),
  app_version text,
  os_version text,
  last_known_ip text,
  camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portable_devices_tenant ON portable_devices(tenant_id, state);
CREATE INDEX IF NOT EXISTS idx_portable_devices_credential ON portable_devices(credential_id);

-- 3. Short-lived QR enrollment sessions
CREATE TABLE IF NOT EXISTS portable_camera_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  allowed_source_types text[] NOT NULL DEFAULT '{"BROWSER_CAMERA","ANDROID_CAMERA","IOS_CAMERA","LAPTOP_CAMERA","USB_WEBCAM","USB_CAPTURE_CARD"}',
  requested_permissions text[] NOT NULL DEFAULT '{"camera","audio","location"}',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONSUMED', 'EXPIRED', 'REVOKED')),
  used_at timestamptz,
  used_by_device_id uuid REFERENCES portable_devices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portable_enrollments_token ON portable_camera_enrollments(token);
CREATE INDEX IF NOT EXISTS idx_portable_enrollments_tenant ON portable_camera_enrollments(tenant_id, status);

-- 4. Authoritative portable camera sessions
CREATE TABLE IF NOT EXISTS portable_camera_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  source_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES portable_devices(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  media_node_id text NOT NULL,
  fencing_token bigint NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_reason text,
  state text NOT NULL DEFAULT 'CREATED' CHECK (state IN ('CREATED', 'CONNECTING', 'LIVE', 'DEGRADED', 'RECONNECTING', 'ENDED', 'FAILED')),
  video_codec text DEFAULT 'H264',
  audio_codec text DEFAULT 'OPUS',
  resolution jsonb DEFAULT '{"width": 1920, "height": 1080}'::jsonb,
  fps numeric(5,2) DEFAULT 25.0,
  bitrate_kbps integer DEFAULT 2000,
  recording_policy text NOT NULL DEFAULT 'RECORD_WHILE_LIVE' CHECK (recording_policy IN ('NO_RECORDING', 'RECORD_WHILE_LIVE', 'CONTINUOUS_WHILE_SESSION_ACTIVE', 'MANUAL_RECORDING', 'INCIDENT_ONLY')),
  health jsonb DEFAULT '{}'::jsonb,
  incident_ids uuid[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portable_sessions_source ON portable_camera_sessions(source_id, state);
CREATE INDEX IF NOT EXISTS idx_portable_sessions_device ON portable_camera_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_portable_sessions_tenant ON portable_camera_sessions(tenant_id, started_at DESC);

-- 5. Session events for telemetry and forensic tracking
CREATE TABLE IF NOT EXISTS portable_camera_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES portable_camera_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portable_session_events ON portable_camera_session_events(session_id, timestamp DESC);

-- 6. Tenant configuration policies for portable cameras
CREATE TABLE IF NOT EXISTS portable_camera_policies (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  allowed_source_types text[] NOT NULL DEFAULT '{"ONVIF_CAMERA","RTSP_CAMERA","DVR_CHANNEL","NVR_CHANNEL","LAPTOP_CAMERA","USB_WEBCAM","USB_CAPTURE_CARD","ANDROID_CAMERA","IOS_CAMERA","BROWSER_CAMERA"}',
  max_concurrent_sessions integer NOT NULL DEFAULT 10,
  allow_audio boolean NOT NULL DEFAULT true,
  allow_location boolean NOT NULL DEFAULT true,
  allow_recording boolean NOT NULL DEFAULT true,
  default_recording_policy text NOT NULL DEFAULT 'RECORD_WHILE_LIVE',
  require_user_consent boolean NOT NULL DEFAULT true,
  max_session_duration_minutes integer DEFAULT 480,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
