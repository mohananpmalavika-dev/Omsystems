import pathlib,requests,hashlib,json
source='https://huggingface.co/vivekvar/helmet-v5/resolve/4ea2eb67301722073555448b477178330e40f7d1/models/'
stage=pathlib.Path('tmp/helmet-localizer-candidates')
for variant in ['v5','v5b','v5c']:
 for suffix in ['.onnx','.onnx.data']:
  name=f'helmet_{variant}{suffix}'
  r=requests.get(source+name,timeout=120);r.raise_for_status();(stage/name).write_bytes(r.content)
  print(json.dumps({'file':name,'bytes':len(r.content),'sha256':hashlib.sha256(r.content).hexdigest()}),flush=True)
