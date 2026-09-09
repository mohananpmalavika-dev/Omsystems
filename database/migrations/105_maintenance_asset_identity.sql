-- Physical serial numbers are immutable hardware identities.  A duplicate
-- within a tenant would make warranty, maintenance history, and replacement
-- workflows ambiguous.  Blank serials remain allowed for assets awaiting
-- commissioning.
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_assets_tenant_serial_unique
  ON maintenance_assets (tenant_id, lower(btrim(serial_number)))
  WHERE serial_number IS NOT NULL AND btrim(serial_number) <> '';
