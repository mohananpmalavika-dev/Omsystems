import hashlib
import json
from pathlib import Path
import urllib.request

revision = '4ea2eb67301722073555448b477178330e40f7d1'
stage = Path('tmp/helmet-head-v2-20261007')
stage.mkdir(parents=True, exist_ok=True)
api = f'https://huggingface.co/api/models/vivekvar/helmet-v5/tree/{revision}/models'
with urllib.request.urlopen(api, timeout=45) as response:
    rows = json.load(response)
row = next(r for r in rows if r['path'] == 'models/helmet_head_v2.pt')
expected = row['lfs']['oid']
target = stage / 'helmet_head_v2.pt'
source = f'https://huggingface.co/vivekvar/helmet-v5/resolve/{revision}/models/helmet_head_v2.pt'
if not target.exists():
    with urllib.request.urlopen(source, timeout=90) as response:
        target.write_bytes(response.read())
actual = hashlib.sha256(target.read_bytes()).hexdigest()
if actual != expected:
    raise ValueError('Downloaded checkpoint checksum mismatch')
provenance = {'source': source, 'revision': revision, 'sha256': actual, 'bytes': target.stat().st_size,
              'license': 'Apache-2.0', 'preprocessor': 'imagenet-zero-letterbox',
              'labels': ['wearing_helmet', 'unwearing_helmet']}
(stage / 'provenance.json').write_text(json.dumps(provenance, indent=2), encoding='utf-8')
print(json.dumps(provenance))
