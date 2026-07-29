# Report Email Delivery Integration

## Overview

Automated email delivery for operational reports with attachment support, HTML templates, and delivery tracking.

## Current Implementation

### Email Webhook Architecture

Reports use a **webhook-based email provider** for delivery, allowing integration with any email service (SendGrid, AWS SES, Mailgun, SMTP relay, etc.).

**Advantages**:
- ✅ Provider-agnostic (works with any email API)
- ✅ No vendor lock-in
- ✅ Easy to swap providers
- ✅ Supports corporate SMTP servers

**File**: `src/reporting/worker.ts`

```typescript
// Email delivery via webhook
const emailResponse = await fetch(emailWebhookUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${emailWebhookToken}`
  },
  body: JSON.stringify({
    to: recipient.email,
    subject: `${reportName} - ${dateStr}`,
    attachments: artifacts.map(artifact => ({
      filename: artifact.filename,
      content: artifact.base64Content,
      contentType: artifact.contentType
    })),
    html: emailTemplate,
    text: emailTextVersion
  })
});
```

## Setup Instructions

### Option 1: SendGrid (Recommended for Production)

**Step 1: Create SendGrid Account**
- Sign up at https://sendgrid.com/
- Verify sender domain
- Generate API key

**Step 2: Deploy Webhook Adapter**

```typescript
// email-webhook/sendgrid-adapter.ts
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export default async function handler(req: Request) {
  const { to, subject, attachments, html, text } = await req.json();
  
  const msg = {
    to,
    from: process.env.FROM_EMAIL!, // verified sender
    subject,
    text,
    html,
    attachments: attachments.map((att: any) => ({
      content: att.content,
      filename: att.filename,
      type: att.contentType,
      disposition: 'attachment'
    }))
  };
  
  await sgMail.send(msg);
  
  return Response.json({ success: true, messageId: 'sg-' + Date.now() });
}
```

**Step 3: Configure Environment**

```bash
# .env
EMAIL_WEBHOOK_URL=https://your-domain.com/api/email/sendgrid
EMAIL_WEBHOOK_TOKEN=your-secure-token
FROM_EMAIL=reports@yourcompany.com
FROM_NAME="Surveillance Reports"
```

**Cost**: Free for 100 emails/day, $14.95/month for 50,000 emails

---

### Option 2: AWS SES (Cost-Effective for High Volume)

**Step 1: Enable AWS SES**
```bash
aws ses verify-email-identity --email-address reports@yourcompany.com
```

**Step 2: Deploy Lambda Function**

```typescript
// email-webhook/aws-ses-adapter.ts
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({ region: process.env.AWS_REGION });

export default async function handler(req: Request) {
  const { to, subject, attachments, html, text } = await req.json();
  
  // Build MIME message with attachments
  const rawMessage = buildMimeMessage(to, subject, html, text, attachments);
  
  const command = new SendRawEmailCommand({
    RawMessage: { Data: Buffer.from(rawMessage) }
  });
  
  const response = await ses.send(command);
  
  return Response.json({ success: true, messageId: response.MessageId });
}
```

**Step 3: Configure**

```bash
# .env
EMAIL_WEBHOOK_URL=https://your-api-gateway.amazonaws.com/email
EMAIL_WEBHOOK_TOKEN=your-api-key
AWS_REGION=us-east-1
FROM_EMAIL=reports@yourcompany.com
```

**Cost**: $0.10 per 1,000 emails (very cost-effective)

---

### Option 3: Corporate SMTP Server

**Step 1: Deploy SMTP Relay**

```typescript
// email-webhook/smtp-adapter.ts
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

export default async function handler(req: Request) {
  const { to, subject, attachments, html, text } = await req.json();
  
  const info = await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to,
    subject,
    text,
    html,
    attachments: attachments.map((att: any) => ({
      filename: att.filename,
      content: Buffer.from(att.content, 'base64'),
      contentType: att.contentType
    }))
  });
  
  return Response.json({ success: true, messageId: info.messageId });
}
```

**Step 2: Configure**

```bash
# .env
EMAIL_WEBHOOK_URL=http://internal-smtp-relay:3000/send
EMAIL_WEBHOOK_TOKEN=internal-auth-token
SMTP_HOST=smtp.company.internal
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=reports@company.com
SMTP_PASS=smtp-password
FROM_EMAIL=reports@company.com
```

**Cost**: Free (uses existing corporate infrastructure)

---

### Option 4: Mailgun

**Quick Setup**:
```bash
# .env
EMAIL_WEBHOOK_URL=https://api.mailgun.net/v3/YOUR_DOMAIN/messages
EMAIL_WEBHOOK_TOKEN=YOUR_MAILGUN_API_KEY
FROM_EMAIL=reports@yourcompany.com
```

**Cost**: Free for 5,000 emails/month, then pay-as-you-go

---

## Email Template

### HTML Template

```html
<!-- Report email template -->
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    .header { background: #1e3a8a; color: white; padding: 20px; }
    .content { padding: 20px; }
    .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; }
    .stats { display: flex; gap: 20px; margin: 20px 0; }
    .stat-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; flex: 1; }
    .stat-value { font-size: 24px; font-weight: bold; color: #1e3a8a; }
    .stat-label { font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="header">
    <h1>{{reportName}}</h1>
    <p>{{dateRange}}</p>
  </div>
  
  <div class="content">
    <p>Hi {{recipientName}},</p>
    <p>Your scheduled surveillance report is ready. Key metrics:</p>
    
    <div class="stats">
      <div class="stat-box">
        <div class="stat-value">{{totalBranches}}</div>
        <div class="stat-label">Total Branches</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">{{healthyBranches}}</div>
        <div class="stat-label">Healthy Branches</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">{{criticalAlerts}}</div>
        <div class="stat-label">Critical Alerts</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">{{camerasOnline}}/{{totalCameras}}</div>
        <div class="stat-label">Cameras Online</div>
      </div>
    </div>
    
    <p>Reports are attached in the following formats:</p>
    <ul>
      {{#attachments}}
      <li><strong>{{filename}}</strong> ({{size}})</li>
      {{/attachments}}
    </ul>
    
    <p>You can also download reports from the dashboard: 
      <a href="{{dashboardUrl}}/reports">View in Dashboard</a>
    </p>
  </div>
  
  <div class="footer">
    <p>This is an automated report from your Video Management System.</p>
    <p>Generated at {{generatedAt}} | {{systemName}}</p>
  </div>
</body>
</html>
```

### Text Version (Plain Email)

```text
{{reportName}}
{{dateRange}}

Hi {{recipientName}},

Your scheduled surveillance report is ready.

KEY METRICS:
- Total Branches: {{totalBranches}}
- Healthy Branches: {{healthyBranches}}
- Critical Alerts: {{criticalAlerts}}
- Cameras Online: {{camerasOnline}}/{{totalCameras}}

ATTACHED FILES:
{{#attachments}}
- {{filename}} ({{size}})
{{/attachments}}

View in Dashboard: {{dashboardUrl}}/reports

---
Generated at {{generatedAt}} | {{systemName}}
```

---

## Delivery Tracking

### Database Schema

```sql
-- Report deliveries table
CREATE TABLE operational_report_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  run_id UUID NOT NULL REFERENCES operational_report_runs(id),
  recipient TEXT NOT NULL,
  status TEXT NOT NULL, -- 'queued', 'sent', 'delivered', 'bounced', 'failed'
  provider_id TEXT,
  attempts INT DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_report_deliveries_run ON operational_report_deliveries(run_id);
CREATE INDEX idx_report_deliveries_status ON operational_report_deliveries(status);
```

### Status Flow

```
queued → sending → sent → delivered
         ↓
       failed → retry → ...
         ↓
       dead (after 3 attempts)
```

### Retry Logic

```typescript
// Exponential backoff
const retryDelays = [60, 300, 900]; // 1min, 5min, 15min

async function retryDelivery(delivery: ReportDelivery) {
  if (delivery.attempts >= 3) {
    await markDead(delivery.id, 'max_attempts_exceeded');
    return;
  }
  
  const delaySeconds = retryDelays[delivery.attempts];
  const nextAttemptAt = new Date(Date.now() + delaySeconds * 1000);
  
  await scheduleRetry(delivery.id, nextAttemptAt);
}
```

---

## Testing

### Manual Test

```bash
# Test email delivery
curl -X POST http://localhost:3000/api/control/v1/reports/operational/runs \
  -H "Content-Type: application/json" \
  -d '{
    "template": "comprehensive",
    "formats": ["pdf"],
    "recipients": ["test@example.com"],
    "filters": {}
  }'

# Check delivery status
curl http://localhost:3000/api/control/v1/reports/operational/runs/<run-id>
```

### Integration Test

```typescript
// test/email-delivery.test.ts
describe('Report Email Delivery', () => {
  it('sends email with attachments', async () => {
    const run = await createReportRun({
      template: 'comprehensive',
      formats: ['pdf', 'xlsx'],
      recipients: ['test@example.com']
    });
    
    await waitForCompletion(run.id);
    
    const deliveries = await getDeliveries(run.id);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].status).toBe('delivered');
    expect(deliveries[0].recipient).toBe('test@example.com');
  });
  
  it('retries on failure', async () => {
    // Mock email service failure
    mockEmailService.mockRejectedValueOnce(new Error('Service unavailable'));
    
    const run = await createReportRun({
      recipients: ['test@example.com']
    });
    
    await waitForRetry(run.id);
    
    const delivery = await getDelivery(run.id);
    expect(delivery.attempts).toBeGreaterThan(1);
    expect(delivery.status).toBe('delivered'); // Eventually succeeds
  });
});
```

---

## Monitoring

### Delivery Metrics

```sql
-- Daily delivery success rate
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_deliveries,
  COUNT(*) FILTER (WHERE status = 'delivered') as successful,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'delivered') / COUNT(*), 2) as success_rate
FROM operational_report_deliveries
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Alert on Failures

```typescript
// Alert if delivery failure rate > 10%
if (failureRate > 0.1) {
  await createAlert({
    severity: 'P3',
    title: 'High Report Email Failure Rate',
    description: `${(failureRate * 100).toFixed(1)}% of report emails failed delivery in the last hour`,
    category: 'system'
  });
}
```

---

## Troubleshooting

### Issue: Emails Not Sending

**Check 1**: Verify webhook URL is accessible
```bash
curl -X POST $EMAIL_WEBHOOK_URL \
  -H "Authorization: Bearer $EMAIL_WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

**Check 2**: Review delivery logs
```sql
SELECT * FROM operational_report_deliveries 
WHERE status = 'failed' 
ORDER BY created_at DESC 
LIMIT 10;
```

**Check 3**: Check email provider logs
- SendGrid: Dashboard → Activity
- AWS SES: CloudWatch Logs
- SMTP: Server logs

### Issue: Emails Going to Spam

**Solutions**:
1. Set up SPF record: `v=spf1 include:sendgrid.net ~all`
2. Set up DKIM signing (via provider)
3. Set up DMARC policy: `v=DMARC1; p=none; rua=mailto:reports@yourcompany.com`
4. Use verified sender domain
5. Include unsubscribe link

### Issue: Attachment Too Large

**Limits**:
- SendGrid: 30MB total
- AWS SES: 10MB total
- Gmail: 25MB
- Outlook: 20MB

**Solution**: Provide download link instead
```typescript
if (totalAttachmentSize > 10_000_000) {
  // Skip attachments, send link instead
  emailBody += `\n\nReports are too large to attach. Download from: ${downloadUrl}`;
}
```

---

## Security

### Webhook Authentication

```typescript
// Verify webhook token
function authenticateWebhook(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  
  if (!token || token !== process.env.EMAIL_WEBHOOK_TOKEN) {
    throw new Error('Unauthorized');
  }
}
```

### Email Content Security

- ✅ Sanitize HTML templates (prevent XSS)
- ✅ Validate recipient email addresses
- ✅ Rate limit email sending (prevent spam)
- ✅ Encrypt sensitive data in attachments
- ✅ Include audit trail in database

---

## Cost Optimization

### Recommendations

1. **Consolidate Reports**: Send one email with multiple attachments instead of separate emails
2. **Compress Attachments**: ZIP large files before attaching
3. **Use Links for Large Reports**: Provide secure download links instead of attachments
4. **Batch Deliveries**: Group recipients when possible (BCC)
5. **Monitor Usage**: Set up billing alerts

### Cost Comparison

**Example: 400 branches × 3 recipients × 30 days = 36,000 emails/month**

| Provider | Monthly Cost |
|----------|-------------|
| SendGrid | $89.95 (40K emails) |
| AWS SES | $3.60 (36K emails) |
| Mailgun | $35 (50K emails) |
| Corporate SMTP | $0 (free) |

**Recommendation**: AWS SES for best cost/performance ratio

---

## References

- [SendGrid API Documentation](https://docs.sendgrid.com/api-reference/mail-send/mail-send)
- [AWS SES Developer Guide](https://docs.aws.amazon.com/ses/latest/dg/)
- [Nodemailer Documentation](https://nodemailer.com/about/)
- [Email Best Practices](https://sendgrid.com/blog/email-best-practices/)
