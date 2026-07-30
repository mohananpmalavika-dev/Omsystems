import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  TwinAlertMarker, TwinBinding, TwinBuilding, TwinEvent, TwinFloor, TwinFloorPlan,
  TwinObject, TwinObjectType, TwinSeverity, TwinSite, TwinZone,
} from "./types.js";

export interface TwinScope { tenantId: string; branchId: string; buildingId: string; floorId?: string; }
export interface TwinObjectInput {
  floorId: string; objectType: TwinObjectType; name: string; description?: string;
  positionX: number; positionY: number; positionZ?: number; rotation?: number; scale?: number;
  iconName?: string; color?: string; fieldOfView?: number; viewingDistance?: number; cameraAngle?: number;
  showStatus?: boolean; showLabel?: boolean; showFieldOfView?: boolean; metadata?: Record<string, unknown>;
}
export interface TwinBindingInput {
  twinObjectId: string; tenantId: string; branchId: string; deviceType: TwinBinding["deviceType"]; deviceId: string;
  statusSource?: string; alertSource?: string; autoUpdate?: boolean; metadata?: Record<string, unknown>;
}
export interface TwinZoneInput {
  floorId: string; name: string; description?: string; zoneType: string;
  vertices: Array<{ x: number; y: number }>; fillColor?: string; fillOpacity?: number;
  strokeColor?: string; strokeWidth?: number; isRestricted?: boolean; alertOnEntry?: boolean;
  alertOnDwell?: boolean; maxDwellSeconds?: number; analyticsEnabled?: boolean; analyticsConfig?: Record<string, unknown>;
}
export interface TwinPlanInput {
  floorId: string; storageKey: string; fileType: TwinFloorPlan["fileType"]; contentType: string;
  fileSizeBytes: number; originalFilename: string; widthPixels?: number; heightPixels?: number;
  scaleMetersPerPixel?: number; originX?: number; originY?: number; rotationDegrees?: number; uploadedBy: string;
}
export interface TwinEventInput {
  tenantId: string; branchId: string; floorId: string; twinObjectId?: string; deviceType?: string; deviceId?: string;
  eventType: string; state?: string; previousState?: string; severity: TwinSeverity;
  positionX?: number; positionY?: number; source: string; idempotencyKey: string;
  metadata?: Record<string, unknown>; occurredAt: string;
}
export interface TwinAuditInput {
  userId: string; action: string; entityType: string; entityId: string; floorId?: string; buildingId?: string;
  previousState?: Record<string, unknown>; newState?: Record<string, unknown>; summary: string;
}

export interface DigitalTwinState {
  bootstrap(tenantId: string, branchId: string, branchName: string, userId: string): Promise<{ site: TwinSite; building: TwinBuilding; floor: TwinFloor }>;
  getBuildingByBranch(tenantId: string, branchId: string): Promise<TwinBuilding | undefined>;
  getBuilding(id: string): Promise<TwinBuilding | undefined>;
  listFloors(buildingId: string): Promise<TwinFloor[]>;
  getFloor(id: string): Promise<TwinFloor | undefined>;
  createFloor(input: { buildingId: string; floorNumber: number; name: string; description?: string; floorHeightMeters?: number; areaSquareMeters?: number }): Promise<TwinFloor>;
  floorScope(floorId: string): Promise<TwinScope | undefined>;
  objectScope(objectId: string): Promise<TwinScope | undefined>;
  createPlan(input: TwinPlanInput): Promise<TwinFloorPlan>;
  getActivePlan(floorId: string): Promise<TwinFloorPlan | undefined>;
  getPlan(planId: string): Promise<TwinFloorPlan | undefined>;
  listPlans(floorId: string): Promise<TwinFloorPlan[]>;
  activatePlan(planId: string, floorId: string): Promise<TwinFloorPlan | undefined>;
  createObject(input: TwinObjectInput, userId: string): Promise<TwinObject>;
  updateObject(id: string, input: Partial<TwinObjectInput>): Promise<TwinObject | undefined>;
  deleteObject(id: string): Promise<boolean>;
  getObject(id: string): Promise<TwinObject | undefined>;
  listObjects(floorId: string): Promise<TwinObject[]>;
  bindDevice(input: TwinBindingInput): Promise<TwinBinding>;
  deleteBinding(id: string): Promise<boolean>;
  listBindings(floorId: string): Promise<TwinBinding[]>;
  createZone(input: TwinZoneInput, userId: string): Promise<TwinZone>;
  updateZone(id: string, input: Partial<TwinZoneInput>): Promise<TwinZone | undefined>;
  deleteZone(id: string): Promise<boolean>;
  listZones(floorId: string): Promise<TwinZone[]>;
  recordEvent(input: TwinEventInput): Promise<{ event: TwinEvent; duplicate: boolean }>;
  listEvents(floorId: string, from: string, to: string, limit: number): Promise<TwinEvent[]>;
  latestEvents(floorId: string): Promise<TwinEvent[]>;
  createAlert(input: Omit<TwinAlertMarker, "id" | "acknowledgedAt" | "resolvedAt">): Promise<TwinAlertMarker>;
  listAlerts(floorId: string, activeOnly?: boolean): Promise<TwinAlertMarker[]>;
  acknowledgeAlert(id: string, userId: string): Promise<TwinAlertMarker | undefined>;
  resolveAlert(id: string, userId: string): Promise<TwinAlertMarker | undefined>;
  writeAudit(input: TwinAuditInput): Promise<void>;
  listAudit(floorId: string, limit: number): Promise<Array<Record<string, unknown>>>;
}

export function createDigitalTwinState(store: unknown): DigitalTwinState {
  const pool = (store as { db?: Pool }).db;
  return pool ? new PostgresDigitalTwinState(pool) : new MemoryDigitalTwinState();
}

export class MemoryDigitalTwinState implements DigitalTwinState {
  readonly sites = new Map<string, TwinSite>();
  readonly buildings = new Map<string, TwinBuilding>();
  readonly floors = new Map<string, TwinFloor>();
  readonly plans = new Map<string, TwinFloorPlan>();
  readonly objects = new Map<string, TwinObject>();
  readonly bindings = new Map<string, TwinBinding>();
  readonly zones = new Map<string, TwinZone>();
  readonly events = new Map<string, TwinEvent>();
  readonly eventKeys = new Map<string, string>();
  readonly alerts = new Map<string, TwinAlertMarker>();
  readonly audits: Array<Record<string, unknown>> = [];

  async bootstrap(tenantId: string, branchId: string, branchName: string, userId: string) {
    let site = [...this.sites.values()].find((item) => item.tenantId === tenantId);
    const now = new Date().toISOString();
    if (!site) {
      site = { id: randomUUID(), tenantId, name: "Branch Digital Twins", description: "Operational branch twins", address: null, timezone: "Asia/Kolkata", createdAt: now, updatedAt: now };
      this.sites.set(site.id, site);
    }
    let building = [...this.buildings.values()].find((item) => item.branchId === branchId);
    if (!building) {
      building = { id: randomUUID(), siteId: site.id, branchId, name: branchName, description: null, buildingType: "branch", totalFloors: 1, createdAt: now, updatedAt: now };
      this.buildings.set(building.id, building);
    }
    let floor = [...this.floors.values()].find((item) => item.buildingId === building!.id && item.floorNumber === 0);
    if (!floor) floor = await this.createFloor({ buildingId: building.id, floorNumber: 0, name: "Ground Floor" });
    void userId;
    return { site, building, floor };
  }
  async getBuildingByBranch(tenantId: string, branchId: string) {
    const building = [...this.buildings.values()].find((item) => item.branchId === branchId);
    if (!building) return undefined;
    return this.sites.get(building.siteId)?.tenantId === tenantId ? clone(building) : undefined;
  }
  async getBuilding(id: string) { return cloned(this.buildings.get(id)); }
  async listFloors(buildingId: string) { return [...this.floors.values()].filter((item) => item.buildingId === buildingId).sort((a, b) => a.floorNumber - b.floorNumber).map(clone); }
  async getFloor(id: string) { return cloned(this.floors.get(id)); }
  async createFloor(input: { buildingId: string; floorNumber: number; name: string; description?: string; floorHeightMeters?: number; areaSquareMeters?: number }) {
    const existing = [...this.floors.values()].find((item) => item.buildingId === input.buildingId && item.floorNumber === input.floorNumber);
    if (existing) throw new Error("floor_number_exists");
    const now = new Date().toISOString();
    const value: TwinFloor = { id: randomUUID(), buildingId: input.buildingId, floorNumber: input.floorNumber, name: input.name, description: input.description ?? null, floorHeightMeters: input.floorHeightMeters ?? null, areaSquareMeters: input.areaSquareMeters ?? null, createdAt: now, updatedAt: now };
    this.floors.set(value.id, value);
    const building = this.buildings.get(input.buildingId); if (building) building.totalFloors = this.floorsFor(input.buildingId).length;
    return clone(value);
  }
  async floorScope(floorId: string) {
    const floor = this.floors.get(floorId); const building = floor && this.buildings.get(floor.buildingId); const site = building && this.sites.get(building.siteId);
    return floor && building && site ? { tenantId: site.tenantId, branchId: building.branchId, buildingId: building.id, floorId } : undefined;
  }
  async objectScope(objectId: string) { const object = this.objects.get(objectId); return object ? this.floorScope(object.floorId) : undefined; }
  async createPlan(input: TwinPlanInput) {
    for (const plan of this.plans.values()) if (plan.floorId === input.floorId) plan.isActive = false;
    const version = Math.max(0, ...[...this.plans.values()].filter((item) => item.floorId === input.floorId).map((item) => item.version)) + 1;
    const value = planValue(randomUUID(), version, input);
    this.plans.set(value.id, value); return clone(value);
  }
  async getActivePlan(floorId: string) { return cloned([...this.plans.values()].find((item) => item.floorId === floorId && item.isActive)); }
  async getPlan(planId: string) { return cloned(this.plans.get(planId)); }
  async listPlans(floorId: string) { return [...this.plans.values()].filter((item) => item.floorId === floorId).sort((a, b) => b.version - a.version).map(clone); }
  async activatePlan(planId: string, floorId: string) {
    const selected = this.plans.get(planId); if (!selected || selected.floorId !== floorId) return undefined;
    for (const plan of this.plans.values()) if (plan.floorId === floorId) plan.isActive = plan.id === planId;
    return clone(selected);
  }
  async createObject(input: TwinObjectInput, _userId: string) {
    const value = objectValue(randomUUID(), input); this.objects.set(value.id, value); return clone(value);
  }
  async updateObject(id: string, input: Partial<TwinObjectInput>) {
    const current = this.objects.get(id); if (!current) return undefined;
    assignObject(current, input); current.updatedAt = new Date().toISOString(); return clone(current);
  }
  async deleteObject(id: string) { const result = this.objects.delete(id); for (const [key, binding] of this.bindings) if (binding.twinObjectId === id) this.bindings.delete(key); return result; }
  async getObject(id: string) { const object = this.objects.get(id); return object ? clone({ ...object, binding: this.bindingFor(object.id) ?? null }) : undefined; }
  async listObjects(floorId: string) { return [...this.objects.values()].filter((item) => item.floorId === floorId).map((item) => clone({ ...item, binding: this.bindingFor(item.id) ?? null })); }
  async bindDevice(input: TwinBindingInput) {
    for (const binding of this.bindings.values()) if (binding.tenantId === input.tenantId && binding.branchId === input.branchId && binding.deviceType === input.deviceType && binding.deviceId === input.deviceId && binding.twinObjectId !== input.twinObjectId) throw new Error("device_already_bound");
    const existing = this.bindingFor(input.twinObjectId);
    const now = new Date().toISOString();
    const value: TwinBinding = { id: existing?.id ?? randomUUID(), twinObjectId: input.twinObjectId, tenantId: input.tenantId, branchId: input.branchId, deviceType: input.deviceType, deviceId: input.deviceId, statusSource: input.statusSource ?? null, alertSource: input.alertSource ?? null, autoUpdate: input.autoUpdate ?? true, metadata: input.metadata ?? {} };
    this.bindings.set(value.id, value); const object = this.objects.get(input.twinObjectId); if (object) object.binding = value;
    void now; return clone(value);
  }
  async deleteBinding(id: string) { const binding = this.bindings.get(id); const result = this.bindings.delete(id); if (binding) { const object = this.objects.get(binding.twinObjectId); if (object) object.binding = null; } return result; }
  async listBindings(floorId: string) { const ids = new Set([...this.objects.values()].filter((item) => item.floorId === floorId).map((item) => item.id)); return [...this.bindings.values()].filter((item) => ids.has(item.twinObjectId)).map(clone); }
  async createZone(input: TwinZoneInput, _userId: string) { const value = zoneValue(randomUUID(), input); this.zones.set(value.id, value); return clone(value); }
  async updateZone(id: string, input: Partial<TwinZoneInput>) { const value = this.zones.get(id); if (!value) return undefined; Object.assign(value, clean(input), { updatedAt: new Date().toISOString() }); return clone(value); }
  async deleteZone(id: string) { return this.zones.delete(id); }
  async listZones(floorId: string) { return [...this.zones.values()].filter((item) => item.floorId === floorId).map(clone); }
  async recordEvent(input: TwinEventInput) {
    const key = `${input.tenantId}:${input.idempotencyKey}`; const existingId = this.eventKeys.get(key);
    if (existingId) return { event: clone(this.events.get(existingId)!), duplicate: true };
    const event = eventValue(randomUUID(), input); this.events.set(event.id, event); this.eventKeys.set(key, event.id); return { event: clone(event), duplicate: false };
  }
  async listEvents(floorId: string, from: string, to: string, limit: number) { return [...this.events.values()].filter((item) => item.floorId === floorId && item.occurredAt >= from && item.occurredAt <= to).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).slice(-limit).map(clone); }
  async latestEvents(floorId: string) {
    const latest = new Map<string, TwinEvent>();
    for (const event of [...this.events.values()].filter((item) => item.floorId === floorId).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) latest.set(event.twinObjectId ?? `${event.deviceType}:${event.deviceId}`, event);
    return [...latest.values()].map(clone);
  }
  async createAlert(input: Omit<TwinAlertMarker, "id" | "acknowledgedAt" | "resolvedAt">) { const value = { ...input, id: randomUUID(), acknowledgedAt: null, resolvedAt: null }; this.alerts.set(value.id, value); return clone(value); }
  async listAlerts(floorId: string, activeOnly = true) { return [...this.alerts.values()].filter((item) => item.floorId === floorId && (!activeOnly || !item.resolvedAt)).sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt)).map(clone); }
  async acknowledgeAlert(id: string, _userId: string) { const value = this.alerts.get(id); if (!value) return undefined; value.acknowledgedAt ??= new Date().toISOString(); return clone(value); }
  async resolveAlert(id: string, _userId: string) { const value = this.alerts.get(id); if (!value) return undefined; value.resolvedAt ??= new Date().toISOString(); return clone(value); }
  async writeAudit(input: TwinAuditInput) { this.audits.unshift({ id: randomUUID(), ...clone(input), timestamp: new Date().toISOString() }); }
  async listAudit(floorId: string, limit: number) { return this.audits.filter((item) => item.floorId === floorId).slice(0, limit).map(clone); }
  private floorsFor(buildingId: string) { return [...this.floors.values()].filter((item) => item.buildingId === buildingId); }
  private bindingFor(objectId: string) { return [...this.bindings.values()].find((item) => item.twinObjectId === objectId); }
}

class PostgresDigitalTwinState implements DigitalTwinState {
  constructor(private readonly pool: Pool) {}
  async bootstrap(tenantId: string, branchId: string, branchName: string, userId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const siteResult = await client.query(`INSERT INTO digital_twin_sites (organization_id,name,description,timezone,created_by) VALUES ($1,'Branch Digital Twins','Operational branch twins','Asia/Kolkata',$2) ON CONFLICT (organization_id,name) DO UPDATE SET updated_at=now() RETURNING *`, [tenantId, userId]);
      const site = mapSite(siteResult.rows[0]);
      const existingBuilding = await client.query(`SELECT * FROM digital_twin_buildings WHERE branch_id=$1`, [branchId]);
      const building = existingBuilding.rows[0] ? mapBuilding(existingBuilding.rows[0]) : mapBuilding((await client.query(`INSERT INTO digital_twin_buildings (site_id,branch_id,name,building_type,total_floors) VALUES ($1,$2,$3,'branch',1) RETURNING *`, [site.id, branchId, branchName])).rows[0]);
      const floorResult = await client.query(`INSERT INTO digital_twin_floors (building_id,floor_number,name) VALUES ($1,0,'Ground Floor') ON CONFLICT (building_id,floor_number) DO UPDATE SET name=digital_twin_floors.name RETURNING *`, [building.id]);
      await client.query("COMMIT");
      return { site, building, floor: mapFloor(floorResult.rows[0]) };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async getBuildingByBranch(tenantId: string, branchId: string) { const row = (await this.pool.query(`SELECT b.* FROM digital_twin_buildings b JOIN digital_twin_sites s ON s.id=b.site_id WHERE s.organization_id=$1 AND b.branch_id=$2`, [tenantId, branchId])).rows[0]; return row ? mapBuilding(row) : undefined; }
  async getBuilding(id: string) { const row = (await this.pool.query(`SELECT * FROM digital_twin_buildings WHERE id=$1`, [id])).rows[0]; return row ? mapBuilding(row) : undefined; }
  async listFloors(buildingId: string) { return (await this.pool.query(`SELECT * FROM digital_twin_floors WHERE building_id=$1 ORDER BY floor_number`, [buildingId])).rows.map(mapFloor); }
  async getFloor(id: string) { const row = (await this.pool.query(`SELECT * FROM digital_twin_floors WHERE id=$1`, [id])).rows[0]; return row ? mapFloor(row) : undefined; }
  async createFloor(input: { buildingId: string; floorNumber: number; name: string; description?: string; floorHeightMeters?: number; areaSquareMeters?: number }) {
    const row = (await this.pool.query(`INSERT INTO digital_twin_floors (building_id,floor_number,name,description,floor_height_meters,area_square_meters) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [input.buildingId, input.floorNumber, input.name, input.description ?? null, input.floorHeightMeters ?? null, input.areaSquareMeters ?? null])).rows[0];
    await this.pool.query(`UPDATE digital_twin_buildings SET total_floors=(SELECT count(*) FROM digital_twin_floors WHERE building_id=$1) WHERE id=$1`, [input.buildingId]); return mapFloor(row);
  }
  async floorScope(floorId: string) { const row = (await this.pool.query(`SELECT s.organization_id::text tenant_id,b.branch_id::text,b.id::text building_id,f.id::text floor_id FROM digital_twin_floors f JOIN digital_twin_buildings b ON b.id=f.building_id JOIN digital_twin_sites s ON s.id=b.site_id WHERE f.id=$1`, [floorId])).rows[0]; return row ? { tenantId: row.tenant_id, branchId: row.branch_id, buildingId: row.building_id, floorId: row.floor_id } : undefined; }
  async objectScope(objectId: string) { const row = (await this.pool.query(`SELECT s.organization_id::text tenant_id,b.branch_id::text,b.id::text building_id,f.id::text floor_id FROM digital_twin_objects o JOIN digital_twin_floors f ON f.id=o.floor_id JOIN digital_twin_buildings b ON b.id=f.building_id JOIN digital_twin_sites s ON s.id=b.site_id WHERE o.id=$1`, [objectId])).rows[0]; return row ? { tenantId: row.tenant_id, branchId: row.branch_id, buildingId: row.building_id, floorId: row.floor_id } : undefined; }
  async createPlan(input: TwinPlanInput) { const client = await this.pool.connect(); try { await client.query("BEGIN"); await client.query(`UPDATE digital_twin_floor_plans SET is_active=false WHERE floor_id=$1`, [input.floorId]); const row = (await client.query(`INSERT INTO digital_twin_floor_plans (floor_id,version,file_url,file_type,file_size_bytes,width_pixels,height_pixels,scale_meters_per_pixel,origin_x,origin_y,rotation_degrees,is_active,metadata,uploaded_by) SELECT $1,COALESCE(max(version),0)+1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12 FROM digital_twin_floor_plans WHERE floor_id=$1 RETURNING *`, [input.floorId, input.storageKey, input.fileType, input.fileSizeBytes, input.widthPixels ?? null, input.heightPixels ?? null, input.scaleMetersPerPixel ?? null, input.originX ?? 0, input.originY ?? 0, input.rotationDegrees ?? 0, JSON.stringify({ contentType: input.contentType, originalFilename: input.originalFilename, storageKey: input.storageKey }), input.uploadedBy])).rows[0]; await client.query("COMMIT"); return mapPlan(row); } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); } }
  async getActivePlan(floorId: string) { const row = (await this.pool.query(`SELECT * FROM digital_twin_floor_plans WHERE floor_id=$1 AND is_active=true ORDER BY version DESC LIMIT 1`, [floorId])).rows[0]; return row ? mapPlan(row) : undefined; }
  async getPlan(planId: string) { const row = (await this.pool.query(`SELECT * FROM digital_twin_floor_plans WHERE id=$1`, [planId])).rows[0]; return row ? mapPlan(row) : undefined; }
  async listPlans(floorId: string) { return (await this.pool.query(`SELECT * FROM digital_twin_floor_plans WHERE floor_id=$1 ORDER BY version DESC`, [floorId])).rows.map(mapPlan); }
  async activatePlan(planId: string, floorId: string) { const client = await this.pool.connect(); try { await client.query("BEGIN"); await client.query(`UPDATE digital_twin_floor_plans SET is_active=false WHERE floor_id=$1`, [floorId]); const row = (await client.query(`UPDATE digital_twin_floor_plans SET is_active=true WHERE id=$1 AND floor_id=$2 RETURNING *`, [planId, floorId])).rows[0]; await client.query("COMMIT"); return row ? mapPlan(row) : undefined; } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); } }
  async createObject(input: TwinObjectInput, userId: string) { const row = (await this.pool.query(`INSERT INTO digital_twin_objects (floor_id,object_type,name,description,position_x,position_y,position_z,rotation,scale,icon_name,color,field_of_view,viewing_distance,camera_angle,show_status,show_label,show_field_of_view,metadata,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`, objectParams(input, userId))).rows[0]; return mapObject(row, null); }
  async updateObject(id: string, input: Partial<TwinObjectInput>) { const current = await this.getObject(id); if (!current) return undefined; const merged: TwinObjectInput = { floorId: current.floorId, objectType: input.objectType ?? current.objectType, name: input.name ?? current.name, description: input.description ?? current.description ?? undefined, positionX: input.positionX ?? current.positionX, positionY: input.positionY ?? current.positionY, positionZ: input.positionZ ?? current.positionZ, rotation: input.rotation ?? current.rotation, scale: input.scale ?? current.scale, iconName: input.iconName ?? current.iconName ?? undefined, color: input.color ?? current.color ?? undefined, fieldOfView: input.fieldOfView ?? current.fieldOfView ?? undefined, viewingDistance: input.viewingDistance ?? current.viewingDistance ?? undefined, cameraAngle: input.cameraAngle ?? current.cameraAngle ?? undefined, showStatus: input.showStatus ?? current.showStatus, showLabel: input.showLabel ?? current.showLabel, showFieldOfView: input.showFieldOfView ?? current.showFieldOfView, metadata: input.metadata ?? current.metadata }; const row = (await this.pool.query(`UPDATE digital_twin_objects SET object_type=$2,name=$3,description=$4,position_x=$5,position_y=$6,position_z=$7,rotation=$8,scale=$9,icon_name=$10,color=$11,field_of_view=$12,viewing_distance=$13,camera_angle=$14,show_status=$15,show_label=$16,show_field_of_view=$17,metadata=$18,updated_at=now() WHERE id=$1 RETURNING *`, [id, ...objectParams(merged).slice(1,18)])).rows[0]; return row ? mapObject(row, current.binding) : undefined; }
  async deleteObject(id: string) { return (await this.pool.query(`DELETE FROM digital_twin_objects WHERE id=$1`, [id])).rowCount > 0; }
  async getObject(id: string) { const row = (await this.pool.query(objectSelect(`o.id=$1`), [id])).rows[0]; return row ? mapJoinedObject(row) : undefined; }
  async listObjects(floorId: string) { return (await this.pool.query(objectSelect(`o.floor_id=$1`) + ` ORDER BY o.name`, [floorId])).rows.map(mapJoinedObject); }
  async bindDevice(input: TwinBindingInput) { const row = (await this.pool.query(`INSERT INTO digital_twin_device_bindings (twin_object_id,tenant_id,branch_node_id,device_type,device_id,device_table,status_source,alert_source,auto_update,metadata) VALUES ($1,$2,$3,$4,$5,'control_plane',$6,$7,$8,$9) ON CONFLICT (twin_object_id) DO UPDATE SET tenant_id=EXCLUDED.tenant_id,branch_node_id=EXCLUDED.branch_node_id,device_type=EXCLUDED.device_type,device_id=EXCLUDED.device_id,status_source=EXCLUDED.status_source,alert_source=EXCLUDED.alert_source,auto_update=EXCLUDED.auto_update,metadata=EXCLUDED.metadata,updated_at=now() RETURNING *`, [input.twinObjectId, input.tenantId, input.branchId, input.deviceType, input.deviceId, input.statusSource ?? null, input.alertSource ?? null, input.autoUpdate ?? true, JSON.stringify(input.metadata ?? {})])).rows[0]; return mapBinding(row); }
  async deleteBinding(id: string) { return (await this.pool.query(`DELETE FROM digital_twin_device_bindings WHERE id=$1`, [id])).rowCount > 0; }
  async listBindings(floorId: string) { return (await this.pool.query(`SELECT b.* FROM digital_twin_device_bindings b JOIN digital_twin_objects o ON o.id=b.twin_object_id WHERE o.floor_id=$1`, [floorId])).rows.map(mapBinding); }
  async createZone(input: TwinZoneInput, userId: string) { const row = (await this.pool.query(`INSERT INTO digital_twin_zones (floor_id,name,description,zone_type,vertices,fill_color,fill_opacity,stroke_color,stroke_width,is_restricted,alert_on_entry,alert_on_dwell,max_dwell_seconds,analytics_enabled,analytics_config,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`, zoneParams(input, userId))).rows[0]; return mapZone(row); }
  async updateZone(id: string, input: Partial<TwinZoneInput>) { const existing = (await this.pool.query(`SELECT * FROM digital_twin_zones WHERE id=$1`, [id])).rows[0]; if (!existing) return undefined; const value = mapZone(existing); const merged: TwinZoneInput = { floorId: value.floorId, name: input.name ?? value.name, description: input.description ?? value.description ?? undefined, zoneType: input.zoneType ?? value.zoneType, vertices: input.vertices ?? value.vertices, fillColor: input.fillColor ?? value.fillColor, fillOpacity: input.fillOpacity ?? value.fillOpacity, strokeColor: input.strokeColor ?? value.strokeColor, strokeWidth: input.strokeWidth ?? value.strokeWidth, isRestricted: input.isRestricted ?? value.isRestricted, alertOnEntry: input.alertOnEntry ?? value.alertOnEntry, alertOnDwell: input.alertOnDwell ?? value.alertOnDwell, maxDwellSeconds: input.maxDwellSeconds ?? value.maxDwellSeconds ?? undefined, analyticsEnabled: input.analyticsEnabled ?? value.analyticsEnabled, analyticsConfig: input.analyticsConfig ?? value.analyticsConfig }; const row = (await this.pool.query(`UPDATE digital_twin_zones SET name=$2,description=$3,zone_type=$4,vertices=$5,fill_color=$6,fill_opacity=$7,stroke_color=$8,stroke_width=$9,is_restricted=$10,alert_on_entry=$11,alert_on_dwell=$12,max_dwell_seconds=$13,analytics_enabled=$14,analytics_config=$15,updated_at=now() WHERE id=$1 RETURNING *`, [id, ...zoneParams(merged).slice(1,15)])).rows[0]; return mapZone(row); }
  async deleteZone(id: string) { return (await this.pool.query(`DELETE FROM digital_twin_zones WHERE id=$1`, [id])).rowCount > 0; }
  async listZones(floorId: string) { return (await this.pool.query(`SELECT * FROM digital_twin_zones WHERE floor_id=$1 ORDER BY name`, [floorId])).rows.map(mapZone); }
  async recordEvent(input: TwinEventInput) { const result = await this.pool.query(`INSERT INTO digital_twin_events (tenant_id,branch_node_id,floor_id,twin_object_id,device_type,device_id,event_type,state,previous_state,severity,position_x,position_y,source,idempotency_key,metadata,occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (tenant_id,idempotency_key) DO NOTHING RETURNING *`, [input.tenantId,input.branchId,input.floorId,input.twinObjectId??null,input.deviceType??null,input.deviceId??null,input.eventType,input.state??null,input.previousState??null,input.severity,input.positionX??null,input.positionY??null,input.source,input.idempotencyKey,JSON.stringify(input.metadata??{}),input.occurredAt]); if (result.rows[0]) return { event: mapEvent(result.rows[0]), duplicate: false }; const row = (await this.pool.query(`SELECT * FROM digital_twin_events WHERE tenant_id=$1 AND idempotency_key=$2`, [input.tenantId,input.idempotencyKey])).rows[0]; return { event: mapEvent(row), duplicate: true }; }
  async listEvents(floorId: string, from: string, to: string, limit: number) { const rows = (await this.pool.query(`SELECT * FROM (SELECT * FROM digital_twin_events WHERE floor_id=$1 AND occurred_at BETWEEN $2 AND $3 ORDER BY occurred_at DESC LIMIT $4) e ORDER BY occurred_at ASC`, [floorId,from,to,limit])).rows; return rows.map(mapEvent); }
  async latestEvents(floorId: string) { return (await this.pool.query(`SELECT DISTINCT ON (COALESCE(twin_object_id::text,device_type||':'||device_id)) * FROM digital_twin_events WHERE floor_id=$1 ORDER BY COALESCE(twin_object_id::text,device_type||':'||device_id),occurred_at DESC`, [floorId])).rows.map(mapEvent); }
  async createAlert(input: Omit<TwinAlertMarker, "id" | "acknowledgedAt" | "resolvedAt">) { const row = (await this.pool.query(`INSERT INTO digital_twin_alert_markers (floor_id,twin_object_id,alert_type,severity,title,description,position_x,position_y,triggered_at,pulse_effect,auto_zoom,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [input.floorId,input.twinObjectId,input.alertType,input.severity,input.title,input.description,input.positionX,input.positionY,input.triggeredAt,input.pulseEffect,input.autoZoom,JSON.stringify({ ...input.metadata, source: input.source, sourceAlertId: input.sourceAlertId, snapshotReference: input.snapshotReference, clipReference: input.clipReference })])).rows[0]; return mapAlert(row); }
  async listAlerts(floorId: string, activeOnly=true) { return (await this.pool.query(`SELECT * FROM digital_twin_alert_markers WHERE floor_id=$1 AND ($2::boolean=false OR resolved_at IS NULL) ORDER BY triggered_at DESC LIMIT 500`, [floorId,activeOnly])).rows.map(mapAlert); }
  async acknowledgeAlert(id: string, userId: string) { const row = (await this.pool.query(`UPDATE digital_twin_alert_markers SET acknowledged_at=COALESCE(acknowledged_at,now()),acknowledged_by=COALESCE(acknowledged_by,$2) WHERE id=$1 RETURNING *`, [id,userId])).rows[0]; return row ? mapAlert(row) : undefined; }
  async resolveAlert(id: string, userId: string) { const row = (await this.pool.query(`UPDATE digital_twin_alert_markers SET resolved_at=COALESCE(resolved_at,now()),resolved_by=COALESCE(resolved_by,$2) WHERE id=$1 RETURNING *`, [id,userId])).rows[0]; return row ? mapAlert(row) : undefined; }
  async writeAudit(input: TwinAuditInput) { await this.pool.query(`INSERT INTO digital_twin_audit_log (user_id,action,entity_type,entity_id,previous_state,new_state,change_summary,floor_id,building_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [input.userId,input.action,input.entityType,input.entityId,input.previousState??null,input.newState??null,input.summary,input.floorId??null,input.buildingId??null]); }
  async listAudit(floorId: string, limit: number) { return (await this.pool.query(`SELECT id::text,user_id::text,action,entity_type,entity_id::text,change_summary,floor_id::text,building_id::text,timestamp FROM digital_twin_audit_log WHERE floor_id=$1 ORDER BY timestamp DESC LIMIT $2`, [floorId,limit])).rows.map((row) => ({ id: row.id,userId: row.user_id,action: row.action,entityType: row.entity_type,entityId: row.entity_id,summary: row.change_summary,floorId: row.floor_id,buildingId: row.building_id,timestamp: iso(row.timestamp) })); }
}

function objectSelect(where: string) { return `SELECT o.*,b.id binding_id,b.tenant_id binding_tenant_id,b.branch_node_id binding_branch_node_id,b.device_type,b.device_id,b.status_source,b.alert_source,b.auto_update,b.metadata binding_metadata FROM digital_twin_objects o LEFT JOIN digital_twin_device_bindings b ON b.twin_object_id=o.id WHERE ${where}`; }
function objectParams(i: TwinObjectInput, userId?: string) { return [i.floorId,i.objectType,i.name,i.description??null,i.positionX,i.positionY,i.positionZ??0,i.rotation??0,i.scale??1,i.iconName??null,i.color??null,i.fieldOfView??null,i.viewingDistance??null,i.cameraAngle??null,i.showStatus??true,i.showLabel??true,i.showFieldOfView??false,JSON.stringify(i.metadata??{}),userId??null]; }
function zoneParams(i: TwinZoneInput, userId?: string) { return [i.floorId,i.name,i.description??null,i.zoneType,JSON.stringify(i.vertices),i.fillColor??"#ef4444",i.fillOpacity??0.18,i.strokeColor??"#ef4444",i.strokeWidth??2,i.isRestricted??false,i.alertOnEntry??false,i.alertOnDwell??false,i.maxDwellSeconds??null,i.analyticsEnabled??false,JSON.stringify(i.analyticsConfig??{}),userId??null]; }
function objectValue(id: string, i: TwinObjectInput): TwinObject { const now=new Date().toISOString(); return { id,floorId:i.floorId,objectType:i.objectType,name:i.name,description:i.description??null,positionX:i.positionX,positionY:i.positionY,positionZ:i.positionZ??0,rotation:i.rotation??0,scale:i.scale??1,iconName:i.iconName??null,color:i.color??null,fieldOfView:i.fieldOfView??null,viewingDistance:i.viewingDistance??null,cameraAngle:i.cameraAngle??null,showStatus:i.showStatus??true,showLabel:i.showLabel??true,showFieldOfView:i.showFieldOfView??false,metadata:i.metadata??{},binding:null,createdAt:now,updatedAt:now }; }
function assignObject(o: TwinObject, i: Partial<TwinObjectInput>) { const values=clean(i); Object.assign(o, values); }
function zoneValue(id: string, i: TwinZoneInput): TwinZone { const now=new Date().toISOString(); return { id,floorId:i.floorId,name:i.name,description:i.description??null,zoneType:i.zoneType,vertices:i.vertices,fillColor:i.fillColor??"#ef4444",fillOpacity:i.fillOpacity??0.18,strokeColor:i.strokeColor??"#ef4444",strokeWidth:i.strokeWidth??2,isRestricted:i.isRestricted??false,alertOnEntry:i.alertOnEntry??false,alertOnDwell:i.alertOnDwell??false,maxDwellSeconds:i.maxDwellSeconds??null,analyticsEnabled:i.analyticsEnabled??false,analyticsConfig:i.analyticsConfig??{},createdAt:now,updatedAt:now }; }
function planValue(id: string, version: number, i: TwinPlanInput): TwinFloorPlan { return { id,floorId:i.floorId,version,contentUrl:`/v1/digital-twin/floor-plans/${id}/content`,storageKey:i.storageKey,fileType:i.fileType,contentType:i.contentType,fileSizeBytes:i.fileSizeBytes,widthPixels:i.widthPixels??null,heightPixels:i.heightPixels??null,scaleMetersPerPixel:i.scaleMetersPerPixel??null,originX:i.originX??0,originY:i.originY??0,rotationDegrees:i.rotationDegrees??0,isActive:true,originalFilename:i.originalFilename,uploadedBy:i.uploadedBy,uploadedAt:new Date().toISOString() }; }
function eventValue(id:string,i:TwinEventInput):TwinEvent{return{id,tenantId:i.tenantId,branchId:i.branchId,floorId:i.floorId,twinObjectId:i.twinObjectId??null,deviceType:i.deviceType??null,deviceId:i.deviceId??null,eventType:i.eventType,state:i.state??null,previousState:i.previousState??null,severity:i.severity,positionX:i.positionX??null,positionY:i.positionY??null,source:i.source,idempotencyKey:i.idempotencyKey,metadata:i.metadata??{},occurredAt:i.occurredAt,receivedAt:new Date().toISOString()};}
function mapSite(r:any):TwinSite{return{id:r.id,tenantId:r.organization_id,name:r.name,description:r.description??null,address:r.address??null,timezone:r.timezone,createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)};}
function mapBuilding(r:any):TwinBuilding{return{id:r.id,siteId:r.site_id,branchId:r.branch_id,name:r.name,description:r.description??null,buildingType:r.building_type??"branch",totalFloors:Number(r.total_floors??1),createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)};}
function mapFloor(r:any):TwinFloor{return{id:r.id,buildingId:r.building_id,floorNumber:Number(r.floor_number),name:r.name,description:r.description??null,floorHeightMeters:num(r.floor_height_meters),areaSquareMeters:num(r.area_square_meters),createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)};}
function mapPlan(r:any):TwinFloorPlan{const m=r.metadata??{};return{id:r.id,floorId:r.floor_id,version:Number(r.version),contentUrl:`/v1/digital-twin/floor-plans/${r.id}/content`,storageKey:m.storageKey??r.file_url,fileType:r.file_type,contentType:m.contentType??contentType(r.file_type),fileSizeBytes:Number(r.file_size_bytes??0),widthPixels:r.width_pixels==null?null:Number(r.width_pixels),heightPixels:r.height_pixels==null?null:Number(r.height_pixels),scaleMetersPerPixel:num(r.scale_meters_per_pixel),originX:Number(r.origin_x??0),originY:Number(r.origin_y??0),rotationDegrees:Number(r.rotation_degrees??0),isActive:Boolean(r.is_active),originalFilename:m.originalFilename??"floor-plan",uploadedBy:r.uploaded_by,uploadedAt:iso(r.uploaded_at)};}
function mapObject(r:any,b:TwinBinding|null):TwinObject{return{id:r.id,floorId:r.floor_id,objectType:r.object_type,name:r.name,description:r.description??null,positionX:Number(r.position_x),positionY:Number(r.position_y),positionZ:Number(r.position_z??0),rotation:Number(r.rotation??0),scale:Number(r.scale??1),iconName:r.icon_name??null,color:r.color??null,fieldOfView:num(r.field_of_view),viewingDistance:num(r.viewing_distance),cameraAngle:num(r.camera_angle),showStatus:Boolean(r.show_status),showLabel:Boolean(r.show_label),showFieldOfView:Boolean(r.show_field_of_view),metadata:r.metadata??{},binding:b,createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)};}
function mapJoinedObject(r:any){return mapObject(r,r.binding_id?{id:r.binding_id,twinObjectId:r.id,tenantId:r.binding_tenant_id,branchId:r.binding_branch_node_id,deviceType:r.device_type,deviceId:r.device_id,statusSource:r.status_source??null,alertSource:r.alert_source??null,autoUpdate:Boolean(r.auto_update),metadata:r.binding_metadata??{}}:null);}
function mapBinding(r:any):TwinBinding{return{id:r.id,twinObjectId:r.twin_object_id,tenantId:r.tenant_id,branchId:r.branch_node_id,deviceType:r.device_type,deviceId:r.device_id,statusSource:r.status_source??null,alertSource:r.alert_source??null,autoUpdate:Boolean(r.auto_update),metadata:r.metadata??{}};}
function mapZone(r:any):TwinZone{return{id:r.id,floorId:r.floor_id,name:r.name,description:r.description??null,zoneType:r.zone_type??"custom",vertices:r.vertices??[],fillColor:r.fill_color,fillOpacity:Number(r.fill_opacity),strokeColor:r.stroke_color,strokeWidth:Number(r.stroke_width),isRestricted:Boolean(r.is_restricted),alertOnEntry:Boolean(r.alert_on_entry),alertOnDwell:Boolean(r.alert_on_dwell),maxDwellSeconds:r.max_dwell_seconds==null?null:Number(r.max_dwell_seconds),analyticsEnabled:Boolean(r.analytics_enabled),analyticsConfig:r.analytics_config??{},createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)};}
function mapEvent(r:any):TwinEvent{return{id:r.id,tenantId:r.tenant_id,branchId:r.branch_node_id,floorId:r.floor_id,twinObjectId:r.twin_object_id??null,deviceType:r.device_type??null,deviceId:r.device_id??null,eventType:r.event_type,state:r.state??null,previousState:r.previous_state??null,severity:r.severity,positionX:num(r.position_x),positionY:num(r.position_y),source:r.source,idempotencyKey:r.idempotency_key,metadata:r.metadata??{},occurredAt:iso(r.occurred_at),receivedAt:iso(r.received_at)};}
function mapAlert(r:any):TwinAlertMarker{const m=r.metadata??{};return{id:r.id,floorId:r.floor_id,twinObjectId:r.twin_object_id??null,alertType:r.alert_type,severity:normalizeSeverity(r.severity),title:r.title,description:r.description??null,positionX:num(r.position_x),positionY:num(r.position_y),triggeredAt:iso(r.triggered_at),acknowledgedAt:r.acknowledged_at?iso(r.acknowledged_at):null,resolvedAt:r.resolved_at?iso(r.resolved_at):null,pulseEffect:Boolean(r.pulse_effect),autoZoom:Boolean(r.auto_zoom),source:m.source??"digital-twin",sourceAlertId:m.sourceAlertId??null,snapshotReference:m.snapshotReference??null,clipReference:m.clipReference??null,metadata:m};}
function normalizeSeverity(v:string):TwinSeverity{return v==="critical"?"critical":v==="high"||v==="medium"?"warning":"info";}
function contentType(type:string){return type==="png"?"image/png":type==="jpg"||type==="jpeg"?"image/jpeg":type==="svg"?"image/svg+xml":"application/pdf";}
function iso(value:unknown){return value instanceof Date?value.toISOString():typeof value==="string"?value:new Date(0).toISOString();}
function num(value:unknown){return value==null?null:Number(value);}
function clean<T extends object>(value:T){return Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined));}
function clone<T>(value:T):T{return structuredClone(value);}
function cloned<T>(value:T|undefined){return value===undefined?undefined:clone(value);}
