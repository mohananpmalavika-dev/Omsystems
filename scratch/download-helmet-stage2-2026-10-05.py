import hashlib,json,pathlib,requests
repo='2vhoc/helmet-detection-traffic'
revision='7e46b9388b05c497ed776026108b5ee7f08f0a41'
stage=pathlib.Path('tmp/helmet-localizer-candidates')
for remote,local in [('stage2/mu_bien_so_stage2.onnx','traffic-stage2.onnx'),('README.md','traffic-README.md'),('stage2/args.yaml','traffic-args.yaml')]:
    response=requests.get(f'https://huggingface.co/{repo}/resolve/{revision}/{remote}',timeout=180)
    response.raise_for_status()
    (stage/local).write_bytes(response.content)
    print(json.dumps({'file':local,'bytes':len(response.content),'sha256':hashlib.sha256(response.content).hexdigest()}),flush=True)
