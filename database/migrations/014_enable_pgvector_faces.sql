-- Enable pgvector for face embeddings
-- This migration converts face_embeddings from bytea to vector(512) type

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add new vector column
ALTER TABLE face_embeddings 
ADD COLUMN embedding_vector vector(512);

-- Migrate existing bytea data to vector if needed
-- (This assumes embeddings are stored as 512 float32 values serialized to bytes)
-- If there's existing data, you would need a custom migration function

-- Drop old bytea column and rename vector column
ALTER TABLE face_embeddings DROP COLUMN embedding;
ALTER TABLE face_embeddings RENAME COLUMN embedding_vector TO embedding;

-- Add model versioning columns
ALTER TABLE face_embeddings 
ADD COLUMN model_name text NOT NULL DEFAULT 'arcface-r100',
ADD COLUMN model_version text NOT NULL DEFAULT '1.0.0';

-- Create HNSW index for fast similarity search
CREATE INDEX face_embeddings_embedding_hnsw_idx 
ON face_embeddings 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Add additional indexes for tenant-scoped queries
CREATE INDEX face_embeddings_tenant_person_idx 
ON face_embeddings (tenant_id, person_id);

CREATE INDEX face_watchlist_persons_watchlist_active_idx
ON face_watchlist_persons (watchlist_id, tenant_id) 
WHERE archived_at IS NULL;

-- Add face match review table for human-in-the-loop confirmation
CREATE TABLE face_match_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recognition_event_id uuid NOT NULL REFERENCES face_recognition_events(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES users(id),
  decision text NOT NULL CHECK (decision IN ('confirmed', 'rejected', 'unsure')),
  notes text,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX face_match_reviews_event_idx 
ON face_match_reviews (recognition_event_id);

CREATE INDEX face_match_reviews_reviewer_idx 
ON face_match_reviews (reviewer_id, reviewed_at DESC);

-- Add face track aggregation table for temporal confirmation
CREATE TABLE face_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  track_id text NOT NULL,
  person_id uuid REFERENCES face_watchlist_persons(id) ON DELETE SET NULL,
  watchlist_id uuid REFERENCES face_watchlists(id) ON DELETE SET NULL,
  
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  observation_count integer NOT NULL DEFAULT 1,
  
  best_similarity numeric(5,4),
  mean_similarity numeric(5,4),
  best_quality numeric(5,4),
  mean_quality numeric(5,4),
  
  status text NOT NULL DEFAULT 'tracking' 
    CHECK (status IN ('tracking', 'identified', 'unknown', 'expired')),
  
  best_snapshot_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX face_tracks_camera_time_idx 
ON face_tracks (camera_id, first_seen_at DESC);

CREATE INDEX face_tracks_person_idx 
ON face_tracks (person_id, last_seen_at DESC) 
WHERE person_id IS NOT NULL;

CREATE INDEX face_tracks_status_idx 
ON face_tracks (status, last_seen_at DESC);

-- Add threshold configuration table per watchlist
ALTER TABLE face_watchlists 
ADD COLUMN match_threshold numeric(5,4) DEFAULT 0.70 
  CHECK (match_threshold BETWEEN 0.40 AND 0.95),
ADD COLUMN review_threshold numeric(5,4) DEFAULT 0.60 
  CHECK (review_threshold BETWEEN 0.40 AND 0.95),
ADD COLUMN minimum_margin numeric(5,4) DEFAULT 0.05 
  CHECK (minimum_margin BETWEEN 0.01 AND 0.30),
ADD COLUMN minimum_quality numeric(5,4) DEFAULT 0.55 
  CHECK (minimum_quality BETWEEN 0.30 AND 0.95),
ADD COLUMN temporal_confirmation_frames integer DEFAULT 3 
  CHECK (temporal_confirmation_frames BETWEEN 1 AND 20),
ADD COLUMN temporal_window_seconds integer DEFAULT 2 
  CHECK (temporal_window_seconds BETWEEN 1 AND 30);

COMMENT ON COLUMN face_embeddings.embedding IS 
  'ArcFace 512-dimensional face embedding vector for similarity search';

COMMENT ON COLUMN face_watchlists.match_threshold IS 
  'Minimum similarity score (0-1) to declare a definitive match';

COMMENT ON COLUMN face_watchlists.review_threshold IS 
  'Minimum similarity score (0-1) to flag as possible match requiring review';

COMMENT ON COLUMN face_watchlists.minimum_margin IS 
  'Minimum difference between best and second-best match to avoid ambiguity';

COMMENT ON TABLE face_tracks IS 
  'Face tracking across frames for temporal confirmation before alerting';

COMMENT ON TABLE face_match_reviews IS 
  'Human review decisions for face matches (for calibration and quality control)';
