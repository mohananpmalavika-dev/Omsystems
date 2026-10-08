import fs from 'node:fs';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
const stage='tmp/bettiah-walking-fix-20261008',stamp='20261008064447138';
const sources=['analytics-engine/src/detectors/helmet-detector.ts','analytics-engine/src/inference/helmet-head-verification.ts','analytics-engine/src/inference/helmet-head-probe.ts'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceChecks=sources.map(file=>{const before=fs.readFileSync(stage+'/local-source-backup/'+file,'utf8');return{
 file,desired:hash(fs.readFileSync(stage+'/'+file)),allowedPrevious:[hash(Buffer.from(before)),hash(Buffer.from(before.replace(/\r\n/g,'\n'))),hash(Buffer.from(before.replace(/\r?\n/g,'\r\n')))]};});
const runtimeChecks=JSON.parse(fs.readFileSync(stage+'/package/manifest.json','utf8')).files.filter(f=>f.file.startsWith('runtime/'));
const code=`import pathlib,json,hashlib,subprocess,shutil,datetime
root=pathlib.Path('/opt/sentinel-grid');release=root/'presentation-releases/${stamp}'
checks=json.loads('${JSON.stringify(sourceChecks)}');runtime=json.loads('${JSON.stringify(runtimeChecks)}')
node='import fs from "node:fs";import {createHash} from "node:crypto";console.log(JSON.stringify('+json.dumps([{'file':'/app/'+r['file'].removeprefix('runtime/'),'sha256':r['sha256']} for r in runtime])+'.map(r=>({file:r.file,sha256:createHash("sha256").update(fs.readFileSync(r.file)).digest("hex")}))))'
result=subprocess.run(['docker','exec','sentinel-gcp-analytics-engine','node','--input-type=module','-e',node],capture_output=True,text=True,check=True)
actual=json.loads(result.stdout)
for expected,found in zip(runtime,actual):
 if expected['sha256']!=found['sha256']:raise RuntimeError('Concurrent runtime changed; recheck before source reconciliation')
prepared=[]
for entry in checks:
 target=root/entry['file'];candidate=release/'package/source'/entry['file']
 current=target.read_bytes();new=candidate.read_bytes();current_hash=hashlib.sha256(current).hexdigest()
 if hashlib.sha256(new).hexdigest()!=entry['desired']:raise RuntimeError('Pinned candidate mismatch')
 if current_hash==entry['desired']:continue
 if current_hash not in entry['allowedPrevious']:raise RuntimeError('Unreviewed source edit; preserve it: '+entry['file'])
 prepared.append((entry,target,current,new))
for entry,target,current,new in prepared:
 backup=release/'post-concurrent-source-backup'/entry['file'];backup.parent.mkdir(parents=True,exist_ok=True);backup.write_bytes(current)
for entry,target,current,new in prepared:
 if target.read_bytes()!=current:raise RuntimeError('Source changed during reconciliation')
 target.write_bytes(new)
print(json.dumps({'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'updatedSources':[r[0]['file'] for r in prepared],'runtimeUnchanged':True,'release':'${stamp}'},indent=2))
`;
const remote=`echo ${Buffer.from(code).toString('base64')} | base64 -d | sudo python3`;
const command=`gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="${remote}"`;
const result=spawnSync(command,{shell:true,encoding:'utf8',timeout:55000,maxBuffer:1024*1024});
if(result.status===0)fs.writeFileSync('reports/bettiah-walking-source-reconciliation-2026-10-08.json',result.stdout);
process.stdout.write(result.stdout||'');if(result.status!==0){process.stderr.write(result.stderr||String(result.error));process.exitCode=1;}
