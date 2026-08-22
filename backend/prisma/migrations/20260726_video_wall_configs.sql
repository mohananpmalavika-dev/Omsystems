-- Video Wall Configurations Migration
-- Support for multi-monitor video wall management

CREATE TABLE IF NOT EXISTS video_wall_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  displays JSONB NOT NULL DEFAULT '[]'::jsonb,
  sync_enabled BOOLEAN DEFAULT TRUE,
  rotation_interval INTEGER, -- seconds
  rotation_enabled BOOLEAN DEFAULT FALSE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_video_wall_configs_user_id ON video_wall_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_video_wall_configs_updated_at ON video_wall_configs(updated_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_video_wall_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER video_wall_configs_updated_at
  BEFORE UPDATE ON video_wall_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_video_wall_configs_updated_at();

-- Comments
COMMENT ON TABLE video_wall_configs IS 'Video wall multi-monitor configurations';
COMMENT ON COLUMN video_wall_configs.displays IS 'Array of display configurations with camera assignments';
COMMENT ON COLUMN video_wall_configs.sync_enabled IS 'Whether all displays show synchronized content';
COMMENT ON COLUMN video_wall_configs.rotation_interval IS 'Auto-rotation interval in seconds';
COMMENT ON COLUMN video_wall_configs.rotation_enabled IS 'Whether auto-rotation is enabled';
