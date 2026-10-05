import hashlib
import json
import pathlib
import requests
revision='4ea2eb67301722073555448b477178330e40f7d1'
repo='vivekvar/helmet-v5'
base=f'https://huggingface.co/{repo}/resolve/{revision}/'
data=json.loads(pathlib.Path('tmp/helmet-model-vivekvar-helmet-v5.json').read_text())
print('Artifacts:',[x['rfilename'] for x in data['siblings'] if x['rfilename'].startswith('models/helmet')])
for file in ['backend/inference/stage2.py','tools/train_helmet_v5.py','tools/train_head_classifier.py','backend/inference/pipeline.py']:
    response=requests.get(base+file,timeout=30);response.raise_for_status()
    target=pathlib.Path('tmp/helmet-upstream-'+pathlib.PurePosixPath(file).name)
    target.write_text(response.text,encoding='utf-8')
    print(file,hashlib.sha256(response.content).hexdigest())
for repo in ['vivekvar/helmet-v5','2vhoc/helmet-detection-traffic']:
    response=requests.get(f'https://huggingface.co/api/models/{repo}/tree/main?recursive=true',timeout=30);response.raise_for_status()
    rows=response.json()
    print('MODEL_FILES',json.dumps([x for x in rows if x.get('path','').endswith(('.onnx','.onnx.data')) and ('helmet' in x['path'] or 'stage2' in x['path'])]))
