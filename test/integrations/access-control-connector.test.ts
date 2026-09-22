import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccessControlConnector } from '../../src/integrations/connectors/access-control-connector.js';
import type { IntegrationConfig, IntegrationEvent } from '../../src/integrations/types.js';
import { createHmac } from 'node:crypto';

describe('AccessControlConnector (PACS) Production Grade', () => {
  let connector: AccessControlConnector;
  const mockConfig: IntegrationConfig = {
    id: 'pacs-integ-1',
    name: 'Honeywell Pro-Watch PACS',
    type: 'access_control',
    enabled: true,
    config: {
      controllerApiUrl: 'https://pacs.bank.internal',
      branchMappingTag: 'MUMBAI-MAIN',
    },
    credentials: {
      apiKey: 'secret-pacs-api-key-99',
      webhookSecret: 'pacs-hmac-webhook-secret-42',
    },
    status: 'connected',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    connector = new AccessControlConnector();
    await connector.initialize(mockConfig);
  });

  it('exposes a production-grade configuration schema', () => {
    const schema = connector.getConfigSchema();
    expect(schema.requiredFields).toContain('controllerApiUrl');
    expect(schema.requiredFields).toContain('apiKey');
    expect(schema.secrets).toContain('apiKey');
    expect(schema.secrets).toContain('webhookSecret');
  });

  it('performs real HTTP connection test against PACS system status endpoint', async () => {
    // Mock global fetch
    const mockResponse = {
      controllersOnline: 12,
      doorsMapped: 48,
      antiPassbackActive: true,
      tailgatingDetection: 'ENABLED',
      version: 'Pro-Watch-v6.0',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as any);

    const result = await connector.testConnection();
    expect(result.success).toBe(true);
    expect(result.message).toContain('PACS API connection verified');
    expect(result.details?.controllersOnline).toBe(12);
    expect(result.details?.doorsMapped).toBe(48);
    expect(result.details?.firmwareVersion).toBe('Pro-Watch-v6.0');
    expect(typeof result.details?.latencyMs).toBe('number');
  });

  it('dispatches outbound door control commands to physical door controllers', async () => {
    let capturedUrl = '';
    let capturedBody = '';

    global.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
      capturedUrl = url;
      capturedBody = opts?.body;
      return {
        ok: true,
        json: async () => ({ status: 'success' }),
      } as any;
    });

    const event: IntegrationEvent = {
      id: 'cmd-event-01',
      integrationId: 'pacs-integ-1',
      type: 'door_control_command',
      category: 'security',
      severity: 'medium',
      data: {
        doorId: 'door-vault-main',
        action: 'unlock',
        durationSeconds: 10,
        authorizedBy: 'dual-custody-officer',
      },
      timestamp: new Date(),
    };

    const res = await connector.handleEvent(event);
    expect(res.success).toBe(true);
    expect(capturedUrl).toContain('/api/v1/doors/door-vault-main/command');
    expect(capturedBody).toContain('unlock');
    expect(capturedBody).toContain('dual-custody-officer');
  });

  it('verifies HMAC-SHA256 signatures for inbound PACS webhooks and rejects tampered payloads', async () => {
    const eventData = { badgeId: 'BADGE-9988', doorId: 'DOOR-ATM-REAR', status: 'granted' };
    const payloadString = JSON.stringify(eventData);

    const validSig = createHmac('sha256', 'pacs-hmac-webhook-secret-42')
      .update(payloadString)
      .digest('hex');

    const validEvent: IntegrationEvent = {
      id: 'webhook-event-01',
      integrationId: 'pacs-integ-1',
      type: 'badge_swipe',
      category: 'security',
      severity: 'info',
      data: eventData,
      metadata: { signature: validSig },
      timestamp: new Date(),
    };

    const successRes = await connector.handleEvent(validEvent);
    expect(successRes.success).toBe(true);

    // Tampered signature
    const tamperedEvent: IntegrationEvent = {
      ...validEvent,
      metadata: { signature: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff' },
    };

    const failRes = await connector.handleEvent(tamperedEvent);
    expect(failRes.success).toBe(false);
    expect(failRes.error).toContain('HMAC-SHA256 signature verification failed');
  });
});
