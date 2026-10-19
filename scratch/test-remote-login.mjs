async function testLogin() {
  const loginRes = await fetch("https://35-200-130-81.sslip.io/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "admin",
      password: "Password@123"
    })
  });
  console.log("Status:", loginRes.status);
  const data = await loginRes.json();
  console.log("Response:", data);
}

testLogin().catch(console.error);
