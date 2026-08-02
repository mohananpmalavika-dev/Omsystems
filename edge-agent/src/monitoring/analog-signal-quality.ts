import { createHash } from "node:crypto";

export interface AnalogSignalState {
  hash: string;
  identicalSamples: number;
  luma: Buffer;
}

export interface AnalogSignalAssessment {
  state: AnalogSignalState;
  imageFrozen: boolean;
  blackScreen: boolean;
  blueScreen: boolean;
  severeBlur: boolean;
  excessiveNoise: boolean;
  rollingInterference: boolean;
  colourLoss: boolean;
  brightnessFailure: boolean;
  obstructionSuspected: boolean;
  cameraMovementSuspected: boolean;
  brightness: number;
  contrast: number;
  edgeScore: number;
  noiseScore: number;
  rowInterferenceScore: number;
  colourScore: number;
  sceneChangeScore: number | null;
}

/**
 * Fast, explainable edge analysis for decoded analog DVR frames. These checks
 * intentionally report "suspected" for obstruction/movement because a single
 * low-resolution sample cannot prove the physical cause.
 */
export function assessAnalogRgbFrame(
  previous: AnalogSignalState | undefined,
  frame: Buffer,
  width = 64,
  height = 36,
): AnalogSignalAssessment {
  if (frame.length !== width * height * 3) throw new Error("invalid_rgb_frame_size");
  const pixels = width * height;
  const luma = Buffer.allocUnsafe(pixels);
  const rowSums = new Array<number>(height).fill(0);
  let lumaSum = 0;
  let lumaSquared = 0;
  let colourSum = 0;
  let redSum = 0;
  let greenSum = 0;
  let blueSum = 0;

  for (let index = 0; index < pixels; index++) {
    const offset = index * 3;
    const red = frame[offset]!;
    const green = frame[offset + 1]!;
    const blue = frame[offset + 2]!;
    const value = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
    luma[index] = value;
    lumaSum += value;
    lumaSquared += value * value;
    colourSum += Math.max(red, green, blue) - Math.min(red, green, blue);
    redSum += red;
    greenSum += green;
    blueSum += blue;
    rowSums[Math.floor(index / width)]! += value;
  }

  const brightness = lumaSum / pixels;
  const contrast = Math.sqrt(Math.max(0, lumaSquared / pixels - brightness * brightness));
  const colourScore = colourSum / pixels;
  let edgeTotal = 0;
  let edgeCount = 0;
  let noiseTotal = 0;
  let noiseCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (x > 0) { edgeTotal += Math.abs(luma[index]! - luma[index - 1]!); edgeCount++; }
      if (y > 0) { edgeTotal += Math.abs(luma[index]! - luma[index - width]!); edgeCount++; }
      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const neighborAverage = (luma[index - 1]! + luma[index + 1]! + luma[index - width]! + luma[index + width]!) / 4;
        noiseTotal += Math.abs(luma[index]! - neighborAverage);
        noiseCount++;
      }
    }
  }
  const edgeScore = edgeCount ? edgeTotal / edgeCount : 0;
  const noiseScore = noiseCount ? noiseTotal / noiseCount : 0;
  const rowMeans = rowSums.map((sum) => sum / width);
  const rowInterferenceScore = rowMeans.slice(1).reduce(
    (sum, value, index) => sum + Math.abs(value - rowMeans[index]!), 0,
  ) / Math.max(1, height - 1);
  const hash = createHash("sha256").update(frame).digest("hex");
  const identicalSamples = previous?.hash === hash ? previous.identicalSamples + 1 : 1;
  const sceneChangeScore = previous?.luma.length === luma.length
    ? luma.reduce((sum, value, index) => sum + Math.abs(value - previous.luma[index]!), 0) / pixels
    : null;
  const redAverage = redSum / pixels;
  const greenAverage = greenSum / pixels;
  const blueAverage = blueSum / pixels;

  const blackScreen = brightness <= 10;
  const blueScreen = blueAverage - redAverage >= 45 && blueAverage - greenAverage >= 25 && contrast < 20;
  const brightnessFailure = brightness < 18 || brightness > 238;
  const colourLoss = colourScore < 5 && brightness >= 25 && brightness <= 230 && contrast >= 10;
  const severeBlur = edgeScore < 4 && contrast >= 10 && !blueScreen;
  const excessiveNoise = noiseScore > 24 && edgeScore > 18;
  const rollingInterference = rowInterferenceScore > 28 && contrast > 20;
  const obstructionSuspected = contrast < 6 && edgeScore < 3 && !blackScreen && !blueScreen;
  const cameraMovementSuspected = sceneChangeScore !== null && sceneChangeScore > 45 &&
    !blackScreen && !blueScreen && !excessiveNoise;

  return {
    state: { hash, identicalSamples, luma },
    imageFrozen: identicalSamples >= 3,
    blackScreen,
    blueScreen,
    severeBlur,
    excessiveNoise,
    rollingInterference,
    colourLoss,
    brightnessFailure,
    obstructionSuspected,
    cameraMovementSuspected,
    brightness: round(brightness),
    contrast: round(contrast),
    edgeScore: round(edgeScore),
    noiseScore: round(noiseScore),
    rowInterferenceScore: round(rowInterferenceScore),
    colourScore: round(colourScore),
    sceneChangeScore: sceneChangeScore === null ? null : round(sceneChangeScore),
  };
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

