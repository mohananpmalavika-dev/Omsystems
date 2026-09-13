import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  createEmployeeFaceTemplate,
  faceTemplatePreferences,
  identifyUserByFace,
  verifyEmployeeFace,
  validateFacePresence,
  calculateSimilarity,
  flipHorizontal,
  PRODUCTION_FACE_MATCH_THRESHOLD,
} from "../src/security/employee-face-verification.service.js";

async function makeDataUrl(svgMarkup: string): Promise<string> {
  const buf = await sharp(Buffer.from(svgMarkup)).png().toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// Standard synthetic human face with facial features (eyes, nose, mouth, skin tone)
const genuinePersonSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="320" height="400">
    <rect width="320" height="400" fill="#d8b08c"/>
    <ellipse cx="160" cy="190" rx="105" ry="140" fill="#8b5a3c"/>
    <circle cx="125" cy="170" r="14" fill="#111"/>
    <circle cx="195" cy="170" r="14" fill="#111"/>
    <path d="M115 250 Q160 285 205 250" stroke="#111" stroke-width="10" fill="none"/>
  </svg>
`;

// Shifted / rotated webcam face
const tiltedPersonSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="320" height="400">
    <rect width="320" height="400" fill="#d8b08c"/>
    <g transform="rotate(4 160 190)">
      <ellipse cx="160" cy="190" rx="105" ry="140" fill="#8b5a3c"/>
      <circle cx="125" cy="170" r="14" fill="#111"/>
      <circle cx="195" cy="170" r="14" fill="#111"/>
      <path d="M115 250 Q160 285 205 250" stroke="#111" stroke-width="10" fill="none"/>
    </g>
  </svg>
`;

// Non-face 1: Wall with doorway shadow
const doorShadowSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="320" height="400">
    <rect width="320" height="400" fill="#dfd7cb"/>
    <rect x="90" y="30" width="140" height="370" fill="#6d5843"/>
    <ellipse cx="160" cy="200" rx="40" ry="60" fill="#4a3b2c"/>
  </svg>
`;

// Non-face 2: Back of head / hair (no facial features)
const backOfHeadSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="320" height="400">
    <rect width="320" height="400" fill="#f0e6d2"/>
    <ellipse cx="160" cy="190" rx="100" ry="130" fill="#1c120c"/>
    <path d="M 60 400 Q 160 290 260 400" fill="#304050"/>
  </svg>
`;

// Non-face 3: Shirt / torso (person leaning away or looking down)
const shirtTorsoSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="320" height="400">
    <rect width="320" height="400" fill="#d0d0d0"/>
    <path d="M 60 140 L 260 140 L 300 400 L 20 400 Z" fill="#1e3a5f"/>
    <path d="M 120 140 Q 160 190 200 140" fill="#d8a080"/>
  </svg>
`;

// Non-face 4: Office chair
const officeChairSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="320" height="400">
    <rect width="320" height="400" fill="#eaeaea"/>
    <ellipse cx="160" cy="170" rx="70" ry="90" fill="#222222"/>
    <rect x="145" y="260" width="30" height="140" fill="#555555"/>
  </svg>
`;

// Completely different person
const differentPersonSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="320" height="400">
    <rect width="320" height="400" fill="#203040"/>
    <circle cx="160" cy="180" r="90" fill="#ffd0b0"/>
    <circle cx="120" cy="160" r="12" fill="#222"/>
    <circle cx="200" cy="160" r="12" fill="#222"/>
    <rect x="130" y="240" width="60" height="10" fill="#333"/>
  </svg>
`;

describe("Biometric Face Safeguards & False-Match Prevention", () => {
  it("enforces a production threshold of at least 0.70", () => {
    expect(PRODUCTION_FACE_MATCH_THRESHOLD).toBeGreaterThanOrEqual(0.70);
  });

  it("validates face presence and rejects low-contrast or blank images", async () => {
    // Blank gray
    const grayBuf = await sharp({
      create: { width: 48, height: 48, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .grayscale()
      .raw()
      .toBuffer();
    expect(validateFacePresence(grayBuf).hasFace).toBe(false);

    // Pitch black
    const blackBuf = await sharp({
      create: { width: 48, height: 48, channels: 3, background: { r: 5, g: 5, b: 5 } },
    })
      .grayscale()
      .raw()
      .toBuffer();
    expect(validateFacePresence(blackBuf).hasFace).toBe(false);

    // Blown out white
    const whiteBuf = await sharp({
      create: { width: 48, height: 48, channels: 3, background: { r: 250, g: 250, b: 250 } },
    })
      .grayscale()
      .raw()
      .toBuffer();
    expect(validateFacePresence(whiteBuf).hasFace).toBe(false);
  });

  it("identifies enrolled user when genuine face is presented", async () => {
    const enrolledUrl = await makeDataUrl(genuinePersonSvg);
    const tiltedUrl = await makeDataUrl(tiltedPersonSvg);

    const template = await createEmployeeFaceTemplate(enrolledUrl);
    const candidateUser = {
      id: "usr-aditi",
      username: "aditi",
      tenantId: "tenant-1",
      preferences: faceTemplatePreferences(template),
    };

    // Match exact image
    const exactMatch = await identifyUserByFace(enrolledUrl, [candidateUser]);
    expect(exactMatch).not.toBeNull();
    expect(exactMatch!.user.username).toBe("aditi");
    expect(exactMatch!.score).toBeGreaterThanOrEqual(0.95);

    // Match with realistic head movement / tilt
    const tiltMatch = await identifyUserByFace(tiltedUrl, [candidateUser]);
    expect(tiltMatch).not.toBeNull();
    expect(tiltMatch!.user.username).toBe("aditi");
    expect(tiltMatch!.score).toBeGreaterThanOrEqual(PRODUCTION_FACE_MATCH_THRESHOLD);
  });

  it("STRICTLY REJECTS non-face scenes and never falsely logs in without a face", async () => {
    const enrolledUrl = await makeDataUrl(genuinePersonSvg);
    const template = await createEmployeeFaceTemplate(enrolledUrl);
    const candidateUser = {
      id: "usr-aditi",
      username: "aditi",
      tenantId: "tenant-1",
      preferences: faceTemplatePreferences(template),
    };

    const nonFaceImages = [
      { name: "Doorway shadow", url: await makeDataUrl(doorShadowSvg) },
      { name: "Back of head", url: await makeDataUrl(backOfHeadSvg) },
      { name: "Shirt / torso only", url: await makeDataUrl(shirtTorsoSvg) },
      { name: "Office chair", url: await makeDataUrl(officeChairSvg) },
      { name: "Different person", url: await makeDataUrl(differentPersonSvg) },
    ];

    for (const testCase of nonFaceImages) {
      const match = await identifyUserByFace(testCase.url, [candidateUser]);
      expect(
        match,
        `Expected ${testCase.name} to be REJECTED, but it falsely matched with score ${match?.score}`
      ).toBeNull();
    }
  });

  it("rejects pitch-black camera or lens cover without authenticating", async () => {
    const enrolledUrl = await makeDataUrl(genuinePersonSvg);
    const template = await createEmployeeFaceTemplate(enrolledUrl);
    const candidateUser = {
      id: "usr-aditi",
      username: "aditi",
      tenantId: "tenant-1",
      preferences: faceTemplatePreferences(template),
    };

    const blackImg = await sharp({
      create: { width: 320, height: 400, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .jpeg()
      .toBuffer();
    const blackUrl = `data:image/jpeg;base64,${blackImg.toString("base64")}`;

    const match = await identifyUserByFace(blackUrl, [candidateUser]);
    expect(match).toBeNull();
  });
});
