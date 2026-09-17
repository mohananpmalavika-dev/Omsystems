// using global fetch in Node 18+

async function run() {
  const loginRes = await fetch("http://127.0.0.1:8080/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "admin",
      password: process.env.BOOTSTRAP_SUPERADMIN_PASSWORD || "SentinelMasterAdmin2026!"
    })
  });
  const data = await loginRes.json();
  const token = data.token || data.session?.token || data.accessToken;
  console.log("Login status:", loginRes.status, "token present:", Boolean(token));

  for (const endpoint of [
    "/v1/banking/sessions/summary?tenantId=default",
    "/v1/banking/sessions?tenantId=default",
    "/v1/banking/monitors?tenantId=default",
    "/v1/banking/visits"
  ]) {
    const res = await fetch("http://127.0.0.1:8080" + endpoint, {
      headers: { "authorization": "Bearer " + token }
    });
    const json = await res.json();
    console.log(endpoint, "-> HTTP", res.status, JSON.stringify(json));
  }
}

run().catch(console.error);
