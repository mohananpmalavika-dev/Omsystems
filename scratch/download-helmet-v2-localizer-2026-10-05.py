import requests,pathlib,json,hashlib
repo='zhaocaimiao1029/AI_HELMET'
s=requests.Session()
r=s.get(f'https://api.github.com/repos/{repo}/commits/main',timeout=30)
if r.status_code==404:r=s.get(f'https://api.github.com/repos/{repo}/commits/master',timeout=30)
r.raise_for_status();rev=r.json()['sha']
r=s.get(f'https://api.github.com/repos/{repo}/git/trees/{rev}?recursive=1',timeout=30);r.raise_for_status()
files=[x for x in r.json()['tree'] if x['path'].endswith(('.onnx','LICENSE','README.md'))]
print(json.dumps({'repo':repo,'rev':rev,'files':files}),flush=True)
for row in files:
 if row['path'].endswith('.onnx') or row['path']=='LICENSE':
  r=s.get(f'https://raw.githubusercontent.com/{repo}/{rev}/{row["path"]}',timeout=180);r.raise_for_status()
  p=pathlib.Path('tmp/helmet-localizer-candidates')/('v2-'+pathlib.Path(row['path']).name);p.write_bytes(r.content)
  print(json.dumps({'file':str(p),'bytes':len(r.content),'sha256':hashlib.sha256(r.content).hexdigest()}),flush=True)
