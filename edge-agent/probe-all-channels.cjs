const { exec } = require('child_process');

function probe(url) {
  return new Promise((resolve) => {
    const cmd = `ffprobe -v error -rtsp_transport tcp -i "${url}" -show_streams`;
    exec(cmd, { timeout: 6000 }, (err, stdout) => {
      resolve({ url, success: !err && stdout.length > 0 });
    });
  });
}

async function run() {
  const dvrHost = '192.168.29.171';
  const username = process.env.CAMERA_USERNAME;
  const password = process.env.CAMERA_PASSWORD;
  if (!username || password === undefined) throw new Error('CAMERA_USERNAME and CAMERA_PASSWORD are required');
  const credentials = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
  console.log(`Checking CP Plus DVR (${dvrHost}) Channels 1 to 8 with the supplied credentials...`);
  
  for (let ch = 1; ch <= 8; ch++) {
    const mainUrl = `rtsp://${credentials}@${dvrHost}:554/cam/realmonitor?channel=${ch}&subtype=0`;
    const subUrl = `rtsp://${credentials}@${dvrHost}:554/cam/realmonitor?channel=${ch}&subtype=1`;
    const mainRes = await probe(mainUrl);
    const subRes = await probe(subUrl);
    console.log(`Channel ${ch}: Main Stream = ${mainRes.success ? '✅ ONLINE' : '❌ No Signal'}, Sub Stream = ${subRes.success ? '✅ ONLINE' : '❌ No Signal'}`);
  }

  const otherIps = ['192.168.29.58', '192.168.29.46', '192.168.29.196'];
  for (const ip of otherIps) {
    const urls = [
      `rtsp://${credentials}@${ip}:554/cam/realmonitor?channel=1&subtype=0`,
      `rtsp://${credentials}@${ip}:554/stream1`,
      `rtsp://${credentials}@${ip}:554/Streaming/Channels/101`,
      `rtsp://${credentials}@${ip}:554/h264/ch1/main/av_stream`
    ];
    let ok = false;
    for (const u of urls) {
      const res = await probe(u);
      if (res.success) {
        console.log(`Camera ${ip}: ✅ ONLINE (URL: ${u.replace(/:[^:@]+@/, ':***@')})`);
        ok = true;
        break;
      }
    }
    if (!ok) {
      console.log(`Camera ${ip}: ❌ Not responding to standard stream paths`);
    }
  }
}
run();
