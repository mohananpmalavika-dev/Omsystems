CREATE TABLE IF NOT EXISTS public.security_device_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name character varying(255) NOT NULL,
    description text,
    integration_type character varying(50) NOT NULL,
    adapter_name character varying(100) NOT NULL,
    adapter_version character varying(50) NOT NULL,
    protocol character varying(50) NOT NULL,
    connection_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    credential_ref_id character varying(255),
    status character varying(50) DEFAULT 'ACTIVE'::character varying NOT NULL,
    last_sync_at timestamp with time zone,
    last_error_at timestamp with time zone,
    last_error_message text,
    polling_interval_seconds integer DEFAULT 60 NOT NULL,
    auto_reconnect boolean DEFAULT true NOT NULL,
    max_retries integer DEFAULT 3 NOT NULL,
    devices_managed integer DEFAULT 0 NOT NULL,
    events_processed_today integer DEFAULT 0 NOT NULL,
    total_events_processed bigint DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.security_device_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    parent_device_id uuid NOT NULL REFERENCES public.security_devices(id) ON DELETE CASCADE,
    child_device_id uuid NOT NULL REFERENCES public.security_devices(id) ON DELETE CASCADE,
    relationship_type character varying(50) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE (parent_device_id, child_device_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_device_integrations_adapter ON public.security_device_integrations USING btree (adapter_name, adapter_version);
CREATE INDEX IF NOT EXISTS idx_device_integrations_status ON public.security_device_integrations USING btree (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_device_integrations_tenant ON public.security_device_integrations USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_device_relationships_child ON public.security_device_relationships USING btree (child_device_id);
CREATE INDEX IF NOT EXISTS idx_device_relationships_parent ON public.security_device_relationships USING btree (parent_device_id);
CREATE INDEX IF NOT EXISTS idx_device_relationships_type ON public.security_device_relationships USING btree (relationship_type);
CREATE INDEX IF NOT EXISTS idx_security_device_integrations_axpro_branch ON public.security_device_integrations USING btree (tenant_id, adapter_name, ((connection_config ->> 'branchId'::text))) WHERE ((adapter_name)::text = 'HIKVISION_AX_PRO'::text);
