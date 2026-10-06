set -eu
sudo docker logs --since 10m sentinel-gcp-analytics-engine 2>&1 | sudo docker exec -i sentinel-gcp-control-plane node -e '
let raw="";process.stdin.on("data",c=>raw+=c);process.stdin.on("end",()=>{
const output=[];for(const line of raw.split("\n")){let v;try{v=JSON.parse(line);}catch{continue;}
if(v.err||v.error||v.stack||v.level>=50||v.res?.statusCode>=500)output.push({time:v.time,msg:v.msg,status:v.res?.statusCode,type:v.err?.type??v.error?.type??v.type,message:v.err?.message??v.error?.message??v.message,stack:(v.err?.stack??v.error?.stack??v.stack)?.split("\n").slice(0,7).join("\n")});}
console.log("ANALYTICS_ERRORS",JSON.stringify(output.slice(-20)));
const disposed=Array.from(raw.matchAll(/"message"\s*:\s*"(Session already disposed\.)"/g),m=>m[1]);
console.log("SESSION_EXCEPTIONS",JSON.stringify({count:disposed.length,messages:[...new Set(disposed)]}));
console.log("MODEL_LIFECYCLE",JSON.stringify(raw.split("\n").filter(line=>line.length<500&&/Auto-unloading idle model:|Unloading model:/.test(line)).slice(-20)));});'
