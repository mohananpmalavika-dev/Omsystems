-- Stream URLs contain camera or recorder passwords. Keep only authenticated
-- ciphertext in PostgreSQL; the encryption key remains outside the database.
CREATE TABLE IF NOT EXISTS central_stream_secrets (
  reference text PRIMARY KEY,
  edge_agent_id uuid NOT NULL REFERENCES edge_agents(id) ON DELETE CASCADE,
  encrypted_uri text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS central_stream_secrets_agent_idx
  ON central_stream_secrets (edge_agent_id);

CREATE TABLE IF NOT EXISTS central_device_credentials (
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  host inet NOT NULL,
  encrypted_login text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (branch_id, host)
);

-- New discovery credentials are encrypted before insert. Existing plaintext
-- rows are re-encrypted by the control plane after this migration is applied.
ALTER TABLE camera_credentials
  ADD COLUMN IF NOT EXISTS password_encrypted text;
