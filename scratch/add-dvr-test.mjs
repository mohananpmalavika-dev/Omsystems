import fs from 'node:fs';

const testFile = 'test/analog-dvr-channels.test.ts';
let content = fs.readFileSync(testFile, 'utf8');

const marker = '  async function approve(discoveryId: string, name: string) {';
const newTest = `  it("upgrades a pre-existing generic IP camera placeholder into DVR Channel 1 without dropping or rejecting channel 1", async () => {
    // 1. Edge agent discovers generic IP camera on the DVR IP first
    const generic = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras/discovered",
      headers: admin,
      payload: {
        edgeAgentId: agentId,
        discoveryMethod: "onvif-probe",
        vendor: "other",
        manufacturer: "Generic RTSP",
        model: "IP Camera",
        ipAddress: "192.168.20.10",
        onvifPort: 80,
        rtspPort: 554,
        profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
        capabilities: { ptz: false, audio: false, events: true },
        displayName: "Generic RTSP camera 192.168.20.10",
        streamVerified: true,
        rtspValidated: true,
        duplicateStatus: "unique",
        compatibilityStatus: "compatible",
        sourceType: "ip-camera",
      },
    });
    expect(generic.statusCode).toBe(202);
    const genericApproval = await approve(generic.json().id, "Generic Camera");
    expect(genericApproval.statusCode).toBe(200);

    // 2. Later, authenticated DVR scan discovers Channel 1
    const ch1 = await submitChannel(1, "CP PLUS DVR - Channel 1");
    expect(ch1.statusCode).toBe(202);
    expect(ch1.json().status).not.toBe("rejected");
    expect(ch1.json().statusReason).toBe("recorder_placeholder_upgrade");

    // 3. Approving channel 1 upgrades the camera in place and keeps it listed
    const ch1Approval = await approve(ch1.json().id, "CP PLUS DVR - Channel 1");
    expect(ch1Approval.statusCode).toBe(200);

    const activeCameras = await store.listCameras("tenant-default");
    const foundCh1 = activeCameras.find((c) => c.name === "CP PLUS DVR - Channel 1" || c.recorderChannel === 1);
    expect(foundCh1).toBeDefined();
    expect(foundCh1!.sourceType).toBe("analog-dvr-channel");
  });

` + marker;

if (content.includes(marker)) {
  content = content.replace(marker, newTest);
  fs.writeFileSync(testFile, content);
  console.log('Added test to test/analog-dvr-channels.test.ts');
} else {
  console.error('Marker not found');
}
