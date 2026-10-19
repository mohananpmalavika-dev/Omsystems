async function main() {
  const loginRes = await fetch("http://127.0.0.1:8080/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "test", password: "test@123" })
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  console.log("Logged in successfully, token received:", Boolean(token));

  // Test restart on PERAVARUNI Gateway (8720fc84-3fee-4f9f-a404-6e2d0a47e535)
  const agentId = "8720fc84-3fee-4f9f-a404-6e2d0a47e535";
  console.log(`Sending restart command for agent: ${agentId}...`);
  const restartRes = await fetch(`http://127.0.0.1:8080/v1/edge-agents/${agentId}/restart`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: "{}"
  });
  console.log("Restart status code:", restartRes.status);
  const restartData = await restartRes.json();
  console.log("Restart response:", restartData);
}

main().catch(console.error);
