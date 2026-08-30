/**
 * DVR Profile Manager
 * 
 * Pre-configured Branch Templates and Channel Analytics Mapping
 * for enterprise multi-branch multi-tenant operations.
 */

export interface ChannelAnalyticsRuleConfig {
  detectionType: string;
  minConfidence: number;
  minDurationSeconds: number;
  zoneType?: "entry" | "cash_counter" | "restricted" | "parking" | "general";
  enabled: boolean;
}

export interface BranchChannelProfile {
  channelIndex: number;
  roleName: string;
  streamProfile: "sub" | "main";
  defaultRules: ChannelAnalyticsRuleConfig[];
}

export interface BranchIndustryProfile {
  id: string;
  name: string;
  description: string;
  channels: BranchChannelProfile[];
}

export const ENTERPRISE_INDUSTRY_PROFILES: Record<string, BranchIndustryProfile> = {
  retail: {
    id: "retail",
    name: "Retail Chain / Supermarket (4-8 Channels)",
    description: "Optimized for entrance footfall, queue dwell, safety compliance, and after-hours intrusion",
    channels: [
      {
        channelIndex: 1,
        roleName: "Main Customer Entrance",
        streamProfile: "sub",
        defaultRules: [
          { detectionType: "person", minConfidence: 0.65, minDurationSeconds: 0, zoneType: "entry", enabled: true },
          { detectionType: "human-analytics", minConfidence: 0.7, minDurationSeconds: 0, zoneType: "entry", enabled: true },
          { detectionType: "helmet", minConfidence: 0.7, minDurationSeconds: 1, zoneType: "entry", enabled: true },
        ],
      },
      {
        channelIndex: 2,
        roleName: "Cash Billing Counters / Queue",
        streamProfile: "sub",
        defaultRules: [
          { detectionType: "queue", minConfidence: 0.6, minDurationSeconds: 30, zoneType: "cash_counter", enabled: true },
          { detectionType: "crowd-density", minConfidence: 0.65, minDurationSeconds: 10, zoneType: "cash_counter", enabled: true },
        ],
      },
      {
        channelIndex: 3,
        roleName: "Store Floor / Aisle",
        streamProfile: "sub",
        defaultRules: [
          { detectionType: "heatmap", minConfidence: 0.5, minDurationSeconds: 0, zoneType: "general", enabled: true },
          { detectionType: "fall", minConfidence: 0.75, minDurationSeconds: 2, zoneType: "general", enabled: true },
          { detectionType: "unattended-objects", minConfidence: 0.7, minDurationSeconds: 60, zoneType: "general", enabled: true },
        ],
      },
      {
        channelIndex: 4,
        roleName: "Store Backroom & Fire Exit",
        streamProfile: "sub",
        defaultRules: [
          { detectionType: "fire-smoke", minConfidence: 0.7, minDurationSeconds: 3, zoneType: "restricted", enabled: true },
          { detectionType: "zone", minConfidence: 0.75, minDurationSeconds: 1, zoneType: "restricted", enabled: true },
          { detectionType: "camera-health", minConfidence: 0.8, minDurationSeconds: 0, zoneType: "restricted", enabled: true },
        ],
      },
    ],
  },

  banking: {
    id: "banking",
    name: "Bank Branch / Gold Loan / Financial Hub",
    description: "High-security configuration for ATM, Vault, Teller queues, and face recognition",
    channels: [
      {
        channelIndex: 1,
        roleName: "Branch / ATM Entrance",
        streamProfile: "sub",
        defaultRules: [
          { detectionType: "helmet", minConfidence: 0.75, minDurationSeconds: 1, zoneType: "entry", enabled: true },
          { detectionType: "face-analytics", minConfidence: 0.7, minDurationSeconds: 0, zoneType: "entry", enabled: true },
          { detectionType: "person", minConfidence: 0.7, minDurationSeconds: 0, zoneType: "entry", enabled: true },
        ],
      },
      {
        channelIndex: 2,
        roleName: "Teller Counter & Cash Area",
        streamProfile: "sub",
        defaultRules: [
          { detectionType: "queue", minConfidence: 0.65, minDurationSeconds: 20, zoneType: "cash_counter", enabled: true },
          { detectionType: "tailgating", minConfidence: 0.7, minDurationSeconds: 1, zoneType: "cash_counter", enabled: true },
        ],
      },
      {
        channelIndex: 3,
        roleName: "Strong Room / Safe Vault",
        streamProfile: "sub",
        defaultRules: [
          { detectionType: "zone", minConfidence: 0.8, minDurationSeconds: 0, zoneType: "restricted", enabled: true },
          { detectionType: "motion", minConfidence: 0.7, minDurationSeconds: 0, zoneType: "restricted", enabled: true },
          { detectionType: "camera-health", minConfidence: 0.85, minDurationSeconds: 0, zoneType: "restricted", enabled: true },
        ],
      },
      {
        channelIndex: 4,
        roleName: "Perimeter / After-hours Area",
        streamProfile: "sub",
        defaultRules: [
          { detectionType: "zone", minConfidence: 0.75, minDurationSeconds: 2, zoneType: "restricted", enabled: true },
          { detectionType: "fire-smoke", minConfidence: 0.75, minDurationSeconds: 3, zoneType: "general", enabled: true },
        ],
      },
    ],
  },

  warehouse: {
    id: "warehouse",
    name: "Warehouse & Logistics Hub",
    description: "Safety compliance (PPE/Helmet, Forklift/Vehicle, Fire/Smoke, Loading Bay ANPR)",
    channels: [
      {
        channelIndex: 1,
        roleName: "Gate & Truck Loading Bay",
        streamProfile: "sub",
        defaultRules: [
          { detectionType: "vehicle", minConfidence: 0.7, minDurationSeconds: 0, zoneType: "parking", enabled: true },
          { detectionType: "anpr", minConfidence: 0.75, minDurationSeconds: 0, zoneType: "parking", enabled: true },
        ],
      },
      {
        channelIndex: 2,
        roleName: "Storage Floor & Forklift Lanes",
        streamProfile: "sub",
        defaultRules: [
          { detectionType: "helmet", minConfidence: 0.7, minDurationSeconds: 1, zoneType: "general", enabled: true },
          { detectionType: "safety-analytics", minConfidence: 0.7, minDurationSeconds: 1, zoneType: "general", enabled: true },
          { detectionType: "fall", minConfidence: 0.75, minDurationSeconds: 2, zoneType: "general", enabled: true },
        ],
      },
      {
        channelIndex: 3,
        roleName: "High Rack Storage & Hazards",
        streamProfile: "sub",
        defaultRules: [
          { detectionType: "fire-smoke", minConfidence: 0.7, minDurationSeconds: 3, zoneType: "general", enabled: true },
          { detectionType: "camera-health", minConfidence: 0.8, minDurationSeconds: 0, zoneType: "general", enabled: true },
        ],
      },
    ],
  },
};

export class DvrProfileManager {
  static getProfile(profileId: string): BranchIndustryProfile {
    return ENTERPRISE_INDUSTRY_PROFILES[profileId] || ENTERPRISE_INDUSTRY_PROFILES.retail;
  }

  static listProfiles(): BranchIndustryProfile[] {
    return Object.values(ENTERPRISE_INDUSTRY_PROFILES);
  }
}
