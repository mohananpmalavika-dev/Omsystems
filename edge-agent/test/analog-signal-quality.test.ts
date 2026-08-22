import { describe, expect, it } from "vitest";
import { assessAnalogRgbFrame } from "../src/monitoring/analog-signal-quality.js";

const width = 64;
const height = 36;

describe("analog signal quality", () => {
  it("detects common DVR blue-screen and flat obstruction signatures", () => {
    const blue = solidFrame(5, 20, 200);
    const blueAssessment = assessAnalogRgbFrame(undefined, blue, width, height);
    expect(blueAssessment.blueScreen).toBe(true);
    expect(blueAssessment.obstructionSuspected).toBe(false);

    const covered = solidFrame(90, 90, 90);
    expect(assessAnalogRgbFrame(undefined, covered, width, height).obstructionSuspected).toBe(true);
  });

  it("detects persistent frozen frames only after three decoded samples", () => {
    const frame = texturedGrayFrame();
    const first = assessAnalogRgbFrame(undefined, frame, width, height);
    const second = assessAnalogRgbFrame(first.state, frame, width, height);
    const third = assessAnalogRgbFrame(second.state, frame, width, height);
    expect(first.imageFrozen).toBe(false);
    expect(second.imageFrozen).toBe(false);
    expect(third.imageFrozen).toBe(true);
  });

  it("reports colour loss and rolling interference as measured evidence", () => {
    const grayscale = texturedGrayFrame();
    expect(assessAnalogRgbFrame(undefined, grayscale, width, height).colourLoss).toBe(true);

    const rolling = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      const value = y % 2 === 0 ? 35 : 210;
      for (let x = 0; x < width; x++) setPixel(rolling, x, y, value, value, value);
    }
    const assessment = assessAnalogRgbFrame(undefined, rolling, width, height);
    expect(assessment.rollingInterference).toBe(true);
    expect(assessment.rowInterferenceScore).toBeGreaterThan(100);
  });

  it("separates low-detail blur from high-frequency analog noise", () => {
    const blurred = Buffer.alloc(width * height * 3);
    const noisy = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const smoothValue = 55 + x * 2;
        const noisyValue = (x + y) % 2 === 0 ? 0 : 255;
        setPixel(blurred, x, y, smoothValue, smoothValue, smoothValue);
        setPixel(noisy, x, y, noisyValue, noisyValue, noisyValue);
      }
    }
    expect(assessAnalogRgbFrame(undefined, blurred, width, height).severeBlur).toBe(true);
    expect(assessAnalogRgbFrame(undefined, noisy, width, height).excessiveNoise).toBe(true);
  });

  it("marks a major whole-frame shift as suspected movement, not a proven cause", () => {
    const before = assessAnalogRgbFrame(undefined, solidFrame(50, 50, 50), width, height);
    const after = assessAnalogRgbFrame(before.state, solidFrame(170, 170, 170), width, height);
    expect(after.cameraMovementSuspected).toBe(true);
    expect(after.sceneChangeScore).toBeGreaterThan(100);
  });
});

function solidFrame(red: number, green: number, blue: number) {
  const frame = Buffer.alloc(width * height * 3);
  for (let index = 0; index < width * height; index++) {
    frame[index * 3] = red;
    frame[index * 3 + 1] = green;
    frame[index * 3 + 2] = blue;
  }
  return frame;
}

function texturedGrayFrame() {
  const frame = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = 40 + ((x * 7 + y * 11) % 150);
      setPixel(frame, x, y, value, value, value);
    }
  }
  return frame;
}

function setPixel(frame: Buffer, x: number, y: number, red: number, green: number, blue: number) {
  const offset = (y * width + x) * 3;
  frame[offset] = red;
  frame[offset + 1] = green;
  frame[offset + 2] = blue;
}
