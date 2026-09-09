-- Contract numbers are external legal/financial references and must be unique
-- per tenant regardless of letter case or incidental whitespace.
CREATE UNIQUE INDEX IF NOT EXISTS amc_contracts_tenant_number_unique
  ON amc_contracts (tenant_id, lower(btrim(contract_number)));
