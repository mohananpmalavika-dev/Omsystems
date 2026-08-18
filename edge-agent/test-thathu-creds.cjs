const { exec } = require('child_process');

const urls = [
  'rtsp://admin:Thathu@110@192.168.29.171:554/cam/realmonitor?channel=1&subtype=0',
  'rtsp://admin:Thathu@110@192.168.29.171:554/cam/realmonitor?channel=1&subtype=1',
  'rtsp://admin:Thathu%40110@192.168.29.171:554/cam/realmonitor?channel=1&subtype=0',
  'rtsp://admin:Thathu%40110@192.168.29.171:554/cam/realmonitor?channel=1&subtype=1',
  'rtsp://admin:Thathu@110@192.168.29.58:554/h264/ch1/main/av_stream',
  'rtsp://admin:Thathu%40110@192.168.29.58:554/h264/ch1/main/av_stream',
  'rtsp://admin:Thathu@110@192.168.29.46:554/stream1',
  'rtsp://admin:Thathu%40110@192.168.29.46:554/stream1',
  'rtsp://admin:Thathu@110@192.168.29.46:554/Streaming/Channels/101',
  'rtsp://admin:Thathu@110@192.168.29.196:554/stream1',
  'rtsp://admin:Thathu%40110@192.168.29.196:554/stream1',
  'rtsp://admin:Thathu@110@192.168.29.196:554/Streaming/Channels/101'
];

function probeUrl(url) {
  return new Promise((resolve) => {
    const cmd = `ffprobe -v error -rtsp_transport tcp -i "${url}" -show_streams`;
    exec(cmd, { timeout: 6000 }, (err, stdout, stderr) => {
      resolve({ url, success: !err && stdout.length > 0, stdout, error: stderr || (err ? err.message : '') });
    });
  });
}

async function run() {
  console.log('Testing with admin / Thathu@110:');
  for (const u of urls) {
    const masked = u.replace(/:([^:@]+)@/, ':***@');
    process.stdout.write(`Testing ${masked} ... `);
    const res = await probeUrl(u);
    if (res.success) {
      console.log('🎉 SUCCESS! Video Stream connected and verified!');
    } else {
      console.log(`❌ Failed: ${res.error.trim().replace(/\r?\n/g, ' ')}`);
    }
  }
}
run();
