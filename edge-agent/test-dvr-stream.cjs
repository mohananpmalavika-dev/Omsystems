const { exec } = require('child_process');

const urls = [
  'rtsp://dhanya:Aditi@2206@192.168.29.171:554/cam/realmonitor?channel=1&subtype=0',
  'rtsp://dhanya:Aditi@2206@192.168.29.171:554/cam/realmonitor?channel=1&subtype=1',
  'rtsp://dhanya:Aditi%402206@192.168.29.171:554/cam/realmonitor?channel=1&subtype=0',
  'rtsp://dhanya:Aditi%402206@192.168.29.171:554/cam/realmonitor?channel=1&subtype=1',
  'rtsp://admin:admin123@192.168.29.171:554/cam/realmonitor?channel=1&subtype=0',
  'rtsp://admin:admin@192.168.29.171:554/cam/realmonitor?channel=1&subtype=0',
  'rtsp://admin:Aditi@2206@192.168.29.171:554/cam/realmonitor?channel=1&subtype=0',
  'rtsp://dhanya:Aditi@2206@192.168.29.58:554/cam/realmonitor?channel=1&subtype=0',
  'rtsp://dhanya:Aditi@2206@192.168.29.58:554/h264/ch1/main/av_stream',
  'rtsp://dhanya:Aditi@2206@192.168.29.58:554/user=dhanya_password=Aditi@2206_channel=1_stream=0.sdp',
  'rtsp://admin:admin@192.168.29.58:554/h264/ch1/main/av_stream',
  'rtsp://admin:Aditi@2206@192.168.29.58:554/h264/ch1/main/av_stream',
  'rtsp://admin:@192.168.29.58:554/h264/ch1/main/av_stream'
];

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
