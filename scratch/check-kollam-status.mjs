const base = "https://35-200-130-81.sslip.io";
const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

const camId = '180b23d1-b187-45c5-b0c7-1fd1a912dd98'; // Kollam ch 1
const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
  method: "POST",
  headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
  body: JSON.stringify({ profile: "sub" })
});
const sData = await sRes.json();

const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ controlPlaneToken: sData.token })
});
const startData = await startRes.json();

console.log("HLS master URL:", startData.hls.url);
const masterRes = await fetch(`${startData.hls.url}?token=${startData.hls.bearerToken}`);
console.log("Master HLS status:", masterRes.status);
const masterText = await masterRes.text();
console.log("Master Playlist:\n", masterText);

// Extract video stream URL
const streamMatch = masterText.match(/video\d+_stream\.m3u8[^\r\n]*/);
if (streamMatch) {
  const streamUrl = new URL(streamMatch[0], startData.hls.url).toString();
  console.log("Stream URL:", streamUrl);
  const streamRes = await fetch(streamUrl);
  console.log("Stream status:", streamRes.status);
  const streamText = await streamRes.text();
  console.log("Stream Playlist:\n", streamText);

  // Extract a segment
  const segmentMatch = streamText.match(/[a-zA-Z0-9_\-]+\.mp4[^\r\n]*|[a-zA-Z0-9_\-]+\.ts[^\r\n]*/);
  if (segmentMatch) {
    const segUrl = new URL(segmentMatch[0], streamUrl).toString();
    console.log("Segment URL:", segUrl);
    const segRes = await fetch(segUrl);
    console.log("Segment status:", segRes.status, "Content-Length:", segRes.headers.get("content-length"));
  }
}
