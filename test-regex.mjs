// Test if the heartbeat URL matches the regex

const url = '/v1/edge-agents/6a570d4a-2c71-415f-b59a-643cf50d55c5/heartbeat';
const method = 'POST';

const path = url.split("?", 1)[0] ?? url;
const regex = /^\/v1\/edge-agents\/[^/]+\/heartbeat$/;

console.log('Testing URL:', url);
console.log('Method:', method);
console.log('Path:', path);
console.log('Regex:', regex);
console.log('Match:', regex.test(path));

// Also test the actual function logic
function isEdgeAgentIngressRoute(method, url) {
  const path = url.split("?", 1)[0] ?? url;
  if (method === "POST" && /^\/v1\/edge-agents\/[^/]+\/heartbeat$/.test(path)) return true;
  if (method === "GET" && /^\/v1\/edge-agents\/[^/]+\/cameras\/monitoring$/.test(path)) return true;
  if (method === "POST" && /^\/v1\/edge-agents\/[^/]+\/live-sessions\/consume$/.test(path)) return true;
  if (method === "GET" && /^\/v1\/edge-agents\/[^/]+\/scan-jobs\/next$/.test(path)) return true;
  if (method === "POST" && /^\/v1\/edge-agents\/[^/]+\/scan-jobs\/[^/]+\/complete$/.test(path)) return true;
  if (method === "POST" && /^\/v1\/edge-agents\/[^/]+\/(?:telemetry|recorder-hdd|recorder-archive)$/.test(path)) return true;
  return method === "POST" && /^\/v1\/branches\/[^/]+\/cameras\/discovered$/.test(path);
}

console.log('\nisEdgeAgentIngressRoute result:', isEdgeAgentIngressRoute(method, url));
