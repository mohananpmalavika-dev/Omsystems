/**
 * Voice/SIP Provider
 * Handles voice call notifications via SIP/PBX
 */

import { BaseNotificationProvider } from './base-provider.adapter.js';
import type {
  ProviderConfig,
  NotificationMessage,
  DeliveryResult,
  SIPConfig,
} from '../domain/notification.types.js';
import { logger } from '../../utils/logger.js';

export class VoiceSIPProvider extends BaseNotificationProvider {
  private sipConfig?: SIPConfig;
  private connected: boolean = false;

  constructor(providerKey: string = 'sip-default') {
    super(providerKey, 'SIP', 'voice');
  }

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    const sipConfig = config.config as SIPConfig;

    if (!sipConfig.sipServer || !sipConfig.sipUsername || !sipConfig.sipPassword) {
      throw new Error('SIP server credentials are required');
    }

    this.sipConfig = sipConfig;

    // In production, initialize SIP client here
    // For now, we'll simulate the connection
    logger.info('Voice/SIP provider initialized', {
      server: sipConfig.sipServer,
      fromNumber: sipConfig.fromNumber,
    });

    this.connected = true;
  }

  protected async doSend(message: NotificationMessage): Promise<DeliveryResult> {
    const validation = this.validateMessage(message);
    if (!validation.valid) {
      return {
        accepted: false,
        status: 'FAILED',
        failureCode: 'VALIDATION_ERROR',
        failureReason: validation.error,
        isPermanentFailure: true,
        timestamp: new Date(),
      };
    }

    // Validate phone format
    if (!this.isValidPhone(message.recipientDestination)) {
      return {
        accepted: false,
        status: 'FAILED',
        failureCode: 'INVALID_PHONE',
        failureReason: 'Invalid phone number format',
        isPermanentFailure: true,
        timestamp: new Date(),
      };
    }

    if (!this.sipConfig || !this.connected) {
      throw new Error('SIP provider not properly initialized');
    }

    try {
      // Generate text-to-speech message
      const voiceMessage = this.generateVoiceScript(message.body, message.metadata);

      // In production, place SIP call here
      // This would integrate with a SIP library or service
      logger.info('Voice call initiated', {
        to: this.maskRecipient(message.recipientDestination),
        scriptLength: voiceMessage.length,
      });

      // Simulate call placement
      const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      return {
        accepted: true,
        providerMessageId: callId,
        status: 'SENT',
        timestamp: new Date(),
      };
    } catch (error) {
      throw error;
    }
  }

  protected async doHealthCheck(): Promise<boolean> {
    if (!this.sipConfig) {
      return false;
    }

    // In production, check SIP registration status
    return this.connected;
  }

  /**
   * Generate voice script from text message
   */
  private generateVoiceScript(body: string, metadata?: Record<string, any>): string {
    // Add voice-specific formatting
    const intro = 'This is a critical Sentinel Grid alert.';
    const outro = 'Press 1 to acknowledge. Press 2 to repeat this message.';
    
    // Clean up text for better speech synthesis
    const cleanedBody = body
      .replace(/\n/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();

    return `${intro} ${cleanedBody} ${outro}`;
  }

  /**
   * Validate phone number format
   */
  private isValidPhone(phone: string): boolean {
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
  }
}

/**
 * Twilio Voice Provider
 * Alternative voice provider using Twilio API
 */
export class TwilioVoiceProvider extends BaseNotificationProvider {
  private accountSid?: string;
  private authToken?: string;
  private fromNumber?: string;

  constructor(providerKey: string = 'twilio-voice-default') {
    super(providerKey, 'TWILIO', 'voice');
  }

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    const twilioConfig = config.config as any;

    if (!twilioConfig.accountSid || !twilioConfig.authToken || !twilioConfig.fromNumber) {
      throw new Error('Twilio credentials are required');
    }

    this.accountSid = twilioConfig.accountSid;
    this.authToken = twilioConfig.authToken;
    this.fromNumber = twilioConfig.fromNumber;

    logger.info('Twilio Voice provider initialized', {
      fromNumber: twilioConfig.fromNumber,
    });
  }

  protected async doSend(message: NotificationMessage): Promise<DeliveryResult> {
    const validation = this.validateMessage(message);
    if (!validation.valid) {
      return {
        accepted: false,
        status: 'FAILED',
        failureCode: 'VALIDATION_ERROR',
        failureReason: validation.error,
        isPermanentFailure: true,
        timestamp: new Date(),
      };
    }

    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      throw new Error('Twilio provider not properly initialized');
    }

    try {
      // Generate TwiML for voice message
      const twiml = this.generateTwiML(message.body);

      // Call Twilio API
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: message.recipientDestination,
            From: this.fromNumber,
            Twiml: twiml,
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Twilio API error: ${response.status} ${errorBody}`);
      }

      const result = await response.json();

      return {
        accepted: true,
        providerMessageId: result.sid,
        status: 'SENT',
        timestamp: new Date(),
      };
    } catch (error) {
      throw error;
    }
  }

  protected async doHealthCheck(): Promise<boolean> {
    if (!this.accountSid || !this.authToken) {
      return false;
    }

    try {
      // Check Twilio account status
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}.json`,
        {
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64'),
          },
          signal: AbortSignal.timeout(5000),
        }
      );

      return response.ok;
    } catch (error) {
      logger.warn('Twilio health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Generate TwiML for voice message
   */
  private generateTwiML(body: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-US">
    This is a critical Sentinel Grid alert. ${body}
  </Say>
  <Gather numDigits="1" action="/twilio/voice/acknowledge" method="POST">
    <Say>Press 1 to acknowledge this alert. Press 2 to repeat.</Say>
  </Gather>
</Response>`;
  }
}
