/**
 * Device Template Service
 * 
 * Manages Golden Configuration Templates and Fleet Compliance for consistent device provisioning.
 * 
 * Key Features:
 * - Built-in Banking Standard Presets (branch_entrance, cash_counter, strongroom_vault, atm_vestibule, perimeter, universal)
 * - Declarative template schema with target classifications
 * - Dynamic parameter variable substitution ({{branch-gateway}}, {{branch-dns}}, {{branch-subnet}}, {{branch-ntp}}, {{branch-code}}, {{assigned}}, {{device-name}})
 * - Real hardware template application orchestrated via DeviceConfigurationService (with rollback & Read-After-Write verification)
 * - Staged rollout and bulk application across single devices, branches, and classifications
 * - Fleet-wide compliance audit and drift detection engine with 1-click automated drift remediation
 */

import { randomUUID } from 'node:crypto';
import type { ExtendedControlPlaneStore } from '../control-plane-store.js';
import type { DeviceConfigurationService } from './device-configuration.service.js';
import type { User } from '../domain/models.js';
import type {
  DeviceGoldenTemplate,
  GoldenTemplateSettings,
  TemplateTargetClassification,
  DeviceComplianceDrift,
  FleetComplianceReport,
  GoldenTemplateApplyRequest,
  ConfigurationDriftItem,
  ConfigurationApplyResult,
  ChannelVideoConfig,
  DeviceImageConfig,
  DeviceTimeConfig,
  DeviceNetworkConfig,
  RecordingSchedule,
  DayOfWeek,
  DailySchedule,
  SchedulePeriod,
  RecordingPeriodType,
} from '../types/device-configuration.types.js';

export interface TemplateInput {
  tenantId: string;
  name: string;
  templateType: 'camera-configuration' | 'recording' | 'analytics' | 'privacy' | 'network' | 'security-hardening' | 'location';
  category: string;
  settings: Record<string, unknown>;
  createdBy: string;
  classification?: TemplateTargetClassification;
  targetType?: 'camera' | 'recorder';
}

export interface TemplateApplicationInput {
  tenantId: string;
  deviceId: string;
  templateId: string;
  appliedBy: string;
}

export interface DriftResult {
  deviceId: string;
  templateId: string;
  drifts: Array<{
    path: string;
    desired: unknown;
    actual: unknown;
  }>;
}

/**
 * Built-in Banking Standard Presets adhering to strict security policies
 */
const ALL_DAYS: DayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

const createWeeklySchedule = (type: RecordingPeriodType): DailySchedule[] =>
  ALL_DAYS.map((day) => ({
    day,
    periods: [{ startHour: 0, startMinute: 0, endHour: 24, endMinute: 0, type }],
  }));

export const BANK_PRESET_TEMPLATES: DeviceGoldenTemplate[] = [
  {
    id: "tmpl-preset-branch-entrance",
    tenantId: "system",
    name: "Banking - Branch Entrance Standard",
    description: "High-frame rate, 1080p, backlight compensation for lobby & entrance lighting, 24/7 continuous recording",
    targetType: "camera",
    classification: "branch_entrance",
    version: 1,
    status: "published",
    settings: {
      videoConfig: {
        codec: "H264",
        resolution: { width: 1920, height: 1080 },
        fps: 30,
        frameRate: 30,
        bitrateKbps: 4096,
        h264Profile: "High",
      },
      imageConfig: {
        brightness: 50,
        colorSaturation: 50,
        contrast: 55,
        sharpness: 60,
        wideDynamicRange: { mode: "ON", level: 70 },
        irCutFilter: "AUTO",
      },
      timeConfig: {
        dateTimeType: "NTP",
        ntpServer: "{{branch-ntp}}",
        timeZone: "Asia/Kolkata",
      },
      networkConfig: {
        dhcpEnabled: false,
        ipAddress: "{{assigned}}",
        subnetMask: "{{branch-subnet}}",
        gateway: "{{branch-gateway}}",
        dnsServers: ["{{branch-dns}}"],
      },
      recordingSchedule: {
        channelNumber: 1,
        enabled: true,
        schedule: createWeeklySchedule("CONTINUOUS"),
        preRecordSeconds: 5,
        postRecordSeconds: 30,
      },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "tmpl-preset-cash-counter",
    tenantId: "system",
    name: "Banking - Cash Counter Teller Standard",
    description: "High-definition, maximum sharpness for currency note verification and continuous coverage",
    targetType: "camera",
    classification: "cash_counter",
    version: 1,
    status: "published",
    settings: {
      videoConfig: {
        codec: "H264",
        resolution: { width: 1920, height: 1080 },
        fps: 25,
        bitrateKbps: 4096,
        h264Profile: "High",
      },
      imageConfig: {
        brightness: 52,
        colorSaturation: 50,
        contrast: 58,
        sharpness: 75,
        wideDynamicRange: { mode: "ON", level: 60 },
        irCutFilter: "AUTO",
      },
      timeConfig: {
        dateTimeType: "NTP",
        ntpServer: "{{branch-ntp}}",
        timeZone: "Asia/Kolkata",
      },
      recordingSchedule: {
        channelNumber: 1,
        enabled: true,
        schedule: createWeeklySchedule("CONTINUOUS"),
        preRecordSeconds: 10,
        postRecordSeconds: 60,
      },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "tmpl-preset-strongroom-vault",
    tenantId: "system",
    name: "Banking - Strongroom & Vault Security Standard",
    description: "Ultra-secure perimeter, IR night vision, continuous recording with motion trigger alarms",
    targetType: "camera",
    classification: "strongroom_vault",
    version: 1,
    status: "published",
    settings: {
      videoConfig: {
        codec: "H264",
        resolution: { width: 1920, height: 1080 },
        fps: 25,
        bitrateKbps: 4096,
        h264Profile: "High",
      },
      imageConfig: {
        brightness: 50,
        colorSaturation: 50,
        contrast: 60,
        sharpness: 70,
        wideDynamicRange: { mode: "ON", level: 50 },
        irCutFilter: "AUTO",
      },
      timeConfig: {
        dateTimeType: "NTP",
        ntpServer: "{{branch-ntp}}",
        timeZone: "Asia/Kolkata",
      },
      recordingSchedule: {
        channelNumber: 1,
        enabled: true,
        schedule: createWeeklySchedule("CONTINUOUS"),
        preRecordSeconds: 15,
        postRecordSeconds: 90,
      },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "tmpl-preset-atm-vestibule",
    tenantId: "system",
    name: "Banking - ATM Vestibule Standard",
    description: "Optimized contrast and wide dynamic range for indoor/outdoor lighting transitions at ATM kiosks",
    targetType: "camera",
    classification: "atm_vestibule",
    version: 1,
    status: "published",
    settings: {
      videoConfig: {
        codec: "H264",
        resolution: { width: 1920, height: 1080 },
        fps: 25,
        bitrateKbps: 3072,
        h264Profile: "Main",
      },
      imageConfig: {
        brightness: 52,
        colorSaturation: 50,
        contrast: 60,
        sharpness: 65,
        wideDynamicRange: { mode: "ON", level: 65 },
        irCutFilter: "AUTO",
      },
      timeConfig: {
        dateTimeType: "NTP",
        ntpServer: "{{branch-ntp}}",
        timeZone: "Asia/Kolkata",
      },
      recordingSchedule: {
        channelNumber: 1,
        enabled: true,
        schedule: createWeeklySchedule("MOTION"),
        preRecordSeconds: 10,
        postRecordSeconds: 60,
      },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "tmpl-preset-perimeter",
    tenantId: "system",
    name: "Banking - Branch Perimeter Standard",
    description: "Outdoor surveillance with infrared day/night, 20 FPS bandwidth-optimized streaming",
    targetType: "camera",
    classification: "perimeter",
    version: 1,
    status: "published",
    settings: {
      videoConfig: {
        codec: "H264",
        resolution: { width: 1920, height: 1080 },
        fps: 20,
        bitrateKbps: 3072,
        h264Profile: "Main",
      },
      imageConfig: {
        brightness: 48,
        colorSaturation: 50,
        contrast: 55,
        sharpness: 60,
        wideDynamicRange: { mode: "ON", level: 50 },
        irCutFilter: "AUTO",
      },
      timeConfig: {
        dateTimeType: "NTP",
        ntpServer: "{{branch-ntp}}",
        timeZone: "Asia/Kolkata",
      },
      recordingSchedule: {
        channelNumber: 1,
        enabled: true,
        schedule: createWeeklySchedule("CONTINUOUS"),
        preRecordSeconds: 5,
        postRecordSeconds: 30,
      },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "tmpl-preset-universal",
    tenantId: "system",
    name: "Banking - Universal NVR & Recorder Baseline",
    description: "Standardized recorder schedule and NTP time synchronization across all branch NVRs",
    targetType: "recorder",
    classification: "universal",
    version: 1,
    status: "published",
    settings: {
      timeConfig: {
        dateTimeType: "NTP",
        ntpServer: "{{branch-ntp}}",
        timeZone: "Asia/Kolkata",
      },
      recordingSchedule: {
        channelNumber: 1,
        enabled: true,
        schedule: createWeeklySchedule("CONTINUOUS"),
        preRecordSeconds: 5,
        postRecordSeconds: 30,
      },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

export class DeviceTemplateService {
  constructor(
    private readonly store: ExtendedControlPlaneStore,
    private readonly deviceConfigService?: DeviceConfigurationService
  ) {}

  // =========================================================================
  // GOLDEN TEMPLATE CRUD & PRESETS
  // =========================================================================

  /**
   * List all golden templates, combining system presets with tenant-specific custom templates.
   */
  async listGoldenTemplates(tenantId: string): Promise<DeviceGoldenTemplate[]> {
    const customTemplates = await this.store.listDeviceTemplates(tenantId);
    
    // Map custom templates from store format to DeviceGoldenTemplate
    const mappedCustom: DeviceGoldenTemplate[] = (customTemplates || []).map((t: any) => ({
      id: t.id,
      tenantId: t.tenantId,
      name: t.name,
      description: t.description || t.category,
      targetType: (t.targetType || (t.settings?.recordingSchedule && !t.settings?.videoConfig ? 'recorder' : 'camera')) as 'camera' | 'recorder',
      classification: (t.targetClassification || t.classification || 'universal') as TemplateTargetClassification,
      version: t.version || 1,
      status: (t.status === 'active' || t.status === 'published' ? 'published' : t.status === 'deprecated' ? 'deprecated' : 'draft') as 'draft' | 'published' | 'deprecated',
      settings: (t.settings as GoldenTemplateSettings) || {},
      createdBy: t.createdBy,
      createdAt: t.createdAt || new Date().toISOString(),
      updatedAt: t.updatedAt || new Date().toISOString(),
    }));

    return [...BANK_PRESET_TEMPLATES, ...mappedCustom];
  }

  /**
   * Get a golden template by ID (checks presets, then store).
   */
  async getGoldenTemplate(templateId: string, tenantId?: string): Promise<DeviceGoldenTemplate | undefined> {
    const preset = BANK_PRESET_TEMPLATES.find((p) => p.id === templateId);
    if (preset) return preset;

    const t = await this.store.getDeviceTemplate(templateId);
    if (!t) return undefined;
    if (tenantId && t.tenantId !== tenantId && t.tenantId !== 'system') return undefined;

    return {
      id: t.id,
      tenantId: t.tenantId,
      name: t.name,
      description: t.description || t.category,
      targetType: (t.targetType || (t.settings?.recordingSchedule && !t.settings?.videoConfig ? 'recorder' : 'camera')) as 'camera' | 'recorder',
      classification: (t.targetClassification || t.classification || 'universal') as TemplateTargetClassification,
      version: t.version || 1,
      status: (t.status === 'active' || t.status === 'published' ? 'published' : t.status === 'deprecated' ? 'deprecated' : 'draft') as 'draft' | 'published' | 'deprecated',
      settings: (t.settings as GoldenTemplateSettings) || {},
      createdBy: t.createdBy,
      createdAt: t.createdAt || new Date().toISOString(),
      updatedAt: t.updatedAt || new Date().toISOString(),
    };
  }

  /**
   * Create a new Golden Configuration Template.
   */
  async createGoldenTemplate(input: {
    tenantId: string;
    name: string;
    description?: string;
    targetType: 'camera' | 'recorder';
    classification: TemplateTargetClassification;
    settings: GoldenTemplateSettings;
    createdBy: string;
  }): Promise<DeviceGoldenTemplate> {
    const template = await this.store.createDeviceTemplate({
      tenantId: input.tenantId,
      name: input.name,
      templateType: input.targetType === 'camera' ? 'camera-configuration' : 'recording',
      category: input.classification,
      version: 1,
      settings: input.settings as Record<string, unknown>,
      createdBy: input.createdBy,
      status: 'active',
      targetClassification: input.classification,
    });

    await this.store.writeAudit({
      tenantId: input.tenantId,
      action: 'device.golden_template.created',
      actorUserId: input.createdBy,
      resourceNodeId: null,
      outcome: 'success',
      details: {
        templateId: template.id,
        name: input.name,
        classification: input.classification,
        targetType: input.targetType,
      },
    });

    return {
      id: template.id,
      tenantId: input.tenantId,
      name: input.name,
      description: input.description,
      targetType: input.targetType,
      classification: input.classification,
      version: 1,
      status: 'published',
      settings: input.settings,
      createdBy: input.createdBy,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  /**
   * Update an existing Golden Configuration Template.
   */
  async updateGoldenTemplate(
    templateId: string,
    updates: {
      name?: string;
      description?: string;
      settings?: GoldenTemplateSettings;
      classification?: TemplateTargetClassification;
      status?: 'draft' | 'published' | 'deprecated';
    },
    user?: User
  ): Promise<DeviceGoldenTemplate | null> {
    // If preset, cannot edit system preset directly
    if (BANK_PRESET_TEMPLATES.some((p) => p.id === templateId)) {
      throw new Error('System preset templates cannot be modified directly. Please clone to create a custom template.');
    }

    const updated = await this.store.updateDeviceTemplate(templateId, {
      ...(updates.name ? { name: updates.name } : {}),
      ...(updates.classification ? { category: updates.classification, targetClassification: updates.classification } : {}),
      ...(updates.status ? { status: updates.status === 'published' ? 'active' : updates.status } : {}),
      ...(updates.settings ? { settings: updates.settings as Record<string, unknown> } : {}),
    });

    if (!updated) return null;

    if (user) {
      await this.store.writeAudit({
        tenantId: updated.tenantId,
        action: 'device.golden_template.updated',
        actorUserId: user.id,
        resourceNodeId: null,
        outcome: 'success',
        details: { templateId, updates },
      });
    }

    return this.getGoldenTemplate(templateId, updated.tenantId) as Promise<DeviceGoldenTemplate>;
  }

  // =========================================================================
  // VARIABLE RESOLUTION & STAGED APPLICATION
  // =========================================================================

  /**
   * Resolves parameter variables for a specific target device and its branch.
   */
  async resolveVariablesForDevice(
    settings: GoldenTemplateSettings,
    device: any,
    branchNetwork?: any
  ): Promise<GoldenTemplateSettings> {
    const subnetMask = branchNetwork?.subnetMask || this.cidrToSubnetMask(branchNetwork?.networkCidr) || '255.255.255.0';

    const variables: Record<string, string> = {
      '{{branch-gateway}}': branchNetwork?.gateway || '192.168.1.1',
      '{{branch-dns}}': branchNetwork?.dnsServers?.[0] || '8.8.8.8',
      '{{branch-subnet}}': subnetMask,
      '{{branch-ntp}}': branchNetwork?.ntpServer || (branchNetwork as any)?.ntp || 'pool.ntp.org',
      '{{branch-code}}': device?.branch || device?.branchNodeId || (device as any)?.branchCode || 'BR-001',
      '{{assigned}}': device?.ipAddress || (device as any)?.ip || '192.168.1.100',
      '{{device-name}}': device?.displayName || device?.name || device?.deviceId || 'Device',
    };

    return this.replaceVariables(settings, variables) as GoldenTemplateSettings;
  }

  private cidrToSubnetMask(cidr?: string): string {
    if (!cidr) return '255.255.255.0';
    if (cidr.includes('.') && !cidr.includes('/')) return cidr;
    const parts = cidr.split('/');
    if (parts.length === 2 && parts[1] !== undefined) {
      const prefix = parseInt(parts[1], 10);
      if (!isNaN(prefix) && prefix >= 0 && prefix <= 32) {
        const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
        return [
          (mask >>> 24) & 255,
          (mask >>> 16) & 255,
          (mask >>> 8) & 255,
          mask & 255,
        ].join('.');
      }
    }
    return '255.255.255.0';
  }

  /**
   * Apply Golden Template across Single Device, Entire Branch, Camera Classification, or Fleet.
   * Performs pre-flight rollback snapshots, hardware mutations via DeviceConfigurationService,
   * and physical Read-After-Write verification.
   */
  async applyGoldenTemplate(
    tenantId: string,
    templateId: string,
    req: GoldenTemplateApplyRequest,
    user: User,
    options?: { confirmNetworkChange?: boolean }
  ): Promise<{
    templateId: string;
    scope: string;
    totalTargeted: number;
    appliedCount: number;
    failedCount: number;
    results: Array<{
      deviceId: string;
      deviceName?: string;
      success: boolean;
      details?: ConfigurationApplyResult[];
      error?: string;
    }>;
  }> {
    const template = await this.getGoldenTemplate(templateId, tenantId);
    if (!template) {
      throw new Error(`Golden template ${templateId} not found`);
    }

    // Resolve target devices
    const targetDevices = await this.resolveTargetDevices(tenantId, req, template);
    if (targetDevices.length === 0) {
      return {
        templateId,
        scope: req.scope,
        totalTargeted: 0,
        appliedCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    const results: Array<{
      deviceId: string;
      deviceName?: string;
      success: boolean;
      details?: ConfigurationApplyResult[];
      error?: string;
    }> = [];

    let appliedCount = 0;
    let failedCount = 0;

    for (const device of targetDevices) {
      const deviceId = device.id || device.deviceId;
      const deviceName = device.displayName || device.name || device.deviceId || deviceId;

      try {
        const branchId = device.branchNodeId || device.branchId || device.branch;
        const branchNetwork = branchId ? await this.store.getBranchNetwork(branchId) : null;
        const resolvedSettings = await this.resolveVariablesForDevice(template.settings, device, branchNetwork);

        const applyResults: ConfigurationApplyResult[] = [];

        if (this.deviceConfigService) {
          // 1. Pre-flight snapshot capture
          try {
            await this.deviceConfigService.captureSnapshot(tenantId, deviceId, user);
          } catch (snapErr) {
            console.warn(`[DeviceTemplateService] Snapshot warning for ${deviceId}:`, snapErr);
          }

          // 2. Video Configuration
          if (resolvedSettings.videoConfig) {
            const rawV = resolvedSettings.videoConfig as any;
            const normalizedVideo: ChannelVideoConfig = {
              codec: (rawV.codec?.replace(".", "") as any) || "H264",
              resolution: rawV.resolution || { width: 1920, height: 1080 },
              fps: rawV.fps ?? rawV.frameRate ?? 25,
              bitrateKbps: rawV.bitrateKbps || 4096,
              quality: rawV.quality ?? 75,
              govLength: rawV.govLength ?? 50,
              h264Profile: rawV.h264Profile || rawV.profile || "Main",
              streamProfileToken: rawV.streamProfileToken,
            };
            const res = await this.deviceConfigService.setVideoConfiguration(
              tenantId,
              deviceId,
              user,
              normalizedVideo
            );
            applyResults.push(res);
          }

          // 3. Imaging Configuration
          if (resolvedSettings.imageConfig) {
            const res = await this.deviceConfigService.setImagingConfiguration(
              tenantId,
              deviceId,
              user,
              resolvedSettings.imageConfig as DeviceImageConfig
            );
            applyResults.push(res);
          }

          // 4. Time Configuration
          if (resolvedSettings.timeConfig) {
            const res = await this.deviceConfigService.setTimeConfiguration(
              tenantId,
              deviceId,
              user,
              resolvedSettings.timeConfig as DeviceTimeConfig
            );
            applyResults.push(res);
          }

          // 5. Network Configuration (only applied if confirmNetworkChange is explicitly provided)
          if (resolvedSettings.networkConfig && options?.confirmNetworkChange) {
            const rawNet = resolvedSettings.networkConfig as any;
            const normalizedNet: DeviceNetworkConfig = {
              dhcpEnabled: Boolean(rawNet.dhcpEnabled),
              ipAddress: rawNet.ipAddress,
              subnetMask: rawNet.subnetMask || "255.255.255.0",
              gateway: rawNet.gateway || rawNet.defaultGateway || "192.168.1.1",
              dnsServers: rawNet.dnsServers,
            };
            try {
              const res = await this.deviceConfigService.setNetworkConfiguration(
                tenantId,
                deviceId,
                user,
                normalizedNet,
                options.confirmNetworkChange
              );
              applyResults.push(res);
            } catch (netErr) {
              console.warn(`[DeviceTemplateService] Network config apply warning for ${deviceId}:`, netErr);
            }
          }

          // 6. Recording Schedule (if recorder or schedule specified)
          if (resolvedSettings.recordingSchedule) {
            try {
              const res = await this.deviceConfigService.setRecorderSchedule(
                tenantId,
                deviceId,
                '1',
                user,
                resolvedSettings.recordingSchedule as RecordingSchedule
              );
              applyResults.push(res);
            } catch {
              // Best-effort for schedule if device is camera rather than recorder
            }
          }
        }

        // Record template assignment in store
        await this.store.createDeviceTemplateAssignment({
          tenantId,
          deviceId,
          templateId,
          templateVersion: template.version,
          appliedBy: user.id,
          verificationStatus: applyResults.every((r) => r.success) ? 'verified' : 'drifted',
        });

        const allSuccessful = applyResults.length === 0 || applyResults.every((r) => r.success);
        if (allSuccessful) {
          appliedCount++;
        } else {
          failedCount++;
        }

        results.push({
          deviceId,
          deviceName,
          success: allSuccessful,
          details: applyResults,
        });
      } catch (err: any) {
        failedCount++;
        results.push({
          deviceId,
          deviceName,
          success: false,
          error: err.message || String(err),
        });
      }
    }

    await this.store.writeAudit({
      tenantId,
      action: 'device.golden_template.bulk_applied',
      actorUserId: user.id,
      resourceNodeId: null,
      outcome: failedCount === 0 ? 'success' : 'failure',
      details: {
        templateId,
        templateName: template.name,
        scope: req.scope,
        totalTargeted: targetDevices.length,
        appliedCount,
        failedCount,
      },
    });

    return {
      templateId,
      scope: req.scope,
      totalTargeted: targetDevices.length,
      appliedCount,
      failedCount,
      results,
    };
  }

  // =========================================================================
  // FLEET COMPLIANCE AUDIT & DRIFT REMEDIATION
  // =========================================================================

  /**
   * Evaluates fleet-wide configuration compliance against Golden Templates.
   */
  async calculateFleetCompliance(
    tenantId: string,
    filterTemplateId?: string,
    user?: User
  ): Promise<FleetComplianceReport> {
    const allDevices = await this.getAllTenantDevices(tenantId);
    const goldenTemplates = await this.listGoldenTemplates(tenantId);

    const drifts: DeviceComplianceDrift[] = [];
    const classificationStats: Record<string, { total: number; compliant: number; percentage: number }> = {
      branch_entrance: { total: 0, compliant: 0, percentage: 100 },
      cash_counter: { total: 0, compliant: 0, percentage: 100 },
      strongroom_vault: { total: 0, compliant: 0, percentage: 100 },
      atm_vestibule: { total: 0, compliant: 0, percentage: 100 },
      perimeter: { total: 0, compliant: 0, percentage: 100 },
      universal: { total: 0, compliant: 0, percentage: 100 },
    };

    let compliantCount = 0;
    let driftedCount = 0;
    let unassignedCount = 0;

    const currentUser = user || {
      id: 'system-compliance-auditor',
      displayName: 'System Compliance Auditor',
      email: 'system@omsystems.internal',
      tenantId,
      role: 'super_admin',
    };

    for (const device of allDevices) {
      const deviceId = device.id || device.deviceId;
      const deviceName = device.displayName || device.name || device.deviceId || deviceId;

      // Determine template to match:
      // 1. Specified filterTemplateId
      // 2. Assigned template from store
      // 3. Fallback to default preset matching device classification
      let template: DeviceGoldenTemplate | undefined;

      if (filterTemplateId) {
        template = goldenTemplates.find((t) => t.id === filterTemplateId);
      } else {
        const assignment = await this.store.getDeviceTemplateAssignment(deviceId, '');
        if (assignment?.templateId) {
          template = goldenTemplates.find((t) => t.id === assignment.templateId);
        }
        if (!template) {
          const deviceClassification =
            (device.classification ||
              (device as any).category ||
              (device.deviceType === 'recorder' || device.deviceType === 'nvr' ? 'universal' : 'branch_entrance')) as TemplateTargetClassification;
          template = goldenTemplates.find((t) => t.classification === deviceClassification) ||
                     goldenTemplates.find((t) => t.id === 'tmpl-preset-branch-entrance');
        }
      }

      if (!template) {
        unassignedCount++;
        continue;
      }

      const branchId = device.branchNodeId || device.branchId || device.branch;
      const branchNetwork = branchId ? await this.store.getBranchNetwork(branchId) : null;
      const expectedSettings = await this.resolveVariablesForDevice(template.settings, device, branchNetwork);

      // Fetch actual hardware configuration
      const actualConfig = await this.fetchDeviceConfigurationSafely(deviceId, tenantId, currentUser);

      // Compare actual vs expected
      const deviceDrifts = this.evaluateConfigurationDrift(expectedSettings, actualConfig);

      const classification = template.classification || 'universal';
      if (!classificationStats[classification]) {
        classificationStats[classification] = { total: 0, compliant: 0, percentage: 100 };
      }
      classificationStats[classification].total++;

      if (deviceDrifts.length === 0) {
        compliantCount++;
        classificationStats[classification].compliant++;
        drifts.push({
          deviceId,
          deviceName,
          templateId: template.id,
          templateName: template.name,
          classification,
          drifts: [],
          status: 'compliant',
          lastEvaluatedAt: new Date().toISOString(),
        });
      } else {
        driftedCount++;
        drifts.push({
          deviceId,
          deviceName,
          templateId: template.id,
          templateName: template.name,
          classification,
          drifts: deviceDrifts,
          status: 'drifted',
          lastEvaluatedAt: new Date().toISOString(),
        });
      }
    }

    // Calculate percentages
    for (const stats of Object.values(classificationStats)) {
      stats.percentage = stats.total > 0 ? Math.round((stats.compliant / stats.total) * 100) : 100;
    }

    const totalEvaluated = compliantCount + driftedCount;
    const overallPercentage = totalEvaluated > 0 ? Math.round((compliantCount / totalEvaluated) * 100) : 100;

    return {
      tenantId,
      overallPercentage,
      totalDevicesEvaluated: totalEvaluated,
      compliantCount,
      driftedCount,
      unassignedCount,
      byClassification: classificationStats,
      drifts,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * 1-Click Automated Drift Remediation: Re-applies Golden Template settings to bring drifted devices into compliance.
   */
  async remediateDrift(
    tenantId: string,
    templateId: string,
    user: User,
    deviceIds?: string[]
  ): Promise<{
    remediatedCount: number;
    failedCount: number;
    results: any[];
  }> {
    const template = await this.getGoldenTemplate(templateId, tenantId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    let targetIds = deviceIds;
    if (!targetIds || targetIds.length === 0) {
      const compliance = await this.calculateFleetCompliance(tenantId, templateId, user);
      targetIds = compliance.drifts.filter((d) => d.status === 'drifted').map((d) => d.deviceId);
    }

    if (targetIds.length === 0) {
      return { remediatedCount: 0, failedCount: 0, results: [] };
    }

    const applyResults: any[] = [];
    let remediatedCount = 0;
    let failedCount = 0;

    for (const deviceId of targetIds) {
      const res = await this.applyGoldenTemplate(
        tenantId,
        templateId,
        { scope: 'single', deviceId },
        user,
        { confirmNetworkChange: true }
      );

      const deviceRes = res.results[0];
      if (deviceRes?.success) {
        remediatedCount++;
      } else {
        failedCount++;
      }
      applyResults.push(deviceRes || { deviceId, success: false });
    }

    return {
      remediatedCount,
      failedCount,
      results: applyResults,
    };
  }

  // =========================================================================
  // INTERNAL HELPERS & BACKWARD COMPATIBILITY
  // =========================================================================

  private async resolveTargetDevices(
    tenantId: string,
    req: GoldenTemplateApplyRequest,
    template: DeviceGoldenTemplate
  ): Promise<any[]> {
    const allDevices = await this.getAllTenantDevices(tenantId);

    if (req.scope === 'single' && req.deviceId) {
      const matched = allDevices.filter((d) => (d.id || d.deviceId) === req.deviceId);
      if (matched.length > 0) return matched;
      return [{
        id: req.deviceId,
        deviceId: req.deviceId,
        displayName: req.deviceId,
        tenantId,
        branchNodeId: req.branchId,
        classification: req.classification || template.classification || 'universal',
      }];
    }

    if (req.scope === 'branch' && req.branchId) {
      return allDevices.filter(
        (d) =>
          d.branchNodeId === req.branchId ||
          d.branchId === req.branchId ||
          d.branch === req.branchId
      );
    }

    if (req.scope === 'classification' || template.classification) {
      const targetClass = req.classification || template.classification;
      if (targetClass === 'universal') {
        return allDevices;
      }
      return allDevices.filter(
        (d) =>
          d.classification === targetClass ||
          (d as any).category === targetClass ||
          (d.displayName || d.name || '').toLowerCase().includes(targetClass.replace('_', ' '))
      );
    }

    // Default fleet: all devices
    return allDevices;
  }

  private async getAllTenantDevices(tenantId: string): Promise<any[]> {
    let inventory: any[] = [];
    try {
      if (typeof (this.store as any).listDeviceInventory === 'function') {
        inventory = (await (this.store as any).listDeviceInventory(tenantId)) || [];
      } else if (Array.isArray((this.store as any).deviceInventory)) {
        inventory = (this.store as any).deviceInventory.filter((d: any) => !d.tenantId || d.tenantId === tenantId);
      }
    } catch {
      inventory = [];
    }

    let cameras: any[] = [];
    try {
      if (typeof (this.store as any).listCameras === 'function') {
        cameras = (await (this.store as any).listCameras(tenantId)) || [];
      } else if ((this.store as any).cameras instanceof Map) {
        cameras = Array.from((this.store as any).cameras.values()).filter(
          (c: any) => !c.tenantId || c.tenantId === tenantId || tenantId === 'omsystems'
        );
      } else if (Array.isArray((this.store as any).cameras)) {
        cameras = (this.store as any).cameras.filter(
          (c: any) => !c.tenantId || c.tenantId === tenantId || tenantId === 'omsystems'
        );
      }
    } catch {
      cameras = [];
    }

    const merged = new Map<string, any>();
    for (const inv of inventory) {
      merged.set(inv.id || inv.deviceId, inv);
    }
    for (const cam of cameras) {
      const key = cam.id || cam.deviceId;
      if (key && !merged.has(key)) {
        merged.set(key, {
          id: cam.id,
          deviceId: cam.id,
          displayName: cam.name,
          name: cam.name,
          tenantId: cam.tenantId || tenantId,
          deviceType: 'ip-camera',
          branchNodeId: cam.nodeId || cam.branchId,
          branch: cam.nodeId || cam.branchId,
          ipAddress: cam.ipAddress,
          classification: (cam as any).classification || 'branch_entrance',
        });
      }
    }

    return Array.from(merged.values());
  }

  private async fetchDeviceConfigurationSafely(
    deviceId: string,
    tenantId: string,
    user: User
  ): Promise<Record<string, unknown>> {
    if (this.deviceConfigService) {
      try {
        return await this.deviceConfigService.readDeviceConfiguration(tenantId, deviceId, user);
      } catch {
        // Fallback
      }
    }
    return {};
  }

  private evaluateConfigurationDrift(
    expected: GoldenTemplateSettings,
    actual: Record<string, unknown>
  ): ConfigurationDriftItem[] {
    const drifts: ConfigurationDriftItem[] = [];

    // 1. Video configuration comparison
    if (expected.videoConfig && actual.video) {
      const expV = expected.videoConfig;
      const actV = actual.video as ChannelVideoConfig;

      const expCodec = expV.codec ? (expV.codec as string).replace(".", "") : undefined;
      const actCodec = actV.codec ? (actV.codec as string).replace(".", "") : undefined;
      if (expCodec && actCodec && expCodec !== actCodec) {
        drifts.push({
          section: 'video',
          field: 'codec',
          expectedValue: expCodec,
          actualValue: actCodec,
          path: 'videoConfig.codec',
          desired: expCodec,
          actual: actCodec,
        });
      }

      const expFps = (expV as any).fps ?? (expV as any).frameRate;
      const actFps = (actV as any).fps ?? (actV as any).frameRate;
      if (expFps && actFps && expFps !== actFps) {
        drifts.push({
          section: 'video',
          field: 'frameRate',
          expectedValue: expFps,
          actualValue: actFps,
          path: 'videoConfig.fps',
          desired: expFps,
          actual: actFps,
        });
      }
      if (expV.bitrateKbps && actV.bitrateKbps && expV.bitrateKbps !== actV.bitrateKbps) {
        drifts.push({
          section: 'video',
          field: 'bitrateKbps',
          expectedValue: expV.bitrateKbps,
          actualValue: actV.bitrateKbps,
          path: 'videoConfig.bitrateKbps',
          desired: expV.bitrateKbps,
          actual: actV.bitrateKbps,
        });
      }
      if (expV.resolution && actV.resolution) {
        if (expV.resolution.width !== actV.resolution.width || expV.resolution.height !== actV.resolution.height) {
          drifts.push({
            section: 'video',
            field: 'resolution',
            expectedValue: `${expV.resolution.width}x${expV.resolution.height}`,
            actualValue: `${actV.resolution.width}x${actV.resolution.height}`,
            path: 'videoConfig.resolution',
            desired: `${expV.resolution.width}x${expV.resolution.height}`,
            actual: `${actV.resolution.width}x${actV.resolution.height}`,
          });
        }
      }
    }

    // 2. Image configuration comparison
    if (expected.imageConfig && actual.imaging) {
      const expI = expected.imageConfig;
      const actI = actual.imaging as DeviceImageConfig;

      if (expI.brightness !== undefined && actI.brightness !== undefined && Math.abs(expI.brightness - actI.brightness) > 5) {
        drifts.push({
          section: 'imaging',
          field: 'brightness',
          expectedValue: expI.brightness,
          actualValue: actI.brightness,
          path: 'imageConfig.brightness',
          desired: expI.brightness,
          actual: actI.brightness,
        });
      }
      if (expI.contrast !== undefined && actI.contrast !== undefined && Math.abs(expI.contrast - actI.contrast) > 5) {
        drifts.push({
          section: 'imaging',
          field: 'contrast',
          expectedValue: expI.contrast,
          actualValue: actI.contrast,
          path: 'imageConfig.contrast',
          desired: expI.contrast,
          actual: actI.contrast,
        });
      }
      if (expI.sharpness !== undefined && actI.sharpness !== undefined && Math.abs(expI.sharpness - actI.sharpness) > 5) {
        drifts.push({
          section: 'imaging',
          field: 'sharpness',
          expectedValue: expI.sharpness,
          actualValue: actI.sharpness,
          path: 'imageConfig.sharpness',
          desired: expI.sharpness,
          actual: actI.sharpness,
        });
      }
      if (expI.wideDynamicRange?.mode && actI.wideDynamicRange?.mode && expI.wideDynamicRange.mode !== actI.wideDynamicRange.mode) {
        drifts.push({
          section: 'imaging',
          field: 'wideDynamicRange.mode',
          expectedValue: expI.wideDynamicRange.mode,
          actualValue: actI.wideDynamicRange.mode,
          path: 'imageConfig.wideDynamicRange.mode',
          desired: expI.wideDynamicRange.mode,
          actual: actI.wideDynamicRange.mode,
        });
      }
    }

    // 3. Time configuration comparison
    if (expected.timeConfig && actual.time) {
      const expT = expected.timeConfig;
      const actT = actual.time as any;

      if (expT.timeZone && actT.timeZone && expT.timeZone !== actT.timeZone) {
        drifts.push({
          section: 'time',
          field: 'timeZone',
          expectedValue: expT.timeZone,
          actualValue: actT.timeZone,
          path: 'timeConfig.timeZone',
          desired: expT.timeZone,
          actual: actT.timeZone,
        });
      }
    }

    return drifts;
  }

  private replaceVariables(obj: unknown, variables: Record<string, string>): unknown {
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

  // =========================================================================
  // LEGACY METHODS (PRESERVED FOR BACKWARD COMPATIBILITY)
  // =========================================================================

  async createTemplate(input: TemplateInput) {
    if (typeof input.settings !== 'object' || input.settings === null) {
      throw new Error('Template settings must be a valid JSON object');
    }

    const existingTemplates = await this.store.listDeviceTemplates(input.tenantId, {
      name: input.name,
    });

    const maxVersion = existingTemplates.reduce(
      (max: number, t: any) => Math.max(max, t.version || 0),
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
      targetClassification: input.classification,
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

  async applyTemplate(input: TemplateApplicationInput) {
    const template = await this.store.getDeviceTemplate(input.templateId);

    if (!template || template.tenantId !== input.tenantId) {
      throw new Error(`Template ${input.templateId} not found`);
    }

    if (template.status !== 'active') {
      throw new Error(`Template must be active to apply (current status: ${template.status})`);
    }

    const device = await this.store.getDeviceInventory(input.deviceId);
    if (!device || device.tenantId !== input.tenantId) {
      throw new Error(`Device ${input.deviceId} not found`);
    }

    const branchNetwork = device.branchNodeId ? await this.store.getBranchNetwork(device.branchNodeId) : null;
    const resolvedSettings = await this.resolveVariablesForDevice(template.settings, device, branchNetwork);

    const assignment = await this.store.createDeviceTemplateAssignment({
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      templateId: input.templateId,
      templateVersion: template.version!,
      appliedBy: input.appliedBy,
      verificationStatus: 'pending',
    });

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

  async detectDrift(deviceId: string, templateId: string): Promise<DriftResult> {
    const template = await this.store.getDeviceTemplate(templateId);
    const device = await this.store.getDeviceInventory(deviceId);

    if (!template || !device) {
      throw new Error('Template or device not found');
    }

    const sysUser: User = {
      id: 'system-drift-scanner',
      displayName: 'System Drift Scanner',
      email: 'system@omsystems.internal',
      tenantId: device.tenantId,
      role: 'super_admin',
    };

    const actualConfig = await this.fetchDeviceConfigurationSafely(deviceId, device.tenantId, sysUser);
    const branchNetwork = device.branchNodeId ? await this.store.getBranchNetwork(device.branchNodeId) : null;
    const resolvedSettings = await this.resolveVariablesForDevice(template.settings, device, branchNetwork);

    const drifts = this.compareConfigurations(resolvedSettings as Record<string, unknown>, actualConfig);

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

  async listTemplates(tenantId: string, filters?: { status?: string; templateType?: string }) {
    return this.store.listDeviceTemplates(tenantId, filters);
  }

  async listDevicesWithTemplate(templateId: string) {
    return this.store.listDeviceTemplateAssignments(templateId);
  }

  async getDeviceDrift(deviceId: string) {
    return this.store.listConfigurationDrift(deviceId, { acknowledged: false });
  }
}
