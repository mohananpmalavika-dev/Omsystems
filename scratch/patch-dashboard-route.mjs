import fs from 'fs';

const files = [
  '/app/dashboard/.next/server/app/api/operations/storage/route.js',
  '/app/.next/server/app/api/operations/storage/route.js'
];

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log('Skipping non-existent:', file);
    continue;
  }
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace('["healthy","ok","online"].includes(b)', '["healthy","ok","online","warning"].includes(b)');
  content = content.replace('!["failed","critical","warning","degraded","missing"].includes(c)', '!["failed","critical","missing"].includes(c)');
  content = content.replace('return!!c&&!p(a)&&o(a).startsWith(`${c}:disk:`)', 'return(!p(a)&&(o(a).startsWith(c+":disk:")||(h(a.branchId)&&h(b.branch_id??b.branchId)&&h(a.branchId)===h(b.branch_id??b.branchId))))');
  content = content.replace('c===`${d}:sdcard`||c.startsWith(`camera:${d}:sdcard`)', 'c===d+":sdcard"||c==="camera:"+d+":sdcard"||c.startsWith("camera:"+d+":sdcard")');
  fs.writeFileSync(file, content);
  console.log('Successfully patched:', file);
}
