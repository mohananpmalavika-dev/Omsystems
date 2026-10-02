import { readFile } from 'node:fs/promises';
import { createPublicKey } from 'node:crypto';
import { DeviceIdentityStore } from '../edge-agent/src/security/device-identity.js';
const install = 'C:/Program Files/Sentinel Grid/Edge Agent';
const identity = await new DeviceIdentityStore(`${install}/data/device-identity.enc`, `${install}/data/device-identity.key`).load();
const signing = await readFile('config/keys/evidence-signing.pem', 'utf8');
const keyMatches = Boolean(identity?.updatePublicKey && createPublicKey(signing).export({type: 'spki', format: 'der'}).equals(createPublicKey(identity.updatePublicKey).export({type: 'spki', format: 'der'})));
console.log(JSON.stringify({agentId: identity?.agentId, trustedUpdateKeyPresent: Boolean(identity?.updatePublicKey), keyMatches}));
