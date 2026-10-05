import type { RedisClientType } from "redis";
import {
  PERSON_COUNT_FRESH_MS, personCountObservationSchema,
  type PersonCountObservation, type LivePersonCountReport, type PersonCountRow,
} from "../../packages/contracts/src/live-person-count.js";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { Camera, ResourceNode, User } from "../domain/models.js";

const key = (tenantId: string, cameraId: string) => `analytics:person-count:${tenantId}:${cameraId}`;
// Preserve the newest capture even when inference requests finish out of order.
const saveLatest = `local old = redis.call('GET', KEYS[1])
if old then local ok, parsed = pcall(cjson.decode, old)
  if ok and parsed.observedAt >= ARGV[2] then return 0 end end
redis.call('SET', KEYS[1], ARGV[1], 'EX', 180)
return 1`;

export class LivePersonCountService {
  constructor(private readonly redis: RedisClientType) {}
  async record(tenantId: string, cameraId: string, value: unknown, now = Date.now()) {
    const parsed = personCountObservationSchema.safeParse(value);
    if (!parsed.success) return false;
    const observedMs = Date.parse(parsed.data.observedAt);
    if (observedMs > now + 5000 || now - observedMs > PERSON_COUNT_FRESH_MS) return false;
    const observation = { ...parsed.data, observedAt: new Date(observedMs).toISOString() };
    return await this.redis.eval(saveLatest, {
      keys: [key(tenantId, cameraId)], arguments: [JSON.stringify(observation), observation.observedAt],
    }) === 1;
  }
  async read(tenantId: string, cameraIds: string[]): Promise<Map<string, PersonCountObservation>> {
    const observations = new Map<string, PersonCountObservation>();
    for (let start = 0; start < cameraIds.length; start += 500) {
      const ids = cameraIds.slice(start, start + 500);
      const values = await this.redis.mGet(ids.map(id => key(tenantId, id)));
      values.forEach((raw, index) => {
        if (!raw) return;
        try {
          const parsed = personCountObservationSchema.safeParse(JSON.parse(raw));
          if (parsed.success) observations.set(ids[index]!, parsed.data);
        } catch { /* Invalid telemetry is unavailable, never zero. */ }
      });
    }
    return observations;
  }
}

export type PersonCountFilters = { branchId?: string; regionId?: string; zoneId?: string; groupBy?: "branch" | "region" | "zone" };

export async function loadPersonCountScope(store: ControlPlaneStore, user: User) {
  const cameras: Camera[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await store.listAccessibleCameras(user, "analytics:view", { limit: 500, offset });
    cameras.push(...page.cameras);
    if (page.cameras.length === 0 || cameras.length >= page.total) break;
  }
  const accessibleBranches = await store.listAccessibleNodes(user, "analytics:view", "branch");
  const branchNodes = await store.listNodesByIds([...new Set(cameras.map(camera => camera.branchId))]);
  const branches = [...new Map([...accessibleBranches, ...branchNodes]
    .filter(branch => branch.tenantId === user.tenantId && branch.type === "branch")
    .map(branch => [branch.id, branch])).values()];
  const ancestors = await store.listNodesByIds([...new Set(branches.flatMap(branch => branch.path))]);
  const branchIds = new Set(branches.map(branch => branch.id));
  return { cameras: cameras.filter(camera => branchIds.has(camera.branchId)), branches,
    nodes: ancestors.filter(node => node.tenantId === user.tenantId) };
}

export function buildLivePersonCountReport(
  scope: { cameras: Camera[]; branches: ResourceNode[]; nodes: ResourceNode[] },
  observations: ReadonlyMap<string, PersonCountObservation>, filters: PersonCountFilters = {}, now = Date.now(),
): LivePersonCountReport {
  const reportTime = new Date(now).toISOString();
  const nodes = new Map(scope.nodes.map(node => [node.id, node]));
  const ancestor = (branch: ResourceNode, type: ResourceNode["type"]) => [...branch.path].reverse()
    .map(id => nodes.get(id)).find(node => node?.type === type);
  const branchFilters = scope.branches.map(branch => {
    const region = ancestor(branch, "region"), zone = ancestor(branch, "zone");
    return { id: branch.id, name: branch.name, regionId: region?.id ?? null, regionName: region?.name ?? null,
      zoneId: zone?.id ?? null, zoneName: zone?.name ?? null };
  }).sort((a,b) => a.name.localeCompare(b.name));
  const rows: PersonCountRow[] = branchFilters.filter(branch =>
    (!filters.branchId || branch.id === filters.branchId) &&
    (!filters.regionId || branch.regionId === filters.regionId) &&
    (!filters.zoneId || branch.zoneId === filters.zoneId)).map(branch => {
      const cameras = scope.cameras.filter(camera => camera.branchId === branch.id);
      // Match Live Wall availability: degraded connections are still online.
      const onlineCameras = cameras.filter(camera => camera.status === "online" || camera.status === "degraded").length;
      const fresh = cameras.flatMap(camera => {
        const value = observations.get(camera.id);
        if (!value || value.status !== "observed" || value.count === null) return [];
        const age = now - Date.parse(value.observedAt);
        return age >= -5000 && age <= PERSON_COUNT_FRESH_MS ? [value] : [];
      });
      const times = fresh.map(value => value.observedAt).sort();
      return { ...branch, branchId: branch.id, branchName: branch.name, reportTime,
        totalCameras: cameras.length, onlineCameras, notWorkingCameras: cameras.length - onlineCameras, reportingCameras: fresh.length,
        personCount: fresh.length ? fresh.reduce((sum,value) => sum + value.count!,0) : null,
        oldestObservationAt: times[0] ?? null, latestObservationAt: times.at(-1) ?? null,
        coverage: fresh.length === 0 ? "unavailable" : fresh.length === cameras.length ? "complete" : "partial" };
    });
  const groupBy = filters.groupBy ?? "branch";
  const grouped = new Map<string, PersonCountRow>();
  if (groupBy !== "branch") for (const row of rows) {
    const id = (groupBy === "region" ? row.regionId : row.zoneId) ?? `branch:${row.id}`;
    const name = (groupBy === "region" ? row.regionName : row.zoneName) ?? row.branchName ?? row.name;
    const current = grouped.get(id);
    if (!current) { grouped.set(id, { ...row, id, name, branchId: undefined, branchName: undefined,
      regionId: groupBy === "zone" ? null : row.regionId, regionName: groupBy === "zone" ? null : row.regionName }); continue; }
    current.totalCameras += row.totalCameras; current.reportingCameras += row.reportingCameras;
    current.onlineCameras += row.onlineCameras; current.notWorkingCameras += row.notWorkingCameras;
    if (row.personCount !== null) current.personCount = (current.personCount ?? 0) + row.personCount;
    current.oldestObservationAt = [current.oldestObservationAt, row.oldestObservationAt].filter(Boolean).sort()[0] ?? null;
    current.latestObservationAt = [current.latestObservationAt, row.latestObservationAt].filter(Boolean).sort().at(-1) ?? null;
    current.coverage = current.reportingCameras === 0 ? "unavailable" : current.reportingCameras === current.totalCameras ? "complete" : "partial";
  }
  return { reportTime, freshnessSeconds: PERSON_COUNT_FRESH_MS / 1000, groupBy,
    rows: groupBy === "branch" ? rows : [...grouped.values()].sort((a,b) => a.name.localeCompare(b.name)),
    summary: { branches: rows.length, totalCameras: rows.reduce((sum,row) => sum + row.totalCameras,0),
      onlineCameras: rows.reduce((sum,row) => sum + row.onlineCameras,0),
      notWorkingCameras: rows.reduce((sum,row) => sum + row.notWorkingCameras,0),
      reportingCameras: rows.reduce((sum,row) => sum + row.reportingCameras,0),
      personCount: rows.some(row => row.personCount !== null) ? rows.reduce((sum,row) => sum + (row.personCount ?? 0),0) : null },
    filters: { branches: branchFilters,
      regions: [...new Map(branchFilters.filter(branch => branch.regionId).map(branch => [branch.regionId!,
        {id: branch.regionId!, name: branch.regionName!, zoneId: branch.zoneId}])).values()].sort((a,b) => a.name.localeCompare(b.name)),
      zones: [...new Map(branchFilters.filter(branch => branch.zoneId).map(branch => [branch.zoneId!,
        {id: branch.zoneId!, name: branch.zoneName!}])).values()].sort((a,b) => a.name.localeCompare(b.name)) } };
}
