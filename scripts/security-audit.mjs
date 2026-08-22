#!/usr/bin/env node
import { spawn } from "node:child_process";

// Time-bounded residual risks where npm currently proposes destructive downgrades
// (Next 9 or ExcelJS 3.4) instead of a safe patched dependency path.
const acceptedUntil="2026-08-15";
const acceptedPackages=new Set(["archiver","archiver-utils","brace-expansion","exceljs","glob","minimatch","next","postcss","readdir-glob","rimraf","sharp","uuid","zip-stream"]);
if(Date.now()>Date.parse(`${acceptedUntil}T23:59:59Z`))throw new Error(`Security exception expired on ${acceptedUntil}`);
const executable=process.platform==="win32"?(process.env.ComSpec??"cmd.exe"):"npm";const args=process.platform==="win32"?["/d","/s","/c","npm.cmd audit --omit=dev --json"]:["audit","--omit=dev","--json"];const output=await command(executable,args);const jsonStart=output.indexOf("{");if(jsonStart<0)throw new Error("npm audit did not return JSON");const report=JSON.parse(output.slice(jsonStart));
const blocking=[];const accepted=[];for(const item of Object.values(report.vulnerabilities??{})){if(!["high","critical"].includes(item.severity))continue;if(item.severity==="critical"||!acceptedPackages.has(item.name))blocking.push(`${item.name}:${item.severity}`);else accepted.push(`${item.name}:${item.severity}`);}
console.log(JSON.stringify({total:report.metadata?.vulnerabilities,acceptedUntil,acceptedResidual:accepted,blocking},null,2));if(blocking.length)throw new Error(`Unaccepted high/critical vulnerabilities: ${blocking.join(", ")}`);
function command(file,args){return new Promise((resolvePromise,reject)=>{const child=spawn(file,args,{windowsHide:true,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";child.stdout.on("data",(chunk)=>stdout+=chunk);child.stderr.on("data",(chunk)=>stderr+=chunk);child.on("error",reject);child.on("close",()=>stdout?resolvePromise(stdout):reject(new Error(stderr||"npm audit failed without output")));});}
