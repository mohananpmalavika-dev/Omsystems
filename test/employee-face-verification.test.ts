import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  createEmployeeFaceTemplate,
  faceTemplatePreferences,
  verifyEmployeeFace,
} from "../src/security/employee-face-verification.service.js";

async function imageData(markup: string): Promise<string> {
  const png = await sharp(Buffer.from(markup)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

const enrolledImage = await imageData(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400"><rect width="320" height="400" fill="#d8b08c"/><ellipse cx="160" cy="190" rx="105" ry="140" fill="#8b5a3c"/><circle cx="125" cy="170" r="14" fill="#111"/><circle cx="195" cy="170" r="14" fill="#111"/><path d="M115 250 Q160 285 205 250" stroke="#111" stroke-width="10" fill="none"/></svg>',
);

const differentImage = await imageData(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400"><rect width="320" height="400" fill="#203040"/><rect x="30" y="30" width="260" height="340" fill="#d0d0d0"/><path d="M30 30 L290 370 M290 30 L30 370" stroke="#b00000" stroke-width="34"/></svg>',
);

describe("employee face verification", () => {
  it("matches a live scan against the enrolled template", async () => {
    const template = await createEmployeeFaceTemplate(enrolledImage);
    const result = await verifyEmployeeFace(enrolledImage, faceTemplatePreferences(template));

    expect(result.enrolled).toBe(true);
    expect(result.matched).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.86);
  });

  it("rejects an image that does not match the enrolled employee", async () => {
    const template = await createEmployeeFaceTemplate(enrolledImage);
    const result = await verifyEmployeeFace(differentImage, faceTemplatePreferences(template));

    expect(result.enrolled).toBe(true);
    expect(result.matched).toBe(false);
    expect(result.reason).toBe("mismatch");
  });

  it("does not allow facial login without enrollment", async () => {
    const result = await verifyEmployeeFace(enrolledImage, {});

    expect(result).toEqual({
      enrolled: false,
      matched: false,
      score: 0,
      reason: "not_enrolled",
    });
  });
});
