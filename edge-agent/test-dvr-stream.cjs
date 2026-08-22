const { exec } = require('child_process');

const username = process.env.CAMERA_USERNAME;
const password = process.env.CAMERA_PASSWORD;
if (!username || password === undefined) throw new Error('CAMERA_USERNAME and CAMERA_PASSWORD are required');
const encodedUsername = encodeURIComponent(username);
const encodedPassword = encodeURIComponent(password);
const hosts = (process.env.CAMERA_HOSTS || '192.168.29.171,192.168.29.58').split(',').map((host) => host.trim()).filter(Boolean);
const paths = [
  '/cam/realmonitor?channel=1&subtype=0',
  '/cam/realmonitor?channel=1&subtype=1',
  '/h264/ch1/main/av_stream',
  '/stream1',
];
const urls = hosts.flatMap((host) => paths.map((path) => `rtsp://${encodedUsername}:${encodedPassword}@${host}:554${path}`));

function probeUrl(url) {
  return new Promise((resolve) => {
    const cmd = `ffprobe -v error -rtsp_transport tcp -i "${url}" -show_streams`;
    exec(cmd, { timeout: 7000 }, (err, stdout, stderr) => {
      resolve({ url, success: !err && stdout.length > 0, stdout, error: stderr || (err ? err.message : '') });
    });
  });
}

async function run() {
  console.log('Testing DVR RTSP Streams...');
  for (const u of urls) {
    const masked = u.replace(/:([^:@]+)@/, ':***@');
    process.stdout.write(`Testing ${masked} ... `);
    const res = await probeUrl(u);
    if (res.success) {
      console.log('✅ SUCCESS! Streams available.');
    } else {
      console.log(`❌ Failed: ${res.error.trim().replace(/\r?\n/g, ' ')}`);
    }
  }
}
run();
