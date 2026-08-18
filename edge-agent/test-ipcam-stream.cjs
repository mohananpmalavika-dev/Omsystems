const { exec } = require('child_process');

const urls = [
  'rtsp://dhanya:Aditi@2206@192.168.29.46:554/cam/realmonitor?channel=1&subtype=0',
  'rtsp://dhanya:Aditi%402206@192.168.29.46:554/stream1',
  'rtsp://dhanya:Aditi%402206@192.168.29.46:554/onvif1',
  'rtsp://dhanya:Aditi%402206@192.168.29.46:554/Streaming/Channels/101',
  'rtsp://admin:Aditi@2206@192.168.29.46:554/stream1',
  'rtsp://admin:Aditi%402206@192.168.29.46:554/Streaming/Channels/101',
  'rtsp://dhanya:Aditi@2206@192.168.29.196:554/cam/realmonitor?channel=1&subtype=0',
  'rtsp://dhanya:Aditi%402206@192.168.29.196:554/stream1',
  'rtsp://dhanya:Aditi%402206@192.168.29.196:554/onvif1',
  'rtsp://dhanya:Aditi%402206@192.168.29.196:554/Streaming/Channels/101',
  'rtsp://admin:Aditi@2206@192.168.29.196:554/stream1',
  'rtsp://admin:Aditi%402206@192.168.29.196:554/Streaming/Channels/101'
];

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
