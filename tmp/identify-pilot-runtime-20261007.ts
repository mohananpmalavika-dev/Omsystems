import {DeviceIdentityStore} from '../edge-agent/src/security/device-identity.js';
const identity=await new DeviceIdentityStore('edge-runtime/data/device-identity.enc','edge-runtime/data/device-identity.key').load();
console.log(JSON.stringify(identity?{agentId:identity.agentId,branchId:identity.branchId,hasUpdateKey:!!identity.updatePublicKey,enrolledAt:identity.enrolledAt}:null));
