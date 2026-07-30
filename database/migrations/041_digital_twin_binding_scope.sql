-- Scope opaque integration device IDs to a tenant and branch. Vendor IDs such
-- as "nvr-1" or "door-7" can legitimately repeat at different branches.
ALTER TABLE digital_twin_device_bindings
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE digital_twin_device_bindings
  ADD COLUMN IF NOT EXISTS branch_node_id UUID REFERENCES resource_nodes(id) ON DELETE CASCADE;

UPDATE digital_twin_device_bindings binding
SET tenant_id = site.organization_id,
    branch_node_id = building.branch_id
FROM digital_twin_objects twin_object
JOIN digital_twin_floors floor ON floor.id = twin_object.floor_id
JOIN digital_twin_buildings building ON building.id = floor.building_id
JOIN digital_twin_sites site ON site.id = building.site_id
WHERE binding.twin_object_id = twin_object.id
  AND (binding.tenant_id IS NULL OR binding.branch_node_id IS NULL);

DROP INDEX IF EXISTS digital_twin_bindings_device_unique;
ALTER TABLE digital_twin_device_bindings
  DROP CONSTRAINT IF EXISTS digital_twin_device_bindings_twin_object_id_device_type_device_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS digital_twin_bindings_object_unique
  ON digital_twin_device_bindings(twin_object_id);
CREATE UNIQUE INDEX IF NOT EXISTS digital_twin_bindings_scoped_device_unique
  ON digital_twin_device_bindings(tenant_id, branch_node_id, device_type, device_id);
