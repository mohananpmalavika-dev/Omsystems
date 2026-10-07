import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request

repo = 'Xenova/clip-vit-base-patch32'
stage = Path('tmp/helmet-clip-candidate-20261007')
stage.mkdir(parents=True, exist_ok=True)
with urllib.request.urlopen('https://huggingface.co/api/models/' + repo, timeout=45) as response:
    info = json.load(response)
revision = info['sha']
with urllib.request.urlopen(f'https://huggingface.co/api/models/{repo}/tree/{revision}/onnx', timeout=45) as response:
    rows = json.load(response)
selected = [next(r for r in rows if r['path'] == 'onnx/' + name) for name in
            ['vision_model_quantized.onnx', 'text_model_quantized.onnx']]

def download(row):
    name = Path(row['path']).name
    target = stage / name
    expected = row['lfs']['oid']
    source = f'https://huggingface.co/{repo}/resolve/{revision}/{row["path"]}'
    if not target.exists():
        with urllib.request.urlopen(source, timeout=180) as response:
            target.write_bytes(response.read())
    actual = hashlib.sha256(target.read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError('Checksum mismatch: ' + name)
    return {'name': name, 'source': source, 'sha256': actual, 'bytes': target.stat().st_size}

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    artifacts = list(pool.map(download, selected))
for name in ['tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'preprocessor_config.json', 'config.json']:
    with urllib.request.urlopen(f'https://huggingface.co/{repo}/resolve/{revision}/{name}', timeout=45) as response:
        (stage / name).write_bytes(response.read())
provenance = {'repo': repo, 'revision': revision, 'artifacts': artifacts,
              'baseModel': 'openai/clip-vit-base-patch32', 'sourceProject': 'https://github.com/openai/CLIP', 'license': 'MIT'}
(stage / 'provenance.json').write_text(json.dumps(provenance, indent=2), encoding='utf-8')
print(json.dumps(provenance), flush=True)
