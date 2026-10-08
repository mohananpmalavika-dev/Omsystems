import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {describe,expect,it} from 'vitest';
import {classifyHelmetHeadEmbedding} from '../src/inference/helmet-head-classification.js';
const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/helmet-head-regression-20261008.json.gz',import.meta.url))).toString());
describe('corrected helmet head classifier',()=>{
 it('reproduces the bent-forward training feedback at both frame sizes and crop contexts',()=>{
  expect(fixture.feedback).toHaveLength(4);
  for(const row of fixture.feedback)expect(classifyHelmetHeadEmbedding(row.feature).wearingHelmetConfidence).toBeGreaterThanOrEqual(.9);
 });
 it('retains independently held-out worn-helmet and bare-head labels',()=>{
  const heldOut=new Set(fixture.heldOutImages);
  expect(fixture.trainingImages.some((file:string)=>heldOut.has(file))).toBe(false);
  expect(fixture.heldOut).toHaveLength(138);
  for(const row of fixture.heldOut){
   const probability=classifyHelmetHeadEmbedding(row.feature).wearingHelmetConfidence;
   expect(probability>=.8,row.file+': '+probability).toBe(row.expectedHelmet);
  }
 });
});
