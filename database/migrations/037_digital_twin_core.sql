-- Digital Twin Core Schema
-- Provides foundation for 2D/3D branch visualization with device positioning

-- Sites (typically corresponds to organizations or major facilities)
CREATE TABLE digital_twin_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    address TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    timezone VARCHAR(100) DEFAULT 'UTC',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    UNIQUE(organization_id, name)
);

-- Buildings within a site
CREATE TABLE digital_twin_buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES digital_twin_sites(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES resource_nodes(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    building_type VARCHAR(100), -- 'branch', 'datacenter', 'warehouse', 'office'
    total_floors INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(site_id, name)
);

-- Floors within a building
CREATE TABLE digital_twin_floors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID NOT NULL REFERENCES digital_twin_buildings(id) ON DELETE CASCADE,
    floor_number INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    floor_height_meters DECIMAL(5, 2),
    area_square_meters DECIMAL(10, 2),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(building_id, floor_number)
);

-- Floor plans (images/CAD files)
CREATE TABLE digital_twin_floor_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_id UUID NOT NULL REFERENCES digital_twin_floors(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    file_url TEXT NOT NULL,
    file_type VARCHAR(50) NOT NULL, -- 'png', 'jpg', 'svg', 'pdf', 'dxf', 'ifc'
    file_size_bytes BIGINT,
    width_pixels INTEGER,
    height_pixels INTEGER,
    scale_meters_per_pixel DECIMAL(10, 6),
    origin_x DECIMAL(10, 6) DEFAULT 0,
    origin_y DECIMAL(10, 6) DEFAULT 0,
    rotation_degrees DECIMAL(6, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(floor_id, version)
);

-- Object types that can be placed on floor plans
CREATE TYPE twin_object_type AS ENUM (
    'camera',
    'dvr',
    'nvr',
    'door',
    'access_reader',
    'panic_button',
    'fire_sensor',
    'smoke_sensor',
    'motion_sensor',
    'temperature_sensor',
    'humidity_sensor',
    'ups',
    'network_switch',
    'router',
    'server',
    'atm',
    'vault',
    'safe',
    'emergency_exit',
    'entrance',
    'window',
    'desk',
    'counter',
    'zone_marker',
    'custom'
);

-- Objects placed on floor plans
CREATE TABLE digital_twin_objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_id UUID NOT NULL REFERENCES digital_twin_floors(id) ON DELETE CASCADE,
    object_type twin_object_type NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Normalized coordinates (0.0 to 1.0)
    position_x DECIMAL(8, 6) NOT NULL CHECK (position_x >= 0 AND position_x <= 1),
    position_y DECIMAL(8, 6) NOT NULL CHECK (position_y >= 0 AND position_y <= 1),
    position_z DECIMAL(8, 3) DEFAULT 0, -- Height in meters for 3D
    
    -- Rotation in degrees (0-360)
    rotation DECIMAL(6, 2) DEFAULT 0 CHECK (rotation >= 0 AND rotation < 360),
    
    -- Scale factor (1.0 = normal size)
    scale DECIMAL(5, 3) DEFAULT 1.0,
    
    -- Visual properties
    icon_name VARCHAR(100),
    color VARCHAR(50),
    size_override DECIMAL(5, 2),
    
    -- Camera-specific properties
    field_of_view DECIMAL(5, 2), -- Degrees
    viewing_distance DECIMAL(6, 2), -- Meters
    camera_angle DECIMAL(5, 2), -- Tilt angle
    
    -- Status display configuration
    show_status BOOLEAN DEFAULT true,
    show_label BOOLEAN DEFAULT true,
    show_field_of_view BOOLEAN DEFAULT false,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_digital_twin_objects_floor ON digital_twin_objects(floor_id);
CREATE INDEX idx_digital_twin_objects_type ON digital_twin_objects(object_type);

-- Device bindings (link objects to actual devices)
CREATE TABLE digital_twin_device_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    twin_object_id UUID NOT NULL REFERENCES digital_twin_objects(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_node_id UUID NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
    device_type VARCHAR(50) NOT NULL, -- 'camera', 'recorder', 'access_control', 'sensor'
    -- Control-plane camera IDs may be UUIDs, while recorder, sensor, UPS and
    -- integration IDs are commonly vendor strings. Keep the binding opaque.
    device_id TEXT NOT NULL,
    device_table VARCHAR(100) NOT NULL, -- Table name for the device
    
    -- Status bindings
    status_source VARCHAR(100), -- e.g., 'camera.health', 'door.state'
    alert_source VARCHAR(100), -- e.g., 'analytics.camera-id'
    
    -- Display rules
    status_mapping JSONB DEFAULT '{}', -- Map device status to colors/icons
    auto_update BOOLEAN DEFAULT true,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(twin_object_id)
);

CREATE INDEX idx_device_bindings_object ON digital_twin_device_bindings(twin_object_id);
CREATE INDEX idx_device_bindings_device ON digital_twin_device_bindings(device_type, device_id);
CREATE UNIQUE INDEX digital_twin_bindings_scoped_device_unique
    ON digital_twin_device_bindings(tenant_id, branch_node_id, device_type, device_id);

-- Zones (polygonal areas on floor plans)
CREATE TABLE digital_twin_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_id UUID NOT NULL REFERENCES digital_twin_floors(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    zone_type VARCHAR(100), -- 'restricted', 'public', 'emergency', 'queue', 'coverage'
    
    -- Polygon vertices (array of normalized coordinates)
    vertices JSONB NOT NULL, -- [{"x": 0.1, "y": 0.2}, {"x": 0.3, "y": 0.4}, ...]
    
    -- Visual properties
    fill_color VARCHAR(50) DEFAULT '#FF0000',
    fill_opacity DECIMAL(3, 2) DEFAULT 0.2,
    stroke_color VARCHAR(50) DEFAULT '#FF0000',
    stroke_width DECIMAL(4, 2) DEFAULT 2,
    
    -- Zone configuration
    is_restricted BOOLEAN DEFAULT false,
    alert_on_entry BOOLEAN DEFAULT false,
    alert_on_dwell BOOLEAN DEFAULT false,
    max_dwell_seconds INTEGER,
    
    -- Associated analytics
    analytics_enabled BOOLEAN DEFAULT false,
    analytics_config JSONB DEFAULT '{}',
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_digital_twin_zones_floor ON digital_twin_zones(floor_id);
CREATE INDEX idx_digital_twin_zones_type ON digital_twin_zones(zone_type);

-- Camera field of view definitions
CREATE TABLE digital_twin_camera_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    twin_object_id UUID NOT NULL REFERENCES digital_twin_objects(id) ON DELETE CASCADE,
    floor_id UUID NOT NULL REFERENCES digital_twin_floors(id) ON DELETE CASCADE,
    
    -- FOV polygon vertices
    coverage_polygon JSONB NOT NULL,
    
    -- Blind spots (areas not covered)
    blind_spots JSONB DEFAULT '[]',
    
    -- Coverage analysis
    coverage_percentage DECIMAL(5, 2),
    overlapping_cameras JSONB DEFAULT '[]', -- Array of camera IDs
    
    -- Detection capabilities per zone
    detection_quality VARCHAR(50), -- 'excellent', 'good', 'fair', 'poor'
    identification_quality VARCHAR(50),
    
    last_calculated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    UNIQUE(twin_object_id)
);

CREATE INDEX idx_camera_views_floor ON digital_twin_camera_views(floor_id);

-- Heat map aggregation (spatial analytics)
CREATE TABLE digital_twin_heatmaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_id UUID NOT NULL REFERENCES digital_twin_floors(id) ON DELETE CASCADE,
    heatmap_type VARCHAR(100) NOT NULL, -- 'people_movement', 'dwell_time', 'incidents', 'device_failures'
    time_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    time_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Grid-based heat data
    grid_resolution INTEGER DEFAULT 50, -- Number of cells per dimension
    grid_data JSONB NOT NULL, -- 2D array of intensity values
    
    -- Statistics
    max_intensity DECIMAL(10, 4),
    avg_intensity DECIMAL(10, 4),
    total_events INTEGER,
    
    -- Source data
    source_cameras JSONB DEFAULT '[]',
    source_zones JSONB DEFAULT '[]',
    
    metadata JSONB DEFAULT '{}',
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_heatmaps_floor_type ON digital_twin_heatmaps(floor_id, heatmap_type);
CREATE INDEX idx_heatmaps_time ON digital_twin_heatmaps(time_period_start, time_period_end);

-- Alert markers (spatial incident visualization)
CREATE TABLE digital_twin_alert_markers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_id UUID NOT NULL REFERENCES digital_twin_floors(id) ON DELETE CASCADE,
    twin_object_id UUID REFERENCES digital_twin_objects(id) ON DELETE SET NULL,
    
    -- Alert information
    alert_type VARCHAR(100) NOT NULL, -- 'intrusion', 'fire', 'panic', 'door_forced', 'camera_offline'
    severity VARCHAR(50) NOT NULL, -- 'critical', 'high', 'medium', 'low'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Position (if not linked to object)
    position_x DECIMAL(8, 6),
    position_y DECIMAL(8, 6),
    
    -- Alert lifecycle
    triggered_at TIMESTAMP WITH TIME ZONE NOT NULL,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID REFERENCES users(id),
    resolved_by UUID REFERENCES users(id),
    
    -- Linked incident
    incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
    
    -- Visual properties
    pulse_effect BOOLEAN DEFAULT true,
    auto_zoom BOOLEAN DEFAULT true,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alert_markers_floor ON digital_twin_alert_markers(floor_id);
CREATE INDEX idx_alert_markers_time ON digital_twin_alert_markers(triggered_at);
CREATE INDEX idx_alert_markers_status ON digital_twin_alert_markers(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_alert_markers_incident ON digital_twin_alert_markers(incident_id);

-- Scene versions (snapshots for timeline playback)
CREATE TABLE digital_twin_scene_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_id UUID NOT NULL REFERENCES digital_twin_floors(id) ON DELETE CASCADE,
    snapshot_time TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Complete scene state
    object_states JSONB NOT NULL, -- Array of object states with positions and statuses
    active_alerts JSONB DEFAULT '[]',
    door_states JSONB DEFAULT '{}',
    sensor_states JSONB DEFAULT '{}',
    camera_states JSONB DEFAULT '{}',
    
    -- Event context
    event_summary TEXT,
    related_incident_id UUID REFERENCES incidents(id),
    
    -- Performance
    compression_applied BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scene_versions_floor_time ON digital_twin_scene_versions(floor_id, snapshot_time DESC);
CREATE INDEX idx_scene_versions_incident ON digital_twin_scene_versions(related_incident_id);

-- User preferences for Digital Twin interface
CREATE TABLE digital_twin_user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- View preferences
    default_view_mode VARCHAR(50) DEFAULT '2d', -- '2d', '2.5d', '3d'
    show_device_labels BOOLEAN DEFAULT true,
    show_field_of_view BOOLEAN DEFAULT true,
    show_zones BOOLEAN DEFAULT true,
    show_heatmaps BOOLEAN DEFAULT false,
    
    -- Favorite floors/views
    favorite_floors JSONB DEFAULT '[]',
    saved_views JSONB DEFAULT '[]',
    
    -- Alert preferences
    auto_zoom_on_alert BOOLEAN DEFAULT true,
    alert_notification_sound BOOLEAN DEFAULT true,
    
    -- Performance
    max_simultaneous_streams INTEGER DEFAULT 4,
    enable_3d_acceleration BOOLEAN DEFAULT true,
    
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Permissions for Digital Twin features
CREATE TABLE digital_twin_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Permission types
    can_view_floors BOOLEAN DEFAULT false,
    can_edit_floors BOOLEAN DEFAULT false,
    can_place_devices BOOLEAN DEFAULT false,
    can_edit_zones BOOLEAN DEFAULT false,
    can_view_3d BOOLEAN DEFAULT false,
    can_export_plans BOOLEAN DEFAULT false,
    can_playback_timeline BOOLEAN DEFAULT false,
    
    -- Scope
    site_id UUID REFERENCES digital_twin_sites(id) ON DELETE CASCADE,
    building_id UUID REFERENCES digital_twin_buildings(id) ON DELETE CASCADE,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CHECK ((role_id IS NOT NULL) OR (user_id IS NOT NULL))
);

CREATE INDEX idx_twin_permissions_role ON digital_twin_permissions(role_id);
CREATE INDEX idx_twin_permissions_user ON digital_twin_permissions(user_id);

-- Audit log for Digital Twin changes
CREATE TABLE digital_twin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL, -- 'create', 'update', 'delete', 'move', 'bind'
    entity_type VARCHAR(100) NOT NULL, -- 'floor_plan', 'object', 'zone', 'binding'
    entity_id UUID NOT NULL,
    
    -- Change details
    previous_state JSONB,
    new_state JSONB,
    change_summary TEXT,
    
    -- Context
    floor_id UUID REFERENCES digital_twin_floors(id),
    building_id UUID REFERENCES digital_twin_buildings(id),
    
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_twin_audit_entity ON digital_twin_audit_log(entity_type, entity_id);
CREATE INDEX idx_twin_audit_user_time ON digital_twin_audit_log(user_id, timestamp DESC);
CREATE INDEX idx_twin_audit_floor ON digital_twin_audit_log(floor_id);

-- Update timestamps automatically
CREATE TRIGGER update_digital_twin_sites_updated_at
    BEFORE UPDATE ON digital_twin_sites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_digital_twin_buildings_updated_at
    BEFORE UPDATE ON digital_twin_buildings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_digital_twin_floors_updated_at
    BEFORE UPDATE ON digital_twin_floors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_digital_twin_objects_updated_at
    BEFORE UPDATE ON digital_twin_objects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_digital_twin_device_bindings_updated_at
    BEFORE UPDATE ON digital_twin_device_bindings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_digital_twin_zones_updated_at
    BEFORE UPDATE ON digital_twin_zones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_digital_twin_user_preferences_updated_at
    BEFORE UPDATE ON digital_twin_user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE digital_twin_sites IS 'Top-level container for Digital Twin, typically one per organization or major facility';
COMMENT ON TABLE digital_twin_buildings IS 'Buildings within a site, can be linked to branches';
COMMENT ON TABLE digital_twin_floors IS 'Individual floors within buildings with metadata';
COMMENT ON TABLE digital_twin_floor_plans IS 'Uploaded floor plan images/CAD files with scaling and transformation data';
COMMENT ON TABLE digital_twin_objects IS 'Devices, sensors, and other objects positioned on floor plans';
COMMENT ON TABLE digital_twin_device_bindings IS 'Links Digital Twin objects to actual physical devices in the system';
COMMENT ON TABLE digital_twin_zones IS 'Polygonal zones on floor plans for analytics and access control';
COMMENT ON TABLE digital_twin_camera_views IS 'Camera field-of-view coverage and blind spot analysis';
COMMENT ON TABLE digital_twin_heatmaps IS 'Aggregated spatial analytics data for visualization';
COMMENT ON TABLE digital_twin_alert_markers IS 'Real-time alert visualization on floor plans';
COMMENT ON TABLE digital_twin_scene_versions IS 'Historical snapshots for timeline playback and investigation';
COMMENT ON TABLE digital_twin_user_preferences IS 'User-specific Digital Twin interface preferences';
COMMENT ON TABLE digital_twin_permissions IS 'Role and user-based access control for Digital Twin features';
COMMENT ON TABLE digital_twin_audit_log IS 'Audit trail for all Digital Twin changes';
