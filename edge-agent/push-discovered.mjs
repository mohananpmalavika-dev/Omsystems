async function pushDiscovered() {
  const branchId = "5f7cf420-7a56-4ef1-8a12-d45d8bbc5cd3";
  const agentId = "03f18514-ea61-41ab-a5f6-1cf96eb0f9c8";
  const baseUrl = "https://sentinel-grid-monitoring-vhid.onrender.com/api/control";

  let actualAgentId = agentId;
  try {
    const regRes = await fetch(`${baseUrl}/v1/branches/${branchId}/edge-agents/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": "user-global-admin" },
      body: JSON.stringify({ name: "Aditi Malavika Gateway Scanner", version: "0.1.8" }),
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
}

pushDiscovered();
