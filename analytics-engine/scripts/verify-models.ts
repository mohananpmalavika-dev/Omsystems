import { ModelManager } from "../src/model-manager.js";

const manager = new ModelManager({
  ...(process.env.MODELS_DIR ? { modelsDirectory: process.env.MODELS_DIR } : {}),
  enableGPU: process.env.ENABLE_GPU_ACCELERATION === "true",
  startCleanupTimer: false,
});

try {
  await manager.initialize();
  const summary = manager.getProvisioningSummary();
  for (const model of summary.models) {
    console.log(`${model.required ? "required" : "optional"} ${model.id}: ${model.status} (${model.resolvedPath})`);
  }
  if (!summary.ready) throw new Error(`Missing or invalid required models: ${summary.missingRequired.join(", ")}`);
  for (const model of summary.models.filter((item) => item.required)) await manager.loadModel(model.id);
  const loaded = manager.getLoadedModels();
  if (loaded.length !== summary.required) {
    throw new Error(`Expected ${summary.required} loaded required models; loaded ${loaded.length}`);
  }
  console.log(`PASS: ${loaded.length}/${summary.required} required ONNX models opened successfully`);
} finally {
  await manager.shutdown();
}
