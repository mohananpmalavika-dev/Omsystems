import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { buildLivePersonCountReport, LivePersonCountService } from "../src/analytics/live-person-count.service.js";
import { registerLivePersonCountRoutes } from "../src/routes/live-person-count.routes.js";
import { sortedMatchingRules } from "../src/analytics/rule-engine.js";
import type { Camera, ResourceNode } from "../src/domain/models.js";
import type { ControlPlaneStore } from "../src/control-plane-store.js";
import type { RedisClientType } from "redis";
const now = Date.parse("2026-10-06T08:00:00.000Z");
const node = (id: string, type: ResourceNode["type"], path: string[]): ResourceNode => ({id,type,path,name:id,tenantId:"t1",parentId:path.at(-2) ?? null});
const branches = [node("b1","branch",["z1","r1","b1"]),node("b2","branch",["z1","r1","b2"]),node("b3","branch",["z2","r2","b3"])];
const nodes = [node("z1","zone",["z1"]),node("r1","region",["z1","r1"]),node("z2","zone",["z2"]),node("r2","region",["z2","r2"]),...branches];
const cameras = [{id:"c1",branchId:"b1",status:"online"},{id:"c2",branchId:"b1",status:"degraded"},{id:"c3",branchId:"b2",status:"offline"},{id:"c4",branchId:"b3",status:"unknown"}] as Camera[];
const observed = (count: number, age=0) => ({count,status:"observed" as const,observedAt:new Date(now-age).toISOString()});
describe("live person count reporting", () => {
  it("sums current views once, includes zero, and distinguishes missing coverage", () => {
    const report = buildLivePersonCountReport({cameras,branches,nodes},new Map([["c1",observed(2)],["c2",observed(3)],["c3",observed(0)],["c4",observed(99,90001)]]),{},now);
    expect(report.rows.map(row => [row.id,row.personCount,row.totalCameras,row.coverage])).toEqual([["b1",5,2,"complete"],["b2",0,1,"complete"],["b3",null,1,"unavailable"]]);
    expect(report.summary).toEqual({branches:3,personCount:5,totalCameras:4,onlineCameras:2,notWorkingCameras:2,reportingCameras:3});
    expect(report.rows.every(row => row.reportTime === new Date(now).toISOString())).toBe(true);
  });
  it("does not turn unavailable inference or future captures into zero/live", () => {
    const report = buildLivePersonCountReport({cameras,branches,nodes},new Map([["c1",observed(2)],["c2",{count:null,status:"unavailable" as const,observedAt:new Date(now).toISOString()}],["c3",observed(5,-6000)]]),{},now);
    expect(report.rows[0]).toMatchObject({personCount:2,coverage:"partial",reportingCameras:1,totalCameras:2});
    expect(report.rows[1]).toMatchObject({personCount:null,coverage:"unavailable"});
  });
  it("filters intersect and grouping preserves camera and person totals", () => {
    const observations = new Map([["c1",observed(2)],["c2",observed(3)],["c3",observed(4)],["c4",observed(7)]]);
    const report = buildLivePersonCountReport({cameras,branches,nodes},observations,{zoneId:"z1",regionId:"r1",groupBy:"region"},now);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({id:"r1",name:"r1",personCount:9,totalCameras:3,onlineCameras:2,notWorkingCameras:1});
    expect(buildLivePersonCountReport({cameras,branches,nodes},observations,{zoneId:"z2",branchId:"b1"},now).rows).toEqual([]);
    expect(buildLivePersonCountReport({cameras,branches,nodes},observations,{groupBy:"zone"},now).rows.map(row => row.personCount)).toEqual([9,7]);
  });
  it("uses camera health independently of inference coverage across every grouping", () => {
    for (const groupBy of ["branch","region","zone"] as const) {
      const report = buildLivePersonCountReport({cameras,branches,nodes},new Map([["c3",observed(2)]]),{groupBy},now);
      expect(report.summary).toMatchObject({totalCameras:4,onlineCameras:2,notWorkingCameras:2,reportingCameras:1});
      expect(report.rows.reduce((sum,row) => sum + row.onlineCameras,0)).toBe(2);
      expect(report.rows.reduce((sum,row) => sum + row.notWorkingCameras,0)).toBe(2);
      expect(report.rows.every(row => row.onlineCameras + row.notWorkingCameras === row.totalCameras)).toBe(true);
    }
    const branch = buildLivePersonCountReport({cameras,branches,nodes},new Map(),{branchId:"b1"},now);
    expect(branch.summary).toMatchObject({totalCameras:2,onlineCameras:2,notWorkingCameras:0,reportingCameras:0});
  });
  it("includes newly added cameras and branches without a rule configuration", () => {
    const report = buildLivePersonCountReport({cameras:[...cameras,{id:"new",branchId:"b1"} as Camera],branches:[...branches,node("empty","branch",["z1","r1","empty"])],nodes},new Map([["c1",observed(2)]]),{},now);
    expect(report.rows.find(row => row.id === "b1")).toMatchObject({totalCameras:3,personCount:2,coverage:"partial"});
    expect(report.rows.find(row => row.id === "empty")).toMatchObject({totalCameras:0,personCount:null});
  });
  it("keeps camera telemetry tenant scoped and rejects invalid captures", async () => {
    const redis = {eval:vi.fn().mockResolvedValue(1),mGet:vi.fn().mockResolvedValue([JSON.stringify(observed(0))])};
    const service = new LivePersonCountService(redis as unknown as RedisClientType);
    expect(await service.record("t1","c1",observed(2,-6000),now)).toBe(false);
    expect(await service.record("t1","c1",observed(2,90001),now)).toBe(false);
    expect(await service.record("t1","c1",{count:-1,status:"observed",observedAt:new Date(now).toISOString()},now)).toBe(false);
    expect(redis.eval).not.toHaveBeenCalled();
    expect((await service.read("t1",["c1"])).get("c1")?.count).toBe(0);
    expect(redis.mGet).toHaveBeenCalledWith(["analytics:person-count:t1:c1"]);
  });
  it("never matches counting rules to alert creation; person P1 stays available", () => {
    const rules = ["person-counting","occupancy-counting","person"].map(detectionType => ({id:detectionType,enabled:true,detectionType,minConfidence:0.65,minDurationSeconds:0,objectClasses:[],direction:"any",severity:"P1"}));
    const event = {detectionType:"person-counting",confidence:0.95,durationSeconds:0,objects:[],occurredAt:new Date(now).toISOString()};
    expect(sortedMatchingRules(rules as any,event as any)).toEqual([]);
    expect(sortedMatchingRules(rules as any,{...event,detectionType:"occupancy-counting"} as any)).toEqual([]);
    expect(sortedMatchingRules(rules as any,{...event,detectionType:"person"} as any)).toHaveLength(1);
  });
  it("only reads authorised cameras and hides other branch filter options", async () => {
    const app = Fastify();
    app.addHook("preHandler",async request => {request.currentUser={id:"viewer",tenantId:"t1"} as any;});
    const store = {
      listAccessibleCameras:vi.fn().mockResolvedValue({cameras:[cameras[0]],total:1}),
      listAccessibleNodes:vi.fn().mockResolvedValue([branches[0]]),
      listNodesByIds:vi.fn(async (ids:string[]) => nodes.filter(node => ids.includes(node.id))),
    } as unknown as ControlPlaneStore;
    const service = {read:vi.fn().mockResolvedValue(new Map([["c1",{...observed(2),observedAt:new Date().toISOString()}]]))};
    await registerLivePersonCountRoutes(app,store,service as any);
    const response = await app.inject({url:"/v1/reports/live-person-count"});
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(service.read).toHaveBeenCalledWith("t1",["c1"]);
    expect(response.json().filters.branches.map((branch:any) => branch.id)).toEqual(["b1"]);
    const forbiddenScope = await app.inject({url:"/v1/reports/live-person-count?branchId=b2"});
    expect(forbiddenScope.json().rows).toEqual([]);
    expect((await app.inject({url:"/v1/reports/live-person-count?groupBy=bad"})).statusCode).toBe(400);
    await app.close();
  });
});
