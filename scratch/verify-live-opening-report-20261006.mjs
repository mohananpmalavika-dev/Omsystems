// Inspect the deployed report using a normal authenticated API session.
// Do not print credentials, tokens, evidence or report rows.
import assert from 'node:assert/strict';
const base='http://127.0.0.1:8080';
const login=await fetch(`${base}/v1/auth/login`,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({username:'admin',password:process.env.BOOTSTRAP_SUPERADMIN_PASSWORD})});
const auth=await login.json();
assert.equal(login.status,200,'Configured administrator login failed');
const token=auth.token || auth.session?.token || auth.accessToken;
assert.ok(token,'Authenticated session token is required');
const headers={authorization:`Bearer ${token}`};
try {
  let checks=0;
  for(const query of ['timeRange=today','timeRange=7d','timeRange=custom&startDate=2026-10-06&endDate=2026-10-06']) {
    const response=await fetch(`${base}/v1/reports/mis/branch-openings?${query}`,{headers});
    assert.equal(response.status,200,query);
    const report=await response.json();
    assert.equal(report.total,report.rows.length);
    const seen=new Set();
    for(const row of report.rows) {
      const key=`${row.branchId}:${row.localDate}`;
      assert.ok(!seen.has(key));seen.add(key);
      if(row.outcome==='NOT_RECORDED') {assert.equal(row.personCount,null);assert.equal(row.occurredAt,null);assert.equal(row.photoUrl,null);}
      else {assert.ok(row.personCount>=1);assert.equal(row.outcome,row.personCount>=2?'SUCCESS':'FAILED');}
      checks++;
    }
    console.log(JSON.stringify({query,http:response.status,rows:report.total,recorded:report.rows.filter(r=>r.outcome!=='NOT_RECORDED').length,truncated:report.truncated}));
  }
  const response=await fetch(`${base}/v1/reports/mis/branch-openings?timeRange=today&branchId=d7b23dee-9814-48c9-8805-48b61b33e3a9`,{headers});
  assert.equal(response.status,200);const report=await response.json();
  assert.ok(report.rows.length>0);assert.ok(report.rows.every(r=>r.branchId==='d7b23dee-9814-48c9-8805-48b61b33e3a9'));
  const invalid=await fetch(`${base}/v1/reports/mis/branch-openings?timeRange=custom&startDate=2026-10-06&endDate=2026-10-05`,{headers});
  assert.equal(invalid.status,400);
  console.log(JSON.stringify({verified:true,rowChecks:checks,branchFilter:true,invalidDatesRejected:true,syntheticAlertsCreated:0}));
} finally {
  await fetch(`${base}/v1/auth/logout`,{method:'POST',headers}).catch(()=>{});
}
