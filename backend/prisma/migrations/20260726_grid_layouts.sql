-- Grid Layouts Migration
-- Support for saving and loading camera grid layouts

CREATE TABLE IF NOT EXISTS grid_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  grid_size VARCHAR(10) NOT NULL CHECK (grid_size IN ('1x1', '2x2', '3x3', '4x4', '5x5', '6x6', '7x7', '8x8', '9x9', '10x10', '11x11', '12x12')),
  camera_positions JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_shared BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_grid_layouts_user_id ON grid_layouts(user_id);
CREATE INDEX IF NOT EXISTS idx_grid_layouts_is_shared ON grid_layouts(is_shared) WHERE is_shared = TRUE;
CREATE INDEX IF NOT EXISTS idx_grid_layouts_updated_at ON grid_layouts(updated_at DESC);

-- Camera positions JSONB structure validation
-- Example: [{"position": 0, "cameraId": "uuid", "stream": "main"}]
CREATE OR REPLACE FUNCTION validate_camera_positions()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT (
    SELECT bool_and(
      jsonb_typeof(pos) = 'object' AND
      pos ? 'position' AND
      pos ? 'cameraId' AND
      pos ? 'stream' AND
      (pos->>'stream') IN ('main', 'sub')
    )
    FROM jsonb_array_elements(NEW.camera_positions) AS pos
  ) THEN
    RAISE EXCEPTION 'Invalid camera_positions format';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_grid_layout_positions
  BEFORE INSERT OR UPDATE ON grid_layouts
  FOR EACH ROW
  EXECUTE FUNCTION validate_camera_positions();

-- Comments
COMMENT ON TABLE grid_layouts IS 'Stores saved camera grid layouts for control room monitoring';
COMMENT ON COLUMN grid_layouts.name IS 'User-defined name for the layout';
COMMENT ON COLUMN grid_layouts.grid_size IS 'Grid dimensions (e.g., 6x6 for 36 cameras)';
COMMENT ON COLUMN grid_layouts.camera_positions IS 'Array of camera assignments to grid positions';
COMMENT ON COLUMN grid_layouts.is_shared IS 'Whether this layout is shared with other users';
