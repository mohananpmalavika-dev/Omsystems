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
console.log('API Total field:', camsData.total);
console.log('API Items length:', camsData.items.length);

const branchCounts = {};
for (const c of camsData.items) {
  branchCounts[c.branchName] = (branchCounts[c.branchName] || 0) + 1;
}
console.log('Branch breakdown:', branchCounts);

let onlineCount = 0;
for (const c of camsData.items) {
  if (c.status === 'online') onlineCount++;
}
console.log(`Online cameras in API: ${onlineCount}/${camsData.items.length}`);
