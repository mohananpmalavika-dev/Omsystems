import json
import subprocess
import urllib.request

# Get frame from redis
cmd = "sudo docker exec sentinel-gcp-redis redis-cli -a SentinelGridRedisMaster2026 get 'analytics:latest-frame:172e5dd2-6c2e-4946-b0a3-8f40b85d7319'"
output = subprocess.check_output(cmd, shell=True).decode('utf-8', errors='ignore')
lines = [l for l in output.split('\n') if l.strip().startswith('{')]
if not lines:
    print('Failed to find JSON in redis output:', output[:200])
    exit(1)
data = json.loads(lines[0])
print('Got frame captured at:', data.get('capturedAt'), 'imageBase64 len:', len(data.get('imageBase64', '')))

payload = {
    'tenantId': '00000000-0000-4000-8000-000000000001',
    'cameraId': '172e5dd2-6c2e-4946-b0a3-8f40b85d7319',
    'capturedAt': data['capturedAt'],
    'width': 640,
    'height': 360,
    'imageBase64': data['imageBase64'],
    'rules': [{
        'id': '5b3b397a-0f2a-4754-a54d-7cb4d9e027e9',
        'cameraId': '172e5dd2-6c2e-4946-b0a3-8f40b85d7319',
        'name': 'AI - Helmet worn inside bank',
        'detectionType': 'helmet-worn',
        'enabled': True,
        'minConfidence': 0.70,
        'minDurationSeconds': 1,
        'cooldownSeconds': 60,
        'severity': 'P2',
        'objectClasses': ['helmet', 'person']
    }],
    'metadata': {'branchId': '00000000-0000-4000-8000-000000000001'}
}

req = urllib.request.Request(
    'http://localhost:8092/internal/frames',
    data=json.dumps(payload).encode('utf-8'),
    headers={
        'content-type': 'application/json',
        'x-analytics-source-key': '10bcf3c15292e4a76522e6c2b73644cd0f480e57fc67ab293ec60ac5c6a82844'
    }
)

try:
    with urllib.request.urlopen(req) as resp:
        print('HTTP status:', resp.status)
        print('Response:', resp.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('HTTP error:', e.code)
    print('Response:', e.read().decode('utf-8'))
except Exception as e:
    print('Exception:', str(e))
