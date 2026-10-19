const base = "https://35-200-130-81.sslip.io";

const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
console.log("Login data:", JSON.stringify(loginData, null, 2));

const token = loginData.accessToken || loginData.token;

const meRes = await fetch(`${base}/v1/auth/me`, {
  headers: { "authorization": `Bearer ${token}` }
});
console.log("Auth me:", await meRes.text());

const camsRes = await fetch(`${base}/v1/cameras`, {
  headers: { "authorization": `Bearer ${token}` }
});
const camsData = await camsRes.json();
console.log("Cameras count returned by API:", Array.isArray(camsData) ? camsData.length : (camsData.items ? camsData.items.length : camsData));

if (Array.isArray(camsData)) {
  const branchCounts = {};
  for (const c of camsData) {
    const bName = c.branchName || c.branch?.name || c.branchId || 'Unknown';
    branchCounts[bName] = (branchCounts[bName] || 0) + 1;
  }
  console.log("Cameras per branch in API:", branchCounts);
} else if (camsData.items) {
  const branchCounts = {};
  for (const c of camsData.items) {
    const bName = c.branchName || c.branch?.name || c.branchId || 'Unknown';
    branchCounts[bName] = (branchCounts[bName] || 0) + 1;
  }
  console.log("Cameras per branch in API items:", branchCounts);
}
