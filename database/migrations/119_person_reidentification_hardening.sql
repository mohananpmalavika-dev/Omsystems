-- ============================================================================
-- Migration 119: Multi-Camera Person Re-Identification (Re-ID) Hardening (analytics.re_identification)
--
-- Authoritative cross-camera tracking ledger, global person identity catalog,
-- camera transition topology, and forensic probe investigation logs.
-- ============================================================================

-- 1. Conditionally enable pgvector extension if supported
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension not installed in current environment; using standard array structures';
END $$;

-- 2. Global Person Identity Catalog
-- Maintains persistent identity profiles synthesized from visual embeddings across multiple cameras
CREATE TABLE IF NOT EXISTS reid_global_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  global_id text NOT NULL UNIQUE,
  representative_embedding double precision[] NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  appearances integer NOT NULL DEFAULT 1,
  cameras_visited text[] NOT NULL DEFAULT '{}',
  primary_branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'merged')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reid_identities_tenant_last_seen
  ON reid_global_identities (tenant_id, last_seen DESC);

CREATE INDEX IF NOT EXISTS idx_reid_identities_branch
  ON reid_global_identities (tenant_id, primary_branch_id, last_seen DESC);

CREATE INDEX IF NOT EXISTS idx_reid_identities_global_id
  ON reid_global_identities (global_id);

-- 3. Camera Sighting / Tracklet Ledger
-- Stores verified camera sightings with timestamps, dwell duration, and quality metrics
CREATE TABLE IF NOT EXISTS reid_camera_sightings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  global_id text NOT NULL REFERENCES reid_global_identities(global_id) ON DELETE CASCADE,
  local_track_id text NOT NULL,
  entered_at timestamptz NOT NULL,
  exited_at timestamptz NOT NULL,
  dwell_seconds numeric(8,2) NOT NULL DEFAULT 0.0,
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  quality_score numeric(5,4) NOT NULL DEFAULT 1.0 CHECK (quality_score BETWEEN 0 AND 1),
  bounding_box jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_url text,
  embedding double precision[] NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reid_sightings_tenant_time
  ON reid_camera_sightings (tenant_id, entered_at DESC);

CREATE INDEX IF NOT EXISTS idx_reid_sightings_camera_time
  ON reid_camera_sightings (camera_id, entered_at DESC);

CREATE INDEX IF NOT EXISTS idx_reid_sightings_global_time
  ON reid_camera_sightings (global_id, entered_at ASC);

CREATE INDEX IF NOT EXISTS idx_reid_sightings_branch_time
  ON reid_camera_sightings (branch_id, entered_at DESC);

-- 4. Branch Camera Transition Topology
-- Defines physical adjacency and transit time feasibility between camera pairs
CREATE TABLE IF NOT EXISTS reid_camera_topology (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  from_camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  to_camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  min_transit_seconds integer NOT NULL DEFAULT 2 CHECK (min_transit_seconds >= 0),
  max_transit_seconds integer NOT NULL DEFAULT 300 CHECK (max_transit_seconds >= min_transit_seconds),
  distance_meters numeric(6,2),
  transition_probability numeric(4,3) NOT NULL DEFAULT 1.000 CHECK (transition_probability BETWEEN 0 AND 1),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_reid_topology_pair UNIQUE (from_camera_id, to_camera_id)
);

CREATE INDEX IF NOT EXISTS idx_reid_topology_branch
  ON reid_camera_topology (tenant_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_reid_topology_from_camera
  ON reid_camera_topology (from_camera_id, to_camera_id);

-- 5. Forensic Investigation Probes
-- Tracks cross-camera visual search queries launched by operators
CREATE TABLE IF NOT EXISTS reid_probe_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  probe_type text NOT NULL DEFAULT 'vector' CHECK (probe_type IN ('vector', 'crop_image', 'sighting_reference')),
  probe_embedding double precision[] NOT NULL,
  similarity_threshold numeric(4,3) NOT NULL DEFAULT 0.700 CHECK (similarity_threshold BETWEEN 0.1 AND 1.0),
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  from_time timestamptz,
  to_time timestamptz,
  match_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reid_probes_tenant_time
  ON reid_probe_searches (tenant_id, created_at DESC);

-- 6. Audit Comments
COMMENT ON TABLE reid_global_identities IS
  'Authoritative global person identity records synthesized from cross-camera visual embeddings.';
COMMENT ON TABLE reid_camera_sightings IS
  'Temporal tracklet sightings linking a global identity to specific cameras with dwell time and visual quality.';
COMMENT ON TABLE reid_camera_topology IS
  'Physical adjacency graph and transit time feasibility constraints between branch cameras.';
COMMENT ON TABLE reid_probe_searches IS
  'Forensic investigation probe audit ledger for cross-camera visual re-identification searches.';
