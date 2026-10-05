import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {NbfcRuleRepository} from '/app/dist/src/analytics/nbfc-rule-repository.js';
import {NbfcRuleEngineService} from '/app/dist/src/analytics/nbfc-rule-engine.service.js';
import {registerNbfcAnalyticsRoutes} from '/app/dist/src/routes/nbfc-analytics.routes.js';
const repository=new NbfcRuleRepository();
const engine=new NbfcRuleEngineService(repository);
const app=Fastify();
app.addHook('onRequest',async request=>{request.currentUser={id:'qa-admin',tenantId:'qa-tenant',role:'company_admin'};});
registerNbfcAnalyticsRoutes(app,{repository,engineService:engine});
try {
 const rule=await repository.instantiateTemplate('tmpl-27-opening-staff-count',{tenantId:'qa-tenant',branchIds:['new-branch']});
 assert.equal(rule.enabled,true);assert.equal(rule.state,'ACTIVE');assert.equal(rule.schedule.start,'08:00');assert.equal(rule.schedule.end,'11:00');
 for(const enabled of [false,true]){
  const payload={enabled,openingStart:'09:15',openingEnd:'10:45',timezone:'Asia/Kolkata',activeDays:[1,2,3,4,5,6]};
  const saved=await app.inject({method:'PUT',url:'/api/ai/branch-opening-policy/new-branch',payload});
  assert.equal(saved.statusCode,200);assert.equal(saved.json().enabled,enabled);
  const loaded=await app.inject({method:'GET',url:'/api/ai/branch-opening-policy/new-branch'});
  assert.equal(loaded.json().enabled,enabled);assert.equal(loaded.json().openingStart,'09:15');assert.equal(loaded.json().openingEnd,'10:45');
  assert.equal((await repository.getRule(rule.id)).state,enabled?'ACTIVE':'INACTIVE');
 }
 const invalid=await app.inject({method:'PUT',url:'/api/ai/branch-opening-policy/new-branch',payload:{enabled:false,openingStart:'11:00',openingEnd:'08:00'}});
 assert.equal(invalid.statusCode,400);
 console.log(JSON.stringify({verified:true,defaultWindow:'08:00-11:00',customWindowPersists:true,togglePersists:true,invalidWindowRejected:true}));
} finally {await app.close();}
