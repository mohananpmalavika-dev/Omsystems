import fs from 'node:fs';

// 1. Patch camera-repository.js
const repoPath = '/app/dist/src/database/camera-repository.js';
if (fs.existsSync(repoPath)) {
  let content = fs.readFileSync(repoPath, 'utf8');
  let changed = false;

  const target1 = '...(row.ip_address ? { ipAddress: row.ip_address } : {}),';
  const replace1 = '...(row.ip_address ? { ipAddress: String(row.ip_address).replace(/\\/\\d+$/, "").trim() } : {}),';
  if (content.includes(target1)) {
    content = content.replace(target1, replace1);
    changed = true;
    console.log('PATCHED: camera-repository.js (row.ip_address)');
  }

  const target2 = 'cameras.connection_transport, cameras.ip_address::text,';
  const replace2 = 'cameras.connection_transport, host(cameras.ip_address) AS ip_address,';
  if (content.includes(target2)) {
    content = content.replace(target2, replace2);
    changed = true;
    console.log('PATCHED: camera-repository.js (host(cameras.ip_address))');
  }

  if (changed) {
    fs.writeFileSync(repoPath, content, 'utf8');
  } else {
    console.log('camera-repository.js already patched or target not found');
  }
} else {
  console.error('File not found:', repoPath);
}

// 2. Patch app.js
const appPath = '/app/dist/src/app.js';
if (fs.existsSync(appPath)) {
  let content = fs.readFileSync(appPath, 'utf8');
  let changed = false;

  const targetApp = '...(camera.ipAddress ? { ipAddress: camera.ipAddress } : {}),';
  const replaceApp = '...(camera.ipAddress ? { ipAddress: String(camera.ipAddress).replace(/\\/\\d+$/, "").trim() } : {}),';
  if (content.includes(targetApp)) {
    content = content.replace(targetApp, replaceApp);
    changed = true;
    console.log('PATCHED: app.js (camera.ipAddress in monitoring)');
  }

  if (changed) {
    fs.writeFileSync(appPath, content, 'utf8');
  } else {
    console.log('app.js already patched or target not found');
  }
} else {
  console.error('File not found:', appPath);
}
