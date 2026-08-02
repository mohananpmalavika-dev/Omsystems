-- Represent every DVR/NVR input as its own camera while retaining the recorder
-- relationship. Analog cameras remain private behind the DVR; only the edge
-- gateway holds the channel RTSP secret.

ALTER TABLE camera_discoveries
  ADD COLUMN source_type text NOT NULL DEFAULT 'ip-camera'
    CHECK (source_type IN ('ip-camera', 'analog-dvr-channel', 'nvr-channel')),
  ADD COLUMN recorder_id text,
  ADD COLUMN recorder_channel integer NOT NULL DEFAULT 0
    CHECK (recorder_channel BETWEEN 0 AND 65535),
  ADD COLUMN recorder_serial_number text,
  ADD COLUMN serial_number text,
  ADD COLUMN firmware_version text,
  ADD COLUMN display_name text,
  ADD COLUMN credentials_required boolean,
  ADD COLUMN stream_verified boolean,
  ADD COLUMN rtsp_validated boolean,
  ADD COLUMN compatibility text,
  ADD COLUMN duplicate_status text,
  ADD COLUMN compatibility_status text,
  ADD COLUMN hardware_id text,
  ADD COLUMN existing_device_association text,
  ADD COLUMN status_reason text;

ALTER TABLE camera_discoveries
  DROP CONSTRAINT IF EXISTS camera_discoveries_edge_agent_id_ip_address_onvif_port_key;

CREATE UNIQUE INDEX camera_discoveries_edge_source_slot_idx
  ON camera_discoveries (edge_agent_id, ip_address, onvif_port, recorder_channel);

CREATE INDEX camera_discoveries_recorder_channel_idx
  ON camera_discoveries (branch_node_id, recorder_id, recorder_channel)
  WHERE recorder_id IS NOT NULL;

ALTER TABLE cameras
  ADD COLUMN source_type text NOT NULL DEFAULT 'ip-camera'
    CHECK (source_type IN ('ip-camera', 'analog-dvr-channel', 'nvr-channel')),
  ADD COLUMN recorder_id text,
  ADD COLUMN recorder_channel integer CHECK (recorder_channel BETWEEN 1 AND 65535),
  ADD COLUMN recorder_serial_number text;

CREATE INDEX cameras_recorder_channel_idx
  ON cameras (branch_node_id, recorder_id, recorder_channel)
  WHERE recorder_id IS NOT NULL;
