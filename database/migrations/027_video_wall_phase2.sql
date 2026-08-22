ALTER TABLE video_wall_layouts
  DROP CONSTRAINT IF EXISTS video_wall_layouts_grid_size_check;

ALTER TABLE video_wall_layouts
  ADD CONSTRAINT video_wall_layouts_grid_size_check CHECK (
    grid_size IN ('1x1','2x2','3x3','4x4','5x5','6x6','7x7','8x8','9x9','10x10','11x11','12x12')
  );

CREATE INDEX IF NOT EXISTS video_wall_layouts_user_idx
  ON video_wall_layouts (tenant_id, created_by, updated_at DESC);
