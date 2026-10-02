const fs=require('fs');
const r=JSON.parse(fs.readFileSync('tmp/audit-tests.json','utf8'));
console.log(JSON.stringify({suites:r.numTotalTestSuites,failedSuites:r.numFailedTestSuites,tests:r.numTotalTests,passed:r.numPassedTests,failed:r.numFailedTests,pending:r.numPendingTests}));
const lines=[];
for(const s of r.testResults){
 const f=s.assertionResults.filter(t=>t.status==='failed');
 if(s.status==='failed')lines.push(JSON.stringify({file:s.name,message:s.message,failures:f.map(t=>({name:t.fullName,error:t.failureMessages.join(' ')}))}));
}
fs.writeFileSync('reports/project-test-failures-2026-10-02.jsonl',lines.join('\n'));
console.log('failed test files',lines.length);
