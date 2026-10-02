import { DeviceIdentityStore } from '../edge-agent/src/security/device-identity.js';
import { GatewayClient } from '../edge-agent/src/registration/gateway-client.js';
import { authenticatedFetch } from '../edge-agent/src/monitoring/http-auth.js';

const install = 'C:/Program Files/Sentinel Grid/Edge Agent';
const identity = await new DeviceIdentityStore(`${install}/data/device-identity.enc`, `${install}/data/device-identity.key`).load();
if (!identity) throw new Error('gateway_identity_missing');
const baseUrl = process.argv[2];
if (!baseUrl) throw new Error('control_url_required');
const control = new GatewayClient(baseUrl, undefined);
control.useEdgeCredential(identity.credential);
const bootstrap = await control.getDiscoveryBootstrap(identity.agentId);
const credential = bootstrap.credentials.find(item => item.host === '192.168.29.171');
if (!credential) throw new Error('recorder_credential_missing');
for (const path of ['/cgi-bin/magicBox.cgi?action=getSystemInfo', '/cgi-bin/storageDevice.cgi?action=getDeviceAllInfo', '/cgi-bin/storage.cgi?action=getDeviceAllInfo', '/cgi-bin/storageDevice.cgi?action=getDeviceInfo', '/cgi-bin/configManager.cgi?action=getConfig&name=Storage']) {
  const response = await authenticatedFetch(`http://192.168.29.171${path}`, {method: 'GET'}, {username: credential.username, password: credential.password ?? ''}, 4000);
  const body = await response.text();
  console.log(JSON.stringify({path, status: response.status, contentType: response.headers.get('content-type'), body: body.replace(/(?:password|token|secret)\s*=\s*[^\r\n]*/gi, '<redacted>').slice(0, 12000)}));
}
