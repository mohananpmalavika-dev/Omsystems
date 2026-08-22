-- Migration: 069_automatic_storage_failover.sql
-- Automatic Storage Failover: Media Node Permitted Recording Targets, Priority Routing, and Failover Auditing

-- 1. Failover Reason Enum
DO $$ BEGIN
  CREATE TYPE storage_failover_reason AS ENUM (
    'DISK_FULL',
    'STORAGE_OFFLINE',
    'READ_ONLY',
    'WRITE_FAILURE',
    'LATENCY_SPIKE',
    'MOUNT_DISCONNECTED',
    'MANUAL_OVERRIDE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Media Node Permitted Recording Targets Table
CREATE TABLE IF NOT EXISTS media_node_storage_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  media_node_id text NOT NULL,
  camera_id uuid REFERENCES cameras(id) ON DELETE CASCADE, -- NULL indicates node-wide default target
  storage_node_id text NOT NULL,
  target_name text NOT NULL,
  target_path text NOT NULL, -- e.g. /mnt/video1, /mnt/video2, nfs://nas/cctv, s3://cloud-bucket
  storage_type text NOT NULL DEFAULT 'local-disk' CHECK (storage_type IN ('local-disk', 'nas', 'san', 's3', 'archive')),
  storage_tier text NOT NULL DEFAULT 'hot' CHECK (storage_tier IN ('hot', 'warm', 'cold', 'archive')),
  priority integer NOT NULL DEFAULT 1 CHECK (priority >= 1 AND priority <= 100), -- 1 is highest priority
  is_active boolean NOT NULL DEFAULT true,
  max_capacity_bytes bigint NOT NULL DEFAULT 0,
  spillover_threshold_percent numeric(5,2) NOT NULL DEFAULT 95.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, media_node_id, camera_id, storage_node_id)
);

CREATE INDEX IF NOT EXISTS idx_media_node_targets_priority
  ON media_node_storage_targets (tenant_id, media_node_id, priority ASC, is_active);

CREATE INDEX IF NOT EXISTS idx_media_node_targets_camera
  ON media_node_storage_targets (tenant_id, camera_id, priority ASC)
  WHERE camera_id IS NOT NULL;

-- 3. Storage Failover Events Table (Audit & Digital Twin RCA)
CREATE TABLE IF NOT EXISTS storage_failover_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  media_node_id text NOT NULL,
  camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
  from_storage_node_id text NOT NULL,
  from_target_path text NOT NULL,
  to_storage_node_id text NOT NULL,
  to_target_path text NOT NULL,
  reason storage_failover_reason NOT NULL,
  error_detail text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recovered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storage_failover_events_time
  ON storage_failover_events (tenant_id, media_node_id, occurred_at DESC);
