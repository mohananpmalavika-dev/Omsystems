import { execSync } from 'child_process';

const project = 'project-7866fc3f-5dd5-4495-804';
const zone = 'asia-south1-b';
const instance = 'kryptovision-server';

const script = `
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module << 'JS'
import { createClient } from 'redis';
import { getModelManager } from '/app/dist/analytics-engine/src/model-manager.js';
import { loadHelmetClassificationInference, loadObjectInference, loadPoseInference } from '/app/dist/analytics-engine/src/inference/configured-model-inference.js';

function expand(box, padding) {
  const x = Math.max(0, box.x - box.width * padding);
  const y = Math.max(0, box.y - box.height * padding);
  const right = Math.min(1, box.x + box.width * (1 + padding));
  const bottom = Math.min(1, box.y + box.height * (1 + padding));
  return { x, y, width: right - x, height: bottom - y };
}

function findMatchingPose(poses, person) {
  if (!poses || poses.length === 0) return undefined;
  return poses.find(pose => {
    const left = Math.max(person.x, pose.boundingBox.x);
    const top = Math.max(person.y, pose.boundingBox.y);
    const right = Math.min(person.x + person.width, pose.boundingBox.x + pose.boundingBox.width);
    const bottom = Math.min(person.y + person.height, pose.boundingBox.y + pose.boundingBox.height);
    const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
    const area = person.width * person.height;
    return (intersection / area) >= 0.25;
  });
}

const redis = createClient({ url: 'redis://:SentinelGridRedisMaster2026@redis:6379' });
await redis.connect();

const manager = getModelManager({ modelsDirectory: '/app/models', enableGPU: false });
await manager.initialize();

const classifier = await loadHelmetClassificationInference('helmet');
const localizer = await loadObjectInference('helmet-head-localizer', 0.10);
const faceDetector = await loadObjectInference('face-detector', 0.08);
let poseEstimator = null;
try {
  poseEstimator = await loadPoseInference('pose-estimator', 0.4);
} catch {}

class TestVerifier {
  constructor(localizer, classifier, faceDetector, poseEstimator) {
    this.localizer = localizer;
    this.classifier = classifier;
    this.faceDetector = faceDetector;
    this.poseEstimator = poseEstimator;
  }

  async verifyDirect(frame, threshold) {
    const candidateProposals = [];

    // 1. From localizer (helmet or head)
    const objects = await this.localizer.run(frame);
    for (const o of objects) {
      if ((o.label === 'helmet' || o.label === 'head') && (o.confidence ?? 0) >= 0.10) {
        candidateProposals.push({ box: o.boundingBox, source: 'localizer-' + o.label, confidence: o.confidence ?? 0.5 });
      }
    }

    // 2. From face detector (YuNet face proposal)
    if (this.faceDetector) {
      const faces = await this.faceDetector.run(frame);
      for (const f of faces) {
        if ((f.confidence ?? 0) >= 0.08) {
          const headBox = {
            x: Math.max(0, f.boundingBox.x - f.boundingBox.width * 0.4),
            y: Math.max(0, f.boundingBox.y - f.boundingBox.height * 0.9),
            width: Math.min(1 - f.boundingBox.x, f.boundingBox.width * 1.8),
            height: Math.min(1 - f.boundingBox.y, f.boundingBox.height * 2.3),
          };
          candidateProposals.push({ box: headBox, source: 'face-yunet', confidence: f.confidence ?? 0.5 });
        }
      }
    }

    // Evaluate proposals
    for (const proposal of candidateProposals) {
      const box = proposal.box;
      if (box.width * frame.width < 20 || box.height * frame.height < 20) continue;

      const synthPerson = {
        x: Math.max(0, box.x - box.width * 0.5),
        y: box.y,
        width: Math.min(1 - box.x, box.width * 2),
        height: Math.min(1 - box.y, Math.max(0.25, box.height * 3.5)),
      };

      if (this.poseEstimator) {
        const poses = await this.poseEstimator.run(frame);
        const matchedPose = findMatchingPose(poses, synthPerson);
        if (matchedPose) {
          const kp = matchedPose.keypoints;
          const leftEar = (kp[3] && kp[3].confidence >= 0.5) ? kp[3] : undefined;
          const rightEar = (kp[4] && kp[4].confidence >= 0.5) ? kp[4] : undefined;
          const earsClearlyExposed = (leftEar && leftEar.confidence >= 0.70) || (rightEar && rightEar.confidence >= 0.70);
          if (earsClearlyExposed) continue;
        }
      }

      const head = await this.classifier.run(frame, box);
      const context = await this.classifier.run(frame, expand(box, 0.15));
      if (head.wearingHelmet && context.wearingHelmet &&
          Math.min(head.wearingHelmetConfidence, context.wearingHelmetConfidence) >= threshold) {
        const surrounding = await this.classifier.run(frame, expand(box, 0.75));
        if (!surrounding.wearingHelmet || surrounding.wearingHelmetConfidence < threshold) continue;

        return {
          candidate: {
            boundingBox: box,
            classificationConfidence: Math.min(head.wearingHelmetConfidence, context.wearingHelmetConfidence, surrounding.wearingHelmetConfidence),
            localizationConfidence: proposal.confidence,
          },
          synthPerson,
        };
      }
    }
    return null;
  }
}

const verifier = new TestVerifier(localizer, classifier, faceDetector, poseEstimator);

for (const id of ['26b22c59-b492-434a-aa89-163fff620af1', '99965e01-8fb4-44e3-8b9f-615ec673274d']) {
  const raw = await redis.get('analytics:latest-frame:' + id);
  if (!raw) continue;
  const frameData = JSON.parse(raw);
  const imageBuffer = Buffer.from(frameData.imageBase64, 'base64');
  const frame = {
    cameraId: id, tenantId: 'test', timestamp: new Date(), imageData: imageBuffer,
    width: 640, height: 360, metadata: { inferenceMode: 'local-onnx' }
  };
  const res = await verifier.verifyDirect(frame, 0.88);
  console.log('Result for camera ' + id + ':', res ? {
    found: true,
    conf: res.candidate.classificationConfidence.toFixed(4),
    box: res.candidate.boundingBox,
    synthPerson: res.synthPerson
  } : { found: false });
}

await manager.shutdown();
await redis.quit();
JS
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh ${instance} --zone=${zone} --project=${project} --command="echo ${b64} | base64 -d | bash"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
