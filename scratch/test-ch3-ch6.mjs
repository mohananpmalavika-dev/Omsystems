import { execSync } from 'child_process';

const ffmpeg = 'C:/Program Files/Sentinel Grid/Edge Agent/runtime/ffmpeg-n8.1.2-34-g9b6c8969e0-win64-lgpl-shared-8.1/bin/ffmpeg.exe';

for (const ch of [3, 6]) {
  console.log(`\n=== Testing Channel ${ch} Substream ===`);
  try {
    const url = `rtsp://admin:Thathu%40110@192.168.29.171:554/cam/realmonitor?channel=${ch}&subtype=1`;
    const out = execSync(`"${ffmpeg}" -hide_banner -loglevel warning -rtsp_transport tcp -i "${url}" -t 2 -f null -`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`Channel ${ch} Substream OK!`);
  } catch (err) {
    console.error(`Channel ${ch} Substream Failed:`, err.stderr || err.message);
  }
}
