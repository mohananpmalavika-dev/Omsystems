import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ch2Frame = fs.readFileSync('scratch/bettiah-entry-20261008/ch2/frame-005.jpg').toString('base64');
const ch5Frame = fs.readFileSync('scratch/bettiah-entry-20261008/ch5/frame-005.jpg').toString('base64');

console.log('CH2 Frame size base64:', ch2Frame.length);
console.log('CH5 Frame size base64:', ch5Frame.length);

const testScript = `
import fs from 'node:fs';
import { loadHelmetClassificationInference } from '/app/dist/analytics-engine/src/inference/vision-specialty-inference.js';
import { loadObjectInference, loadPoseInference } from '/app/dist/analytics-engine/src/inference/vision-specialty-inference.js';
import { LocalizedHelmetHeadVerifier } from '/app/dist/analytics-engine/src/inference/helmet-head-verification.js';
import { HelmetDetector } from '/app/dist/analytics-engine/src/detectors/helmet-detector.js';

const yolo = await loadObjectInference("yolov8n", 0.25);
const helmet = await loadHelmetClassificationInference("helmet");
const localizer = await loadObjectInference("helmet-head-localizer", 0.25);
const headEvidence = await loadHelmetClassificationInference("helmet-head-evidence");
const face = await loadObjectInference("face-detector", 0.5);
const pose = await loadPoseInference("pose-estimator", 0.4);

console.log("All models loaded successfully");
`;

fs.writeFileSync('scratch/remote-test-models.mjs', testScript);
