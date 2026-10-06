// Authenticated, read-only report verification. Never print credentials or report rows.
import assert from 'node:assert/strict';
const base='http://127.0.0.1:8080';
const login=await fetch(`${base}/v1/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password:process.env.BOOTSTRAP_SUPERADMIN_PASSWORD})});
const auth=await login.json();assert.equal(login.status,200,'Configured administrator login failed');
const token=auth.token||auth.session?.token||auth.accessToken;assert.ok(token);
const headers={authorization:`Bearer ${token}`};
async function get(path,status=200){const r=await fetch(base+path,{headers});assert.equal(r.status,status,path);return r.json();}
try {
 const hierarchy=await get('/v1/reports/mis/hierarchy');
 assert.ok(Array.isArray(hierarchy.zones));assert.ok(Array.isArray(hierarchy.branches));
 const report=await get('/v1/reports/mis?timeRange=custom&startDate=2026-10-06&endDate=2026-10-06&groupBy=branch');
 assert.equal(report.metadata.timezone,'Asia/Kolkata');assert.equal(report.metadata.startDate,'2026-10-05T18:30:00.000Z');assert.equal(report.metadata.endDate,'2026-10-06T18:29:59.999Z');
 const rawNodes=await get('/v1/organization/nodes');const nodes=new Map((rawNodes.data||rawNodes.nodes||rawNodes).map(n=>[n.id,n]));
 function names(branchId){const labels={zone:'',region:'',area:''},seen=new Set();let node=nodes.get(branchId);while(node&&!seen.has(node.id)){seen.add(node.id);if(node.type in labels&&!labels[node.type])labels[node.type]=node.name;node=nodes.get(node.parentId);}return labels;}
 let hierarchyChecks=0;
 for(const row of report.branchMatrix){const labels=names(row.branchId);for(const key of ['zone','region','area'])assert.equal(row[key]||'',labels[key]);hierarchyChecks++;}
 const alerts=await get('/v1/analytics/alerts?limit=200&offset=0');assert.ok(Array.isArray(alerts.data));
 for(const alert of alerts.data){const labels=names(alert.branchId);for(const key of ['zone','region','area'])assert.equal(alert[key+'Name']||'',labels[key]);hierarchyChecks++;}
 if(alerts.data.length){const next=await get('/v1/analytics/alerts?limit=1&offset=1');assert.ok(next.data.length===0||next.data[0].id!==alerts.data[0].id);}
 for(const groupBy of ['zone','region','area','date']){const r=await get(`/v1/reports/mis?timeRange=today&groupBy=${groupBy}`);assert.ok(Array.isArray(r.matrix));}
 await get('/v1/reports/mis?timeRange=custom&startDate=2026-10-06&endDate=2026-10-05',400);
 for(const path of ['/v1/reports/branch-benchmarking?period=monthly','/v1/reports/financial/tco?period=monthly','/v1/reports/compliance-scorecard?period=monthly'])await get(path);
 console.log(JSON.stringify({verified:true,hierarchyChecks,branches:report.branchMatrix.length,alerts:alerts.data.length,timezone:'Asia/Kolkata',singleDayInclusive:true,missingLevelsSkipped:true,pagination:true,invalidDatesRejected:true}));
} finally {await fetch(base+'/v1/auth/logout',{method:'POST',headers}).catch(()=>{});}
