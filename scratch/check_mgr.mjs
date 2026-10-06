import { getModelManager } from '/app/dist/analytics-engine/src/model-manager.js';

const mgr = getModelManager();
console.log('modelsDir:', mgr.options?.modelsDirectory);
console.log('manifestPath:', mgr.options?.manifestPath);
console.log('Manifest models count:', mgr.manifest?.length);
console.log('Manifest model IDs:', mgr.manifest?.map(x => x.id));
