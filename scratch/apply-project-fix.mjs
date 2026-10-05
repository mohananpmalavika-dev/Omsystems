import fs from 'node:fs';

// 1. src/database/device-identity-repository.ts
let devRepo = fs.readFileSync('src/database/device-identity-repository.ts', 'utf8');
const targetDevRepo = `           AND (\r\n             COALESCE(identity.model, '') ~* '(dvr|nvr|xvr|uvr|recorder|multi[- ]?channel)'\r\n             OR COALESCE(camera.model, '') ~* '(dvr|nvr|xvr|uvr|recorder|multi[- ]?channel)'\r\n           )`;
const replaceDevRepo = `           AND (\r\n             COALESCE(identity.model, '') ~* '(dvr|nvr|xvr|uvr|recorder|multi[- ]?channel|ip camera|generic)'\r\n             OR COALESCE(camera.model, '') ~* '(dvr|nvr|xvr|uvr|recorder|multi[- ]?channel|ip camera|generic)'\r\n             OR identity.channel IS NULL\r\n             OR identity.channel = 1\r\n           )`;

if (devRepo.includes(targetDevRepo)) {
  devRepo = devRepo.replace(targetDevRepo, replaceDevRepo);
  fs.writeFileSync('src/database/device-identity-repository.ts', devRepo);
  console.log('Updated src/database/device-identity-repository.ts');
} else {
  console.warn('Target not found in src/database/device-identity-repository.ts');
}

// 2. src/database/camera-repository.ts
let camRepo = fs.readFileSync('src/database/camera-repository.ts', 'utf8');
const targetCamRepo = `source.identity_last_seen_at, source.device_identity_id],\r\n    );\r\n    await this.deviceIdentities.linkCamera(\r\n      client,\r\n      source.device_identity_id,\r\n      cameraId,\r\n      input.connectionSecretRef,\r\n    );`;
const replaceCamRepo = `source.identity_last_seen_at, source.device_identity_id],\r\n    );\r\n    await client.query(\r\n      \`UPDATE resource_nodes\r\n       SET name = COALESCE($2, name), is_active = true, lifecycle_status = 'ACTIVE', updated_at = now()\r\n       WHERE id = (SELECT resource_node_id FROM cameras WHERE id = $1::uuid)\`,\r\n      [cameraId, input.name ?? source.model ?? null],\r\n    );\r\n    await this.deviceIdentities.linkCamera(\r\n      client,\r\n      source.device_identity_id,\r\n      cameraId,\r\n      input.connectionSecretRef,\r\n    );`;

if (camRepo.includes(targetCamRepo)) {
  camRepo = camRepo.replace(targetCamRepo, replaceCamRepo);
  fs.writeFileSync('src/database/camera-repository.ts', camRepo);
  console.log('Updated src/database/camera-repository.ts');
} else {
  console.warn('Target not found in src/database/camera-repository.ts');
}
