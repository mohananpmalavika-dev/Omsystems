const base = 'https://35-200-130-81.sslip.io';
const loginRes = await fetch(base + '/v1/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'test', password: 'test@123' })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;
const camsRes = await fetch(base + '/v1/cameras', {
  headers: { 'authorization': 'Bearer ' + token }
});
const camsData = await camsRes.json();
const list = Array.isArray(camsData) ? camsData : (camsData.items || []);
console.log('Total cameras returned:', list.length);
const branchCounts = {};
for (const c of list) {
  const b = c.branchName || 'Unknown';
  branchCounts[b] = (branchCounts[b] || 0) + 1;
}
console.log('Branch Breakdown:', branchCounts);
