// Try to detect camera brands from ONVIF responses
const cameras = [
  { ip: "192.168.29.196", name: "Camera 1" },
  { ip: "192.168.29.171", name: "Camera 2" },
];

for (const camera of cameras) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Checking: ${camera.name} (${camera.ip})`);
  console.log("=".repeat(60));

  // Try web interface
  try {
    const webResponse = await fetch(`http://${camera.ip}`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    
    console.log(`\nWeb Interface: ${webResponse.status}`);
    
    // Check headers for clues
    const server = webResponse.headers.get("server");
    const xPoweredBy = webResponse.headers.get("x-powered-by");
    
    if (server) console.log(`  Server: ${server}`);
    if (xPoweredBy) console.log(`  X-Powered-By: ${xPoweredBy}`);
    
    // Try to get some content
    const text = await webResponse.text();
    
    // Look for brand names in HTML
    const brands = [
      "hikvision", "dahua", "axis", "samsung", "hanwha",
      "cp plus", "cpplus", "uniview", "tiandy", "vivotek"
    ];
    
    const foundBrands = brands.filter(brand => 
      text.toLowerCase().includes(brand)
    );
    
    if (foundBrands.length > 0) {
      console.log(`  🎯 Detected brand: ${foundBrands.join(", ").toUpperCase()}`);
    } else {
      console.log(`  ❓ Brand not detected from web interface`);
    }
  } catch (error) {
    console.log(`\n  ❌ Web interface error: ${error.message}`);
  }

  // Try ONVIF discovery port
  try {
    const onvifResponse = await fetch(`http://${camera.ip}:80/onvif/device_service`, {
      method: "POST",
      headers: { "Content-Type": "application/soap+xml" },
      body: `<?xml version="1.0" encoding="UTF-8"?>
        <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
          <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
            <GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/>
          </s:Body>
        </s:Envelope>`,
      signal: AbortSignal.timeout(3000),
    });
    
    const onvifText = await onvifResponse.text();
    
    // Look for manufacturer in ONVIF response
    const manufacturerMatch = onvifText.match(/<(?:tds:)?Manufacturer>([^<]+)<\/(?:tds:)?Manufacturer>/i);
    const modelMatch = onvifText.match(/<(?:tds:)?Model>([^<]+)<\/(?:tds:)?Model>/i);
    const serialMatch = onvifText.match(/<(?:tds:)?SerialNumber>([^<]+)<\/(?:tds:)?SerialNumber>/i);
    
    if (manufacturerMatch || modelMatch) {
      console.log(`\n  📡 ONVIF Device Information:`);
      if (manufacturerMatch) console.log(`     Manufacturer: ${manufacturerMatch[1]}`);
      if (modelMatch) console.log(`     Model: ${modelMatch[1]}`);
      if (serialMatch) console.log(`     Serial: ${serialMatch[1]}`);
    }
  } catch (error) {
    console.log(`\n  ❌ ONVIF error: ${error.message}`);
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log("Detection complete!");
console.log("=".repeat(60));
