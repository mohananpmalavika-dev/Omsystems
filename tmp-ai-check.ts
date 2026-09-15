import { buildApp } from './src/app.ts';

async function main() {
  const app = await buildApp();
  await app.ready();
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/ai/events',
    payload: {
      eventId: 'evt-rest-1',
      tenantId: 'bank-corp',
      branchId: 'branch-178',
      cameraId: 'cam-178-01',
      vendorSource: 'YOLO_V8',
      rawEventType: 'violence',
      timestamp: new Date().toISOString(),
    },
  });
  console.log('STATUS', res.statusCode);
  console.log(res.body);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
