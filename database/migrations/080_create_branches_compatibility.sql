-- Compatibility branch registry for backend services that use the legacy branches relation.
-- The canonical core schema stores organizational branches as resource_nodes, but
-- several backend modules require a relational branches table and foreign keys.

CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    region TEXT,
    risk_category TEXT,
    emergency_contact TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    postal_code TEXT,
    timezone TEXT,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS branches_tenant_idx ON branches(tenant_id);
CREATE INDEX IF NOT EXISTS branches_status_idx ON branches(tenant_id, status);

-- Preserve existing canonical branch identities when the legacy table is absent
-- or empty. Future branch writes remain available to legacy backend services.
INSERT INTO branches (id, tenant_id, name, metadata)
SELECT id, tenant_id, name, jsonb_build_object('source', 'resource_nodes')
FROM resource_nodes
WHERE node_type = 'branch'
ON CONFLICT (id) DO NOTHING;
