import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import { AnalyticsRepository } from "../src/database/analytics-repository.js";
import { shutterCalibration } from "../analytics-engine/test/shutter-fixtures.js";

const admin={"x-user-id":"user-global-admin"};
const engineKey="shutter-engine-key-long-enough-for-testing";
const ruleInput={name:"Entrance shutter",detectionType:"shutter-state",enabled:true,
  objectClasses:["shutter"],minConfidence:.7,minDurationSeconds:2,direction:"any" as const,
  severity:"P3" as const,cooldownSeconds:60,recipients:[],recordingPolicy:"none" as const,
  preRollSeconds:5,postRollSeconds:30,shutterConfig:shutterCalibration()};
function event(ruleId:string,state:"open"|"closed",number:number) {
  return {tenantId:"omsystems",cameraId:"cam-001",sourceEventId:`shutter-${number}`,
    detectionType:state==="open"?"shutter-opened":"shutter-closed",
    occurredAt:new Date(Date.parse("2026-10-05T10:00:00Z")+number*3000).toISOString(),
    confidence:.98,durationSeconds:2,modelVersion:"calibrated-shutter-region-1.0.0",
    objects:[{label:"shutter",confidence:.98}],
    metadata:{shutterRuleId:ruleId,shutterState:state,previousShutterState:state==="open"?"closed":"open",transitionConfirmed:true}};
}

describe("shutter rule API and alert workflow",()=>{
  let app:FastifyInstance,store:MemoryStore;
  beforeEach(async()=>{store=new MemoryStore();app=await buildApp({store,analyticsEngineSharedKey:engineKey});});
  afterEach(async()=>{await app?.close();});
  it("requires calibration on creation and when changing a generic rule to shutter monitoring",async()=>{
    const {shutterConfig,...withoutConfig}=ruleInput;
    const missing=await app.inject({method:"POST",url:"/v1/cameras/cam-001/analytics/rules",headers:admin,payload:withoutConfig});
    expect(missing.statusCode).toBe(400);expect(missing.json().error).toBe("shutter_calibration_required");
    const generic=await store.createAnalyticsRule("omsystems","cam-001","user-global-admin",{...withoutConfig,detectionType:"person"});
    const update=await app.inject({method:"PATCH",url:`/v1/cameras/cam-001/analytics/rules/${generic.id}`,headers:admin,payload:{detectionType:"shutter-state"}});
    expect(update.statusCode).toBe(400);
    expect((await store.listAnalyticsRules("cam-001"))[0]?.detectionType).toBe("person");
  });
  it("round trips calibration, preserves it on edits, and exposes it to the frame worker",async()=>{
    const created=await app.inject({method:"POST",url:"/v1/cameras/cam-001/analytics/rules",headers:admin,payload:ruleInput});
    expect(created.statusCode).toBe(201);
    expect(created.json().shutterConfig).toEqual(ruleInput.shutterConfig);
    const update=await app.inject({method:"PATCH",url:`/v1/cameras/cam-001/analytics/rules/${created.json().id}`,headers:admin,payload:{name:"Main shutter"}});
    expect(update.statusCode).toBe(200);expect(update.json().shutterConfig).toEqual(ruleInput.shutterConfig);
    const listed=await app.inject({method:"GET",url:"/v1/cameras/cam-001/analytics/rules",headers:admin});
    expect(listed.json().data[0].shutterConfig).toEqual(ruleInput.shutterConfig);
  });
  it("rejects unusable calibration",async()=>{
    const response=await app.inject({method:"POST",url:"/v1/cameras/cam-001/analytics/rules",headers:admin,
      payload:{...ruleInput,shutterConfig:{...ruleInput.shutterConfig,openReference:ruleInput.shutterConfig.closedReference}}});
    expect(response.statusCode).toBe(400);
    expect(store.analyticsRules).toHaveLength(0);
  });
  it("creates and notifies a separate incident for each opening and closing inside cooldown",async()=>{
    const rule=await store.createAnalyticsRule("omsystems","cam-001","user-global-admin",{...ruleInput,recordingPolicy:"protect-window"});
    const ids=[];
    for(const [number,state] of ["open","closed","open","closed"].entries()) {
      const response=await app.inject({method:"POST",url:"/internal/analytics/events",headers:{"x-analytics-engine-key":engineKey},payload:event(rule.id,state as "open"|"closed",number)});
      expect(response.statusCode).toBe(202);
      expect(response.json().event.status).toBe("accepted");
      expect(response.json().alerts).toHaveLength(1);
      const alert=response.json().alerts[0];ids.push(alert.id);
      expect(alert).toMatchObject({title:state==="open"?"Shutter opened":"Shutter closed",status:"new",occurrenceCount:1,incidentId:expect.any(String)});
    }
    expect(new Set(ids).size).toBe(4);
    expect(store.analyticsAlerts).toHaveLength(4);
    expect(store.analyticsNotifications.filter(notification=>notification.channel==="dashboard")).toHaveLength(4);
    const duplicate=await app.inject({method:"POST",url:"/internal/analytics/events",headers:{"x-analytics-engine-key":engineKey},payload:event(rule.id,"closed",3)});
    expect(duplicate.json().event.status).toBe("duplicate");
    expect(store.analyticsAlerts).toHaveLength(4);
    expect(store.analyticsNotifications.filter(notification=>notification.channel==="dashboard")).toHaveLength(4);
  });
  it("does not suppress a closing when its opening alert was resolved immediately",async()=>{
    const rule=await store.createAnalyticsRule("omsystems","cam-001","user-global-admin",ruleInput);
    const opened=await store.processAnalyticsEvent(event(rule.id,"open",0));
    const alert=opened.alerts[0]!;alert.status="resolved";alert.resolvedAt=alert.lastDetectedAt;
    const closed=await store.processAnalyticsEvent(event(rule.id,"closed",1));
    expect(closed.event.status).toBe("accepted");expect(closed.alerts[0]?.id).not.toBe(alert.id);
  });
  it("matches only the calibrated rule and ignores unconfirmed transitions",async()=>{
    const first=await store.createAnalyticsRule("omsystems","cam-001","user-global-admin",ruleInput);
    await store.createAnalyticsRule("omsystems","cam-001","user-global-admin",ruleInput);
    expect((await store.processAnalyticsEvent(event(first.id,"open",0))).alerts).toHaveLength(1);
    const unconfirmed=event(first.id,"closed",1);unconfirmed.metadata.transitionConfirmed=false;
    expect((await store.processAnalyticsEvent(unconfirmed)).alerts).toHaveLength(0);
    const inconsistent=event(first.id,"closed",3);inconsistent.metadata.shutterState="open";
    expect((await store.processAnalyticsEvent(inconsistent)).alerts).toHaveLength(0);
    expect((await store.processAnalyticsEvent(event("other-rule","closed",2))).alerts).toHaveLength(0);
  });
});

describe("Postgres shutter storage and transition deduplication",()=>{
  it("persists calibration on creation and preserves it on partial updates",async()=>{
    let row:Record<string,unknown>={};
    const query=vi.fn(async(sql:string,values:unknown[]=[])=>{
      if(sql.includes("INSERT INTO analytics_rules")) {
        row={id:values[0],tenant_id:values[1],camera_id:values[2],name:values[5],detection_type:values[6],enabled:values[7],
          object_classes:values[9],min_confidence:values[10],min_duration_seconds:values[11],direction:values[12],severity:values[13],
          cooldown_seconds:values[14],recipients:values[15],recording_policy:values[17],pre_roll_seconds:values[18],post_roll_seconds:values[19],
          shutter_config:values[21],created_at:"2026-10-05T10:00:00Z",updated_at:"2026-10-05T10:00:00Z"};
        return {rows:[{id:row.id}]};
      }
      if(sql.includes("UPDATE analytics_rules SET")){row={...row,name:values[5],shutter_config:values[20]};}
      if(sql.includes("FROM analytics_rules rule"))return {rows:[row]};
      return {rows:[]};
    });
    const pool={connect:async()=>({query,release:vi.fn()})} as unknown as Pool;
    const repository=new AnalyticsRepository(pool);
    const created=await repository.createRule("tenant-1","camera-1",undefined,ruleInput);
    expect(created.shutterConfig).toEqual(ruleInput.shutterConfig);
    expect((await repository.updateRule(created.id,"tenant-1","camera-1",{name:"Renamed"}))?.shutterConfig).toEqual(ruleInput.shutterConfig);
    expect(JSON.parse(row.shutter_config as string)).toEqual(ruleInput.shutterConfig);
  });
  it("inserts both transitions without querying generic active/resolved cooldowns",async()=>{
    let storedEvent:Record<string,unknown>={};
    const rule={id:"rule-1",tenant_id:"omsystems",camera_id:"cam-001",name:ruleInput.name,detection_type:"shutter-state",enabled:true,
      object_classes:["shutter"],min_confidence:.7,min_duration_seconds:2,direction:"any",severity:"P3",cooldown_seconds:60,
      recipients:[],recording_policy:"none",pre_roll_seconds:5,post_roll_seconds:5,shutter_config:ruleInput.shutterConfig,
      created_at:"2026-10-05T10:00:00Z",updated_at:"2026-10-05T10:00:00Z"};
    const query=vi.fn(async(sql:string,values:unknown[]=[])=>{
      if(sql.includes("COALESCE(camera.branch_node_id"))return {rows:[{id:"cam-001",branch_id:"A005"}]};
      if(sql.includes("FROM analytics_rules rule"))return {rows:[rule]};
      if(sql.includes("INSERT INTO analytics_events"))storedEvent={id:values[0],tenant_id:values[1],camera_id:values[2],source_event_id:values[3],
        detection_type:values[5],occurred_at:values[6],confidence:values[8],duration_seconds:values[9],model_version:values[10],metadata:values[13],status:values[14],created_at:values[6]};
      if(sql==="SELECT * FROM analytics_events WHERE id=$1")return {rows:[storedEvent]};
      if(sql.includes("INSERT INTO analytics_alerts"))return {rows:[{id:values[0],tenant_id:values[1],camera_id:values[2],rule_id:values[3],event_id:values[4],
        title:values[5],description:values[6],severity:values[7],confidence:values[8],object_classes:values[9],model_version:values[10],
        first_detected_at:values[13],last_detected_at:values[13],created_at:values[13],updated_at:values[13],status:"new",occurrence_count:1}]};
      return {rows:[]};
    });
    const pool={connect:async()=>({query,release:vi.fn()})} as unknown as Pool;
    const repository=new AnalyticsRepository(pool);
    const opened=await repository.processEvent(event("rule-1","open",0));
    const closed=await repository.processEvent(event("rule-1","closed",1));
    expect(opened.alerts[0]?.title).toBe("Shutter opened");expect(closed.alerts[0]?.title).toBe("Shutter closed");
    expect(opened.alerts[0]?.id).not.toBe(closed.alerts[0]?.id);
    expect(query.mock.calls.filter(([sql])=>sql.includes("INSERT INTO analytics_alerts"))).toHaveLength(2);
    expect(query.mock.calls.some(([sql])=>sql.includes("last_detected_at >=")||sql.includes("resolved_at >="))).toBe(false);
    expect(query.mock.calls.filter(([sql])=>sql.includes("FROM alert_suppression_config"))).toHaveLength(2);
  });
});
