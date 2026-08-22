const { exec } = require('child_process');

const username = process.env.CAMERA_USERNAME;
const password = process.env.CAMERA_PASSWORD;
if (!username || password === undefined) throw new Error('CAMERA_USERNAME and CAMERA_PASSWORD are required');
const encodedUsername = encodeURIComponent(username);
const encodedPassword = encodeURIComponent(password);
const hosts = (process.env.CAMERA_HOSTS || '192.168.29.46,192.168.29.196').split(',').map((host) => host.trim()).filter(Boolean);
const paths = [
  '/cam/realmonitor?channel=1&subtype=0',
  '/stream1',
  '/onvif1',
  '/Streaming/Channels/101',
];
const urls = hosts.flatMap((host) => paths.map((path) => `rtsp://${encodedUsername}:${encodedPassword}@${host}:554${path}`));

function probeUrl(url) {
  return new Promise((resolve) => {
    const cmd = `ffprobe -v error -rtsp_transport tcp -i "${url}" -show_streams`;
    exec(cmd, { timeout: 6000 }, (err, stdout, stderr) => {
      resolve({ url, success: !err && stdout.length > 0, error: stderr || (err ? err.message : '') });
    });
  });
}

async function run() {
  console.log('Testing IP Cameras 192.168.29.46 and 192.168.29.196...');
  for (const u of urls) {
    const masked = u.replace(/:([^:@]+)@/, ':***@');
    process.stdout.write(`Testing ${masked} ... `);
    const res = await probeUrl(u);
    if (res.success) {
      console.log('✅ SUCCESS! Live stream connected.');
    } else {
      console.log(`❌ Failed: ${res.error.trim().replace(/\r?\n/g, ' ')}`);
    }
  }
}
run();
