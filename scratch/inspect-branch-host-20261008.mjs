import fs from 'node:fs';import {spawnSync} from 'node:child_process';
const code=`import subprocess,json,re,os
units=subprocess.run(['systemctl','list-units','--all','--type=service','--no-pager','--no-legend'],capture_output=True,text=True).stdout.splitlines()
units=[line for line in units if re.search('sentinel|krypton|scanner|edge-agent',line,re.I)]
processes=subprocess.run(['ps','-eo','pid,ppid,comm,args'],capture_output=True,text=True).stdout.splitlines()
processes=[re.sub(r'(?i)(token|password|secret|api[-_]?key|activation[-_]?code)(\\s*[:=]\\s*|\\s+)([^\\s]+)',r'\\1\\2[redacted]',line) for line in processes if re.search('edge-agent|scanner|branch-agent',line,re.I) or (len(line.split())>2 and line.split()[2]=='node')]
entries=[]
for directory in ['/opt','/opt/sentinel-grid','/opt/sentinel-grid/edge-agent','/etc/systemd/system']:
 if os.path.isdir(directory):entries.append({'directory':directory,'names':[n for n in os.listdir(directory) if directory=='/opt' or directory=='/opt/sentinel-grid' or re.search('edge|sentinel|scanner|krypton|agent|config',n,re.I)]})
runtime=[]
for directory,children,files in os.walk('/opt/sentinel-grid/edge-runtime'):
 children[:]=[n for n in children if n not in ['node_modules','.git']]
 if directory.count('/')>7:children[:]=[]
 runtime.append({'directory':directory,'directories':children,'files':[n for n in files if re.search('env|pid|log|sh$|json$',n,re.I)]})
 if len(runtime)>65:break
print(json.dumps({'units':units,'processes':processes,'runtime':runtime},indent=2))
`;
const remote=`echo ${Buffer.from(code).toString('base64')} | base64 -d | sudo python3`;
const command=`gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="${remote}"`;
const result=spawnSync(command,{shell:true,encoding:'utf8',timeout:55000,maxBuffer:1024*1024});
if(result.status===0)fs.writeFileSync('reports/bettiah-branch-host-diagnostic-2026-10-08.json',result.stdout);
process.stdout.write(result.stdout||'');if(result.status!==0){process.stderr.write(result.stderr||String(result.error));process.exitCode=1;}
