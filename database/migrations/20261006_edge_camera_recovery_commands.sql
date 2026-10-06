-- Keep the command allowlist aligned with the commands executed by the gateway.
-- Existing installations created by migration 048 reject recover-camera with 23514.
ALTER TABLE edge_commands
  DROP CONSTRAINT IF EXISTS edge_commands_command_type_check;

ALTER TABLE edge_commands
  ADD CONSTRAINT edge_commands_command_type_check CHECK (command_type IN (
    'rediscover', 'restart-media', 'restart-agent', 'probe-camera',
    'recover-camera', 'probe-recorder', 'collect-logs', 'update-credentials',
    'trigger-siren', 'apply-update'
  ));
