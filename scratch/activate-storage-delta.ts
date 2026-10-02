import { readFile } from 'node:fs/promises';
import { DeviceIdentityStore } from '../edge-agent/src/security/device-identity.js';
import { stageSignedUpdate, activateSignedUpdate } from '../edge-agent/src/updates/signed-update.js';
const install = 'C:/Program Files/Sentinel Grid/Edge Agent';
const identity = await new DeviceIdentityStore(`${install}/data/device-identity.enc`, `${install}/data/device-identity.key`).load();
if (!identity?.updatePublicKey) throw new Error('trusted_update_key_missing');
const manifest = JSON.parse(await readFile('edge-agent/release/updates/0.1.42/manifest.json', 'utf8'));
const release = {id: 'storage-fix-0.1.42', version: manifest.version, artifactUrl: manifest.artifactUrl,
  sha256: manifest.sha256, notes: manifest.notes, signature: manifest.signature};
const root = `${install}/data/updates`;
const staged = await stageSignedUpdate(release, identity.updatePublicKey, root);
await activateSignedUpdate(release, staged, root, '0.1.40');
console.log(JSON.stringify({version: staged.version, bytes: staged.bytes, sha256: staged.sha256, activated: true}));
