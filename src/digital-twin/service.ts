import { randomUUID } from "node:crypto";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { AnalyticsAlert, User } from "../domain/models.js";
import type { OperationalTelemetryEnvelope } from "../operational-health/types.js";
import { DigitalTwinAssetStore } from "./assets.js";
import { digitalTwinEvents } from "./event-stream.js";
import type { DigitalTwinState, TwinEventInput, TwinObjectInput, TwinPlanInput, TwinZoneInput } from "./state.js";
import type {
  TwinAlertMarker, TwinBinding, TwinBranchSummary, TwinEvent, TwinFloorState, TwinHeatmap,
  TwinHeatmapType, TwinObject, TwinObjectStatus, TwinSeverity,
} from "./types.js";

export class DigitalTwinService {
  constructor(private readonly store: ControlPlaneStore, readonly state: DigitalTwinState, readonly assets: DigitalTwinAssetStore) {}

  async listBranches(user: User): Promise<TwinBranchSummary[]> {
    const branches = await this.store.listAccessibleNodes(user, "recording:view", "branch");
    const summaries: TwinBranchSummary[] = [];
    for (let offset = 0; offset < branches.length; offset += 12) {
      const batch = await Promise.all(branches.slice(offset, offset + 12).map(async (branch) => {
        const building = await this.state.getBuildingByBranch(user.tenantId, branch.id);
        if (!building) return { branch: { id: branch.id, name: branch.name }, building: null, floors: [], configured: false, objectCount: 0, activeAlerts: 0, criticalObjects: 0, updatedAt: null };
        const floors = await this.state.listFloors(building.id);
        const counts = await Promise.all(floors.map(async (floor) => {
          const [objects, alerts] = await Promise.all([this.state.listObjects(floor.id), this.state.listAlerts(floor.id, true)]);
          return { objects: objects.length, alerts: alerts.length };
        }));
        return { branch: { id: branch.id, name: branch.name }, building, floors, configured: true, objectCount: counts.reduce((sum, item) => sum + item.objects, 0), activeAlerts: counts.reduce((sum, item) => sum + item.alerts, 0), criticalObjects: 0, updatedAt: building.updatedAt };
      }));
      summaries.push(...batch);
    }
    return summaries;
  }

  async bootstrap(user: User, branchId: string) {
    const branch = await this.requireBranch(user, branchId, "device:configure");
    const result = await this.state.bootstrap(user.tenantId, branch.id, branch.name, user.id);
    digitalTwinEvents.publish({ id: randomUUID(), tenantId: user.tenantId, branchId, floorId: result.floor.id, type: "twin.configured", occurredAt: new Date().toISOString() });
    return result;
  }

  async branchLive(user: User, branchId: string) {
    const branch = await this.requireBranch(user, branchId, "recording:view");
    const building = await this.state.getBuildingByBranch(user.tenantId, branchId);
    if (!building) return { branch: { id: branch.id, name: branch.name }, configured: false, building: null, floors: [] };
    const floors = await this.state.listFloors(building.id);
    return { branch: { id: branch.id, name: branch.name }, configured: true, building, floors: await Promise.all(floors.map((floor) => this.floorState(user, floor.id))) };
  }

  async floorState(user: User, floorId: string, heatmapType?: TwinHeatmapType): Promise<TwinFloorState> {
    const scope = await this.requireFloor(user, floorId, "recording:view");
    const [floor, building, branch, plan, objects, zones, persistedAlerts, latestEvents, telemetry, analytics] = await Promise.all([
      this.state.getFloor(floorId), this.state.getBuilding(scope.buildingId), this.store.getNode(scope.branchId),
      this.state.getActivePlan(floorId), this.state.listObjects(floorId), this.state.listZones(floorId),
      this.state.listAlerts(floorId, true), this.state.latestEvents(floorId),
      this.store.listLatestOperationalTelemetry(user.tenantId, [scope.branchId]),
      this.store.listAnalyticsAlerts(user.tenantId, { branchId: scope.branchId, limit: 500 }),
    ]);
    if (!floor || !building || !branch) throw new TwinServiceError("floor_not_found", 404);
    const activeAnalytics = analytics.filter((item) => !["resolved", "false_alarm", "suppressed"].includes(item.status));
    const eventsByObject = new Map(latestEvents.filter((item) => item.twinObjectId).map((item) => [item.twinObjectId!, item]));
    const telemetryByKey = new Map(telemetry.map((item) => [`${item.deviceType}:${item.deviceId}`, item]));
    const projected = objects.map((object) => ({ ...object, currentStatus: projectStatus(object, eventsByObject.get(object.id), telemetryByKey, activeAnalytics) }));
    const analyticsMarkers = activeAnalytics.flatMap((alert) => markerForAnalytics(alert, projected));
    const alerts = dedupeAlerts([...persistedAlerts, ...analyticsMarkers]);
    const heatmap = heatmapType ? this.generateHeatmap(heatmapType, projected, alerts, latestEvents) : null;
    const summary = {
      totalObjects: projected.length,
      online: projected.filter((item) => item.currentStatus.color === "green").length,
      warning: projected.filter((item) => ["yellow", "orange", "blue", "purple"].includes(item.currentStatus.color)).length,
      critical: projected.filter((item) => item.currentStatus.color === "red").length,
      unknown: projected.filter((item) => item.currentStatus.color === "grey").length,
      activeAlerts: alerts.length,
    };
    return { branch: { id: branch.id, name: branch.name }, building, floor, floorPlan: plan ?? null, objects: projected, zones, alerts, heatmap, summary, permissions: { canView: true, canEdit: Boolean((await this.store.checkAccess(user, "device:configure", scope.branchId))?.allowed), canPlayback: Boolean((await this.store.checkAccess(user, "incident:view", scope.branchId))?.allowed) }, generatedAt: new Date().toISOString() };
  }

  async inventory(user: User, floorId: string) {
    const scope = await this.requireFloor(user, floorId, "device:configure");
    const [cameras, telemetry, bindings] = await Promise.all([
      this.store.listCamerasByBranch(user, scope.branchId, "recording:view"),
      this.store.listLatestOperationalTelemetry(user.tenantId, [scope.branchId]), this.state.listBindings(floorId),
    ]);
    const bound = new Set(bindings.map((item) => `${item.deviceType}:${item.deviceId}`));
    const cameraItems = cameras.map((item) => ({ deviceType: "camera", objectType: "camera", deviceId: item.id, name: item.name, status: item.status, bound: bound.has(`camera:${item.id}`) }));
    const deviceMap: Record<string, { deviceType: string; objectType: string }> = { recorder: { deviceType: "recorder", objectType: "nvr" }, ups: { deviceType: "ups", objectType: "ups" }, network: { deviceType: "network", objectType: "network_switch" }, disk: { deviceType: "disk", objectType: "server" } };
    const telemetryItems = telemetry.filter((item) => deviceMap[item.deviceType]).map((item) => ({ ...deviceMap[item.deviceType]!, deviceId: item.deviceId, name: metricName(item) ?? `${item.deviceType} ${item.deviceId}`, status: telemetryState(item), bound: bound.has(`${deviceMap[item.deviceType]!.deviceType}:${item.deviceId}`) }));
    return [...cameraItems, ...telemetryItems];
  }

  async uploadPlan(user: User, input: Omit<TwinPlanInput, "storageKey" | "fileSizeBytes" | "uploadedBy" | "fileType"> & { dataBase64: string; fileType?: string }) {
    await this.requireFloor(user, input.floorId, "device:configure");
    const saved = await this.assets.save({ floorId: input.floorId, contentType: input.contentType, dataBase64: input.dataBase64, originalFilename: input.originalFilename });
    const plan = await this.state.createPlan({ ...input, storageKey: saved.storageKey, fileSizeBytes: saved.size, uploadedBy: user.id, fileType: saved.extension === "jpg" ? "jpg" : saved.extension as "png" | "svg" | "pdf" });
    await this.audit(user, "upload", "floor_plan", plan.id, `Uploaded floor plan version ${plan.version}`, { floorId: input.floorId, newState: plan as unknown as Record<string, unknown> });
    return plan;
  }

  async createObject(user: User, input: TwinObjectInput, binding?: Omit<TwinBinding, "id" | "twinObjectId" | "statusSource" | "alertSource" | "autoUpdate" | "metadata"> & Partial<TwinBinding>) {
    const scope = await this.requireFloor(user, input.floorId, "device:configure");
    const object = await this.state.createObject(input, user.id);
    if (binding) await this.state.bindDevice({ twinObjectId: object.id, deviceType: binding.deviceType, deviceId: binding.deviceId, statusSource: binding.statusSource ?? undefined, alertSource: binding.alertSource ?? undefined, autoUpdate: binding.autoUpdate, metadata: binding.metadata });
    const result = (await this.state.getObject(object.id))!;
    await this.audit(user, "create", "object", result.id, `Placed ${result.objectType} ${result.name}`, { floorId: input.floorId, buildingId: scope.buildingId, newState: result as unknown as Record<string, unknown> });
    this.publish(scope, "object.created", result.id); return result;
  }

  async updateObject(user: User, id: string, input: Partial<TwinObjectInput>) {
    const scope = await this.requireObject(user, id, "device:configure"); const previous = await this.state.getObject(id);
    const object = await this.state.updateObject(id, input); if (!object) throw new TwinServiceError("object_not_found", 404);
    await this.audit(user, "update", "object", id, `Updated ${object.name}`, { floorId: scope.floorId, buildingId: scope.buildingId, previousState: previous as unknown as Record<string, unknown>, newState: object as unknown as Record<string, unknown> });
    this.publish(scope, "object.updated", id); return object;
  }

  async deleteObject(user: User, id: string) {
    const scope = await this.requireObject(user, id, "device:configure"); const previous = await this.state.getObject(id);
    if (!(await this.state.deleteObject(id))) throw new TwinServiceError("object_not_found", 404);
    await this.audit(user, "delete", "object", id, `Deleted ${previous?.name ?? id}`, { floorId: scope.floorId, buildingId: scope.buildingId, previousState: previous as unknown as Record<string, unknown> }); this.publish(scope, "object.deleted", id);
  }

  async bindDevice(user: User, input: { twinObjectId: string; deviceType: TwinBinding["deviceType"]; deviceId: string; statusSource?: string; alertSource?: string; metadata?: Record<string, unknown> }) {
    const scope = await this.requireObject(user, input.twinObjectId, "device:configure");
    await this.validateBinding(user, scope.branchId, input.deviceType, input.deviceId);
    const binding = await this.state.bindDevice(input);
    await this.audit(user, "bind", "binding", binding.id, `Bound ${binding.deviceType}:${binding.deviceId}`, { floorId: scope.floorId, buildingId: scope.buildingId, newState: binding as unknown as Record<string, unknown> }); this.publish(scope, "binding.updated", input.twinObjectId); return binding;
  }

  async createZone(user: User, input: TwinZoneInput) { const scope = await this.requireFloor(user, input.floorId, "device:configure"); const zone = await this.state.createZone(input, user.id); await this.audit(user, "create", "zone", zone.id, `Created zone ${zone.name}`, { floorId: input.floorId, buildingId: scope.buildingId, newState: zone as unknown as Record<string, unknown> }); this.publish(scope, "zone.created"); return zone; }
  async updateZone(user: User, id: string, floorId: string, input: Partial<TwinZoneInput>) { const scope = await this.requireFloor(user, floorId, "device:configure"); const zone = await this.state.updateZone(id, input); if (!zone || zone.floorId !== floorId) throw new TwinServiceError("zone_not_found", 404); await this.audit(user, "update", "zone", id, `Updated zone ${zone.name}`, { floorId, buildingId: scope.buildingId, newState: zone as unknown as Record<string, unknown> }); this.publish(scope, "zone.updated"); return zone; }
  async deleteZone(user: User, id: string, floorId: string) { const scope = await this.requireFloor(user, floorId, "device:configure"); if (!(await this.state.deleteZone(id))) throw new TwinServiceError("zone_not_found", 404); await this.audit(user, "delete", "zone", id, `Deleted zone ${id}`, { floorId, buildingId: scope.buildingId }); this.publish(scope, "zone.deleted"); }

  async ingestEvent(user: User, input: Omit<TwinEventInput, "tenantId" | "branchId">) {
    const scope = await this.requireFloor(user, input.floorId, "device:configure");
    if (input.twinObjectId) { const objectScope = await this.state.objectScope(input.twinObjectId); if (objectScope?.floorId !== input.floorId) throw new TwinServiceError("object_floor_mismatch", 409); }
    const result = await this.state.recordEvent({ ...input, tenantId: user.tenantId, branchId: scope.branchId });
    if (!result.duplicate && isAlertEvent(result.event)) {
      const object = result.event.twinObjectId ? await this.state.getObject(result.event.twinObjectId) : undefined;
      const alert = await this.state.createAlert({ floorId: input.floorId, twinObjectId: result.event.twinObjectId, alertType: result.event.eventType, severity: result.event.severity, title: alertTitle(result.event, object?.name), description: (result.event.metadata.description as string | undefined) ?? null, positionX: result.event.positionX ?? object?.positionX ?? null, positionY: result.event.positionY ?? object?.positionY ?? null, triggeredAt: result.event.occurredAt, pulseEffect: true, autoZoom: true, source: result.event.source, sourceAlertId: result.event.id, snapshotReference: typeof result.event.metadata.snapshotReference === "string" ? result.event.metadata.snapshotReference : null, clipReference: typeof result.event.metadata.clipReference === "string" ? result.event.metadata.clipReference : null, metadata: result.event.metadata });
      digitalTwinEvents.publish({ id: randomUUID(), tenantId: user.tenantId, branchId: scope.branchId, floorId: input.floorId, type: "alert.triggered", occurredAt: input.occurredAt, severity: alert.severity, objectId: alert.twinObjectId ?? undefined, alertId: alert.id });
    } else if (!result.duplicate) this.publish(scope, "state.updated", result.event.twinObjectId ?? undefined);
    return result;
  }

  async timeline(user: User, floorId: string, from: string, to: string, limit: number) {
    const scope = await this.requireFloor(user, floorId, "incident:view");
    const [events, telemetry, alerts] = await Promise.all([this.state.listEvents(floorId, from, to, limit), this.store.listOperationalTelemetryHistory(user.tenantId, scope.branchId, from, to, limit), this.store.listAnalyticsAlerts(user.tenantId, { branchId: scope.branchId, from, to, limit })]);
    const objects = await this.state.listObjects(floorId); const byDevice = new Map(objects.filter((item) => item.binding).map((item) => [`${item.binding!.deviceType}:${item.binding!.deviceId}`, item]));
    const telemetryEvents = telemetry.flatMap((item) => { const object = byDevice.get(`${normalizeDeviceType(item.deviceType)}:${item.deviceId}`); return object ? [{ id: `telemetry:${item.idempotencyKey}`, occurredAt: item.observedAt, type: "device_state", severity: severityForTelemetry(item), title: `${object.name}: ${telemetryState(item)}`, objectId: object.id, source: `${item.source}:${item.quality}`, state: telemetryState(item), metadata: item.metrics }] : []; });
    const analyticsEvents = alerts.flatMap((item) => { const object = byDevice.get(`camera:${item.cameraId}`); return object ? [{ id: `analytics:${item.id}`, occurredAt: item.lastDetectedAt, type: "ai_alert", severity: analyticsSeverity(item), title: item.title, objectId: object.id, source: `analytics:${item.modelVersion}`, state: item.status, metadata: { confidence: item.confidence, snapshotReference: item.snapshotReference, clipReference: item.clipReference } }] : []; });
    const twinEvents = events.map((item) => ({ id: item.id, occurredAt: item.occurredAt, type: item.eventType, severity: item.severity, title: alertTitle(item), objectId: item.twinObjectId, source: item.source, state: item.state, metadata: item.metadata }));
    return [...twinEvents, ...telemetryEvents, ...analyticsEvents].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).slice(-limit);
  }

  async playback(user: User, floorId: string, at: string) {
    const scope = await this.requireFloor(user, floorId, "incident:view"); const current = await this.floorState(user, floorId);
    const from = new Date(Date.parse(at) - 180 * 24 * 60 * 60 * 1_000).toISOString();
    const [events, telemetry, alerts] = await Promise.all([this.state.listEvents(floorId, from, at, 10_000), this.store.listOperationalTelemetryHistory(user.tenantId, scope.branchId, from, at, 10_000), this.state.listAlerts(floorId, false)]);
    const latestEvent = new Map<string, TwinEvent>(); for (const event of events) if (event.twinObjectId) latestEvent.set(event.twinObjectId, event);
    const latestTelemetry = new Map<string, OperationalTelemetryEnvelope>(); for (const item of telemetry) latestTelemetry.set(`${normalizeDeviceType(item.deviceType)}:${item.deviceId}`, item);
    const objects = current.objects.map((object) => ({ ...object, currentStatus: projectStatus(object, latestEvent.get(object.id), latestTelemetry, []) }));
    return { at, branch: current.branch, building: current.building, floor: current.floor, floorPlan: current.floorPlan, objects, zones: current.zones, alerts: alerts.filter((item) => item.triggeredAt <= at && (!item.resolvedAt || item.resolvedAt > at)), sourceWindow: { from, to: at }, generatedAt: new Date().toISOString() };
  }

  generateHeatmap(type: TwinHeatmapType, objects: Array<TwinObject & { currentStatus: TwinObjectStatus }>, alerts: TwinAlertMarker[], events: TwinEvent[]): TwinHeatmap {
    const raw: Array<{ x: number; y: number; weight: number; label?: string; source: string }> = [];
    if (type === "operational") for (const item of objects) if (item.currentStatus.color !== "green" && item.currentStatus.color !== "grey") raw.push({ x: item.positionX, y: item.positionY, weight: item.currentStatus.color === "red" ? 1 : 0.55, label: item.name, source: item.currentStatus.source });
    if (type === "people_security" || type === "incidents") for (const alert of alerts) if (alert.positionX != null && alert.positionY != null) raw.push({ x: alert.positionX, y: alert.positionY, weight: alert.severity === "critical" ? 1 : alert.severity === "warning" ? 0.65 : 0.35, label: alert.title, source: alert.source });
    if (type === "door_usage") for (const event of events) if (event.eventType.includes("door") && event.positionX != null && event.positionY != null) raw.push({ x: event.positionX, y: event.positionY, weight: 0.5, label: event.state ?? "door event", source: event.source });
    const cells = new Map<string, { x: number; y: number; intensity: number; count: number; label?: string }>(); for (const point of raw) { const x = Math.round(point.x * 24) / 24; const y = Math.round(point.y * 24) / 24; const key = `${x}:${y}`; const value = cells.get(key) ?? { x, y, intensity: 0, count: 0, label: point.label }; value.intensity += point.weight; value.count += 1; cells.set(key, value); }
    const max = Math.max(0, ...[...cells.values()].map((item) => item.intensity)); const points = [...cells.values()].map((item) => ({ ...item, intensity: max ? Math.round((item.intensity / max) * 1000) / 1000 : 0 })); const now = new Date().toISOString();
    return { type, generatedAt: now, from: events.at(0)?.occurredAt ?? now, to: now, points, maxIntensity: max ? 1 : 0, totalEvents: raw.length, source: [...new Set(raw.map((item) => item.source))] };
  }

  async nearbyCameras(user: User, objectId: string, limit = 4) { const scope = await this.requireObject(user, objectId, "recording:view"); const selected = await this.state.getObject(objectId); if (!selected) throw new TwinServiceError("object_not_found", 404); return (await this.state.listObjects(scope.floorId!)).filter((item) => item.objectType === "camera" && item.id !== objectId).map((item) => ({ ...item, distance: Math.hypot(item.positionX - selected.positionX, item.positionY - selected.positionY) })).sort((a, b) => a.distance - b.distance).slice(0, limit); }
  async acknowledgeAlert(user: User, alertId: string, floorId: string, resolve = false) { const scope = await this.requireFloor(user, floorId, "alerts:acknowledge"); const alert = resolve ? await this.state.resolveAlert(alertId, user.id) : await this.state.acknowledgeAlert(alertId, user.id); if (!alert || alert.floorId !== floorId) throw new TwinServiceError("alert_not_found", 404); await this.audit(user, resolve ? "resolve" : "acknowledge", "alert", alertId, `${resolve ? "Resolved" : "Acknowledged"} spatial alert ${alert.title}`, { floorId, buildingId: scope.buildingId }); digitalTwinEvents.publish({ id: randomUUID(), tenantId: user.tenantId, branchId: scope.branchId, floorId, type: resolve ? "alert.resolved" : "alert.acknowledged", occurredAt: new Date().toISOString(), alertId, severity: alert.severity }); return alert; }

  private async validateBinding(user: User, branchId: string, type: TwinBinding["deviceType"], deviceId: string) { if (type === "camera") { const camera = await this.store.getCamera(deviceId); if (!camera || camera.branchId !== branchId) throw new TwinServiceError("device_not_found", 404); return; } const telemetry = await this.store.listLatestOperationalTelemetry(user.tenantId, [branchId]); if (["recorder","ups","network","disk"].includes(type) && !telemetry.some((item) => normalizeDeviceType(item.deviceType) === type && item.deviceId === deviceId)) throw new TwinServiceError("device_not_found", 404); }
  private async requireBranch(user: User, branchId: string, action: "recording:view" | "device:configure" | "incident:view" | "alerts:acknowledge") { const branch = await this.store.getNode(branchId); const decision = branch && await this.store.checkAccess(user, action, branchId); if (!branch || branch.type !== "branch" || branch.tenantId !== user.tenantId || !decision?.allowed) throw new TwinServiceError("branch_not_found", 404); return branch; }
  private async requireFloor(user: User, floorId: string, action: "recording:view" | "device:configure" | "incident:view" | "alerts:acknowledge") { const scope = await this.state.floorScope(floorId); if (!scope || scope.tenantId !== user.tenantId) throw new TwinServiceError("floor_not_found", 404); await this.requireBranch(user, scope.branchId, action); return scope; }
  private async requireObject(user: User, objectId: string, action: "recording:view" | "device:configure") { const scope = await this.state.objectScope(objectId); if (!scope || scope.tenantId !== user.tenantId) throw new TwinServiceError("object_not_found", 404); await this.requireBranch(user, scope.branchId, action); return scope; }
  private async audit(user: User, action: string, type: string, id: string, summary: string, context: { floorId?: string; buildingId?: string; previousState?: Record<string, unknown>; newState?: Record<string, unknown> }) { await this.state.writeAudit({ userId: user.id, action, entityType: type, entityId: id, summary, ...context }); const branchId = context.floorId ? (await this.state.floorScope(context.floorId))?.branchId : undefined; await this.store.writeAudit({ tenantId: user.tenantId, actorUserId: user.id, action: `digital_twin.${type}.${action}`, resourceNodeId: branchId ?? null, outcome: "success", details: { entityId: id, summary, floorId: context.floorId, buildingId: context.buildingId } }); }
  private publish(scope: { tenantId: string; branchId: string; floorId?: string }, type: string, objectId?: string) { digitalTwinEvents.publish({ id: randomUUID(), tenantId: scope.tenantId, branchId: scope.branchId, floorId: scope.floorId, type, occurredAt: new Date().toISOString(), objectId }); }
}

export class TwinServiceError extends Error { constructor(public readonly code: string, public readonly statusCode: number, public readonly details?: Record<string, unknown>) { super(code); } }

function projectStatus(object: TwinObject, event: TwinEvent | undefined, telemetry: Map<string, OperationalTelemetryEnvelope>, alerts: AnalyticsAlert[]): TwinObjectStatus {
  const binding = object.binding; const ai = binding?.deviceType === "camera" && alerts.some((item) => item.cameraId === binding.deviceId);
  if (event) return eventStatus(event, ai);
  if (!binding) return status("unknown", "grey", "Not bound", null, null, ai, null, "digital-twin", {});
  const sample = telemetry.get(`${binding.deviceType}:${binding.deviceId}`) ?? (binding.deviceType === "camera" ? telemetry.get(`camera:${binding.deviceId}`) : undefined);
  if (binding.deviceType === "camera") {
    const offline = sample?.metrics.reachable === false || sample?.metrics.online === false || lower(sample?.metrics.status) === "offline";
    const recording = lower(sample?.metrics.recordingStatus); if (offline) return status("offline", "red", "Offline", false, false, ai, sample?.observedAt ?? null, sample?.source ?? "camera-registry", sample?.metrics ?? {});
    if (["not_recording","stopped","failed"].includes(recording)) return status("not_recording", "yellow", "Online, not recording", true, false, ai, sample?.observedAt ?? null, sample?.source ?? "telemetry", sample?.metrics ?? {});
    if (ai) return status("ai_alert", "purple", "Active AI alert", true, recording ? true : null, true, sample?.observedAt ?? null, "analytics", sample?.metrics ?? {});
    if (sample) return status("online", "green", recording === "recording" ? "Online and recording" : "Online", true, recording === "recording" ? true : null, false, sample.observedAt, sample.source, sample.metrics);
    return status("unknown", "grey", "No live telemetry", null, null, ai, null, "inventory", {});
  }
  if (!sample) return status("unknown", "grey", "No live telemetry", null, null, ai, null, "inventory", {});
  const state = telemetryState(sample); const bad = ["offline","critical","failed","missing","unreachable"].includes(state); const warning = ["warning","degraded","on_battery","failover"].includes(state); return status(state, bad ? "red" : warning ? "orange" : "green", label(state), bad ? false : true, null, ai, sample.observedAt, sample.source, sample.metrics);
}
function eventStatus(event:TwinEvent,ai:boolean){const value=event.state??event.eventType;const v=lower(value);const red=/forced|panic|fire|smoke|tamper|offline|critical|denied/.test(v);const orange=/held|trigger|battery_low|warning|degraded/.test(v);const blue=/open|authorized/.test(v);return status(value,red?"red":orange?"orange":blue?"blue":ai?"purple":"green",label(value),red?false:true,null,ai,event.occurredAt,event.source,event.metadata);}
function status(stateValue:string,color:string,labelValue:string,online:boolean|null,recording:boolean|null,analyticsActive:boolean,observedAt:string|null,source:string,details:Record<string,unknown>):TwinObjectStatus{return{state:stateValue,color,label:labelValue,online,recording,analyticsActive,observedAt,source,details};}
function markerForAnalytics(alert:AnalyticsAlert,objects:Array<TwinObject & {currentStatus:TwinObjectStatus}>):TwinAlertMarker[]{const object=objects.find((item)=>item.binding?.deviceType==="camera"&&item.binding.deviceId===alert.cameraId);if(!object)return[];return[{id:`analytics:${alert.id}`,floorId:object.floorId,twinObjectId:object.id,alertType:"ai_alert",severity:analyticsSeverity(alert),title:alert.title,description:alert.description??null,positionX:object.positionX,positionY:object.positionY,triggeredAt:alert.lastDetectedAt,acknowledgedAt:alert.acknowledgedAt??null,resolvedAt:alert.resolvedAt??null,pulseEffect:true,autoZoom:true,source:`analytics:${alert.modelVersion}`,sourceAlertId:alert.id,snapshotReference:alert.snapshotReference??null,clipReference:alert.clipReference??null,metadata:{confidence:alert.confidence,objectClasses:alert.objectClasses,cameraProjection:"camera-location approximation"}}];}
function dedupeAlerts(items:TwinAlertMarker[]){return[...new Map(items.map((item)=>[`${item.source}:${item.sourceAlertId??item.id}`,item])).values()].sort((a,b)=>b.triggeredAt.localeCompare(a.triggeredAt));}
function telemetryState(item:OperationalTelemetryEnvelope){const value=[item.metrics.operationalStatus,item.metrics.healthStatus,item.metrics.status,item.metrics.recordingStatus].find((v)=>typeof v==="string");if(item.metrics.reachable===false||item.metrics.online===false||item.metrics.connectivity===false)return"offline";return lower(value)||"unknown";}
function severityForTelemetry(item:OperationalTelemetryEnvelope):TwinSeverity{const value=`${telemetryState(item)} ${item.reasonCodes.join(" ")}`;return/critical|failed|offline|missing|forced/.test(value)?"critical":/warning|degraded|battery|failover/.test(value)?"warning":"info";}
function analyticsSeverity(alert:AnalyticsAlert):TwinSeverity{return alert.severity==="P1"?"critical":["P2","P3"].includes(alert.severity)?"warning":"info";}
function normalizeDeviceType(value:string){return value==="recorder"?"recorder":value;}
function isAlertEvent(event:TwinEvent){const value=`${event.eventType} ${event.state}`.toLowerCase();return event.severity!=="info"||/forced|held_open|panic|fire|smoke|tamper|access_denied|intrusion|triggered/.test(value);}
function alertTitle(event:TwinEvent,name?:string){return `${name?`${name}: `:""}${label(event.eventType)}${event.state?` — ${label(event.state)}`:""}`;}
function lower(value:unknown){return typeof value==="string"?value.toLowerCase().replaceAll("-","_").replaceAll(" ","_"):"";}
function label(value:string){return value.replaceAll("_"," ").replaceAll("-"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase());}
function metricName(item:OperationalTelemetryEnvelope){return typeof item.metrics.name==="string"?item.metrics.name:undefined;}
