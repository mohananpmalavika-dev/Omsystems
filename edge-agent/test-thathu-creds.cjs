const { exec } = require("child_process");

/**
 * Probe camera streams with credentials supplied at runtime.
 *
 * Usage (PowerShell):
 *   $env:CAMERA_TEST_PASSWORD = "..."; node edge-agent/test-thathu-creds.cjs
 */
const username = process.env.CAMERA_TEST_USERNAME || "admin";
const password = process.env.CAMERA_TEST_PASSWORD;
if (!password) {
  console.error("CAMERA_TEST_PASSWORD is required; credentials are never stored in this file.");
  process.exit(2);
}

const hosts = ["192.168.29.171", "192.168.29.58", "192.168.29.46", "192.168.29.196"];
const paths = [
  "/cam/realmonitor?channel=1&subtype=0",
  "/cam/realmonitor?channel=1&subtype=1",
  "/h264/ch1/main/av_stream",
  "/stream1",
  "/Streaming/Channels/101",
];
const encodedPassword = encodeURIComponent(password);
const urls = hosts.flatMap((host) => paths.map((path) =>
  `rtsp://${username}:${encodedPassword}@${host}:554${path}`,
));

function probeUrl(url) {
  return new Promise((resolve) => {
    const cmd = `ffprobe -v error -rtsp_transport tcp -i "${url}" -show_streams`;
    exec(cmd, { timeout: 6000 }, (err, stdout, stderr) => {
      resolve({ success: !err && stdout.length > 0, error: stderr || (err ? err.message : "") });
    });
  });
}

async function run() {
  console.log(`Testing ${username} against ${urls.length} configured camera stream candidates...`);
  for (const url of urls) {
    const masked = url.replace(/:([^:@]+)@/, ":***@");
    process.stdout.write(`Testing ${masked} ... `);
    const result = await probeUrl(url);
    if (result.success) {
      console.log("SUCCESS");
    } else {
      console.log(`Failed: ${result.error.trim().replace(/\r?\n/g, " ")}`);
    }
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
