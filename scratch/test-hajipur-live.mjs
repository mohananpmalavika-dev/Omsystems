const base = "https://35-200-130-81.sslip.io";

async function main() {
  const loginRes = await fetch(`${base}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "test", password: "test@123" })
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken || loginData.token;
  console.log('Login token:', !!token);

  // Hajipur cameras:
  const cams = [
    { ch: 1, id: '574ec320-ad4a-4c40-9a6d-76fa7cf7d13c' },
    { ch: 2, id: '25175a3f-562e-4138-a827-91518096937e' },
    { ch: 3, id: '5ffde9b3-924c-4622-aa74-b3c406567d7c' },
    { ch: 4, id: '80ce1672-d553-4e85-b2e4-3758bd744eb4' },
    { ch: 5, id: '84ae9288-43d5-4721-9587-8b2d41d44c54' },
    { ch: 6, id: '88137ebc-8df1-4995-824a-99bfce6c2225' },
    { ch: 7, id: '8a2fa6b2-78d5-45ce-8f18-f3495ec3ca94' },
    { ch: 8, id: 'aa6e8afc-07a6-4b05-b962-c4133f79e306' },
    { ch: 9, id: '3c2101f3-4569-4083-8eef-e27670e26a14' }
  ];

  for (const c of cams) {
    try {
      const sRes = await fetch(`${base}/v1/cameras/${c.id}/live-sessions`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
        body: JSON.stringify({ profile: "sub" })
      });
      const sData = await sRes.json();
      console.log(`Channel ${c.ch} (${c.id.slice(0, 8)}): status=${sRes.status}`, sData);
      if (sData.token && sData.mediaGatewayUrl) {
        const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ controlPlaneToken: sData.token })
        });
        const startData = await startRes.json();
        console.log(`  -> startRes status=${startRes.status}`, startData);
      }
    } catch (e) {
      console.log(`Channel ${c.ch} error:`, e.message);
    }
  }
}

main().catch(console.error);
