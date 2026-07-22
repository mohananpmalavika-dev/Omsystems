/**
 * Notification Configuration
 * Configure email, SMS, and webhook providers
 */

import type { NotificationConfig } from '../services/notification-service.js';

/**
 * Load notification configuration from environment variables
 */
export function loadNotificationConfig(): NotificationConfig {
  const config: NotificationConfig = {};

  // Email configuration
  if (process.env.EMAIL_PROVIDER) {
    config.email = {
      provider: process.env.EMAIL_PROVIDER as any,
      from: process.env.EMAIL_FROM || 'noreply@aditi-sentinel.com',
      apiKey: process.env.EMAIL_API_KEY,
      smtpHost: process.env.SMTP_HOST,
      smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : undefined,
      smtpUser: process.env.SMTP_USER,
      smtpPassword: process.env.SMTP_PASSWORD,
    };
  }

  // SMS configuration
  if (process.env.SMS_PROVIDER) {
    config.sms = {
      provider: process.env.SMS_PROVIDER as any,
      from: process.env.SMS_FROM || '+1234567890',
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      awsRegion: process.env.AWS_REGION,
      apiUrl: process.env.SMS_API_URL,
      apiKey: process.env.SMS_API_KEY,
    };
  }

  // Webhook configuration
  if (process.env.WEBHOOK_URLS) {
    const urls = process.env.WEBHOOK_URLS.split(',').map(url => url.trim());
    config.webhook = {
      urls,
      headers: process.env.WEBHOOK_HEADERS ? JSON.parse(process.env.WEBHOOK_HEADERS) : undefined,
      retryAttempts: process.env.WEBHOOK_RETRY_ATTEMPTS 
        ? parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS) 
        : 3,
      timeoutMs: process.env.WEBHOOK_TIMEOUT_MS 
        ? parseInt(process.env.WEBHOOK_TIMEOUT_MS) 
        : 10000,
    };
  }

  return config;
}

/**
 * Default notification configuration for development
 */
export const defaultNotificationConfig: NotificationConfig = {
  email: {
    provider: 'smtp',
    from: 'notifications@aditi-sentinel.local',
    smtpHost: 'localhost',
    smtpPort: 1025, // MailHog or similar SMTP server for testing
  },
  // SMS and webhook are disabled by default in development
};

/**
 * Example production configuration
 * Copy to .env and customize
 */
export const exampleProductionConfig = `
# Email Configuration (Choose one provider)

# SendGrid
EMAIL_PROVIDER=sendgrid
EMAIL_FROM=notifications@yourdomain.com
EMAIL_API_KEY=SG.your_sendgrid_api_key

# AWS SES
# EMAIL_PROVIDER=ses
# EMAIL_FROM=notifications@yourdomain.com
# AWS_REGION=us-east-1
# AWS_ACCESS_KEY_ID=your_key
# AWS_SECRET_ACCESS_KEY=your_secret

# SMTP (Generic)
# EMAIL_PROVIDER=smtp
# EMAIL_FROM=notifications@yourdomain.com
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your_email@gmail.com
# SMTP_PASSWORD=your_app_password

# SMS Configuration (Choose one provider)

# Twilio
SMS_PROVIDER=twilio
SMS_FROM=+1234567890
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token

# AWS SNS
# SMS_PROVIDER=sns
# AWS_REGION=us-east-1
# AWS_ACCESS_KEY_ID=your_key
# AWS_SECRET_ACCESS_KEY=your_secret

# Custom SMS Gateway
# SMS_PROVIDER=custom
# SMS_FROM=+1234567890
# SMS_API_URL=https://sms-gateway.example.com/send
# SMS_API_KEY=your_api_key

# Webhook Configuration
WEBHOOK_URLS=https://your-domain.com/webhook,https://backup-webhook.com/alerts
WEBHOOK_RETRY_ATTEMPTS=3
WEBHOOK_TIMEOUT_MS=10000
WEBHOOK_HEADERS={"Authorization":"Bearer your_token","X-Custom-Header":"value"}
`.trim();
