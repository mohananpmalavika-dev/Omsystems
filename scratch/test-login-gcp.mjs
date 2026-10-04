const CONTROL_PLANE_URL = 'https://34-14-220-41.sslip.io';

async function tryLogin() {
  const passwords = ['dhanya123', 'mgdhanyamohan', 'Password123!', 'SentinelGrid2026!'];
  for (const pw of passwords) {
    try {
      const res = await fetch(`${CONTROL_PLANE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'mgdhanyamohan@omsystems.bank', password: pw })
      });
      console.log(`Password ${pw}: status ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        console.log('Login success! Token:', data.accessToken ? data.accessToken.slice(0, 20) + '...' : 'none');
        return data.accessToken;
      }
    } catch (e) {
      console.log(`Password ${pw} error:`, e.message);
    }
  }
}
tryLogin();
