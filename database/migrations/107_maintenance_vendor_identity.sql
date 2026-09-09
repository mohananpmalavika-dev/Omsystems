-- A vendor directory must have one canonical record per tenant. This prevents
-- duplicate escalation contacts differing only by case or whitespace.
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_vendors_tenant_name_unique
  ON maintenance_vendors (tenant_id, lower(btrim(name)));
