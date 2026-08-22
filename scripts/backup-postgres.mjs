#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const databaseUrl=process.env.DATABASE_URL;if(!databaseUrl)throw new Error("DATABASE_URL is required");
const directory=resolve(process.argv[2]??"./backups");await mkdir(directory,{recursive:true});
const stamp=new Date().toISOString().replaceAll(":","").replaceAll("-","").replace(/\.\d{3}Z$/,"Z");const path=resolve(directory,`sentinel-${stamp}.dump`);
await command("pg_dump",["--format=custom","--no-owner","--file",path,databaseUrl]);
const checksum=createHash("sha256").update(await readFile(path)).digest("hex");
const manifest={createdAt:new Date().toISOString(),filename:path.split(/[\\/]/).at(-1),sha256:checksum,format:"postgres-custom",encryptedAtRestRequired:true};
await writeFile(`${path}.manifest.json`,JSON.stringify(manifest,null,2),"utf8");console.log(JSON.stringify(manifest));
function command(executable,args){return new Promise((resolvePromise,reject)=>{const child=spawn(executable,args,{stdio:"inherit",windowsHide:true});child.on("error",reject);child.on("close",(code)=>code===0?resolvePromise():reject(new Error(`${executable} exited with ${code}`)));});}
