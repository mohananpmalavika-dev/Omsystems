/**
 * Device Template Service
 * 
 * Manages configuration templates for consistent device provisioning.
 * 
 * Key Features:
 * - Template versioning
 * - Variable substitution ({{branch-gateway}}, {{assigned}}, etc.)
 * - Template application workflow
 * - Configuration drift detection
 * 
 * @see DEVICE_MANAGEMENT_PRODUCTION_GUIDE.md for complete documentation
 */

import type { ExtendedControlPlaneStore } from '../control-plane-store.js';

interface TemplateInput {
  tenantId: string;
  name: string;
  templateType: 'camera-configuration' | 'recording' | 'analytics' | 'privacy' | 'network' | 'security-hardening' | 'location';
  category: string;
  settings: Record<string, unknown>;
  createdBy: string;
}

interface TemplateApplicationInput {
  tenantId: string;
  deviceId: string;
  templateId: string;
  appliedBy: string;
}

interface DriftResult {
  deviceId: string;
  templateId: string;
  drifts: Array<{
    path: string;
    desired: unknown;
    actual: unknown;
  }>;
}

export class DeviceTemplateService {
  constructor(private readonly store: ExtendedControlPlaneStore) {}

  /**
   * Create a new device configuration template.
   */
  async createTemplate(input: TemplateInput) {
    // Validate settings is valid JSON
    if (typeof input.settings !== 'object' || input.settings === null) {
      throw new Error('Template settings must be a valid JSON object');
    }

    // Get current version for this template name
    const existingTemplates = await this.store.listDeviceTemplates(input.tenantId, {
      name: input.name,
    });

    const maxVersion = existingTemplates.reduce(
      (max, t) => Math.max(max, t.version || 0),
      0
    );

    const template = await this.store.createDeviceTemplate({
      tenantId: input.tenantId,
      name: input.name,
      templateType: input.templateType,
      category: input.category,
      version: maxVersion + 1,
      settings: input.settings,
      createdBy: input.createdBy,
      status: 'draft',
    });

    await this.store.writeAudit({
      tenantId: input.tenantId,
      action: 'device.template.created',
      actorUserId: input.createdBy,
      resourceNodeId: null,
      outcome: 'success',
      details: {
        name: input.name,
        version: template.version,
        templateType: input.templateType,
        resourceId: template.id,
      },
    });

    return template;
  }

  /**
   * Publish a template for use (change status from draft to active).
   */
  async publishTemplate(templateId: string, tenantId: string, publishedBy: string) {
    const template = await this.store.getDeviceTemplate(templateId);

    if (!template || template.tenantId !== tenantId) {
      throw new Error(`Template ${templateId} not found`);
    }

    if (template.status !== 'draft') {
      throw new Error(`Template is already ${template.status}`);
    }

    const updated = await this.store.updateDeviceTemplate(templateId, {
      status: 'active',
    });

    await this.store.writeAudit({
      tenantId,
      action: 'device.template.published',
      actorUserId: publishedBy,
      resourceNodeId: null,
      outcome: 'success',
      details: {
        name: template.name,
        version: template.version,
        resourceId: templateId,
      },
    });

    return updated;
  }

  /**
   * Apply a template to a device.
   * Creates a job for async execution.
   */
  async applyTemplate(input: TemplateApplicationInput) {
    // Validate template exists and is active
    const template = await this.store.getDeviceTemplate(input.templateId);

    if (!template || template.tenantId !== input.tenantId) {
      throw new Error(`Template ${input.templateId} not found`);
    }

    if (template.status !== 'active') {
      throw new Error(`Template must be active to apply (current status: ${template.status})`);
    }

    // Validate device exists
    const device = await this.store.getDeviceInventory(input.deviceId);

    if (!device || device.tenantId !== input.tenantId) {
      throw new Error(`Device ${input.deviceId} not found`);
    }

    // Resolve template variables
    const resolvedSettings = await this.resolveTemplateVariables(
      template.settings,
      input.deviceId,
      device.branchNodeId
    );

    // Create template assignment
    const assignment = await this.store.createDeviceTemplateAssignment({
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      templateId: input.templateId,
      templateVersion: template.version!,
      appliedBy: input.appliedBy,
      verificationStatus: 'pending',
    });

    // Create job
    const job = await this.store.createDeviceConfigurationJob({
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      jobType: 'template-apply',
      requestedBy: input.appliedBy,
      reason: `Apply template: ${template.name} v${template.version}`,
      priority: 'normal',
      payload: {
        assignmentId: assignment.id,
        templateId: input.templateId,
        templateName: template.name,
        templateVersion: template.version,
        settings: resolvedSettings,
      },
      status: 'queued',
    });

    await this.store.writeAudit({
      tenantId: input.tenantId,
      action: 'device.template.applied',
      actorUserId: input.appliedBy,
      resourceNodeId: device.branchNodeId ?? null,
      outcome: 'success',
      details: {
        jobId: job.id,
        resourceId: input.deviceId,
        templateId: input.templateId,
        templateName: template.name,
        templateVersion: template.version,
      },
    });

    return job;
  }

  /**
   * Detect configuration drift between template and actual device config.
   */
  async detectDrift(deviceId: string, templateId: string): Promise<DriftResult> {
    const template = await this.store.getDeviceTemplate(templateId);
    const device = await this.store.getDeviceInventory(deviceId);

    if (!template || !device) {
      throw new Error('Template or device not found');
    }

    // TODO: Implement actual device config fetching via ONVIF/vendor API
    // For now, return placeholder
    const actualConfig = await this.fetchDeviceConfiguration(deviceId);

    const drifts = this.compareConfigurations(template.settings, actualConfig);

    // Store drift records
    for (const drift of drifts) {
      await this.store.createConfigurationDrift({
        tenantId: device.tenantId,
        deviceId,
        templateId,
        driftType: drift.path,
        desiredValue: drift.desired,
        actualValue: drift.actual,
        acknowledged: false,
      });
    }

    return {
      deviceId,
      templateId,
      drifts,
    };
  }

  /**
   * Resolve template variables like {{branch-gateway}}, {{assigned}}, etc.
   */
  private async resolveTemplateVariables(
    settings: Record<string, unknown>,
    deviceId: string,
    branchId?: string
  ): Promise<Record<string, unknown>> {
    const device = await this.store.getDeviceInventory(deviceId);
    const network = branchId ? await this.store.getBranchNetwork(branchId) : null;

    const variables: Record<string, string> = {
      '{{branch-gateway}}': network?.gateway || '',
      '{{branch-dns}}': network?.dnsServers?.[0] || '',
      '{{branch-subnet}}': network?.networkCidr || '',
      '{{assigned}}': device?.ipAddress || '',
      '{{device-name}}': device?.deviceId || '',
    };

    return this.replaceVariables(settings, variables) as Record<string, unknown>;
  }

  /**
   * Recursively replace variables in template settings.
   */
  private replaceVariables(
    obj: unknown,
    variables: Record<string, string>
  ): unknown {
    if (typeof obj === 'string') {
      let result = obj;
      for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(key, 'g'), value);
      }
      return result;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.replaceVariables(item, variables));
    }

    if (typeof obj === 'object' && obj !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.replaceVariables(value, variables);
      }
      return result;
    }

    return obj;
  }

  /**
   * Fetch current device configuration via ONVIF/vendor API.
   */
  private async fetchDeviceConfiguration(deviceId: string): Promise<Record<string, unknown>> {
    // TODO: Implement actual device config fetching
    // This would use ONVIF or vendor-specific APIs
    return {};
  }

  /**
   * Compare desired and actual configurations to find drifts.
   */
  private compareConfigurations(
    desired: Record<string, unknown>,
    actual: Record<string, unknown>,
    path = ''
  ): Array<{ path: string; desired: unknown; actual: unknown }> {
    const drifts: Array<{ path: string; desired: unknown; actual: unknown }> = [];

    for (const [key, desiredValue] of Object.entries(desired)) {
      const currentPath = path ? `${path}.${key}` : key;
      const actualValue = actual[key];

      if (typeof desiredValue === 'object' && desiredValue !== null && !Array.isArray(desiredValue)) {
        // Recurse into nested objects
        drifts.push(
          ...this.compareConfigurations(
            desiredValue as Record<string, unknown>,
            (actualValue as Record<string, unknown>) || {},
            currentPath
          )
        );
      } else if (JSON.stringify(desiredValue) !== JSON.stringify(actualValue)) {
        drifts.push({
          path: currentPath,
          desired: desiredValue,
          actual: actualValue,
        });
      }
    }

    return drifts;
  }

  /**
   * List templates for a tenant.
   */
  async listTemplates(tenantId: string, filters?: { status?: string; templateType?: string }) {
    return this.store.listDeviceTemplates(tenantId, filters);
  }

  /**
   * List devices using a template.
   */
  async listDevicesWithTemplate(templateId: string) {
    return this.store.listDeviceTemplateAssignments(templateId);
  }

  /**
   * Get drift records for a device.
   */
  async getDeviceDrift(deviceId: string) {
    return this.store.listConfigurationDrift(deviceId, { acknowledged: false });
  }
}
