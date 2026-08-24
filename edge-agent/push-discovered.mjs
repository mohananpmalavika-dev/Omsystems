async function pushDiscovered() {
  const branchId = "5f7cf420-7a56-4ef1-8a12-d45d8bbc5cd3";
  const agentId = "03f18514-ea61-41ab-a5f6-1cf96eb0f9c8";
  const baseUrl = "https://sentinel-grid-monitoring-s38w.onrender.com/api/control";

  let actualAgentId = agentId;
  try {
    const regRes = await fetch(`${baseUrl}/v1/branches/${branchId}/edge-agents/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": "user-global-admin" },
      body: JSON.stringify({ name: "Aditi Malavika Gateway Scanner", version: "0.1.9" }),
    });
    console.log("Edge agent register status:", regRes.status);
    const data = await regRes.json();
    console.log("Registered agent:", data);
    if (data?.agent?.id || data?.id) {
      actualAgentId = data.agent?.id || data.id;
    }
  } catch (e) {
    console.log("Agent register error:", e.message);
  }

  const channels = [
    { ch: 1, w: 1280, h: 720 },
    { ch: 2, w: 960, h: 576 },
    { ch: 3, w: 1280, h: 720 },
    { ch: 4, w: 1280, h: 720 },
  ];

  for (const { ch, w, h } of channels) {
    const payload = {
      edgeAgentId: actualAgentId,
      discoveryMethod: "configured-ip-range",
      vendor: "other",
      manufacturer: "CP PLUS / Dahua / Generic NVR",
      model: "HD Security DVR/NVR Channel " + ch,
      ipAddress: "192.168.29.171",
      sourceType: "analog-dvr-channel",
      recorderId: "recorder-cpplus-dvr-192-168-29-171",
      recorderChannel: ch,
      recorderSerialNumber: "9FLX3NYS4X3UQ4HA",
      onvifPort: 80,
      rtspPort: 554,
      displayName: `Discovered DVR 192.168.29.171 - Channel ${ch}`,
      credentialsRequired: false,
      streamVerified: true,
      rtspValidated: true,
      compatibility: "compatible",
      duplicateStatus: "unique",
      compatibilityStatus: "compatible",
      profiles: [{ name: "main", codec: "hevc", width: w, height: h }],
      capabilities: { ptz: false, audio: true, events: true },
    };

    const res = await fetch(`${baseUrl}/v1/branches/${branchId}/cameras/discovered`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": "user-global-admin" },
      body: JSON.stringify(payload),
    });

    console.log(`Channel ${ch} submission status:`, res.status);
    const text = await res.text();
    console.log(`Channel ${ch} response:`, text);
  }

  // Also submit the ONVIF IP camera at 192.168.29.58
  const ipCamPayload = {
    edgeAgentId: actualAgentId,
    discoveryMethod: "onvif-ws-discovery",
    vendor: "other",
    manufacturer: "IPC",
    model: "H264 IPC_NT98566_IPG-N4C-WQ2_S38",
    ipAddress: "192.168.29.58",
    sourceType: "ip-camera",
    onvifPort: 80,
    rtspPort: 554,
    displayName: "H264 IPC_NT98566_IPG-N4C-WQ2_S38",
    credentialsRequired: false,
    streamVerified: true,
    rtspValidated: true,
    compatibility: "compatible",
    duplicateStatus: "unique",
    compatibilityStatus: "compatible",
    profiles: [{ name: "main", codec: "h264", width: 1920, height: 1080 }],
    capabilities: { ptz: false, audio: true, events: true },
  };

  const camRes = await fetch(`${baseUrl}/v1/branches/${branchId}/cameras/discovered`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user-id": "user-global-admin" },
    body: JSON.stringify(ipCamPayload),
  });
  console.log("IP Camera submission status:", camRes.status);
  console.log("IP Camera response:", await camRes.text());
}

pushDiscovered();
