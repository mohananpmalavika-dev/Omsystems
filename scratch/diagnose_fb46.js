const fs = require('fs');

async function test() {
  const raw = fs.readFileSync('/tmp/fb46_frame_raw.txt', 'utf8');
  const lines = raw.trim().split('\n').filter(l => l.startsWith('{'));
  const frameData = JSON.parse(lines[0]);
  const imgBuffer = Buffer.from(frameData.imageBase64, 'base64');
  console.log('Image buffer bytes:', imgBuffer.length);
  const width = 640;
  const height = 360;

  const { getModelManager } = require('/app/dist/analytics-engine/src/model-manager.js');
  const manager = getModelManager();
  await manager.initialize();

  // Test yolo with confidence 0.25
  const yoloModel = await manager.getModel('yolov8n');
  const { YoloCocoInference } = require('/app/dist/analytics-engine/src/inference/yolo-coco-inference.js');
  const { yoloModelOptions } = require('/app/dist/analytics-engine/src/inference/configured-model-inference.js');
  const yoloConfig = manager.getModelConfig('yolov8n');
  const yolo = new YoloCocoInference(yoloModel, 0.25, 0.45, yoloModelOptions(yoloConfig));
  
  const frameObj = {
    imageData: imgBuffer,
    width,
    height,
    timestamp: new Date(),
    cameraId: 'fb465a8f-5d79-4a3f-9cb8-b8cec471708d',
    tenantId: '00000000-0000-0000-0000-000000000001'
  };

  const detections = await yolo.run(frameObj);
  console.log('YOLO Detections count (threshold 0.25):', detections.length);
  for (const d of detections) {
    console.log(`- label: ${d.label}, conf: ${d.confidence.toFixed(3)}, box:`, d.boundingBox);
  }

  // Also test helmet-head-localizer with confidence 0.15
  const { loadObjectInference } = require('/app/dist/analytics-engine/src/inference/configured-model-inference.js');
  const localizer = await loadObjectInference('helmet-head-localizer', 0.15);
  const locResults = await localizer.run(frameObj);
  console.log('Localizer results (threshold 0.15):', locResults.length);
  for (const d of locResults) {
    console.log(`- label: ${d.label}, conf: ${d.confidence?.toFixed(3)}, box:`, d.boundingBox);
  }

  // Test helmet classifier on candidates
  const { loadHelmetClassificationInference } = require('/app/dist/analytics-engine/src/inference/configured-model-inference.js');
  const classifier = await loadHelmetClassificationInference('helmet');
  for (const d of locResults) {
    const cRes = await classifier.run(frameObj, d.boundingBox);
    console.log(`Classifier on localizer (${d.label}, conf: ${d.confidence.toFixed(2)}): wearingHelmet=${cRes.wearingHelmet}, conf=${cRes.wearingHelmetConfidence?.toFixed(3)}`);
  }
}

test().catch(console.error);
