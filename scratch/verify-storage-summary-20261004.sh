set -e
sudo docker exec -i sentinel-gcp-control-plane node <<'JS'
(async()=>{
const login=await fetch('http://localhost:8080/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'test',password:'test@123'})});
const session=await login.json();if(!login.ok||!session.accessToken)throw new Error('Test-account login failed: '+login.status);
const response=await fetch('http://dashboard:10000/api/operations/storage',{headers:{cookie:'sentinel_access='+session.accessToken},signal:AbortSignal.timeout(20000)});
const data=await response.json();if(!response.ok||!data.success)throw new Error('Storage inventory failed: '+response.status);
if(data.summary.tier2DvrHddCount===0 && data.summary.dvrHddNode.capacity!=='Unavailable')throw new Error('Unavailable disks are still included in capacity');
console.log(JSON.stringify({http:response.status,summary:data.summary,disks:data.storageDevices.map(d=>({id:d.id,branch:d.branchName,status:d.operationalStatus,capacity:d.capacityBytes,lastCheck:d.lastCheck,stale:d.telemetryStale}))}));
})().catch(e=>{console.error(e.message);process.exit(1)});
JS
