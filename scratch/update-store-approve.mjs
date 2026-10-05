import fs from 'node:fs';

const storeFile = 'src/store.ts';
let content = fs.readFileSync(storeFile, 'utf8');

const target = `    if (resolvedIdentity.cameraId) {
      const existingCamera = this.cameras.get(resolvedIdentity.cameraId);
      if (!existingCamera) throw new Error("identity_camera_not_found");
      Object.assign(existingCamera, clean({`;

const replacement = `    if (resolvedIdentity.cameraId) {
      const existingCamera = this.cameras.get(resolvedIdentity.cameraId);
      if (!existingCamera) throw new Error("identity_camera_not_found");
      if (input.name) {
        existingCamera.name = input.name;
        const node = this.nodes.get(existingCamera.nodeId);
        if (node) {
          node.name = input.name;
          node.isActive = true;
        }
      }
      Object.assign(existingCamera, clean({`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(storeFile, content);
  console.log('Updated approveCamera in src/store.ts');
} else {
  console.error('Target not found in src/store.ts');
}
