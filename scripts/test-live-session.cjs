const http = require('http');

async function post(host, port, path, body, token, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: host,
      port: port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      }
    }, (res) => {
      let buf = '';
      res.on('data', chunk => buf += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(buf) });
        } catch {
          resolve({ status: res.statusCode, body: buf });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log("=== 1. Login as Superadmin ===");
  const auth = await post('3.7.216.169', 8080, '/v1/auth/login', {
    username: 'mgdhanyamohan',
    password: 'SentinelMasterAdmin2026!'
  });
  const token = auth.body.accessToken;

  console.log("\n=== 2. Creating Live Session for South camera 74359e6e-2c5f-4c81-9649-f2e4ef181d19 ===");
  const liveSess = await post('3.7.216.169', 8080, '/v1/cameras/74359e6e-2c5f-4c81-9649-f2e4ef181d19/live-sessions', {}, token);
  console.log("Live session:", liveSess);

  console.log("\n=== 3. Consuming token on media-gateway (port 8090) ===");
  const mgRes = await post('3.7.216.169', 8090, '/v1/live/start', {
    controlPlaneToken: liveSess.body.token
  });
  console.log("Media gateway response:", mgRes);
}

run().catch(console.error);
