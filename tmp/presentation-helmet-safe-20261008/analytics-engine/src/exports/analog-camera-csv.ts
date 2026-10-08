/**
 * Analog Camera CSV Export
 * Structured export schema for analog camera analytics report
 */

import { serializeCsv, type CsvColumn } from './csv.js';

/**
 * Flattened export row for analog camera analytics
 * This is the public export schema - do not expose internal IDs or credentials
 */
export interface AnalogCameraExportRow {
  // Camera Identity
  cameraId: string;
  cameraName?: string;
  location?: string;
  
  // Camera Type & Classification
  cameraType: string;
  analogStandard?: string;
  signalType?: string;
  connectionType?: string;
  
  // Resolution
  resolutionWidth?: number;
  resolutionHeight?: number;
  resolutionMegapixels?: number;
  
  // Video Quality Metrics
  videoQualityScore?: number;
  brightness?: number;
  contrast?: number;
  sharpness?: number;
  noiseLevel?: number;
  colorSaturation?: number;
  interlacing?: number;
  
  // Quality Issues
  qualityIssues?: string; // Comma-separated list
  qualityIssueCount?: number;
  mostSevereIssue?: string;
  degradationTrend?: string;
  
  // AI Performance
  aiAccuracyEstimate?: number;
  aiCapabilities?: string; // Comma-separated list
  
  // Camera Health & Aging
  estimatedAgeYears?: number;
  healthScore?: number;
  failureRiskScore?: number;
  replacementPriority?: number;
  
  // Maintenance & Recommendations
  maintenanceRecommendation?: string;
  maintenancePriority?: string;
  estimatedMaintenanceCostUSD?: number;
  maintenanceUrgencyDays?: number;
  
  // Upgrade Recommendations
  upgradeRecommendation?: string;
  recommendedUpgradeType?: string;
  upgradeAccuracyGain?: number;
  upgradeCostUSD?: number;
  upgradeROIPriority?: string;
  
  // DVR/Channel Information
  dvrId?: string;
  dvrName?: string;
  channelNumber?: number;
  channelStatus?: string;
  
  // Feature Support
  nightVision?: string; // Yes/No
  wdr?: string; // Yes/No
  ptz?: string; // Yes/No
  colorMode?: string;
  
  // Operational Status
  status?: string;
  lastSeenAt?: Date | null;
  lastQualityCheckAt?: Date | null;
  
  // Timestamps
  firstSeenAt?: Date | null;
  installationDate?: Date | null;
}

/**
 * Fixed column schema for analog camera CSV export
 * Defines exact order and formatting of columns
 */
const ANALOG_CAMERA_CSV_COLUMNS: CsvColumn<AnalogCameraExportRow>[] = [
  // Identity
  {
    header: 'Camera ID',
    value: (row) => row.cameraId,
  },
  {
    header: 'Camera Name',
    value: (row) => row.cameraName ?? '',
  },
  {
    header: 'Location',
    value: (row) => row.location ?? '',
  },
  
  // Classification
  {
    header: 'Camera Type',
    value: (row) => row.cameraType,
  },
  {
    header: 'Analog Standard',
    value: (row) => row.analogStandard ?? '',
  },
  {
    header: 'Signal Type',
    value: (row) => row.signalType ?? '',
  },
  {
    header: 'Connection Type',
    value: (row) => row.connectionType ?? '',
  },
  
  // Resolution
  {
    header: 'Resolution Width',
    value: (row) => row.resolutionWidth ?? '',
  },
  {
    header: 'Resolution Height',
    value: (row) => row.resolutionHeight ?? '',
  },
  {
    header: 'Megapixels',
    value: (row) => row.resolutionMegapixels ?? '',
  },
  
  // Video Quality
  {
    header: 'Video Quality Score',
    value: (row) => row.videoQualityScore ?? '',
  },
  {
    header: 'Brightness',
    value: (row) => row.brightness ?? '',
  },
  {
    header: 'Contrast',
    value: (row) => row.contrast ?? '',
  },
  {
    header: 'Sharpness',
    value: (row) => row.sharpness ?? '',
  },
  {
    header: 'Noise Level',
    value: (row) => row.noiseLevel ?? '',
  },
  {
    header: 'Color Saturation',
    value: (row) => row.colorSaturation ?? '',
  },
  {
    header: 'Interlacing',
    value: (row) => row.interlacing ?? '',
  },
  
  // Quality Issues
  {
    header: 'Quality Issues',
    value: (row) => row.qualityIssues ?? '',
  },
  {
    header: 'Issue Count',
    value: (row) => row.qualityIssueCount ?? '',
  },
  {
    header: 'Most Severe Issue',
    value: (row) => row.mostSevereIssue ?? '',
  },
  {
    header: 'Degradation Trend',
    value: (row) => row.degradationTrend ?? '',
  },
  
  // AI Performance
  {
    header: 'AI Accuracy Estimate (%)',
    value: (row) => row.aiAccuracyEstimate ?? '',
  },
  {
    header: 'AI Capabilities',
    value: (row) => row.aiCapabilities ?? '',
  },
  
  // Health & Aging
  {
    header: 'Estimated Age (Years)',
    value: (row) => row.estimatedAgeYears ?? '',
  },
  {
    header: 'Health Score',
    value: (row) => row.healthScore ?? '',
  },
  {
    header: 'Failure Risk Score',
    value: (row) => row.failureRiskScore ?? '',
  },
  {
    header: 'Replacement Priority',
    value: (row) => row.replacementPriority ?? '',
  },
  
  // Maintenance
  {
    header: 'Maintenance Recommendation',
    value: (row) => row.maintenanceRecommendation ?? '',
  },
  {
    header: 'Maintenance Priority',
    value: (row) => row.maintenancePriority ?? '',
  },
  {
    header: 'Maintenance Cost (USD)',
    value: (row) => row.estimatedMaintenanceCostUSD ?? '',
  },
  {
    header: 'Maintenance Urgency (Days)',
    value: (row) => row.maintenanceUrgencyDays ?? '',
  },
  
  // Upgrade Recommendations
  {
    header: 'Upgrade Recommendation',
    value: (row) => row.upgradeRecommendation ?? '',
  },
  {
    header: 'Recommended Upgrade Type',
    value: (row) => row.recommendedUpgradeType ?? '',
  },
  {
    header: 'Upgrade Accuracy Gain (%)',
    value: (row) => row.upgradeAccuracyGain ?? '',
  },
  {
    header: 'Upgrade Cost (USD)',
    value: (row) => row.upgradeCostUSD ?? '',
  },
  {
    header: 'Upgrade ROI Priority',
    value: (row) => row.upgradeROIPriority ?? '',
  },
  
  // DVR/Channel
  {
    header: 'DVR ID',
    value: (row) => row.dvrId ?? '',
  },
  {
    header: 'DVR Name',
    value: (row) => row.dvrName ?? '',
  },
  {
    header: 'Channel Number',
    value: (row) => row.channelNumber ?? '',
  },
  {
    header: 'Channel Status',
    value: (row) => row.channelStatus ?? '',
  },
  
  // Features
  {
    header: 'Night Vision',
    value: (row) => row.nightVision ?? '',
  },
  {
    header: 'WDR',
    value: (row) => row.wdr ?? '',
  },
  {
    header: 'PTZ',
    value: (row) => row.ptz ?? '',
  },
  {
    header: 'Color Mode',
    value: (row) => row.colorMode ?? '',
  },
  
  // Status
  {
    header: 'Status',
    value: (row) => row.status ?? '',
  },
  {
    header: 'Last Seen At',
    value: (row) => row.lastSeenAt ?? '',
  },
  {
    header: 'Last Quality Check At',
    value: (row) => row.lastQualityCheckAt ?? '',
  },
  {
    header: 'First Seen At',
    value: (row) => row.firstSeenAt ?? '',
  },
  {
    header: 'Installation Date',
    value: (row) => row.installationDate ?? '',
  },
];

/**
 * Serialize analog camera analytics to CSV format
 * Always returns valid CSV with headers, even for empty data
 */
export function serializeAnalogCameraCsv(
  cameras: AnalogCameraExportRow[]
): string {
  return serializeCsv(cameras, ANALOG_CAMERA_CSV_COLUMNS);
}

/**
 * Helper: Convert boolean to Yes/No string for CSV
 */
export function boolToYesNo(value: boolean | undefined): string {
  if (value === undefined) return '';
  return value ? 'Yes' : 'No';
}

/**
 * Helper: Join array of strings with semicolons (safer than commas in CSV)
 */
export function joinForCsv(items: string[] | undefined): string {
  if (!items || items.length === 0) return '';
  return items.join('; ');
}
