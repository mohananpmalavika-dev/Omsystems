import * as ort from 'onnxruntime-node';

async function main() {
  const session = await ort.InferenceSession.create('/tmp/helmet_yolo.onnx');
  console.log('Inputs:', session.inputNames);
  console.log('Outputs:', session.outputNames);

  // Run dummy inference to check output shape
  // Typical YOLOv8 input is 1x3x640x640
  const inputTensor = new ort.Tensor('float32', new Float32Array(1 * 3 * 640 * 640), [1, 3, 640, 640]);
  const results = await session.run({ [session.inputNames[0]]: inputTensor });
  const output = results[session.outputNames[0]];
  console.log('Output dims:', output.dims); // e.g. [1, 4 + num_classes, 8400]
  const numChannels = output.dims[1];
  console.log('Channels (4 coords + classes):', numChannels);
  console.log('Number of classes:', numChannels - 4);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
