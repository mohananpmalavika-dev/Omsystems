// Test camera credentials with blank password and various usernames
const cameras = [
  { ip: "192.168.29.171", name: "CP PLUS Camera" },
  { ip: "192.168.29.196", name: "Unknown Camera" },
];

const testCombinations = [
  { username: "admin", password: "" },
  { username: "root", password: "" },
  { username: "user", password: "" },
  { username: "admin", password: "admin" },
  { username: "", password: "" },
  { username: "admin", password: "12345" },
  { username: "admin", password: "123456" },
];

console.log("Testing camera credentials (including blank passwords)...\n");

for (const camera of cameras) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing: ${camera.name} (${camera.ip})`);
  console.log("=".repeat(60));

  let found = false;

  for (const combo of testCombinations) {
    const displayUser = combo.username || "(blank)";
    const displayPass = combo.password || "(blank)";
    console.log(`\nTrying: ${displayUser} / ${displayPass}`);
    
    try {
      // Try ONVIF authentication
      const auth = Buffer.from(`${combo.username}:${combo.password}`).toString("base64");
      
      const response = await fetch(`http://${camera.ip}/onvif/device_service`, {
        method: "POST",
        headers: {
          "Content-Type": "application/soap+xml",
          ...(combo.username || combo.password ? { "Authorization": `Basic ${auth}` } : {}),
        },
        body: `<?xml version="1.0" encoding="UTF-8"?>
          <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
            <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
              <GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/>
            </s:Body>
          </s:Envelope>`,
        signal: AbortSignal.timeout(5000),
      });

      const text = await response.text();
      
      if (response.ok && !text.includes("NotAuthorized") && !text.includes("Unauthorized")) {
        console.log(`  ✅ SUCCESS! Working credentials: ${displayUser} / ${displayPass}`);
        
        // Try to get device info
        const mfg = text.match(/<(?:tds:)?Manufacturer>([^<]+)/i);
        const model = text.match(/<(?:tds:)?Model>([^<]+)/i);
        const serial = text.match(/<(?:tds:)?SerialNumber>([^<]+)/i);
        
        if (mfg) console.log(`     Manufacturer: ${mfg[1]}`);
        if (model) console.log(`     Model: ${model[1]}`);
        if (serial) console.log(`     Serial: ${serial[1]}`);
        
        found = true;
        break; // Found working credentials
      } else if (text.includes("NotAuthorized")) {
        console.log(`  ❌ Unauthorized`);
      } else {
        console.log(`  ❌ Failed`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }

  if (!found) {
    console.log(`\n  ⚠️  No working credentials found for this camera`);
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log("Testing complete!");
console.log("=".repeat(60));
console.log(`\nRecommendation: If no credentials worked, these cameras need:`);
console.log(`  1. Physical reset to factory defaults`);
console.log(`  2. Or check with camera manufacturer for default credentials`);
