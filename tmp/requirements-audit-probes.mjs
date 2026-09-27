import fs from 'node:fs';
import { NotificationOutbox } from '../src/notifications/infrastructure/outbox/notification-outbox.ts';
import { NotificationWorker } from '../src/notifications/infrastructure/worker/notification-worker.ts';
import { NotificationProviderRegistry } from '../src/notifications/infrastructure/providers/notification-provider.interface.ts';
import { VoiceNotificationProvider } from '../src/notifications/infrastructure/providers/voice.provider.ts';
// Local memory only: no provider transport, device access or external notifications.
const outbox=new NotificationOutbox();
const providers=new NotificationProviderRegistry();
providers.register({channel:'email',async send(){return {accepted:false,provider:'audit-unconfigured',state:'FAILED',error:'PROVIDER_NOT_CONFIGURED'};}});
const job=await outbox.enqueue({tenantId:'audit',alertId:'audit-local',channel:'email',priority:'P1',recipientId:'audit',recipientName:'Audit',destination:'audit@example.invalid',payload:{text:'Local audit fixture'},maxAttempts:3,idempotencyKey:'audit-local:email'});
const worker=new NotificationWorker(outbox,providers);
const claimed=(await outbox.claimPending(1))[0];
const workerReportedSuccess=await worker.processJob(claimed);
const saved=await outbox.getJobById(job.id);
const voice=new VoiceNotificationProvider();
const voiceResult=await voice.send({...job,channel:'voice',destination:'AUDIT-NO-NUMBER'});
const report={localOnly:true,rejectedEmail:{providerAccepted:false,providerState:'FAILED',workerReportedSuccess,savedStatus:saved?.status},defaultVoice:{accepted:voiceResult.accepted,state:voiceResult.state,provider:voiceResult.provider,generatedCallId:voiceResult.providerMessageId},voiceHealth:await voice.healthCheck()};
fs.writeFileSync('reports/customer-requirements-audit-probes.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
