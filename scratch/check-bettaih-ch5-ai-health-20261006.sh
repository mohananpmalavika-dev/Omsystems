#!/usr/bin/env bash
# Read-only health/version fingerprints. No camera images or raw frames.
set -eu
sudo docker exec -i sentinel-gcp-analytics-engine node --input-type=module <<'JS'
import fs from 'node:fs';
const cameraId='172e5dd2-6c2e-4946-b0a3-8f40b85d7319';
const health=await (await fetch('http://localhost:8092/health')).json();
const response=await fetch(`http://localhost:8092/v1/analytics/cameras/${cameraId}/status`,{
  headers:{'x-analytics-source-key':process.env.ANALYTICS_ENGINE_SHARED_KEY || ''},
  signal:AbortSignal.timeout(15000),
});
const camera=response.ok?await response.json():null;
const detector=fs.readFileSync('/app/dist/analytics-engine/src/detectors/helmet-detector.js','utf8');
const verifier=fs.readFileSync('/app/dist/analytics-engine/src/inference/helmet-head-verification.js','utf8');
console.log(JSON.stringify({cameraId,status:response.status,
  camera:camera?{stream:camera.stream,aiEngine:camera.aiEngine,inference:camera.inference,
    detection:camera.detection}:null,
  received:health.received,failed:health.failed,lastAcceptedAt:health.lastAcceptedAt,
  headCandidatesSupported:verifier.includes('head.label === "head" || head.label === "helmet"'),
  overlappingHeadVeto:verifier.includes('dominantBareHead'),
  localizedConfirmationCanFallThrough:detector.includes('presence = candidate;')},null,2));
JS
sudo docker exec -i sentinel-gcp-control-plane node <<'JS'
const {createClient}=require('redis');
(async()=>{
  const client=createClient({url:process.env.REDIS_URL,socket:{connectTimeout:5000,reconnectStrategy:false}});
  client.on('error',()=>{});await client.connect();
  const ttl=await client.ttl('analytics:latest-frame:172e5dd2-6c2e-4946-b0a3-8f40b85d7319');
  console.log(JSON.stringify({cameraFrameCacheTtlSeconds:ttl}));
  await client.quit();
})().catch(()=>{console.log('Frame cache health unavailable');process.exitCode=1});
JS
