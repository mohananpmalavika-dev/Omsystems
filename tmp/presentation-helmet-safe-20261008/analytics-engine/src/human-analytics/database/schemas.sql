-- Human Analytics Database Schemas
-- PostgreSQL with pgvector extension

-- Enable pgvector extension for appearance embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- Camera Appearances (for cross-camera journey reconstruction)
-- =============================================================================

CREATE TABLE IF NOT EXISTS camera_appearances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  camera_id VARCHAR(255) NOT NULL,
  local_track_id VARCHAR(255) NOT NULL,
  
  entered_at TIMESTAMP NOT NULL,
  exited_at TIMESTAMP NOT NULL,
  
  entry_gate_id VARCHAR(255),
  exit_gate_id VARCHAR(255),
  
  -- ReID embedding (512-dimensional vector)
  representative_embedding vector(512),
  embedding_quality FLOAT,
  
  -- Clothing features (JSONB for flexibility)
  clothing_features JSONB,
  
  -- Trajectory summary
  trajectory_summary JSONB,
  
  best_frame_id VARCHAR(255),
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_appearances_tenant_camera ON camera_appearances(tenant_id, camera_id);
CREATE INDEX idx_appearances_entered_at ON camera_appearances(entered_at);
CREATE INDEX idx_appearances_exited_at ON camera_appearances(exited_at);

-- Vector similarity search index (HNSW for fast nearest-neighbor)
CREATE INDEX idx_appearances_embedding ON camera_appearances 
USING hnsw (representative_embedding vector_cosine_ops);

-- =============================================================================
-- Person Journeys (cross-camera tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS person_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  started_at TIMESTAMP NOT NULL,
  last_updated_at TIMESTAMP NOT NULL,
  
  confidence FLOAT NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'completed', 'ambiguous')),
  review_status VARCHAR(50) DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed', 'confirmed', 'rejected')),
  
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMP,
  review_notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_journey_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_journeys_tenant ON person_journeys(tenant_id);
CREATE INDEX idx_journeys_started_at ON person_journeys(started_at);
CREATE INDEX idx_journeys_status ON person_journeys(status);
CREATE INDEX idx_journeys_review_status ON person_journeys(review_status);

-- =============================================================================
-- Journey Appearance Links
-- =============================================================================

CREATE TABLE IF NOT EXISTS journey_appearance_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL,
  appearance_id UUID NOT NULL,
  
  camera_id VARCHAR(255) NOT NULL,
  entered_at TIMESTAMP NOT NULL,
  exited_at TIMESTAMP NOT NULL,
  
  previous_appearance_id UUID,
  transition_confidence FLOAT,
  transition_reasons JSONB,
  
  sequence_order INT NOT NULL,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_link_journey FOREIGN KEY (journey_id) REFERENCES person_journeys(id) ON DELETE CASCADE,
  CONSTRAINT fk_link_appearance FOREIGN KEY (appearance_id) REFERENCES camera_appearances(id) ON DELETE CASCADE,
  CONSTRAINT fk_link_previous FOREIGN KEY (previous_appearance_id) REFERENCES camera_appearances(id) ON DELETE SET NULL
);

CREATE INDEX idx_links_journey ON journey_appearance_links(journey_id);
CREATE INDEX idx_links_appearance ON journey_appearance_links(appearance_id);
CREATE INDEX idx_links_sequence ON journey_appearance_links(journey_id, sequence_order);

-- =============================================================================
-- Counting Gates (entry/exit configuration)
-- =============================================================================

CREATE TABLE IF NOT EXISTS counting_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  camera_id VARCHAR(255) NOT NULL,
  
  name VARCHAR(255) NOT NULL,
  
  line_start_x FLOAT NOT NULL,
  line_start_y FLOAT NOT NULL,
  line_end_x FLOAT NOT NULL,
  line_end_y FLOAT NOT NULL,
  
  entry_side VARCHAR(50) NOT NULL CHECK (entry_side IN ('positive', 'negative')),
  allowed_direction VARCHAR(50) NOT NULL CHECK (allowed_direction IN ('both', 'entry', 'exit')),
  
  minimum_track_age_ms INT DEFAULT 1000,
  cooldown_ms INT DEFAULT 5000,
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_gate_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_gates_tenant_camera ON counting_gates(tenant_id, camera_id);
CREATE INDEX idx_gates_active ON counting_gates(is_active);

-- =============================================================================
-- Crossing Events (atomic line crossing records)
-- =============================================================================

CREATE TABLE IF NOT EXISTS crossing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  camera_id VARCHAR(255) NOT NULL,
  gate_id UUID NOT NULL,
  local_track_id VARCHAR(255) NOT NULL,
  
  direction VARCHAR(50) NOT NULL CHECK (direction IN ('entry', 'exit')),
  crossed_at TIMESTAMP NOT NULL,
  confidence FLOAT NOT NULL,
  
  before_point_x FLOAT NOT NULL,
  before_point_y FLOAT NOT NULL,
  after_point_x FLOAT NOT NULL,
  after_point_y FLOAT NOT NULL,
  
  metadata JSONB,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_crossing_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_crossing_gate FOREIGN KEY (gate_id) REFERENCES counting_gates(id) ON DELETE CASCADE
);

CREATE INDEX idx_crossings_tenant_camera ON crossing_events(tenant_id, camera_id);
CREATE INDEX idx_crossings_gate ON crossing_events(gate_id);
CREATE INDEX idx_crossings_crossed_at ON crossing_events(crossed_at);
CREATE INDEX idx_crossings_direction ON crossing_events(direction);

-- Uniqueness constraint for deduplication
CREATE UNIQUE INDEX idx_crossings_dedup ON crossing_events(
  tenant_id,
  camera_id,
  gate_id,
  local_track_id,
  direction,
  DATE_TRUNC('second', crossed_at)
);

-- =============================================================================
-- Occupancy Ledger (audit trail for occupancy counts)
-- =============================================================================

CREATE TABLE IF NOT EXISTS occupancy_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL,
  zone_id VARCHAR(255) NOT NULL,
  
  timestamp TIMESTAMP NOT NULL,
  delta INT NOT NULL,
  
  reason VARCHAR(100) NOT NULL CHECK (reason IN (
    'camera_entry',
    'camera_exit',
    'manual_correction',
    'access_control',
    'reconciliation'
  )),
  
  source_event_id VARCHAR(255) NOT NULL,
  confidence FLOAT NOT NULL,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_ledger_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_ledger_site_zone ON occupancy_ledger(site_id, zone_id);
CREATE INDEX idx_ledger_timestamp ON occupancy_ledger(timestamp);
CREATE INDEX idx_ledger_reason ON occupancy_ledger(reason);

-- =============================================================================
-- Behavior Events (fighting, panic, loitering, etc.)
-- =============================================================================

CREATE TABLE IF NOT EXISTS behavior_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  camera_id VARCHAR(255) NOT NULL,
  
  event_type VARCHAR(100) NOT NULL,
  
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  
  confidence FLOAT NOT NULL,
  severity VARCHAR(50) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  track_ids JSONB NOT NULL,
  
  -- Evidence
  evidence_frame_ids JSONB,
  evidence_clip_id VARCHAR(255),
  evidence_feature_summary JSONB,
  
  -- Provenance
  detector_version VARCHAR(100) NOT NULL,
  model_versions JSONB,
  configuration_version VARCHAR(50),
  
  -- Review
  review_status VARCHAR(50) DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed', 'confirmed', 'rejected')),
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMP,
  review_notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_behavior_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_behavior_tenant_camera ON behavior_events(tenant_id, camera_id);
CREATE INDEX idx_behavior_type ON behavior_events(event_type);
CREATE INDEX idx_behavior_started_at ON behavior_events(started_at);
CREATE INDEX idx_behavior_severity ON behavior_events(severity);
CREATE INDEX idx_behavior_review_status ON behavior_events(review_status);

-- =============================================================================
-- Camera Topology (for journey reconstruction)
-- =============================================================================

CREATE TABLE IF NOT EXISTS camera_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  from_camera_id VARCHAR(255) NOT NULL,
  to_camera_id VARCHAR(255) NOT NULL,
  
  minimum_travel_seconds INT NOT NULL,
  maximum_travel_seconds INT NOT NULL,
  probability FLOAT NOT NULL DEFAULT 0.5,
  
  from_gate_id UUID,
  to_gate_id UUID,
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_transition_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_transition_from_gate FOREIGN KEY (from_gate_id) REFERENCES counting_gates(id) ON DELETE SET NULL,
  CONSTRAINT fk_transition_to_gate FOREIGN KEY (to_gate_id) REFERENCES counting_gates(id) ON DELETE SET NULL
);

CREATE INDEX idx_transitions_tenant ON camera_transitions(tenant_id);
CREATE INDEX idx_transitions_from_camera ON camera_transitions(from_camera_id);
CREATE INDEX idx_transitions_to_camera ON camera_transitions(to_camera_id);
CREATE INDEX idx_transitions_active ON camera_transitions(is_active);

-- Unique constraint for camera pairs
CREATE UNIQUE INDEX idx_transitions_cameras ON camera_transitions(
  tenant_id,
  from_camera_id,
  to_camera_id
);

-- =============================================================================
-- Crowd Baselines (for panic detection)
-- =============================================================================

CREATE TABLE IF NOT EXISTS crowd_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id VARCHAR(255) NOT NULL,
  zone_id VARCHAR(255),
  
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  hour_of_day INT NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  
  median_speed FLOAT NOT NULL,
  median_density FLOAT NOT NULL,
  median_direction_entropy FLOAT NOT NULL,
  
  mad_speed FLOAT NOT NULL,
  mad_density FLOAT NOT NULL,
  mad_direction_entropy FLOAT NOT NULL,
  
  sample_count INT NOT NULL,
  last_updated TIMESTAMP NOT NULL,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(camera_id, zone_id, day_of_week, hour_of_day)
);

CREATE INDEX idx_baselines_camera ON crowd_baselines(camera_id);
CREATE INDEX idx_baselines_camera_time ON crowd_baselines(camera_id, day_of_week, hour_of_day);

-- =============================================================================
-- Views for common queries
-- =============================================================================

-- Current occupancy by zone
CREATE OR REPLACE VIEW current_occupancy AS
SELECT 
  site_id,
  zone_id,
  SUM(delta) as occupancy,
  MAX(timestamp) as last_updated,
  COUNT(*) as event_count
FROM occupancy_ledger
GROUP BY site_id, zone_id;

-- Recent crossings summary
CREATE OR REPLACE VIEW recent_crossings_summary AS
SELECT 
  tenant_id,
  camera_id,
  gate_id,
  direction,
  DATE_TRUNC('hour', crossed_at) as hour,
  COUNT(*) as crossing_count,
  AVG(confidence) as avg_confidence
FROM crossing_events
WHERE crossed_at >= NOW() - INTERVAL '24 hours'
GROUP BY tenant_id, camera_id, gate_id, direction, DATE_TRUNC('hour', crossed_at)
ORDER BY hour DESC;

-- Active journeys summary
CREATE OR REPLACE VIEW active_journeys_summary AS
SELECT 
  j.id as journey_id,
  j.tenant_id,
  j.status,
  j.confidence,
  j.started_at,
  COUNT(l.id) as appearance_count,
  ARRAY_AGG(DISTINCT l.camera_id ORDER BY l.camera_id) as cameras
FROM person_journeys j
LEFT JOIN journey_appearance_links l ON j.id = l.journey_id
WHERE j.status = 'active'
GROUP BY j.id, j.tenant_id, j.status, j.confidence, j.started_at;
