// Run the deployed report handler against production repositories in a READ ONLY transaction.
// This verifies report generation separately from the external login/UI session.
import assert from 'node:assert/strict';
import pg from 'pg';
import Fastify from 'fastify';
import {ResourceRepository} from '/app/dist/src/database/resource-repository.js';
import {CameraRepository} from '/app/dist/src/database/camera-repository.js';
import {DeviceIdentityRepository} from '/app/dist/src/database/device-identity-repository.js';
import {UserRepository} from '/app/dist/src/database/user-repository.js';
import {AnalyticsRepository} from '/app/dist/src/database/analytics-repository.js';
import {NbfcRuleRepository} from '/app/dist/src/analytics/nbfc-rule-repository.js';
import {createMISUnifiedRoutes} from '/app/dist/src/routes/reports/mis-unified.routes.js';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
const client=await pool.connect();
const app=Fastify();
try {
 await client.query('BEGIN READ ONLY');
 const tenantId='00000000-0000-4000-8000-000000000001';
 const {rows:[identity]}=await client.query("SELECT id FROM users WHERE tenant_id=$1 AND role='super_admin' AND status='active' ORDER BY id LIMIT 1",[tenantId]);
 const user=await new UserRepository(client).findByIdentity(identity.id);
 assert.equal(user.tenantId,tenantId);
 const resources=new ResourceRepository(client);
 const cameras=new CameraRepository(client,new DeviceIdentityRepository(client));
 const analytics=new AnalyticsRepository(client);
 const store={listAccessibleNodes:(u,action,type)=>resources.listAccessible(u,action,type),
  listCameras:id=>cameras.listByTenant(id),listAnalyticsEvents:(id,filters)=>analytics.listEvents(id,filters)};
 app.addHook('preHandler',async request=>{request.currentUser=user;});
 createMISUnifiedRoutes(app,client,store,new NbfcRuleRepository(client));
 let checks=0;
 for(const query of ['timeRange=today','timeRange=7d','timeRange=custom&startDate=2026-10-06&endDate=2026-10-06',
  'timeRange=today&branchId=d7b23dee-9814-48c9-8805-48b61b33e3a9']) {
  const response=await app.inject({method:'GET',url:`/mis/branch-openings?${query}`});
  assert.equal(response.statusCode,200,response.body.slice(0,120));
  const report=response.json();assert.equal(report.total,report.rows.length);
  const seen=new Set();
  for(const row of report.rows){
   const key=`${row.branchId}:${row.localDate}`;assert.ok(!seen.has(key));seen.add(key);
   if(row.outcome==='NOT_RECORDED'){assert.equal(row.personCount,null);assert.equal(row.occurredAt,null);assert.equal(row.photoUrl,null);}
   else {assert.ok(row.personCount>=1);assert.equal(row.outcome,row.personCount>=2?'SUCCESS':'FAILED');}
   if(query.includes('branchId='))assert.equal(row.branchId,'d7b23dee-9814-48c9-8805-48b61b33e3a9');
   checks++;
  }
  console.log(JSON.stringify({query,status:response.statusCode,rows:report.total,recorded:report.rows.filter(r=>r.outcome!=='NOT_RECORDED').length}));
 }
 const bad=await app.inject({method:'GET',url:'/mis/branch-openings?timeRange=custom&startDate=2026-10-06&endDate=2026-10-05'});
 assert.equal(bad.statusCode,400);
 await client.query('ROLLBACK');
 console.log(JSON.stringify({deployedHandlerVerified:true,rowChecks:checks,readOnly:true,externalLoginVerified:false}));
} finally {await app.close();await client.query('ROLLBACK').catch(()=>{});client.release();await pool.end();}
