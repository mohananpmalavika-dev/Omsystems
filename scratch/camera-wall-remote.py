import base64,json,pathlib,subprocess,sys
script=pathlib.Path(sys.argv[1]).read_bytes()
encoded=base64.b64encode(script).decode()
if sys.argv[1].endswith('.cjs'):
 remote='printf %s '+encoded+' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node'
else: remote='printf %s '+encoded+' | base64 -d | bash'
arguments=['gcloud.cmd','compute','ssh','kryptovision-server','--zone=asia-south1-b','--project=project-7866fc3f-5dd5-4495-804','--command='+remote]
if not sys.argv[1].endswith('.cjs'):
 raise SystemExit(subprocess.run(arguments).returncode)
result=subprocess.run(arguments,capture_output=True,text=True)
if result.returncode:print(result.stderr[-2500:]);print(result.stdout[-2500:]);raise SystemExit(result.returncode)
if sys.argv[1].endswith('set-branch-live-limit.cjs'):
 data=json.loads(result.stdout);pathlib.Path('scratch/branch-live-limit-144-backup.json').write_text(json.dumps(data.pop('backup'),indent=2));print(json.dumps(data))
else:print(result.stdout)
