import {
  OnvifClient,
  redactStreamUri,
} from "file:///app/edge-agent/dist/src/devices/onvif-client.js";

const [deviceServiceUrl] = process.argv.slice(2);
const username = process.env.CAMERA_USERNAME;
const password = process.env.CAMERA_PASSWORD;

if (!deviceServiceUrl || !username || password === undefined) {
  console.error(
    "Usage: CAMERA_USERNAME=... CAMERA_PASSWORD=... node inspect-camera.mjs <ONVIF URL>",
  );
  process.exit(2);
}

const client = new OnvifClient(deviceServiceUrl, { username, password });
const device = await client.inspect();
const streams = [];

for (const profile of device.profiles) {
  const streamUri = await client.getStreamUri(
    device.mediaServiceUrl,
    profile.token,
  );
  streams.push({
    profile: {
      name: profile.name,
      codec: profile.codec,
      width: profile.width,
      height: profile.height,
    },
    uri: redactStreamUri(streamUri),
  });
}

console.log(JSON.stringify({ model: device.model, streams }, null, 2));
