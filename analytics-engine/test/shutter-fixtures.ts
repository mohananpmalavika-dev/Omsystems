import type { DetectionFrame } from "../src/detectors/base-detector.js";
import type { ShutterRule } from "../src/detectors/shutter-detector.js";
import { shutterSignature, type ShutterConfig } from "../../packages/contracts/src/shutter.js";

export function shutterFrame(state: "open" | "closed" | "unknown", seconds: number, overrides: Partial<DetectionFrame> = {}): DetectionFrame {
  const width = 64, height = 64, imageData = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = state === "unknown" ? 120 : 40 + Math.round(120 * ((state === "open" ? y : x) % 16) / 15);
    imageData.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
  }
  return {cameraId:"camera-1",tenantId:"tenant-1",width,height,imageData,
    timestamp:new Date(Date.parse("2026-10-05T10:00:00Z") + seconds * 1000), ...overrides};
}
export function shutterCalibration(): ShutterConfig {
  const region = {x:0,y:0,width:1,height:1};
  const signature = (state: "open" | "closed") => {
    const frame = shutterFrame(state, 0);
    return shutterSignature(frame.imageData, frame.width, frame.height, region);
  };
  return {region,openReference:signature("open"),closedReference:signature("closed")};
}
export function shutterRule(overrides: Partial<ShutterRule> = {}): ShutterRule {
  return {id:"rule-1",cameraId:"camera-1",enabled:true,detectionType:"shutter-state",
    minConfidence:.7,minDurationSeconds:2,shutterConfig:shutterCalibration(), ...overrides};
}
