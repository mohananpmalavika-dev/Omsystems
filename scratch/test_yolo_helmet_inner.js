
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { YoloDetectionInference } from './dist/analytics-engine/src/inference/yolo-detection-inference.js';

async function main() {
  const session = await ort.InferenceSession.create('/tmp/helmet_yolo.onnx');
  
  // Load user image
  const img = sharp('/tmp/user_test.png');
  const meta = await img.metadata();
  console.log('Image size:', meta.width, meta.height);
  
  const rawRgb = await img.removeAlpha().raw().toBuffer();
  const frame = {
    cameraId: 'test',
    tenantId: 'test',
    timestamp: new Date(),
    imageData: rawRgb,
    width: meta.width,
    height: meta.height,
  };

  // Test with labels: ["helmet", "no-helmet"]
  const inference1 = new YoloDetectionInference(session, {
    labels: ['helmet', 'no-helmet'],
    decoder: 'yolov8',
    confidenceThreshold: 0.25,
    iouThreshold: 0.45,
    inputWidth: 640,
    inputHeight: 640,
  });

  const res1 = await inference1.run(frame);
  console.log('Results (labels: [helmet, no-helmet]):', JSON.stringify(res1, null, 2));

  // Test with inverted labels: ["no-helmet", "helmet"]
  const inference2 = new YoloDetectionInference(session, {
    labels: ['no-helmet', 'helmet'],
    decoder: 'yolov8',
    confidenceThreshold: 0.25,
    iouThreshold: 0.45,
    inputWidth: 640,
    inputHeight: 640,
  });

  const res2 = await inference2.run(frame);
  console.log('Results (labels: [no-helmet, helmet]):', JSON.stringify(res2, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
