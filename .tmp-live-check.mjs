const base = process.argv[2] || "http://127.0.0.1:3000";
const cameraId = process.argv[3] || "0eeceeb6-b24b-429a-b1c8-3081ca44b48a";
const gatewayOverride = process.argv[4];
const response = await fetch(`${base}/api/live`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ cameraId, profile: "sub" }),
});
const text = await response.text();
console.log("dashboard", response.status, text);
if (!response.ok) process.exitCode = 1;
const authorization = JSON.parse(text);
if (authorization.direct) {
  const gatewayStartUrl = gatewayOverride
    ? new URL("/v1/live/start", gatewayOverride).toString()
    : authorization.direct.url;
  const gateway = await fetch(gatewayStartUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ controlPlaneToken: authorization.direct.controlPlaneToken }),
  });
  const gatewayText = await gateway.text();
  console.log("gateway", gateway.status, gatewayText);
  if (!gateway.ok) process.exitCode = 1;
  const session = JSON.parse(gatewayText);
  if (session.hls?.url) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const sourcePlaylistUrl = new URL(session.hls.url);
    const playlistUrl = gatewayOverride
      ? new URL(`${sourcePlaylistUrl.pathname}${sourcePlaylistUrl.search}`, gatewayOverride)
      : sourcePlaylistUrl;
    playlistUrl.searchParams.set("token", session.hls.bearerToken);
    const playlist = await fetch(playlistUrl);
    console.log("hls", playlist.status, (await playlist.text()).slice(0, 200));
    if (!playlist.ok) process.exitCode = 1;
  }
}
