import subprocess
import json
import urllib.request
import urllib.error

try:
    redis_cmd = ["sudo", "docker", "exec", "sentinel-gcp-redis", "redis-cli", "-a", "SentinelGridRedisMaster2026", "get", "analytics:latest-frame:99455d3a-3411-43ad-b756-84a4ae17c026"]
    raw = subprocess.check_output(redis_cmd).decode('utf-8', errors='ignore')
    lines = [l for l in raw.strip().split('\n') if l.startswith('{')]
    if not lines:
        print("No JSON found in redis output:", raw[:200])
        exit(1)
    data = json.loads(lines[0])

    print("Frame capturedAt:", data.get("capturedAt"))
    img_b64 = data.get("imageBase64", "")
    print("Base64 length:", len(img_b64))

    payload = {
        "tenantId": "00000000-0000-0000-0000-000000000001",
        "cameraId": "99455d3a-3411-43ad-b756-84a4ae17c026",
        "capturedAt": data.get("capturedAt"),
        "width": 640,
        "height": 360,
        "imageBase64": img_b64,
        "rules": [{
            "id": "289c5a0d-df6d-41fa-a857-83634d773f19",
            "cameraId": "99455d3a-3411-43ad-b756-84a4ae17c026",
            "name": "AI - Helmet worn inside bank",
            "detectionType": "helmet-worn",
            "enabled": True,
            "minConfidence": 0.65,
            "cooldownSeconds": 20
        }]
    }

    req = urllib.request.Request(
        "http://localhost:8092/internal/frames",
        data=json.dumps(payload).encode('utf-8'),
        headers={
            "Content-Type": "application/json",
            "x-analytics-source-key": "10bcf3c15292e4a76522e6c2b73644cd0f480e57fc67ab293ec60ac5c6a82844"
        }
    )
    with urllib.request.urlopen(req) as resp:
        print("Status:", resp.status)
        print("Body:", resp.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print("HTTPError Code:", e.code)
    print("HTTPError Body:", e.read().decode('utf-8'))
except Exception as e:
    print("General Error:", e)
