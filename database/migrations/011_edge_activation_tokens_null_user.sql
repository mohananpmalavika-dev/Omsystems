-- Migration 011: Relax edge_activation_tokens created_by foreign key
-- Allows resilient gateway provisioning even during cold database boots or token creation by system subjects

ALTER TABLE IF EXISTS edge_activation_tokens 
  DROP CONSTRAINT IF EXISTS edge_activation_tokens_created_by_fkey;

ALTER TABLE IF EXISTS edge_activation_tokens 
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE IF EXISTS edge_activation_tokens 
  ADD CONSTRAINT edge_activation_tokens_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
