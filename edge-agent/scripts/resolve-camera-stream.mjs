import {
  OnvifClient,
  attachCredentials,
} from "../dist/src/devices/onvif-client.js";

const onvifUrl = process.env.CAMERA_ONVIF_URL;
const username = process.env.CAMERA_USERNAME;
const password = process.env.CAMERA_PASSWORD;
const requestedProfile = process.env.CAMERA_PROFILE_NAME;

if (!onvifUrl || !username || password === undefined) {
  throw new Error("Camera connection environment is incomplete");
}

const credentials = { username, password };
const client = new OnvifClient(onvifUrl, credentials);
const device = await client.inspect();
const mainProfile =
  device.profiles.find((profile) => profile.name === requestedProfile) ??
  device.profiles.find((profile) => profile.name === "mainStream") ??
  device.profiles[0];

if (!mainProfile) throw new Error("Camera did not expose a video profile");

const uri = await client.getStreamUri(
  device.mediaServiceUrl,
  mainProfile.token,
);

// This process is called by start-local-camera.ps1, which captures stdout
// directly into the media gateway's environment without writing it to disk.
process.stdout.write(attachCredentials(uri, credentials));
