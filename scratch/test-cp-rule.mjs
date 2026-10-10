import { execSync } from 'child_process';

const testScript = `
import { analyticsAlertTitle, analyticsAlertDescription, eventDetectionTypes } from '/app/dist/src/analytics/rule-engine.js';

const rule = {
  id: '485522ba-846e-4bbc-9ef0-4958dbafb396',
  name: 'Banking AI - Dual control verification',
  detectionType: 'dual-control-verification'
};

const event = {
  detectionType: 'dual-control-verification',
  metadata: {
    actualPersons: 1,
    requiredPersons: 2
  }
};

console.log('EVENT_TYPES:', JSON.stringify(eventDetectionTypes(event)));
console.log('ALERT_TITLE:', analyticsAlertTitle(rule, event.metadata));
console.log('ALERT_DESC:', analyticsAlertDescription(rule, event.metadata));
`;

const b64 = Buffer.from(testScript, 'utf8').toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
