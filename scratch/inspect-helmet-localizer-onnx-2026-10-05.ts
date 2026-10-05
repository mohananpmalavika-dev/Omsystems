import {InferenceSession} from 'onnxruntime-node';
import {readFile} from 'node:fs/promises';
const file=process.argv[2]??'tmp/helmet-localizer-candidates/pooja-best.onnx';
const session=await InferenceSession.create(file,{executionProviders:['cpu'],intraOpNumThreads:2});
console.log(JSON.stringify({inputs:session.inputMetadata,outputs:session.outputMetadata}));
const model=await readFile(file);
console.log(model.subarray(-1800).toString('latin1').replace(/[^\x20-\x7e\n]/g,' '));
await session.release();
