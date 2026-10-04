const {execFileSync} = require('node:child_process');
const {gzipSync} = require('node:zlib');
const {chromium} = require('playwright');
const base = 'https://34-14-220-41.sslip.io';
function remote(script) {
  const command = 'printf %s ' + gzipSync(Buffer.from(script)).toString('base64') + ' | base64 -d | gzip -d | bash';
  // Capture the temporary credential in memory; do not log it or write it to disk.
  return execFileSync('python', ['-X','utf8','-c', "import subprocess,sys; r=subprocess.run(['gcloud.cmd','compute','ssh','kryptovision-server','--zone=asia-south1-b','--project=project-7866fc3f-5dd5-4495-804','--quiet','--command='+sys.argv[1]],capture_output=True,text=True);sys.stdout.write(r.stdout);sys.stderr.write(r.stderr);sys.exit(r.returncode)",command], {encoding:'utf8', timeout:60000});
}
(async () => {
  let auth, browser;
  try {
    auth = JSON.parse(remote(`sudo docker exec -i sentinel-gcp-control-plane node <<'JS'
const {randomBytes,createHash}=require('node:crypto');const {Pool}=require('pg');
(async()=>{const p=new Pool({connectionString:process.env.DATABASE_URL});try{
const u=(await p.query("SELECT id,tenant_id FROM users WHERE username='mgdhanyamohan'")).rows[0];
const id=randomBytes(16).toString('hex'), token=randomBytes(64).toString('base64url');
const hash=v=>createHash('sha256').update(v).digest('base64');
await p.query('INSERT INTO user_sessions (id,user_id,tenant_id,access_token_hash,refresh_token_hash,access_expires_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$6)',[id,u.id,u.tenant_id,hash(token),hash(randomBytes(64).toString('base64url')),new Date(Date.now()+300000)]);
console.log(JSON.stringify({id,token}));}finally{await p.end();}})().catch(()=>process.exit(1));
JS`));
    browser = await chromium.launch({headless:true});
    const context = await browser.newContext({ignoreHTTPSErrors:true});
    await context.addCookies([{name:'sentinel_access',value:auth.token,url:base,httpOnly:true,secure:true,sameSite:'Lax'}]);
    const page = await context.newPage();
    const failures=[];
    page.on('pageerror', e => failures.push(e.message));
    const to=new Date(Date.now()-60000).toISOString(), from=new Date(Date.now()-24*3600000).toISOString();
    await page.goto(base+'/recordings?branchId=00000000-0000-4000-8000-000000000104&cameraId=fa884a52-2378-4981-9c09-4620c12a9de5&from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to), {timeout:60000});
    await page.getByRole('button',{name:'Search recordings',exact:true}).click({timeout:30000});
    const clips = page.locator('[aria-label="Camera and recorder storage"] .segment-row');
    await clips.first().waitFor({timeout:60000});
    console.log('LIVE_SEARCH',JSON.stringify({camera:await page.getByLabel('Camera',{exact:true}).inputValue(),clipCount:await clips.count(),rangeHours:24}));
    await clips.first().click();
    const video = page.locator('[aria-label="Camera and recorder storage"] video');
    await video.waitFor({timeout:60000});
    await video.evaluate(v => v.play().catch(()=>{}));
    await page.waitForFunction(()=>{const v=document.querySelector('[aria-label="Camera and recorder storage"] video');return v&&v.videoWidth>0&&v.currentTime>2;}, undefined, {timeout:60000});
    console.log('LIVE_PLAYBACK',JSON.stringify(await video.evaluate(v=>({width:v.videoWidth,height:v.videoHeight,currentTime:v.currentTime,readyState:v.readyState,decodedFrames:v.getVideoPlaybackQuality().totalVideoFrames}))));
    if(failures.length) throw new Error('Browser errors: '+failures.join('; '));
    const released=page.waitForResponse(r=>r.request().method()==='DELETE'&&r.url().includes('/v1/live/'),{timeout:15000});
    await page.getByLabel('Camera',{exact:true}).selectOption({label:'CP PLUS DVR - Channel 8'});
    console.log('LIVE_CLEANUP',JSON.stringify({status:(await released).status(),videoRemoved:await video.count()===0}));
  } finally {
    await browser?.close();
    if(auth) remote(`sudo docker exec -i sentinel-gcp-control-plane node <<'JS'
const {Pool}=require('pg');(async()=>{const p=new Pool({connectionString:process.env.DATABASE_URL});try{await p.query('DELETE FROM user_sessions WHERE id=$1',['${auth.id}']);console.log('Diagnostic session removed');}finally{await p.end();}})().catch(()=>process.exit(1));
JS`);
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
