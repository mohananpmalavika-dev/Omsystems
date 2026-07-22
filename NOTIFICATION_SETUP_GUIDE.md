# Notification Setup Guide

## Overview

This guide explains how to configure email, SMS, and webhook notifications for the Aditi Sentinel maintenance alerting system.

---

## Table of Contents

1. [Email Configuration](#email-configuration)
2. [SMS Configuration](#sms-configuration)
3. [Webhook Configuration](#webhook-configuration)
4. [Testing Notifications](#testing-notifications)
5. [Troubleshooting](#troubleshooting)

---

## Email Configuration

### Option 1: SendGrid (Recommended for Production)

**Pros:** Reliable, scalable, good deliverability, detailed analytics  
**Cost:** Free tier: 100 emails/day, Paid plans start at $19.95/month

**Setup Steps:**

1. **Sign up for SendGrid**: https://sendgrid.com/

2. **Create API Key:**
   - Go to Settings → API Keys
   - Click "Create API Key"
   - Choose "Restricted Access"
   - Enable "Mail Send" permission
   - Copy the API key

3. **Configure in .env:**
   ```env
   EMAIL_PROVIDER=sendgrid
   EMAIL_FROM=notifications@yourdomain.com
   EMAIL_API_KEY=SG.your_sendgrid_api_key_here
   ```

4. **Verify sender domain:**
   - Go to Settings → Sender Authentication
   - Authenticate your domain
   - Add DNS records as instructed

5. **Install package (optional for direct integration):**
   ```bash
   npm install @sendgrid/mail
   ```

---

### Option 2: AWS SES (Good for AWS Environments)

**Pros:** Cost-effective, integrates with AWS ecosystem, reliable  
**Cost:** $0.10 per 1,000 emails

**Setup Steps:**

1. **Enable SES in AWS Console**: https://console.aws.amazon.com/ses/

2. **Verify email address or domain:**
   - Go to "Verified identities"
   - Add and verify your domain or email

3. **Create IAM user with SES permissions:**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "ses:SendEmail",
           "ses:SendRawEmail"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

4. **Configure in .env:**
   ```env
   EMAIL_PROVIDER=ses
   EMAIL_FROM=notifications@yourdomain.com
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   ```

5. **Move out of sandbox mode** (for production):
   - Request production access in SES console
   - Wait for AWS approval (usually 24 hours)

6. **Install AWS SDK:**
   ```bash
   npm install @aws-sdk/client-ses
   ```

---

### Option 3: SMTP (Any Email Provider)

**Pros:** Works with any email service (Gmail, Outlook, custom server)  
**Cost:** Depends on provider

**Setup for Gmail:**

1. **Enable 2-Factor Authentication** in your Google account

2. **Generate App Password:**
   - Go to https://myaccount.google.com/apppasswords
   - Select app: "Mail"
   - Select device: "Other (Custom name)"
   - Copy the 16-character password

3. **Configure in .env:**
   ```env
   EMAIL_PROVIDER=smtp
   EMAIL_FROM=your-email@gmail.com
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=your_16_char_app_password
   ```

4. **Install nodemailer:**
   ```bash
   npm install nodemailer
   ```

**Setup for Custom SMTP Server:**

```env
EMAIL_PROVIDER=smtp
EMAIL_FROM=notifications@yourdomain.com
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_USER=notifications@yourdomain.com
SMTP_PASSWORD=your_password
```

---

## SMS Configuration

### Option 1: Twilio (Recommended)

**Pros:** Reliable, global coverage, excellent documentation  
**Cost:** $0.0079 per SMS in US, varies by country

**Setup Steps:**

1. **Sign up for Twilio**: https://www.twilio.com/

2. **Get Account SID and Auth Token:**
   - Go to Console Dashboard
   - Copy "Account SID" and "Auth Token"

3. **Buy a phone number:**
   - Go to Phone Numbers → Manage → Buy a number
   - Select a number with SMS capability
   - Complete purchase

4. **Configure in .env:**
   ```env
   SMS_PROVIDER=twilio
   SMS_FROM=+1234567890
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token_here
   ```

5. **Install Twilio SDK:**
   ```bash
   npm install twilio
   ```

6. **Test with console:**
   ```javascript
   const twilio = require('twilio');
   const client = twilio(accountSid, authToken);
   
   client.messages.create({
     body: 'Test message from Aditi Sentinel',
     from: '+1234567890',
     to: '+1234567890'
   });
   ```

---

### Option 2: AWS SNS

**Pros:** Cost-effective, integrates with AWS  
**Cost:** $0.00645 per SMS in US, varies by country

**Setup Steps:**

1. **Enable SNS in AWS Console**: https://console.aws.amazon.com/sns/

2. **Create IAM user with SNS permissions:**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "sns:Publish"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

3. **Configure in .env:**
   ```env
   SMS_PROVIDER=sns
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   ```

4. **Install AWS SDK:**
   ```bash
   npm install @aws-sdk/client-sns
   ```

---

### Option 3: Custom SMS Gateway

**Pros:** Use your existing SMS provider  
**Cost:** Depends on provider

**Setup Steps:**

1. **Get API credentials** from your SMS provider

2. **Configure in .env:**
   ```env
   SMS_PROVIDER=custom
   SMS_FROM=+1234567890
   SMS_API_URL=https://your-sms-gateway.com/api/send
   SMS_API_KEY=your_api_key_here
   ```

3. **Customize the implementation** in `src/services/notification-service.ts`:
   ```typescript
   private async sendSmsViaCustom(message: SmsMessage): Promise<void> {
     const smsConfig = this.config.sms;
     
     for (const to of message.to) {
       await fetch(smsConfig.apiUrl!, {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${smsConfig.apiKey}`,
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({
           to,
           from: smsConfig.from,
           message: message.body,
         }),
       });
     }
   }
   ```

---

## Webhook Configuration

Webhooks allow you to send alert notifications to external systems (Slack, Microsoft Teams, custom applications, etc.).

### Basic Setup

**Configure in .env:**

```env
WEBHOOK_URLS=https://your-domain.com/webhook,https://backup-webhook.com/alerts
WEBHOOK_RETRY_ATTEMPTS=3
WEBHOOK_TIMEOUT_MS=10000
```

### With Custom Headers

```env
WEBHOOK_URLS=https://your-domain.com/webhook
WEBHOOK_HEADERS={"Authorization":"Bearer your_token","X-Custom-Header":"value"}
```

### Webhook Payload Format

Your webhook endpoint will receive POST requests with this JSON payload:

```json
{
  "event": "maintenance.alert",
  "timestamp": "2024-07-22T10:30:00Z",
  "data": {
    "alert": {
      "id": "alert-123",
      "tenantId": "tenant-uuid",
      "severity": "critical",
      "category": "health",
      "title": "Camera Offline",
      "description": "Camera is not responding",
      "assetId": "camera-uuid",
      "branchNodeId": "branch-uuid",
      "createdAt": "2024-07-22T10:30:00Z",
      "status": "active"
    },
    "severity": "critical",
    "category": "health",
    "tenantId": "tenant-uuid"
  }
}
```

### Slack Integration

1. **Create Incoming Webhook:**
   - Go to https://api.slack.com/messaging/webhooks
   - Create a new webhook for your workspace
   - Copy the webhook URL

2. **Create a proxy endpoint** to format Slack messages:
   ```javascript
   // Example proxy endpoint
   app.post('/slack-webhook', async (req, res) => {
     const { alert } = req.body.data;
     
     await fetch(process.env.SLACK_WEBHOOK_URL, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         text: `🚨 *${alert.title}*`,
         blocks: [
           {
             type: 'section',
             text: {
               type: 'mrkdwn',
               text: `*${alert.title}*\n${alert.description}`
             }
           },
           {
             type: 'context',
             elements: [
               { type: 'mrkdwn', text: `Severity: *${alert.severity}*` },
               { type: 'mrkdwn', text: `Category: ${alert.category}` }
             ]
           }
         ]
       })
     });
     
     res.sendStatus(200);
   });
   ```

3. **Configure webhook:**
   ```env
   WEBHOOK_URLS=https://your-domain.com/slack-webhook
   ```

### Microsoft Teams Integration

Similar to Slack, create a connector webhook in Teams and use a proxy to format the message as an Adaptive Card.

---

## Testing Notifications

### Test Email

```bash
# Using the API
curl -X POST http://localhost:3000/v1/test/email \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "subject": "Test Email",
    "body": "This is a test email from Aditi Sentinel"
  }'
```

### Test SMS

```bash
curl -X POST http://localhost:3000/v1/test/sms \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+1234567890",
    "body": "Test SMS from Aditi Sentinel"
  }'
```

### Test Webhook

```bash
curl -X POST http://localhost:3000/v1/test/webhook \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "test",
    "data": {"message": "Test webhook"}
  }'
```

### Trigger a Test Alert

```bash
# Create a camera with high temperature to trigger alert
curl -X POST http://localhost:3000/v1/maintenance/health/test-alert \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "alertType": "camera-high-temperature",
    "severity": "critical"
  }'
```

---

## Troubleshooting

### Emails Not Sending

**Check Configuration:**
```bash
# View current configuration (sanitized)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/v1/maintenance/health/collector/status
```

**Common Issues:**

1. **API Key Invalid:**
   - Verify the API key is correct
   - Check if the key has the right permissions

2. **Sender Not Verified:**
   - For SendGrid/SES, verify your sender domain/email
   - Check DNS records are correct

3. **SMTP Authentication Failed:**
   - Use app-specific passwords (not your regular password)
   - Check firewall allows outbound SMTP connections

4. **Emails Going to Spam:**
   - Set up SPF, DKIM, and DMARC records
   - Use a verified domain
   - Don't send too many emails too quickly

**Debug Mode:**

Check application logs:
```bash
tail -f logs/app.log | grep notification
```

### SMS Not Sending

**Common Issues:**

1. **Phone Number Format:**
   - Use E.164 format: +[country code][number]
   - Example: +12345678900 (not 123-456-7900)

2. **Country Not Supported:**
   - Check if your SMS provider supports the destination country
   - Some countries have restrictions

3. **Account Limits:**
   - Twilio trial accounts can only send to verified numbers
   - AWS SNS may require you to request SMS permissions

### Webhooks Failing

**Common Issues:**

1. **URL Not Accessible:**
   - Verify the webhook URL is publicly accessible
   - Check firewall rules

2. **Timeout:**
   - Increase `WEBHOOK_TIMEOUT_MS`
   - Optimize your webhook endpoint

3. **SSL Certificate Issues:**
   - Ensure your webhook URL uses valid HTTPS certificate
   - Update Node.js if using self-signed certificates

**Test Webhook Manually:**

```bash
curl -X POST https://your-domain.com/webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"test","timestamp":"2024-07-22T10:00:00Z","data":{}}'
```

---

## Production Recommendations

### Email

1. **Use a dedicated domain** for notifications (e.g., notifications.yourdomain.com)
2. **Set up proper DNS records** (SPF, DKIM, DMARC)
3. **Monitor deliverability** through your provider's dashboard
4. **Implement bounce handling** to remove invalid addresses
5. **Rate limit** to avoid triggering spam filters

### SMS

1. **Use toll-free numbers** for better deliverability
2. **Keep messages concise** (160 characters or less)
3. **Include opt-out instructions** (required by law in many countries)
4. **Monitor costs** - SMS can get expensive
5. **Have a backup provider** for critical alerts

### Webhooks

1. **Implement retry logic** (already built-in)
2. **Use HTTPS** with valid certificates
3. **Add authentication** headers
4. **Log all webhook attempts**
5. **Monitor webhook endpoint health**

---

## Security Best Practices

1. **Never commit credentials** to version control
2. **Use environment variables** for all secrets
3. **Rotate API keys regularly** (every 90 days)
4. **Use least-privilege IAM policies** for AWS
5. **Monitor API usage** for unusual activity
6. **Enable 2FA** on all provider accounts
7. **Encrypt credentials at rest** if storing in database

---

## Cost Optimization

### Email
- Use transactional email providers (cheaper than marketing platforms)
- SendGrid Free tier: 100 emails/day
- AWS SES: $0.10 per 1,000 emails
- Consolidate multiple alerts into digest emails

### SMS
- **Reserve SMS for critical alerts only**
- Use email for non-critical notifications
- Twilio: ~$0.0079 per SMS
- AWS SNS: ~$0.00645 per SMS
- Consider regional pricing differences

### Webhooks
- Free (just requires endpoint hosting)
- Watch for rate limits on receiving end

---

## Example .env Configuration

```env
# Production Email Configuration
EMAIL_PROVIDER=sendgrid
EMAIL_FROM=notifications@yourdomain.com
EMAIL_API_KEY=SG.your_production_api_key

# Production SMS Configuration  
SMS_PROVIDER=twilio
SMS_FROM=+12345678900
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_production_auth_token

# Production Webhook Configuration
WEBHOOK_URLS=https://api.yourdomain.com/maintenance-alerts
WEBHOOK_HEADERS={"Authorization":"Bearer prod_webhook_token","X-Environment":"production"}
WEBHOOK_RETRY_ATTEMPTS=5
WEBHOOK_TIMEOUT_MS=15000
```

---

## Support

- **SendGrid Support**: https://support.sendgrid.com/
- **AWS SES Documentation**: https://docs.aws.amazon.com/ses/
- **Twilio Support**: https://support.twilio.com/
- **Nodemailer Documentation**: https://nodemailer.com/

---

**Last Updated**: 2026-07-22  
**Status**: Ready for Production
