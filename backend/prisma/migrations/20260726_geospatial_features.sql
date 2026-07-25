-- Geospatial Features Schema
-- Support for map visualization and location-based analytics

-- Add geospatial columns to branches table
DO $$ 
BEGIN
    -- Latitude and Longitude
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='latitude') THEN
        ALTER TABLE branches ADD COLUMN latitude DECIMAL(10, 8);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='longitude') THEN
        ALTER TABLE branches ADD COLUMN longitude DECIMAL(11, 8);
    END IF;
    
    -- Address details
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='address_line1') THEN
        ALTER TABLE branches ADD COLUMN address_line1 VARCHAR(200);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='address_line2') THEN
        ALTER TABLE branches ADD COLUMN address_line2 VARCHAR(200);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='city') THEN
        ALTER TABLE branches ADD COLUMN city VARCHAR(100);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='state') THEN
        ALTER TABLE branches ADD COLUMN state VARCHAR(100);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='postal_code') THEN
        ALTER TABLE branches ADD COLUMN postal_code VARCHAR(20);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='country') THEN
        ALTER TABLE branches ADD COLUMN country VARCHAR(100);
    END IF;
    
    -- Time zone
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='timezone') THEN
        ALTER TABLE branches ADD COLUMN timezone VARCHAR(50) DEFAULT 'UTC';
    END IF;
END $$;

-- Create spatial index for location-based queries
CREATE INDEX IF NOT EXISTS idx_branches_location ON branches(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Geographic regions table
CREATE TABLE IF NOT EXISTS geographic_regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    region_type VARCHAR(50) NOT NULL, -- country, state, district, zone, custom
    parent_region_id UUID REFERENCES geographic_regions(id),
    
    -- Boundary definition
    boundary_type VARCHAR(30) DEFAULT 'polygon', -- polygon, circle, rectangle
    boundary_coordinates JSONB, -- GeoJSON format
    center_latitude DECIMAL(10, 8),
    center_longitude DECIMAL(11, 8),
    
    -- Metadata
    population INTEGER,
    area_sq_km DECIMAL(10, 2),
    description TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_region_name_per_tenant UNIQUE(tenant_id, name, region_type)
);

CREATE INDEX idx_geographic_regions_tenant ON geographic_regions(tenant_id);
CREATE INDEX idx_geographic_regions_parent ON geographic_regions(parent_region_id);
CREATE INDEX idx_geographic_regions_center ON geographic_regions(center_latitude, center_longitude);

-- Branch region assignments
CREATE TABLE IF NOT EXISTS branch_region_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    region_id UUID NOT NULL REFERENCES geographic_regions(id) ON DELETE CASCADE,
    assignment_type VARCHAR(30) DEFAULT 'primary', -- primary, secondary, coverage
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_branch_region UNIQUE(branch_id, region_id, assignment_type)
);

CREATE INDEX idx_branch_region_assignments_branch ON branch_region_assignments(branch_id);
CREATE INDEX idx_branch_region_assignments_region ON branch_region_assignments(region_id);

-- Map layers (for custom overlays)
CREATE TABLE IF NOT EXISTS map_layers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    layer_type VARCHAR(50) NOT NULL, -- heatmap, cluster, route, zone, custom
    description TEXT,
    
    -- Layer configuration
    data_source VARCHAR(50), -- incidents, cameras, alerts, traffic, custom
    style_config JSONB DEFAULT '{}',
    visibility_default BOOLEAN DEFAULT true,
    z_index INTEGER DEFAULT 1,
    
    -- Permissions
    visible_to_roles VARCHAR(50)[],
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_layer_name_per_tenant UNIQUE(tenant_id, name)
);

CREATE INDEX idx_map_layers_tenant ON map_layers(tenant_id, is_active);

-- Map markers (custom points of interest)
CREATE TABLE IF NOT EXISTS map_markers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    layer_id UUID REFERENCES map_layers(id) ON DELETE CASCADE,
    
    name VARCHAR(200),
    marker_type VARCHAR(50), -- police-station, hospital, atm, landmark, emergency
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    
    icon_url VARCHAR(500),
    color VARCHAR(7), -- Hex color
    metadata_json JSONB DEFAULT '{}',
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_map_markers_tenant ON map_markers(tenant_id, is_active);
CREATE INDEX idx_map_markers_layer ON map_markers(layer_id);
CREATE INDEX idx_map_markers_location ON map_markers(latitude, longitude);
CREATE INDEX idx_map_markers_type ON map_markers(marker_type);
