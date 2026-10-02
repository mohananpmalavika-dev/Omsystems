import { DeviceIdentityStore } from '../edge-agent/src/security/device-identity.js';
import { GatewayClient } from '../edge-agent/src/registration/gateway-client.js';
import { authenticatedFetch } from '../edge-agent/src/monitoring/http-auth.js';
import { parseCgiDisks } from '../edge-agent/src/monitoring/recorder-probe.js';
import { normalizeRecorderHddStatus } from '../src/operational-health/disk-health.js';
const install = 'C:/Program Files/Sentinel Grid/Edge Agent';
const identity = await new DeviceIdentityStore(`${install}/data/device-identity.enc`, `${install}/data/device-identity.key`).load();
if (!identity) throw new Error('identity_missing');
const control = new GatewayClient('https://34-14-220-41.sslip.io', undefined);
control.useEdgeCredential(identity.credential);
const credential = (await control.getDiscoveryBootstrap(identity.agentId)).credentials.find(item => item.host === '192.168.29.171');
if (!credential) throw new Error('recorder_credential_missing');
const response = await authenticatedFetch('http://192.168.29.171/cgi-bin/storageDevice.cgi?action=getDeviceAllInfo', {method: 'GET'}, {username: credential.username, password: credential.password ?? ''}, 5000);
if (!response.ok) throw new Error(`storage_http_${response.status}`);
const disks = parseCgiDisks(await response.text());
if (disks.length !== 1 || !disks[0]?.TotalBytes) throw new Error('storage_evidence_incomplete');
const observedAt = new Date().toISOString();
const result = await control.submitRecorderHdd(identity.agentId, {
  branchId: identity.branchId, recorderId: 'recorder-192.168.29.171', observedAt,
  source: 'cp-plus-adapter', quality: 'verified',
  idempotencyKey: `${identity.agentId}:storage-repair:${observedAt}`, hddStatus: disks,
});
console.log(JSON.stringify({observedAt, result, disks: normalizeRecorderHddStatus(disks).map(({id, devicePath, capacityBytes, usedBytes, availableBytes, slotStatus, writeVerification}) => ({id, devicePath, capacityBytes, usedBytes, availableBytes, slotStatus, writeVerification}))}));
