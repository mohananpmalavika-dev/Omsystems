/**
 * Zero-Touch Provisioning Service
 * Automated branch onboarding with minimal manual configuration
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface ProvisioningRequest {
  branchCode: string;
  branchName: string;
  region: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  contactInfo?: {
    email: string;
    phone: string;
  };
  edgeAgentMacAddress?: string;
  expectedCameraCount?: number;
  templateId?: string; // Config template to apply
}

export interface ProvisioningToken {
  token: string;
  branchId: string;
  expiresAt: Date;
  status: 'pending' | 'activated' | 'expired' | 'revoked';
}

export interface ProvisioningStatus {
  branchId: string;
  status: 'pending' | 'configuring' | 'deploying' | 'testing' | 'active' | 'failed';
  progress: number; // 0-100
  steps: Array<{
    name: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    message?: string;
    completedAt?: Date;
  }>;
  startedAt: Date;
  completedAt?: Date;
}

export class ZeroTouchProvisioningService {
  constructor(private pool: Pool) {}

  /**
   * Initiate zero-touch provisioning
   */
  async initiateProvisioning(
    tenantId: string,
    userId: string,
    request: ProvisioningRequest
  ): Promise<{ branchId: string; provisioningToken: string; status: ProvisioningStatus }> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create branch record
      const branchId = uuidv4();
      const branchQuery = `
        INSERT INTO branches (
          id, tenant_id, name, code, region, status,
          address_line1, address_line2, city, state, postal_code, country,
          contact_email, contact_phone,
          created_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'provisioning', $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        RETURNING id
      `;

      await client.query(branchQuery, [
        branchId,
        tenantId,
        request.branchName,
        request.branchCode,
        request.region,
        request.address?.line1 || null,
        request.address?.line2 || null,
        request.address?.city || null,
        request.address?.state || null,
        request.address?.postalCode || null,
        request.address?.country || 'US',
        request.contactInfo?.email || null,
        request.contactInfo?.phone || null,
        userId
      ]);

      // Generate provisioning token
      const token = this.generateProvisioningToken();
      const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const tokenQuery = `
        INSERT INTO provisioning_tokens (
          token, branch_id, tenant_id, created_by, expires_at, status
        ) VALUES ($1, $2, $3, $4, $5, 'pending')
      `;

      await client.query(tokenQuery, [token, branchId, tenantId, userId, tokenExpiresAt]);

      // Create provisioning status
      const statusQuery = `
        INSERT INTO provisioning_status (
          branch_id, status, progress, steps, started_at
        ) VALUES ($1, 'pending', 0, $2, NOW())
      `;

      const initialSteps = [
        { name: 'Branch Created', status: 'completed', completedAt: new Date() },
        { name: 'Token Generated', status: 'completed', completedAt: new Date() },
        { name: 'Edge Agent Registration', status: 'pending' },
        { name: 'Network Configuration', status: 'pending' },
        { name: 'Camera Discovery', status: 'pending' },
        { name: 'Storage Setup', status: 'pending' },
        { name: 'Configuration Applied', status: 'pending' },
        { name: 'Health Check', status: 'pending' },
        { name: 'Activation', status: 'pending' }
      ];

      await client.query(statusQuery, [branchId, JSON.stringify(initialSteps)]);

      // Apply configuration template if provided
      if (request.templateId) {
        await this.applyConfigurationTemplate(client, branchId, request.templateId);
      }

      await client.query('COMMIT');

      const status: ProvisioningStatus = {
        branchId,
        status: 'pending',
        progress: 22, // 2 of 9 steps completed
        steps: initialSteps,
        startedAt: new Date()
      };

      return {
        branchId,
        provisioningToken: token,
        status
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Register edge agent using provisioning token
   */
  async registerEdgeAgent(
    token: string,
    agentInfo: {
      macAddress: string;
      hostname: string;
      ipAddress: string;
      version: string;
      systemInfo: any;
    }
  ): Promise<{ branchId: string; agentId: string; configuration: any }> {
    // Validate token
    const tokenQuery = `
      SELECT pt.*, b.tenant_id, b.name as branch_name
      FROM provisioning_tokens pt
      JOIN branches b ON b.id = pt.branch_id
      WHERE pt.token = $1
        AND pt.status = 'pending'
        AND pt.expires_at > NOW()
    `;

    const tokenResult = await this.pool.query(tokenQuery, [token]);
    
    if (tokenResult.rows.length === 0) {
      throw new Error('Invalid or expired provisioning token');
    }

    const { branch_id: branchId, tenant_id: tenantId } = tokenResult.rows[0];

    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Register edge agent
      const agentId = uuidv4();
      const agentQuery = `
        INSERT INTO edge_agents (
          id, branch_id, mac_address, hostname, ip_address,
          version, system_info, status, registered_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'online', NOW())
        RETURNING id
      `;

      await client.query(agentQuery, [
        agentId,
        branchId,
        agentInfo.macAddress,
        agentInfo.hostname,
        agentInfo.ipAddress,
        agentInfo.version,
        JSON.stringify(agentInfo.systemInfo)
      ]);

      // Update provisioning status
      await this.updateProvisioningStep(
        client,
        branchId,
        'Edge Agent Registration',
        'completed'
      );

      // Mark token as activated
      await client.query(
        `UPDATE provisioning_tokens SET status = 'activated', activated_at = NOW() WHERE token = $1`,
        [token]
      );

      // Get configuration for edge agent
      const configuration = await this.generateEdgeAgentConfiguration(client, branchId, tenantId);

      await client.query('COMMIT');

      // Trigger next provisioning steps asynchronously
      this.continueProvisioning(branchId).catch(err => 
        console.error('Error continuing provisioning:', err)
      );

      return {
        branchId,
        agentId,
        configuration
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Continue provisioning workflow
   */
  private async continueProvisioning(branchId: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      // Network configuration
      await this.updateProvisioningStep(client, branchId, 'Network Configuration', 'in_progress');
      await this.configureNetwork(client, branchId);
      await this.updateProvisioningStep(client, branchId, 'Network Configuration', 'completed');

      // Camera discovery
      await this.updateProvisioningStep(client, branchId, 'Camera Discovery', 'in_progress');
      await this.discoverCameras(client, branchId);
      await this.updateProvisioningStep(client, branchId, 'Camera Discovery', 'completed');

      // Storage setup
      await this.updateProvisioningStep(client, branchId, 'Storage Setup', 'in_progress');
      await this.setupStorage(client, branchId);
      await this.updateProvisioningStep(client, branchId, 'Storage Setup', 'completed');

      // Configuration applied
      await this.updateProvisioningStep(client, branchId, 'Configuration Applied', 'completed');

      // Health check
      await this.updateProvisioningStep(client, branchId, 'Health Check', 'in_progress');
      const healthPassed = await this.performHealthCheck(client, branchId);
      
      if (healthPassed) {
        await this.updateProvisioningStep(client, branchId, 'Health Check', 'completed');
        
        // Activate branch
        await this.updateProvisioningStep(client, branchId, 'Activation', 'in_progress');
        await this.activateBranch(client, branchId);
        await this.updateProvisioningStep(client, branchId, 'Activation', 'completed');

        // Update overall status
        await client.query(
          `UPDATE provisioning_status SET status = 'active', progress = 100, completed_at = NOW() WHERE branch_id = $1`,
          [branchId]
        );

        await client.query(
          `UPDATE branches SET status = 'active' WHERE id = $1`,
          [branchId]
        );
      }

    } catch (error) {
      await client.query(
        `UPDATE provisioning_status SET status = 'failed' WHERE branch_id = $1`,
        [branchId]
      );
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get provisioning status
   */
  async getProvisioningStatus(branchId: string): Promise<ProvisioningStatus | null> {
    const query = `
      SELECT * FROM provisioning_status
      WHERE branch_id = $1
      ORDER BY started_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [branchId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      branchId: row.branch_id,
      status: row.status,
      progress: row.progress,
      steps: row.steps,
      startedAt: row.started_at,
      completedAt: row.completed_at
    };
  }

  // Helper methods
  private generateProvisioningToken(): string {
    return `ZTP-${uuidv4().replace(/-/g, '').toUpperCase()}`;
  }

  private async updateProvisioningStep(
    client: any,
    branchId: string,
    stepName: string,
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
  ): Promise<void> {
    const query = `
      UPDATE provisioning_status
      SET steps = jsonb_set(
        steps,
        ARRAY[(
          SELECT idx::text
          FROM jsonb_array_elements(steps) WITH ORDINALITY arr(item, idx)
          WHERE item->>'name' = $2
          LIMIT 1
        )],
        jsonb_build_object(
          'name', $2,
          'status', $3,
          'completedAt', CASE WHEN $3 = 'completed' THEN to_jsonb(NOW()) ELSE NULL END
        )
      ),
      progress = (
        SELECT COUNT(*) * 100 / jsonb_array_length(steps)
        FROM jsonb_array_elements(steps) step
        WHERE step->>'status' = 'completed'
      )
      WHERE branch_id = $1
    `;

    await client.query(query, [branchId, stepName, status]);
  }

  private async applyConfigurationTemplate(client: any, branchId: string, templateId: string): Promise<void> {
    // Apply saved configuration template
    const query = `SELECT configuration FROM branch_config_templates WHERE id = $1`;
    const result = await client.query(query, [templateId]);
    
    if (result.rows.length > 0) {
      const config = result.rows[0].configuration;
      // Apply configuration (implementation depends on config structure)
    }
  }

  private async generateEdgeAgentConfiguration(client: any, branchId: string, tenantId: string): Promise<any> {
    return {
      branchId,
      tenantId,
      serverEndpoints: {
        api: process.env.API_ENDPOINT || 'https://api.vms.example.com',
        websocket: process.env.WS_ENDPOINT || 'wss://ws.vms.example.com',
        media: process.env.MEDIA_ENDPOINT || 'https://media.vms.example.com'
      },
      heartbeatInterval: 30,
      configSyncInterval: 300,
      uploadSettings: {
        maxRetries: 3,
        batchSize: 100
      }
    };
  }

  private async configureNetwork(client: any, branchId: string): Promise<void> {
    // Auto-configure network settings
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate configuration
  }

  private async discoverCameras(client: any, branchId: string): Promise<void> {
    // Auto-discover cameras on network
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate discovery
  }

  private async setupStorage(client: any, branchId: string): Promise<void> {
    // Setup storage configuration
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate setup
  }

  private async performHealthCheck(client: any, branchId: string): Promise<boolean> {
    // Perform system health check
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate health check
    return true;
  }

  private async activateBranch(client: any, branchId: string): Promise<void> {
    // Final activation steps
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
