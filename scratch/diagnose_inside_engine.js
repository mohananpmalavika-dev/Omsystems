const fs = require('fs');

async function test() {
  const raw = fs.readFileSync('/tmp/kollam_frame_raw.txt', 'utf8');
  const lines = raw.trim().split('\n').filter(l => l.startsWith('{'));
  const frameData = JSON.parse(lines[0]);
  const imgBuffer = Buffer.from(frameData.imageBase64, 'base64');
  console.log('Image buffer bytes:', imgBuffer.length);
  const width = 640;
  const height = 360;

  const { getModelManager } = require('/app/dist/analytics-engine/src/model-manager.js');
  const manager = getModelManager();
  await manager.initialize();

  // Test raw session of yolov8n
  const yoloModel = await manager.getModel('yolov8n');
  console.log('Inputs:', yoloModel.inputNames);
  console.log('Outputs:', yoloModel.outputNames);

  // Let's inspect the first 20 bytes of imgBuffer
  console.log('First 20 bytes:', Array.from(imgBuffer.slice(0, 20)));

  // Test yolo with confidence 0.05
  const { YoloCocoInference } = require('/app/dist/analytics-engine/src/inference/yolo-coco-inference.js');
  const { yoloModelOptions } = require('/app/dist/analytics-engine/src/inference/configured-model-inference.js');
  const yoloConfig = manager.getModelConfig('yolov8n');
  const yolo = new YoloCocoInference(yoloModel, 0.05, 0.45, yoloModelOptions(yoloConfig));
  
  const frameObj = {
    imageData: imgBuffer,
    width,
    height,
    timestamp: new Date(),
    cameraId: '99455d3a-3411-43ad-b756-84a4ae17c026',
    tenantId: '00000000-0000-0000-0000-000000000001'
  };

  const detections = await yolo.run(frameObj);
  console.log('YOLO Detections count (threshold 0.05):', detections.length);
  for (const d of detections) {
    console.log(`- label: ${d.label}, conf: ${d.confidence.toFixed(3)}, box:`, d.boundingBox);
  }

  // Also test helmet-head-localizer with confidence 0.05
  const { loadObjectInference } = require('/app/dist/analytics-engine/src/inference/configured-model-inference.js');
  const localizer = await loadObjectInference('helmet-head-localizer', 0.05);
  const locResults = await localizer.run(frameObj);
  console.log('Localizer results (threshold 0.05):', locResults.length);
  for (const d of locResults) {
    console.log(`- label: ${d.label}, conf: ${d.confidence?.toFixed(3)}, box:`, d.boundingBox);
  }
}

test().catch(console.error);
