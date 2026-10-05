async function test() {
  // First obtain session token from control plane
  const loginRes = await fetch("http://control-plane:8080/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "mohanpmalavika@gmail.com",
      password: "SentinelMasterAdmin2026!"
    })
  });
  const loginData = await loginRes.json();
  const token = loginData.token || loginData.sessionToken || loginData.accessToken || (loginData.data && (loginData.data.token || loginData.data.sessionToken));
  console.log("Login status:", loginRes.status, "Token:", token ? "Obtained" : "Missing");

  const cookie = loginRes.headers.get("set-cookie") || `sentinel_access=${token}`;
  const res = await fetch("http://localhost:10000/api/operations/storage", {
    headers: {
      "cookie": cookie,
      "authorization": `Bearer ${token}`
    }
  });
  const data = await res.json();
  console.log("Storage API Status:", res.status);
  console.log("Summary:", JSON.stringify(data.summary, null, 2));
  console.log("Total cameras mapped:", data.cameras ? data.cameras.length : 0);
  console.log("Storage devices count:", data.storageDevices ? data.storageDevices.length : 0);
  if (data.cameras && data.cameras.length) {
    console.log("Sample camera storage (first 2):", JSON.stringify(data.cameras.slice(0, 2), null, 2));
  }
}
test().catch(console.error);
