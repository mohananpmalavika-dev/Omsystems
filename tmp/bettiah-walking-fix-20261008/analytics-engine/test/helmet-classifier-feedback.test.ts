import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import {classifyHelmetHeadEmbedding} from '../src/inference/helmet-head-classification.js';
const artifact=JSON.parse(fs.readFileSync('tmp/bettiah-walking-fix-20261008/head-probe.json','utf8'));
describe('corrected helmet head classifier',()=>{
 it('reproduces the confirmed bent-forward training feedback at both frame sizes and crop contexts',()=>{
  const rows=JSON.parse(fs.readFileSync('reports/bettiah-walking-feedback-features-2026-10-08.json','utf8'));
  expect(rows).toHaveLength(4);
  for(const row of rows){
   expect(classifyHelmetHeadEmbedding(row.feature).wearingHelmetConfidence).toBeGreaterThanOrEqual(.9);
  }
 });
 it('retains the independently held-out worn-helmet and bare-head labels',()=>{
  const heldOut=new Set(artifact.heldOutImages);
  expect(artifact.trainingImages.some((f:string)=>heldOut.has(f))).toBe(false);
  const rows=JSON.parse(fs.readFileSync('reports/helmet-semantic-features-2026-10-07.json','utf8')).filter((r:any)=>heldOut.has(r.file));
  expect(rows).toHaveLength(138);
  for(const row of rows){
   const probability=classifyHelmetHeadEmbedding(row.feature).wearingHelmetConfidence;
   expect(probability>=.8,`${row.file}: ${probability}`).toBe(row.expectedHelmet);
  }
 });
});
