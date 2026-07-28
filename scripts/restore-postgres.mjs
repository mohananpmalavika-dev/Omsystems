#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

if(!process.argv.includes("--confirm-restore"))throw new Error("Restore is destructive. Re-run with --confirm-restore after validating the target database.");
const backupArg=process.argv.find((item)=>item.endsWith(".dump"));if(!backupArg)throw new Error("Supply the .dump backup path");
const target=process.env.RESTORE_DATABASE_URL;if(!target)throw new Error("RESTORE_DATABASE_URL is required; DATABASE_URL is intentionally ignored");
const backup=resolve(backupArg);const manifest=JSON.parse(await readFile(`${backup}.manifest.json`,"utf8"));const checksum=createHash("sha256").update(await readFile(backup)).digest("hex");if(checksum!==manifest.sha256)throw new Error("Backup checksum mismatch");
await command("pg_restore",["--clean","--if-exists","--no-owner","--dbname",target,backup]);console.log(JSON.stringify({restoredAt:new Date().toISOString(),backup:manifest.filename,sha256:checksum,targetVerified:true}));
function command(executable,args){return new Promise((resolvePromise,reject)=>{const child=spawn(executable,args,{stdio:"inherit",windowsHide:true});child.on("error",reject);child.on("close",(code)=>code===0?resolvePromise():reject(new Error(`${executable} exited with ${code}`)));});}
