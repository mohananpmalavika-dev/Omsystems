-- Migration 132: Video Timeline Bookmarks Production Hardening
-- Operator tagged timestamps with notes, priority levels, and incident associations.

-- 1. Ensure live_bookmarks has timestamp, title, metadata, updated_at
ALTER TABLE live_bookmarks
  ADD COLUMN IF NOT EXISTS timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill timestamp from bookmarked_at if missing
UPDATE live_bookmarks 
SET timestamp = bookmarked_at 
WHERE timestamp IS NULL AND bookmarked_at IS NOT NULL;

-- Backfill bookmarked_at from timestamp if missing
UPDATE live_bookmarks 
SET bookmarked_at = timestamp 
WHERE bookmarked_at IS NULL AND timestamp IS NOT NULL;

-- Backfill title from notes or ID if missing
UPDATE live_bookmarks 
SET title = COALESCE(substring(notes from 1 for 60), 'Bookmark ' || substring(id::text, 1, 8))
WHERE title IS NULL;

-- Relax legacy single-table FK on incident_id so it can reference either `incidents` or `live_incidents`
ALTER TABLE live_bookmarks 
  DROP CONSTRAINT IF EXISTS live_bookmarks_incident_id_fkey;

-- 2. Multi-Incident Associations Table
-- Enables associating a single bookmark with multiple incidents (or vice-versa) with operator notes
CREATE TABLE IF NOT EXISTS video_bookmark_incident_associations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bookmark_id uuid NOT NULL REFERENCES live_bookmarks(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    incident_id uuid NOT NULL,
    incident_table text NOT NULL DEFAULT 'incidents' CHECK (incident_table IN ('incidents', 'live_incidents')),
    associated_by uuid REFERENCES users(id) ON DELETE SET NULL,
    association_notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_video_bookmark_incident UNIQUE (bookmark_id, incident_id)
);

-- Backfill existing single-incident links from live_bookmarks into associations
INSERT INTO video_bookmark_incident_associations (bookmark_id, tenant_id, incident_id, incident_table, associated_by, created_at)
SELECT id, tenant_id, incident_id, 'live_incidents', operator_id, created_at
FROM live_bookmarks
WHERE incident_id IS NOT NULL
ON CONFLICT (bookmark_id, incident_id) DO NOTHING;

-- 3. Video Bookmark Forensic Audit Trail
CREATE TABLE IF NOT EXISTS video_bookmark_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bookmark_id uuid NOT NULL,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    operator_id uuid REFERENCES users(id) ON DELETE SET NULL,
    action text NOT NULL, -- 'created', 'updated', 'deleted', 'incident_associated', 'incident_disassociated', 'verified', 'exported'
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. High performance indices for timeline scrubbing and filtering
CREATE INDEX IF NOT EXISTS idx_live_bookmarks_tenant_camera_time 
    ON live_bookmarks (tenant_id, camera_id, bookmarked_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_bookmarks_tenant_time 
    ON live_bookmarks (tenant_id, bookmarked_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_bookmarks_priority 
    ON live_bookmarks (tenant_id, priority);

CREATE INDEX IF NOT EXISTS idx_live_bookmarks_incident 
    ON live_bookmarks (tenant_id, incident_id) WHERE incident_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vbm_assoc_incident 
    ON video_bookmark_incident_associations (tenant_id, incident_id);

CREATE INDEX IF NOT EXISTS idx_vbm_assoc_bookmark 
    ON video_bookmark_incident_associations (bookmark_id);

CREATE INDEX IF NOT EXISTS idx_vbm_audit_bookmark 
    ON video_bookmark_audit_logs (bookmark_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vbm_audit_tenant 
    ON video_bookmark_audit_logs (tenant_id, created_at DESC);
