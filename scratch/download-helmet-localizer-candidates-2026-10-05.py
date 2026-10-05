import hashlib
import json
import pathlib
import requests

stage=pathlib.Path('tmp/helmet-localizer-candidates')
stage.mkdir(exist_ok=True)
session=requests.Session()
repo='Pooja-Vachhad/Helmet_Detection'
response=session.get(f'https://api.github.com/repos/{repo}/commits/main',timeout=30);response.raise_for_status()
revision=response.json()['sha']
tree=session.get(f'https://api.github.com/repos/{repo}/git/trees/{revision}?recursive=1',timeout=30);tree.raise_for_status()
print(json.dumps({'repo':repo,'revision':revision,'files':[x for x in tree.json()['tree'] if x['path'].endswith(('.onnx','LICENSE'))]}),flush=True)
for filename in ['LICENSE','best.onnx']:
    response=session.get(f'https://raw.githubusercontent.com/{repo}/{revision}/{filename}',timeout=90);response.raise_for_status()
    (stage/('pooja-'+filename)).write_bytes(response.content)
    print(filename,len(response.content),hashlib.sha256(response.content).hexdigest(),flush=True)
(stage/'pooja-provenance.json').write_text(json.dumps({'repo':repo,'revision':revision},indent=2))
