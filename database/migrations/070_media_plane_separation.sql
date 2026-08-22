-- Migration 070: Control-Plane / Media-Plane Separation
-- Tables for Media Plane Node Registry and Emergency Token Revocation

CREATE TABLE IF NOT EXISTS media_plane_nodes (
  node_id VARCHAR(128) PRIMARY KEY,
  node_name VARCHAR(128) NOT NULL,
  host VARCHAR(255) NOT NULL,
  public_host VARCHAR(255),
  port INT NOT NULL DEFAULT 8554,
  relay_port INT NOT NULL DEFAULT 8443,
  type VARCHAR(64) NOT NULL DEFAULT 'PRIMARY_INGEST',
  region VARCHAR(64) NOT NULL DEFAULT 'ap-south-1',
  status VARCHAR(32) NOT NULL DEFAULT 'HEALTHY',
  active_streams INT NOT NULL DEFAULT 0,
  max_streams INT NOT NULL DEFAULT 150,
  ingress_mbps DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  max_ingress_mbps DOUBLE PRECISION NOT NULL DEFAULT 1200.0,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_plane_status ON media_plane_nodes(status, active_streams);

CREATE TABLE IF NOT EXISTS media_token_revocations (
  jti VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  camera_id VARCHAR(128) NOT NULL,
  reason VARCHAR(255),
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_revocations_expires ON media_token_revocations(expires_at);
