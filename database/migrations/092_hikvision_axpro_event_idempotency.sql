-- Hikvision AX PRO event ingestion is at-least-once. Keep a durable idempotency
-- key in event metadata so retries from a receiver or polling worker are safe.
CREATE UNIQUE INDEX IF NOT EXISTS idx_security_device_events_idempotency
ON security_device_events (
  tenant_id,
  device_id,
  ((metadata->>'idempotencyKey'))
)
WHERE metadata ? 'idempotencyKey'
  AND metadata->>'idempotencyKey' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_device_integrations_axpro_branch
ON security_device_integrations (
  tenant_id,
  adapter_name,
  ((connection_config->>'branchId'))
)
WHERE adapter_name = 'HIKVISION_AX_PRO';

