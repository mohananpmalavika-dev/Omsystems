/** Probe ONVIF credentials supplied at runtime; no credentials are persisted here. */
const cameras = [
  { ip: "192.168.29.171", name: "CP PLUS Camera" },
  { ip: "192.168.29.196", name: "Unknown Camera" },
];
const passwords = (process.env.CAMERA_TEST_PASSWORDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const username = process.env.CAMERA_USERNAME || "admin";

if (passwords.length === 0) {
  throw new Error("Set CAMERA_TEST_PASSWORDS as a comma-separated runtime value.");
}

for (const camera of cameras) {
  console.log(`Testing ${camera.name} (${camera.ip})`);
  for (const password of passwords) {
    try {
      const auth = Buffer.from(`${username}:${password}`).toString("base64");
      const response = await fetch(`http://${camera.ip}/onvif/device_service`, {
        method: "POST",
        headers: {
          "Content-Type": "application/soap+xml",
          Authorization: `Basic ${auth}`,
        },
        body: `<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/></s:Body></s:Envelope>`,
        signal: AbortSignal.timeout(5000),
      });
      const body = await response.text();
      if (response.ok && !body.includes("NotAuthorized") && !body.includes("Unauthorized")) {
        console.log("SUCCESS: credentials accepted (password redacted).");
        break;
      }
    } catch (error) {
      console.log(`Probe error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
