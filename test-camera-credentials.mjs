// Test camera credentials
import { createHash } from "crypto";

const cameras = [
  { ip: "192.168.29.171", name: "CP PLUS Camera" },
  { ip: "192.168.29.196", name: "Unknown Camera" },
];

const passwords = ["Thathu@110", "4344@RAM"];
const username = "admin";

console.log("Testing camera credentials...\n");

for (const camera of cameras) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing: ${camera.name} (${camera.ip})`);
  console.log("=".repeat(60));

  for (const password of passwords) {
    console.log(`\nTrying: ${username} / ${password.substring(0, 3)}***`);
    
    try {
      // Try ONVIF authentication
      const auth = Buffer.from(`${username}:${password}`).toString("base64");
      
      const response = await fetch(`http://${camera.ip}/onvif/device_service`, {
        method: "POST",
        headers: {
          "Content-Type": "application/soap+xml",
          "Authorization": `Basic ${auth}`,
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
        console.log(`  ✅ SUCCESS! Credentials work: ${username} / ${password}`);
        
        // Try to get device info
        const mfg = text.match(/<(?:tds:)?Manufacturer>([^<]+)/i);
        const model = text.match(/<(?:tds:)?Model>([^<]+)/i);
        
        if (mfg) console.log(`     Manufacturer: ${mfg[1]}`);
        if (model) console.log(`     Model: ${model[1]}`);
        
        break; // Found working password
      } else {
        console.log(`  ❌ Failed - Invalid credentials`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log("Credential testing complete!");
console.log("=".repeat(60));
