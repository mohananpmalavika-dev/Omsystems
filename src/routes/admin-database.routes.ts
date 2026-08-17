import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { MemoryStore } from "../store.js";

export interface ColumnDefinition {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "json" | "datetime" | "enum";
  options?: string[];
  required?: boolean;
  readonly?: boolean;
  description?: string;
}

export interface TableDefinition {
  id: string;
  name: string;
  category: "Core Topology" | "Surveillance" | "Edge & Fleet" | "AI & Analytics" | "Incidents & Audit" | "Maintenance & Storage";
  description: string;
  primaryKey: string;
  columns: ColumnDefinition[];
  getRows: (store: any) => Promise<any[]> | any[];
  getRow: (store: any, id: string) => Promise<any> | any;
  createRow: (store: any, data: any) => Promise<any> | any;
  updateRow: (store: any, id: string, data: any) => Promise<any> | any;
  deleteRow: (store: any, id: string) => Promise<boolean> | boolean;
}

export const TABLE_REGISTRY: Record<string, TableDefinition> = {
  branches: {
    id: "branches",
    name: "Branches & Nodes",
    category: "Core Topology",
    description: "Physical facilities, branches, buildings and topological nodes",
    primaryKey: "id",
    columns: [
      { name: "id", label: "Node ID", type: "string", readonly: true, required: true },
      { name: "name", label: "Branch Name", type: "string", required: true },
      { name: "type", label: "Type", type: "enum", options: ["tenant", "region", "branch", "building", "floor", "zone"], required: true },
      { name: "parentId", label: "Parent ID", type: "string" },
      { name: "address", label: "Address", type: "string" },
      { name: "city", label: "City", type: "string" },
      { name: "state", label: "State", type: "string" },
      { name: "postalCode", label: "Postal Code", type: "string" },
      { name: "timezone", label: "Timezone", type: "string" },
      { name: "contactEmail", label: "Contact Email", type: "string" },
      { name: "contactPhone", label: "Contact Phone", type: "string" },
      { name: "createdAt", label: "Created At", type: "datetime", readonly: true },
    ],
    getRows: async (store) => {
      if ('db' in store && store.db) {
        const result = await (store as any).db.query(
          `SELECT id::text, name, type::text, parent_id::text as "parentId",
                  address, city, state, postal_code as "postalCode", timezone,
                  contact_email as "contactEmail", contact_phone as "contactPhone",
                  created_at as "createdAt"
           FROM resource_nodes
           ORDER BY type, name`
        );
        return result.rows;
      }
      const memStore = store as any;
      if (memStore.nodes instanceof Map) return Array.from(memStore.nodes.values());
      return store.listBranches?.() || [];
    },
    getRow: async (store, id) => {
      if ('db' in store && store.db) {
        const result = await (store as any).db.query(
          `SELECT id::text, name, type::text, parent_id::text as "parentId",
                  address, city, state, postal_code as "postalCode", timezone,
                  contact_email as "contactEmail", contact_phone as "contactPhone",
                  created_at as "createdAt"
           FROM resource_nodes WHERE id = $1`,
          [id]
        );
        return result.rows[0] || null;
      }
      const memStore = store as any;
      if (memStore.nodes instanceof Map) return memStore.nodes.get(id) || null;
      const branches = await store.listBranches?.();
      return branches?.find((b: any) => b.id === id) || null;
    },
    createRow: async (store, data) => {
      const id = data.id || `node-${randomUUID()}`;
      if ('db' in store && store.db) {
        const result = await (store as any).db.query(
          `INSERT INTO resource_nodes (id, name, type, parent_id, tenant_id, address, city, state, postal_code, timezone, contact_email, contact_phone, created_at)
           VALUES ($1, $2, $3::node_type, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
           RETURNING id::text, name, type::text, parent_id::text as "parentId",
                     address, city, state, postal_code as "postalCode", timezone,
                     contact_email as "contactEmail", contact_phone as "contactPhone",
                     created_at as "createdAt"`,
          [id, data.name, data.type, data.parentId, data.tenantId || '00000000-0000-4000-8000-000000000001', 
           data.address, data.city, data.state, data.postalCode, data.timezone, data.contactEmail, data.contactPhone]
        );
        return result.rows[0];
      }
      const record = {
        id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...data,
      };
      const memStore = store as any;
      if (memStore.nodes instanceof Map) {
        memStore.nodes.set(id, record);
      }
      return record;
    },
    updateRow: async (store, id, data) => {
      if ('db' in store && store.db) {
        const result = await (store as any).db.query(
          `UPDATE resource_nodes
           SET name = COALESCE($2, name),
               type = COALESCE($3::node_type, type),
               parent_id = COALESCE($4, parent_id),
               address = COALESCE($5, address),
               city = COALESCE($6, city),
               state = COALESCE($7, state),
               postal_code = COALESCE($8, postal_code),
               timezone = COALESCE($9, timezone),
               contact_email = COALESCE($10, contact_email),
               contact_phone = COALESCE($11, contact_phone),
               updated_at = now()
           WHERE id = $1
           RETURNING id::text, name, type::text, parent_id::text as "parentId",
                     address, city, state, postal_code as "postalCode", timezone,
                     contact_email as "contactEmail", contact_phone as "contactPhone",
                     created_at as "createdAt"`,
          [id, data.name, data.type, data.parentId, data.address, data.city, data.state, 
           data.postalCode, data.timezone, data.contactEmail, data.contactPhone]
        );
        if (result.rows.length === 0) throw new Error(`Node ${id} not found`);
        return result.rows[0];
      }
      const memStore = store as any;
      if (memStore.nodes instanceof Map) {
        const existing = memStore.nodes.get(id);
        if (!existing) throw new Error(`Node ${id} not found`);
        const updated = { ...existing, ...data, id, updatedAt: new Date().toISOString() };
        memStore.nodes.set(id, updated);
        return updated;
      }
      return null;
    },
    deleteRow: async (store, id) => {
      if ('db' in store && store.db) {
        const result = await (store as any).db.query(
          `DELETE FROM resource_nodes WHERE id = $1 RETURNING id`,
          [id]
        );
        return result.rows.length > 0;
      }
      const memStore = store as any;
      if (memStore.nodes instanceof Map) {
        return memStore.nodes.delete(id);
      }
      return false;
    },
  },

  cameras: {
    id: "cameras",
    name: "Cameras Inventory",
    category: "Surveillance",
    description: "Registered CCTV and IP cameras across all branches",
    primaryKey: "id",
    columns: [
      { name: "id", label: "Camera ID", type: "string", readonly: true, required: true },
      { name: "name", label: "Camera Name", type: "string", required: true },
      { name: "branchId", label: "Branch ID", type: "string", required: true },
      { name: "vendor", label: "Vendor", type: "string" },
      { name: "model", label: "Model", type: "string" },
      { name: "ipAddress", label: "IP Address", type: "string" },
      { name: "rtspUrl", label: "RTSP Stream URL", type: "string" },
      { name: "macAddress", label: "MAC Address", type: "string" },
      { name: "firmwareVersion", label: "Firmware", type: "string" },
      { name: "status", label: "Status", type: "enum", options: ["online", "offline", "degraded", "maintenance"] },
      { name: "capabilities", label: "Capabilities", type: "json" },
      { name: "createdAt", label: "Created At", type: "datetime", readonly: true },
    ],
    getRows: async (store) => {
      if ('db' in store && store.db) {
        const result = await (store as any).db.query(
          `SELECT c.id::text, c.name, c.branch_node_id::text as "branchId",
                  di.vendor, di.model, di.ipv4_address as "ipAddress",
                  di.rtsp_url as "rtspUrl", di.mac_address as "macAddress",
                  di.firmware_version as "firmwareVersion",
                  c.status::text, c.capabilities, c.created_at as "createdAt"
           FROM cameras c
           LEFT JOIN device_identities di ON c.device_uuid = di.device_uuid
           ORDER BY c.name, c.created_at`
        );
        return result.rows;
      }
      const memStore = store as any;
      if (memStore.cameras instanceof Map) return Array.from(memStore.cameras.values());
      return store.listCameras?.() || [];
    },
    getRow: async (store, id) => {
      if ('db' in store && store.db) {
        const result = await (store as any).db.query(
          `SELECT c.id::text, c.name, c.branch_node_id::text as "branchId",
                  di.vendor, di.model, di.ipv4_address as "ipAddress",
                  di.rtsp_url as "rtspUrl", di.mac_address as "macAddress",
                  di.firmware_version as "firmwareVersion",
                  c.status::text, c.capabilities, c.created_at as "createdAt"
           FROM cameras c
           LEFT JOIN device_identities di ON c.device_uuid = di.device_uuid
           WHERE c.id = $1`,
          [id]
        );
        return result.rows[0] || null;
      }
      const memStore = store as any;
      if (memStore.cameras instanceof Map) return memStore.cameras.get(id) || null;
      return store.getCamera?.(id) || null;
    },
    createRow: async (store, data) => {
      const id = data.id || `cam-${randomUUID()}`;
      if ('db' in store && store.db) {
        const result = await (store as any).db.query(
          `INSERT INTO cameras (id, name, branch_node_id, status, capabilities, created_at)
           VALUES ($1, $2, $3, $4::camera_status, $5, now())
           RETURNING id::text, name, branch_node_id::text as "branchId", status::text,
                     capabilities, created_at as "createdAt"`,
          [id, data.name, data.branchId, data.status || 'online', data.capabilities || {}]
        );
        return result.rows[0];
      }
      const record = {
        id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: data.status || "online",
        ...data,
      };
      const memStore = store as any;
      if (memStore.cameras instanceof Map) {
        memStore.cameras.set(id, record);
      }
      return record;
    },
    updateRow: async (store, id, data) => {
      if ('db' in store && store.db) {
        const result = await (store as any).db.query(
          `UPDATE cameras
           SET name = COALESCE($2, name),
               status = COALESCE($3::camera_status, status),
               capabilities = COALESCE($4, capabilities),
               updated_at = now()
           WHERE id = $1
           RETURNING id::text, name, branch_node_id::text as "branchId", status::text,
                     capabilities, created_at as "createdAt"`,
          [id, data.name, data.status, data.capabilities]
        );
        if (result.rows.length === 0) throw new Error(`Camera ${id} not found`);
        return result.rows[0];
      }
      const memStore = store as any;
      if (memStore.cameras instanceof Map) {
        const existing = memStore.cameras.get(id);
        if (!existing) throw new Error(`Camera ${id} not found`);
        const updated = { ...existing, ...data, id, updatedAt: new Date().toISOString() };
        memStore.cameras.set(id, updated);
        return updated;
      }
      return null;
    },
    deleteRow: async (store, id) => {
      if ('db' in store && store.db) {
        const result = await (store as any).db.query(
          `DELETE FROM cameras WHERE id = $1 RETURNING id`,
          [id]
        );
        return result.rows.length > 0;
      }
      const memStore = store as any;
      if (memStore.cameras instanceof Map) {
        return memStore.cameras.delete(id);
      }
      return false;
    },
  },

  edge_agents: {
    id: "edge_agents",
    name: "Edge Gateways & Agents",
    category: "Edge & Fleet",
    description: "Branch edge runner nodes, daemons and service instances",
    primaryKey: "id",
    columns: [
      { name: "id", label: "Agent ID", type: "string", readonly: true, required: true },
      { name: "name", label: "Agent Name", type: "string", required: true },
      { name: "branchId", label: "Branch ID", type: "string", required: true },
      { name: "version", label: "Version", type: "string" },
      { name: "status", label: "Status", type: "enum", options: ["online", "offline", "unhealthy", "enrolling"] },
      { name: "publicMediaUrl", label: "Public Media Gateway", type: "string" },
      { name: "lastHeartbeatAt", label: "Last Heartbeat", type: "datetime" },
      { name: "enrolledAt", label: "Enrolled At", type: "datetime", readonly: true },
    ],
    getRows: async (store) => {
      // For PostgresStore, query the database directly
      if ('db' in store && store.db) {
        const result = await (store as any).db.query(
          `SELECT e.id::text, e.branch_node_id::text as "branchId", e.name, e.version,
                  CASE WHEN e.last_seen_at < now() - interval '90 seconds'
                    THEN 'offline'::text ELSE e.status::text END AS status,
                  e.last_seen_at as "lastHeartbeatAt", e.public_media_url as "publicMediaUrl",
                  e.created_at as "enrolledAt"
           FROM edge_agents e
           ORDER BY e.name, e.created_at`
        );
        return result.rows;
      }
      // For MemoryStore, access the internal map through reflection
      const memStore = store as any;
      if (memStore.edgeAgents instanceof Map) {
        return Array.from(memStore.edgeAgents.values()).map((agent: any) => ({
          id: agent.id,
          name: agent.name,
          branchId: agent.branchId,
          version: agent.version,
          status: agent.status,
          publicMediaUrl: agent.publicMediaUrl,
          lastHeartbeatAt: agent.lastSeenAt,
          enrolledAt: agent.credentialIssuedAt || agent.createdAt,
        }));
      }
      return [];
    },
    getRow: async (store, id) => {
      if ('db' in store && store.db) {
        const result = await (store as any).db.query(
          `SELECT e.id::text, e.branch_node_id::text as "branchId", e.name, e.version,
                  e.status::text, e.last_seen_at as "lastHeartbeatAt",
                  e.public_media_url as "publicMediaUrl", e.created_at as "enrolledAt"
           FROM edge_agents e WHERE e.id = $1`,
          [id]
        );
        return result.rows[0] || null;
      }
      const memStore = store as any;
      if (memStore.edgeAgents instanceof Map) {
        const agent = memStore.edgeAgents.get(id);
        if (!agent) return null;
        return {
          id: agent.id,
          name: agent.name,
          branchId: agent.branchId,
          version: agent.version,
          status: agent.status,
          publicMediaUrl: agent.publicMediaUrl,
          lastHeartbeatAt: agent.lastSeenAt,
          enrolledAt: agent.credentialIssuedAt || agent.createdAt,
        };
      }
      return null;
    },
    createRow: async (store, data) => {
      const id = data.id || `agent-${randomUUID()}`;
      if ('db' in store && store.db) {
        const result = await (store as any).db.query(
          `INSERT INTO edge_agents (id, name, branch_node_id, version, status, public_media_url, created_at, last_seen_at)
           VALUES ($1, $2, $3, $4, $5, $6, now(), now())
           RETURNING id::text, branch_node_id::text as "branchId", name, version, status::text,
                     public_media_url as "publicMediaUrl", last_seen_at as "lastHeartbeatAt",
                     created_at as "enrolledAt"`,
          [id, data.name, data.branchId, data.version || '1.0.0', data.status || 'online', data.publicMediaUrl]
        );
        return result.rows[0];
      }
      const memStore = store as any;
      const record = {
        id,
        name: data.name,
        branchId: data.branchId,
        version: data.version || '1.0.0',
        status: data.status || "online",
        publicMediaUrl: data.publicMediaUrl,
        lastSeenAt: new Date().toISOString(),
        credentialIssuedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      if (memStore.edgeAgents instanceof Map) {
        memStore.edgeAgents.set(id, record);
      }
      return {
        id: record.id,
        name: record.name,
        branchId: record.branchId,
        version: record.version,
        status: record.status,
        publicMediaUrl: record.publicMediaUrl,
        lastHeartbeatAt: record.lastSeenAt,
        enrolledAt: record.credentialIssuedAt,
      };
    },
    updateRow: async (store, id, data) => {
      if ('db' in store && store.db) {
        const result = await (store as any).db.query(
          `UPDATE edge_agents
           SET name = COALESCE($2, name),
               version = COALESCE($3, version),
               status = COALESCE($4::edge_agent_status, status),
               public_media_url = COALESCE($5, public_media_url)
           WHERE id = $1
           RETURNING id::text, branch_node_id::text as "branchId", name, version, status::text,
                     public_media_url as "publicMediaUrl", last_seen_at as "lastHeartbeatAt",
                     created_at as "enrolledAt"`,
          [id, data.name, data.version, data.status, data.publicMediaUrl]
        );
        if (result.rows.length === 0) throw new Error(`Edge Agent ${id} not found`);
        return result.rows[0];
      }
      const memStore = store as any;
      if (memStore.edgeAgents instanceof Map) {
        const existing = memStore.edgeAgents.get(id);
        if (!existing) throw new Error(`Edge Agent ${id} not found`);
        const updated = { ...existing, ...data, id };
        memStore.edgeAgents.set(id, updated);
        return {
          id: updated.id,
          name: updated.name,
          branchId: updated.branchId,
          version: updated.version,
          status: updated.status,
          publicMediaUrl: updated.publicMediaUrl,
          lastHeartbeatAt: updated.lastSeenAt,
          enrolledAt: updated.credentialIssuedAt || updated.createdAt,
        };
      }
      return null;
    },
    deleteRow: async (store, id) => {
      if ('db' in store && store.db) {
        const result = await (store as any).db.query(
          `DELETE FROM edge_agents WHERE id = $1 RETURNING id`,
          [id]
        );
        return result.rows.length > 0;
      }
      const memStore = store as any;
      if (memStore.edgeAgents instanceof Map) {
        return memStore.edgeAgents.delete(id);
      }
      return false;
    },
  },

  users: {
    id: "users",
    name: "User Directory & Staff",
    category: "Core Topology",
    description: "Operators, administrators, auditors and security personnel",
    primaryKey: "id",
    columns: [
      { name: "id", label: "User ID", type: "string", readonly: true, required: true },
      { name: "email", label: "Email", type: "string", required: true },
      { name: "name", label: "Full Name", type: "string", required: true },
      { name: "role", label: "Role", type: "enum", options: ["global-admin", "branch-admin", "security-operator", "compliance-auditor", "viewer"] },
      { name: "tenantId", label: "Tenant ID", type: "string" },
      { name: "active", label: "Active", type: "boolean" },
      { name: "createdAt", label: "Created At", type: "datetime", readonly: true },
    ],
    getRows: async (store) => {
      if (store.users instanceof Map) return Array.from(store.users.values());
      return [];
    },
    getRow: async (store, id) => {
      if (store.users instanceof Map) return store.users.get(id) || null;
      return null;
    },
    createRow: async (store, data) => {
      const id = data.id || `user-${randomUUID()}`;
      const record = {
        id,
        active: data.active !== false,
        createdAt: new Date().toISOString(),
        ...data,
      };
      if (store.users instanceof Map) {
        store.users.set(id, record);
      }
      return record;
    },
    updateRow: async (store, id, data) => {
      if (store.users instanceof Map) {
        const existing = store.users.get(id);
        if (!existing) throw new Error(`User ${id} not found`);
        const updated = { ...existing, ...data, id };
        store.users.set(id, updated);
        return updated;
      }
      return null;
    },
    deleteRow: async (store, id) => {
      if (store.users instanceof Map) {
        return store.users.delete(id);
      }
      return false;
    },
  },

  recorders: {
    id: "recorders",
    name: "DVR / NVR Recorders",
    category: "Surveillance",
    description: "Physical and network video recording hardware appliances",
    primaryKey: "id",
    columns: [
      { name: "id", label: "Recorder ID", type: "string", readonly: true, required: true },
      { name: "branchId", label: "Branch ID", type: "string", required: true },
      { name: "vendor", label: "Vendor", type: "string" },
      { name: "model", label: "Model", type: "string" },
      { name: "channelCount", label: "Channels", type: "number" },
      { name: "ipAddress", label: "IP Address", type: "string" },
      { name: "status", label: "Status", type: "enum", options: ["online", "offline", "unhealthy"] },
      { name: "storageCapacityGb", label: "Capacity (GB)", type: "number" },
      { name: "storageUsedGb", label: "Used (GB)", type: "number" },
      { name: "observedAt", label: "Observed At", type: "datetime" },
    ],
    getRows: async (store) => {
      if (store.recordingStorageNodes instanceof Map) return Array.from(store.recordingStorageNodes.values());
      return [];
    },
    getRow: async (store, id) => {
      if (store.recordingStorageNodes instanceof Map) return store.recordingStorageNodes.get(id) || null;
      return null;
    },
    createRow: async (store, data) => {
      const id = data.id || `rec-${randomUUID()}`;
      const record = {
        id,
        status: data.status || "online",
        observedAt: new Date().toISOString(),
        ...data,
      };
      if (store.recordingStorageNodes instanceof Map) {
        store.recordingStorageNodes.set(id, record);
      }
      return record;
    },
    updateRow: async (store, id, data) => {
      if (store.recordingStorageNodes instanceof Map) {
        const existing = store.recordingStorageNodes.get(id);
        if (!existing) throw new Error(`Recorder ${id} not found`);
        const updated = { ...existing, ...data, id };
        store.recordingStorageNodes.set(id, updated);
        return updated;
      }
      return null;
    },
    deleteRow: async (store, id) => {
      if (store.recordingStorageNodes instanceof Map) {
        return store.recordingStorageNodes.delete(id);
      }
      return false;
    },
  },

  recording_jobs: {
    id: "recording_jobs",
    name: "Recording Jobs & Retention",
    category: "Surveillance",
    description: "Configured recording policies, retention targets and continuous modes",
    primaryKey: "cameraId",
    columns: [
      { name: "cameraId", label: "Camera ID", type: "string", readonly: true, required: true },
      { name: "enabled", label: "Enabled", type: "boolean", required: true },
      { name: "mode", label: "Mode", type: "enum", options: ["continuous", "motion_only", "scheduled", "disabled"] },
      { name: "retentionDays", label: "Retention Target (Days)", type: "number", required: true },
      { name: "storageNodeId", label: "Storage Node ID", type: "string" },
      { name: "updatedAt", label: "Updated At", type: "datetime" },
    ],
    getRows: async (store) => {
      if (store.recordingJobs instanceof Map) return Array.from(store.recordingJobs.values());
      return [];
    },
    getRow: async (store, id) => {
      if (store.recordingJobs instanceof Map) return store.recordingJobs.get(id) || null;
      return null;
    },
    createRow: async (store, data) => {
      const cameraId = data.cameraId;
      if (!cameraId) throw new Error("Camera ID is required");
      const record = {
        cameraId,
        enabled: data.enabled !== false,
        mode: data.mode || "continuous",
        retentionDays: Number(data.retentionDays) || 90,
        updatedAt: new Date().toISOString(),
        ...data,
      };
      if (store.recordingJobs instanceof Map) {
        store.recordingJobs.set(cameraId, record);
      }
      return record;
    },
    updateRow: async (store, id, data) => {
      if (store.recordingJobs instanceof Map) {
        const existing = store.recordingJobs.get(id);
        const updated = { ...(existing || {}), ...data, cameraId: id, updatedAt: new Date().toISOString() };
        store.recordingJobs.set(id, updated);
        return updated;
      }
      return null;
    },
    deleteRow: async (store, id) => {
      if (store.recordingJobs instanceof Map) {
        return store.recordingJobs.delete(id);
      }
      return false;
    },
  },

  operational_policies: {
    id: "operational_policies",
    name: "Operational Health Policies",
    category: "Surveillance",
    description: "Branch & tenant SLA rules, retention thresholds, and allowable recording gaps",
    primaryKey: "branchId",
    columns: [
      { name: "branchId", label: "Branch ID", type: "string", required: true },
      { name: "retentionDays", label: "Retention Required (Days)", type: "number", required: true },
      { name: "retentionWarningDays", label: "Warning Margin (Days)", type: "number" },
      { name: "maxRecordingGapSeconds", label: "Max Recording Gap (Sec)", type: "number" },
      { name: "recorderHeartbeatSeconds", label: "Heartbeat Tolerance (Sec)", type: "number" },
      { name: "updatedAt", label: "Updated At", type: "datetime" },
    ],
    getRows: async (store) => {
      if (store.operationalHealthPolicies instanceof Map) {
        return Array.from(store.operationalHealthPolicies.entries()).map((entry: any) => {
          const [branchId, policy] = entry as [string, any];
          return {
            branchId,
            ...policy,
          };
        });
      }
      return [];
    },
    getRow: async (store, id) => {
      if (store.operationalHealthPolicies instanceof Map) {
        const policy = store.operationalHealthPolicies.get(id);
        return policy ? { branchId: id, ...policy } : null;
      }
      return null;
    },
    createRow: async (store, data) => {
      const branchId = data.branchId;
      if (!branchId) throw new Error("Branch ID is required");
      const policy = {
        retentionDays: Number(data.retentionDays) || 90,
        retentionWarningDays: Number(data.retentionWarningDays) || 14,
        maxRecordingGapSeconds: Number(data.maxRecordingGapSeconds) || 60,
        recorderHeartbeatSeconds: Number(data.recorderHeartbeatSeconds) || 30,
        updatedAt: new Date().toISOString(),
      };
      if (store.operationalHealthPolicies instanceof Map) {
        store.operationalHealthPolicies.set(branchId, policy);
      }
      return { branchId, ...policy };
    },
    updateRow: async (store, id, data) => {
      if (store.operationalHealthPolicies instanceof Map) {
        const existing = store.operationalHealthPolicies.get(id) || {};
        const policy = { ...existing, ...data, updatedAt: new Date().toISOString() };
        store.operationalHealthPolicies.set(id, policy);
        return { branchId: id, ...policy };
      }
      return null;
    },
    deleteRow: async (store, id) => {
      if (store.operationalHealthPolicies instanceof Map) {
        return store.operationalHealthPolicies.delete(id);
      }
      return false;
    },
  },

  analytics_rules: {
    id: "analytics_rules",
    name: "AI Analytics Rules",
    category: "AI & Analytics",
    description: "Configured edge & cloud AI detection rules, triggers, and schedules",
    primaryKey: "id",
    columns: [
      { name: "id", label: "Rule ID", type: "string", readonly: true, required: true },
      { name: "cameraId", label: "Camera ID", type: "string", required: true },
      { name: "detectionType", label: "Detection Type", type: "string", required: true },
      { name: "name", label: "Rule Name", type: "string", required: true },
      { name: "enabled", label: "Enabled", type: "boolean", required: true },
      { name: "severity", label: "Severity", type: "enum", options: ["low", "medium", "high", "critical"] },
      { name: "confidenceThreshold", label: "Confidence Threshold", type: "number" },
      { name: "zones", label: "Zones", type: "json" },
      { name: "schedule", label: "Schedule", type: "json" },
      { name: "createdAt", label: "Created At", type: "datetime", readonly: true },
    ],
    getRows: async (store) => {
      if (Array.isArray(store.analyticsRules)) return store.analyticsRules;
      return [];
    },
    getRow: async (store, id) => {
      if (Array.isArray(store.analyticsRules)) return store.analyticsRules.find((r: any) => r.id === id) || null;
      return null;
    },
    createRow: async (store, data) => {
      const id = data.id || `rule-${randomUUID()}`;
      const record = {
        id,
        enabled: data.enabled !== false,
        severity: data.severity || "medium",
        confidenceThreshold: Number(data.confidenceThreshold) || 0.75,
        createdAt: new Date().toISOString(),
        ...data,
      };
      if (Array.isArray(store.analyticsRules)) {
        store.analyticsRules.push(record);
      }
      return record;
    },
    updateRow: async (store, id, data) => {
      if (Array.isArray(store.analyticsRules)) {
        const index = store.analyticsRules.findIndex((r: any) => r.id === id);
        if (index < 0) throw new Error(`Rule ${id} not found`);
        store.analyticsRules[index] = { ...store.analyticsRules[index], ...data, id };
        return store.analyticsRules[index];
      }
      return null;
    },
    deleteRow: async (store, id) => {
      if (Array.isArray(store.analyticsRules)) {
        const index = store.analyticsRules.findIndex((r: any) => r.id === id);
        if (index >= 0) {
          store.analyticsRules.splice(index, 1);
          return true;
        }
      }
      return false;
    },
  },

  analytics_alerts: {
    id: "analytics_alerts",
    name: "AI Generated Alerts",
    category: "AI & Analytics",
    description: "Incidents, bounding boxes, person/vehicle detections and safety breaches",
    primaryKey: "id",
    columns: [
      { name: "id", label: "Alert ID", type: "string", readonly: true, required: true },
      { name: "ruleId", label: "Rule ID", type: "string" },
      { name: "cameraId", label: "Camera ID", type: "string", required: true },
      { name: "branchId", label: "Branch ID", type: "string", required: true },
      { name: "detectionType", label: "Type", type: "string", required: true },
      { name: "severity", label: "Severity", type: "enum", options: ["low", "medium", "high", "critical"] },
      { name: "status", label: "Status", type: "enum", options: ["new", "acknowledged", "in_progress", "resolved", "dismissed"] },
      { name: "confidence", label: "Confidence", type: "number" },
      { name: "timestamp", label: "Timestamp", type: "datetime", required: true },
      { name: "details", label: "Details / Objects", type: "json" },
    ],
    getRows: async (store) => {
      if (Array.isArray(store.analyticsAlerts)) return store.analyticsAlerts;
      return [];
    },
    getRow: async (store, id) => {
      if (Array.isArray(store.analyticsAlerts)) return store.analyticsAlerts.find((a: any) => a.id === id) || null;
      return null;
    },
    createRow: async (store, data) => {
      const id = data.id || `alert-${randomUUID()}`;
      const record = {
        id,
        status: data.status || "new",
        severity: data.severity || "medium",
        confidence: Number(data.confidence) || 0.9,
        timestamp: data.timestamp || new Date().toISOString(),
        ...data,
      };
      if (Array.isArray(store.analyticsAlerts)) {
        store.analyticsAlerts.unshift(record);
      }
      return record;
    },
    updateRow: async (store, id, data) => {
      if (Array.isArray(store.analyticsAlerts)) {
        const index = store.analyticsAlerts.findIndex((a: any) => a.id === id);
        if (index < 0) throw new Error(`Alert ${id} not found`);
        store.analyticsAlerts[index] = { ...store.analyticsAlerts[index], ...data, id };
        return store.analyticsAlerts[index];
      }
      return null;
    },
    deleteRow: async (store, id) => {
      if (Array.isArray(store.analyticsAlerts)) {
        const index = store.analyticsAlerts.findIndex((a: any) => a.id === id);
        if (index >= 0) {
          store.analyticsAlerts.splice(index, 1);
          return true;
        }
      }
      return false;
    },
  },

  discoveries: {
    id: "discoveries",
    name: "Discovered Devices",
    category: "Edge & Fleet",
    description: "Candidate ONVIF / RTSP cameras discovered on branch networks",
    primaryKey: "id",
    columns: [
      { name: "id", label: "Discovery ID", type: "string", readonly: true, required: true },
      { name: "edgeAgentId", label: "Edge Agent ID", type: "string", required: true },
      { name: "ipAddress", label: "IP Address", type: "string", required: true },
      { name: "model", label: "Model", type: "string" },
      { name: "vendor", label: "Vendor", type: "string" },
      { name: "approvalStatus", label: "Approval Status", type: "enum", options: ["pending", "approved", "rejected", "provisioned"] },
      { name: "discoveredAt", label: "Discovered At", type: "datetime" },
    ],
    getRows: async (store) => {
      if (store.discoveries instanceof Map) return Array.from(store.discoveries.values());
      return [];
    },
    getRow: async (store, id) => {
      if (store.discoveries instanceof Map) return store.discoveries.get(id) || null;
      return null;
    },
    createRow: async (store, data) => {
      const id = data.id || `disc-${randomUUID()}`;
      const record = {
        id,
        approvalStatus: data.approvalStatus || "pending",
        discoveredAt: new Date().toISOString(),
        ...data,
      };
      if (store.discoveries instanceof Map) {
        store.discoveries.set(id, record);
      }
      return record;
    },
    updateRow: async (store, id, data) => {
      if (store.discoveries instanceof Map) {
        const existing = store.discoveries.get(id);
        if (!existing) throw new Error(`Discovery ${id} not found`);
        const updated = { ...existing, ...data, id };
        store.discoveries.set(id, updated);
        return updated;
      }
      return null;
    },
    deleteRow: async (store, id) => {
      if (store.discoveries instanceof Map) {
        return store.discoveries.delete(id);
      }
      return false;
    },
  },

  audit_events: {
    id: "audit_events",
    name: "Audit Trail Logs",
    category: "Incidents & Audit",
    description: "Tamper-evident audit logs of user actions, policy updates and security commands",
    primaryKey: "id",
    columns: [
      { name: "id", label: "Audit ID", type: "string", readonly: true, required: true },
      { name: "actorId", label: "Actor ID", type: "string", required: true },
      { name: "action", label: "Action", type: "string", required: true },
      { name: "resourceType", label: "Resource Type", type: "string", required: true },
      { name: "resourceId", label: "Resource ID", type: "string", required: true },
      { name: "occurredAt", label: "Occurred At", type: "datetime", required: true },
      { name: "payload", label: "Payload", type: "json" },
    ],
    getRows: async (store) => {
      if (Array.isArray(store.auditEvents)) return store.auditEvents;
      return [];
    },
    getRow: async (store, id) => {
      if (Array.isArray(store.auditEvents)) return store.auditEvents.find((a: any) => (a.id || a.auditId) === id) || null;
      return null;
    },
    createRow: async (store, data) => {
      const id = data.id || `audit-${randomUUID()}`;
      const record = {
        id,
        occurredAt: data.occurredAt || new Date().toISOString(),
        ...data,
      };
      if (Array.isArray(store.auditEvents)) {
        store.auditEvents.unshift(record);
      }
      return record;
    },
    updateRow: async (store, id, data) => {
      if (Array.isArray(store.auditEvents)) {
        const index = store.auditEvents.findIndex((a: any) => (a.id || a.auditId) === id);
        if (index < 0) throw new Error(`Audit event ${id} not found`);
        store.auditEvents[index] = { ...store.auditEvents[index], ...data, id };
        return store.auditEvents[index];
      }
      return null;
    },
    deleteRow: async (store, id) => {
      if (Array.isArray(store.auditEvents)) {
        const index = store.auditEvents.findIndex((a: any) => (a.id || a.auditId) === id);
        if (index >= 0) {
          store.auditEvents.splice(index, 1);
          return true;
        }
      }
      return false;
    },
  },
};

export async function registerAdminDatabaseRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  /**
   * GET /v1/admin/database/tables
   * List all accessible tables with metadata and live row counts
   */
  app.get("/v1/admin/database/tables", async (request, reply) => {
    const tables = await Promise.all(
      Object.values(TABLE_REGISTRY).map(async (def) => {
        let count = 0;
        try {
          const rows = await def.getRows(store);
          count = rows ? rows.length : 0;
        } catch {
          count = 0;
        }
        return {
          id: def.id,
          name: def.name,
          category: def.category,
          description: def.description,
          primaryKey: def.primaryKey,
          columnCount: def.columns.length,
          rowCount: count,
          columns: def.columns,
        };
      })
    );

    return reply.send({
      success: true,
      data: {
        tables,
        totalTables: tables.length,
      },
    });
  });

  /**
   * GET /v1/admin/database/tables/:tableId
   * Retrieve schema and paginated, searchable rows for a table
   */
  app.get("/v1/admin/database/tables/:tableId", async (request, reply) => {
    const { tableId } = z.object({ tableId: z.string() }).parse(request.params);
    const query = z
      .object({
        search: z.string().optional(),
        sortBy: z.string().optional(),
        sortOrder: z.enum(["asc", "desc"]).default("asc"),
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(500).default(50),
      })
      .parse(request.query);

    const def = TABLE_REGISTRY[tableId];
    if (!def) {
      return reply.code(404).send({ success: false, error: `Table '${tableId}' not found` });
    }

    let rows: any[] = [];
    try {
      rows = (await def.getRows(store)) || [];
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: `Failed to load rows: ${err.message}` });
    }

    // Search filter
    if (query.search) {
      const q = query.search.toLowerCase();
      rows = rows.filter((row) =>
        Object.values(row).some((val) => {
          if (val === null || val === undefined) return false;
          if (typeof val === "object") return JSON.stringify(val).toLowerCase().includes(q);
          return String(val).toLowerCase().includes(q);
        })
      );
    }

    // Sorting
    if (query.sortBy) {
      const key = query.sortBy;
      const factor = query.sortOrder === "desc" ? -1 : 1;
      rows.sort((a, b) => {
        const valA = a[key];
        const valB = b[key];
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (typeof valA === "number" && typeof valB === "number") return (valA - valB) * factor;
        return String(valA).localeCompare(String(valB)) * factor;
      });
    }

    const total = rows.length;
    const offset = (query.page - 1) * query.limit;
    const paginated = rows.slice(offset, offset + query.limit);

    return reply.send({
      success: true,
      data: {
        table: {
          id: def.id,
          name: def.name,
          category: def.category,
          description: def.description,
          primaryKey: def.primaryKey,
          columns: def.columns,
        },
        rows: paginated,
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    });
  });

  /**
   * POST /v1/admin/database/tables/:tableId/rows
   * Create a new row in a table
   */
  app.post("/v1/admin/database/tables/:tableId/rows", async (request, reply) => {
    const { tableId } = z.object({ tableId: z.string() }).parse(request.params);
    const body = request.body as Record<string, unknown>;

    const def = TABLE_REGISTRY[tableId];
    if (!def) {
      return reply.code(404).send({ success: false, error: `Table '${tableId}' not found` });
    }

    try {
      const created = await def.createRow(store, body);
      return reply.code(201).send({
        success: true,
        data: created,
        message: `Successfully created record in ${def.name}`,
      });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  /**
   * PUT /v1/admin/database/tables/:tableId/rows/:rowId
   * Update an existing row
   */
  app.put("/v1/admin/database/tables/:tableId/rows/:rowId", async (request, reply) => {
    const { tableId, rowId } = z.object({ tableId: z.string(), rowId: z.string() }).parse(request.params);
    const body = request.body as Record<string, unknown>;

    const def = TABLE_REGISTRY[tableId];
    if (!def) {
      return reply.code(404).send({ success: false, error: `Table '${tableId}' not found` });
    }

    try {
      const updated = await def.updateRow(store, rowId, body);
      return reply.send({
        success: true,
        data: updated,
        message: `Successfully updated record ${rowId} in ${def.name}`,
      });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  /**
   * DELETE /v1/admin/database/tables/:tableId/rows/:rowId
   * Delete a row by its primary key
   */
  app.delete("/v1/admin/database/tables/:tableId/rows/:rowId", async (request, reply) => {
    const { tableId, rowId } = z.object({ tableId: z.string(), rowId: z.string() }).parse(request.params);

    const def = TABLE_REGISTRY[tableId];
    if (!def) {
      return reply.code(404).send({ success: false, error: `Table '${tableId}' not found` });
    }

    try {
      const deleted = await def.deleteRow(store, rowId);
      if (!deleted) {
        return reply.code(404).send({ success: false, error: `Record '${rowId}' not found in ${def.name}` });
      }
      return reply.send({
        success: true,
        data: { id: rowId },
        message: `Successfully deleted record ${rowId} from ${def.name}`,
      });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });
}
