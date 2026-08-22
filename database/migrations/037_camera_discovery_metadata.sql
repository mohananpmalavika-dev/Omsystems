CREATE TYPE camera_discovery_method AS ENUM (
  'onvif-ws-discovery',
  'configured-ip-range',
  'manual-ip-registration',
  'csv-bulk-import',
  'nvr-dvr-channel-discovery',
  'vendor-api-discovery',
  'snmp-discovery',
  'edge-agent-reported-inventory'
);

ALTER TABLE camera_discoveries
  ADD COLUMN discovery_method camera_discovery_method NOT NULL DEFAULT 'edge-agent-reported-inventory',
  ADD COLUMN manufacturer text;
