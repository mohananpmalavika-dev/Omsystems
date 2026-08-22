// Test specific password
const cameras = [
  { ip: "192.168.29.171", name: "CP PLUS Camera" },
  { ip: "192.168.29.196", name: "Unknown Camera" },
];

const testCombinations = [
  { username: "admin", password: "4344@RaM4" },
  { username: "Admin", password: "4344@RaM4" },
  { username: "root", password: "4344@RaM4" },
];

console.log("Testing password: 4344@RaM4\n");

for (const camera of cameras) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing: ${camera.name} (${camera.ip})`);
  console.log("=".repeat(60));

  for (const combo of testCombinations) {
    console.log(`\nTrying: ${combo.username} / 4344@RaM4`);
    
    try {
      const auth = Buffer.from(`${combo.username}:${combo.password}`).toString("base64");
      
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
        console.log(`  ✅ SUCCESS! Credentials work: ${combo.username} / 4344@RaM4`);
        
        const mfg = text.match(/<(?:tds:)?Manufacturer>([^<]+)/i);
        const model = text.match(/<(?:tds:)?Model>([^<]+)/i);
        const serial = text.match(/<(?:tds:)?SerialNumber>([^<]+)/i);
        
        if (mfg) console.log(`     Manufacturer: ${mfg[1]}`);
        if (model) console.log(`     Model: ${model[1]}`);
        if (serial) console.log(`     Serial: ${serial[1]}`);
        
        break;
      } else {
        console.log(`  ❌ Failed`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log("Complete!");
console.log("=".repeat(60));
