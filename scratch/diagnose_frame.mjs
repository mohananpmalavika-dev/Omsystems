import fs from 'fs';
import ort from 'onnxruntime-node';

// We will read the frame from stdin or file
const rawJson = fs.readFileSync(process.argv[2], 'utf8');
const data = JSON.parse(rawJson);
const buf = Buffer.from(data.imageBase64, 'base64');
const width = 640;
const height = 360;

console.log('Buffer length:', buf.length, 'expected:', width * height * 3);

// Let's test yolox_tiny
try {
  const session = await ort.InferenceSession.create('/app/models/detection/yolox_tiny.onnx');
  console.log('Loaded yolox_tiny. Inputs:', session.inputNames, 'Outputs:', session.outputNames);
  
  // Preprocess RGB24 640x360 to input dimensions (416x416? Let's check session input)
  // Let's inspect input metadata
} catch (e) {
  console.error('Yolox error:', e);
}
