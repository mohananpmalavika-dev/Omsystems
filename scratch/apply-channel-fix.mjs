import fs from 'node:fs';

// 1. src/database/edge-agent-repository.ts
let edgeRepo = fs.readFileSync('src/database/edge-agent-repository.ts', 'utf8');

const t1 = `AND COALESCE(c.recorder_channel, c.channel, 0) = camera_discoveries.recorder_channel)`;
const r1 = `AND COALESCE(c.recorder_channel, CASE WHEN c.source_type IN ('analog-dvr-channel', 'nvr-channel') THEN c.channel ELSE NULL END, 0) = camera_discoveries.recorder_channel)`;

if (edgeRepo.includes(t1)) {
  edgeRepo = edgeRepo.replaceAll(t1, r1);
  fs.writeFileSync('src/database/edge-agent-repository.ts', edgeRepo);
  console.log('Updated src/database/edge-agent-repository.ts (both occurrences)');
} else {
  console.warn('Target 1 not found in src/database/edge-agent-repository.ts');
}

// 2. src/store.ts
let storeContent = fs.readFileSync('src/store.ts', 'utf8');

const tStoreStatus = `status: existing.status === "approved" ? "approved" as const : "pending" as const,`;
const rStoreStatus = `status: (existing.status === "approved" && !recorderPlaceholderUpgrade) ? "approved" as const : "pending" as const,`;

if (storeContent.includes(tStoreStatus)) {
  storeContent = storeContent.replace(tStoreStatus, rStoreStatus);
  console.log('Updated status in src/store.ts');
}

const tStoreFilter = `(c.recorderChannel ?? c.channel ?? 0) === (discovery.recorderChannel ?? 0)`;
const rStoreFilter = `(c.recorderChannel ?? (c.sourceType === "analog-dvr-channel" || c.sourceType === "nvr-channel" ? c.channel : undefined) ?? 0) === (discovery.recorderChannel ?? 0)`;

if (storeContent.includes(tStoreFilter)) {
  storeContent = storeContent.replace(tStoreFilter, rStoreFilter);
  console.log('Updated channel filter in src/store.ts');
}

fs.writeFileSync('src/store.ts', storeContent);
