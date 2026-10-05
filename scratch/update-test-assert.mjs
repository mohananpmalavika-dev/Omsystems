import fs from 'node:fs';

const testFile = 'test/analog-dvr-channels.test.ts';
let content = fs.readFileSync(testFile, 'utf8');

const oldAssert = `    const activeCameras = await store.listCameras("tenant-default");
    const foundCh1 = activeCameras.find((c) => c.name === "CP PLUS DVR - Channel 1" || c.recorderChannel === 1);
    expect(foundCh1).toBeDefined();
    expect(foundCh1!.sourceType).toBe("analog-dvr-channel");`;

const newAssert = `    const camera = await store.getCamera(ch1Approval.json().cameraId);
    expect(camera).toBeDefined();
    expect(camera).toMatchObject({
      name: "CP PLUS DVR - Channel 1",
      channel: 1,
      sourceType: "analog-dvr-channel",
      recorderChannel: 1,
    });`;

if (content.includes(oldAssert)) {
  content = content.replace(oldAssert, newAssert);
  fs.writeFileSync(testFile, content);
  console.log('Updated test assertion in test/analog-dvr-channels.test.ts');
} else {
  console.error('Target assertion not found');
}
