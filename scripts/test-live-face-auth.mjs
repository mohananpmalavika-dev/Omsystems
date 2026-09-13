import sharp from "sharp";

async function makeDataUrl(svgMarkup) {
  const buf = await sharp(Buffer.from(svgMarkup)).jpeg().toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

async function run() {
  const baseUrl = "https://3-7-216-169.sslip.io";

  console.log("=== Testing EC2 Live Biometric Auth API ===");

  // 1. Send blank/dark image (no face)
  const blankBuf = await sharp({
    create: { width: 320, height: 400, channels: 3, background: { r: 50, g: 50, b: 50 } }
  }).jpeg().toBuffer();
  const blankUrl = `data:image/jpeg;base64,${blankBuf.toString("base64")}`;

  console.log("1. Sending blank wall/lens image to /v1/auth/face-login...");
  const res1 = await fetch(`${baseUrl}/v1/auth/face-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ faceScan: blankUrl }),
  });
  const data1 = await res1.json();
  console.log(`Status: ${res1.status}, Response:`, data1);

  if (res1.status === 401 && data1.error === "face_not_recognized") {
    console.log("PASS: Non-face / blank image was strictly REJECTED without logging in.");
  } else {
    console.error("FAIL: Expected 401 face_not_recognized, got:", res1.status, data1);
  }

  // 2. Send doorway / shadow / chair image (textures without human face features)
  const shadowSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="400">
      <rect width="320" height="400" fill="#dfd7cb"/>
      <rect x="90" y="30" width="140" height="370" fill="#6d5843"/>
      <ellipse cx="160" cy="200" rx="40" ry="60" fill="#4a3b2c"/>
    </svg>
  `;
  const shadowUrl = await makeDataUrl(shadowSvg);
  console.log("\n2. Sending shadow/doorway non-face image to /v1/auth/face-login...");
  const res2 = await fetch(`${baseUrl}/v1/auth/face-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ faceScan: shadowUrl }),
  });
  const data2 = await res2.json();
  console.log(`Status: ${res2.status}, Response:`, data2);

  if (res2.status === 401 && data2.error === "face_not_recognized") {
    console.log("PASS: Non-face pattern was strictly REJECTED without logging in.");
  } else {
    console.error("FAIL: Expected 401 face_not_recognized, got:", res2.status, data2);
  }

  // 3. Send back of head image
  const backOfHeadSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="400">
      <rect width="320" height="400" fill="#f0e6d2"/>
      <ellipse cx="160" cy="190" rx="100" ry="130" fill="#1c120c"/>
      <path d="M 60 400 Q 160 290 260 400" fill="#304050"/>
    </svg>
  `;
  const backUrl = await makeDataUrl(backOfHeadSvg);
  console.log("\n3. Sending back of head (no facial features) to /v1/auth/face-login...");
  const res3 = await fetch(`${baseUrl}/v1/auth/face-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ faceScan: backUrl }),
  });
  const data3 = await res3.json();
  console.log(`Status: ${res3.status}, Response:`, data3);

  if (res3.status === 401 && data3.error === "face_not_recognized") {
    console.log("PASS: Back of head was strictly REJECTED without logging in.");
  } else {
    console.error("FAIL: Expected 401 face_not_recognized, got:", res3.status, data3);
  }

  console.log("\n=== ALL EC2 PRODUCTION LIVE TESTS COMPLETED ===");
}

run().catch(console.error);
