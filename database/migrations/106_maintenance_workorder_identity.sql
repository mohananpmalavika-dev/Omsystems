-- Work-order numbers are human-facing references used in vendor tickets,
-- invoices, and audit records. They must be unique within each tenant.
CREATE UNIQUE INDEX IF NOT EXISTS work_orders_tenant_number_unique
  ON work_orders (tenant_id, lower(btrim(work_order_number)));
