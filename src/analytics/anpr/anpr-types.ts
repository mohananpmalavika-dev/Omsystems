/**
 * Automatic Number Plate Recognition (ANPR) Domain Types
 * 
 * Defines core contracts for license plate optical localization, character segmentation,
 * country-specific syntax rules, fuzzy watchlist matching, vehicle dwell tracking,
 * and operator review workflows.
 */

export type PlateType = 
  | 'standard' 
  | 'commercial' 
  | 'electric' 
  | 'government' 
  | 'diplomatic' 
  | 'military' 
  | 'temporary';

export type VehicleCategory = 'car' | 'motorcycle' | 'bus' | 'truck' | 'van' | 'auto_rickshaw' | 'other';

export type WatchlistListType = 'alert' | 'stolen' | 'wanted' | 'vip' | 'staff' | 'blacklist';

export type WatchlistSeverity = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export type WatchlistPriority = 'critical' | 'high' | 'medium' | 'low';

export type ReviewStatus = 'pending' | 'confirmed' | 'false_positive' | 'dismissed';

export type DirectionType = 'entry' | 'exit' | 'unknown';

export type SessionStatus = 'inside' | 'exited' | 'overstay' | 'unknown';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CharacterReading {
  char: string;
  confidence: number;
  bbox?: BoundingBox;
}

export interface PlateReading {
  plateNumber: string;
  normalizedPlate: string;
  confidence: number;
  countryCode: string;
  regionCode?: string;
  plateType: PlateType;
  characters: CharacterReading[];
  plateBbox: BoundingBox;
  isValidSyntax: boolean;
  syntaxFormatName?: string;
  correctionsApplied: number;
  contrastScore?: number;
}

export interface VehicleAttributes {
  category: VehicleCategory;
  confidence: number;
  color?: string;
  make?: string;
  model?: string;
  bbox?: BoundingBox;
}

export interface WatchlistMatchDetail {
  matched: boolean;
  watchlistId?: string;
  watchlistName?: string;
  listType?: WatchlistListType;
  plateId?: string;
  targetPlate?: string;
  reason?: string;
  severity?: WatchlistSeverity;
  alertAuthorities?: boolean;
  matchType?: 'exact' | 'fuzzy' | 'wildcard';
  editDistance?: number;
  similarity?: number;
}

export interface AnprEvaluationResult {
  plate: PlateReading;
  vehicle?: VehicleAttributes;
  watchlistMatch: WatchlistMatchDetail;
  processingTimeMs: number;
  requiresAlert: boolean;
  observedAt: Date;
}

export interface AnprEventRecord {
  id: string;
  tenant_id: string;
  camera_id: string;
  branch_id?: string | null;
  camera_name?: string | null;
  watchlist_id?: string | null;
  watchlist_name?: string | null;
  plate_id?: string | null;
  analytics_event_id?: string | null;
  plate_number: string;
  normalized_plate: string;
  plate_confidence: number;
  country_code: string;
  region_code?: string | null;
  plate_type: PlateType;
  vehicle_type?: string | null;
  vehicle_color?: string | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_bbox?: BoundingBox | null;
  plate_bbox: BoundingBox;
  ocr_details?: {
    characters: CharacterReading[];
    correctionsApplied?: number;
    syntaxFormat?: string;
  } | null;
  snapshot_reference?: string | null;
  plate_crop_url?: string | null;
  entry_direction: DirectionType;
  review_status: ReviewStatus;
  reviewed_by?: string | null;
  reviewed_at?: Date | null;
  review_notes?: string | null;
  processing_time_ms: number;
  occurred_at: Date;
  created_at: Date;
}

export interface AnprWatchlistRecord {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  list_type: WatchlistListType;
  enabled: boolean;
  alert_on_match: boolean;
  alert_severity: WatchlistSeverity;
  alert_authorities: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  archived_at?: Date | null;
}

export interface AnprWatchlistPlateRecord {
  id: string;
  tenant_id: string;
  watchlist_id: string;
  plate_number: string;
  normalized_plate: string;
  country_code: string;
  region_code?: string | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_color?: string | null;
  vehicle_type?: VehicleCategory | null;
  owner_name?: string | null;
  reason: string;
  notes?: string | null;
  fuzzy_match: boolean;
  max_levenshtein_distance: number;
  priority: WatchlistPriority;
  metadata?: Record<string, unknown>;
  added_by: string;
  added_at: Date;
  expires_at?: Date | null;
  active_from?: Date | null;
  active_to?: Date | null;
  last_matched_at?: Date | null;
  match_count: number;
  archived_at?: Date | null;
}

export interface AnprVehicleSessionRecord {
  id: string;
  tenant_id: string;
  plate_number: string;
  normalized_plate: string;
  entry_event_id?: string | null;
  exit_event_id?: string | null;
  entry_camera_id?: string | null;
  exit_camera_id?: string | null;
  entry_camera_name?: string | null;
  exit_camera_name?: string | null;
  vehicle_type?: string | null;
  vehicle_color?: string | null;
  entry_at: Date;
  exit_at?: Date | null;
  duration_seconds?: number | null;
  max_dwell_minutes: number;
  overstay_alerted: boolean;
  status: SessionStatus;
  created_at: Date;
  updated_at: Date;
}

export interface ListAnprEventsFilter {
  tenantId: string;
  cameraId?: string;
  branchId?: string;
  plateNumber?: string;
  watchlistId?: string;
  entryDirection?: DirectionType;
  reviewStatus?: ReviewStatus;
  hasWatchlistMatch?: boolean;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface ListVehicleSessionsFilter {
  tenantId: string;
  plateNumber?: string;
  status?: SessionStatus;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface AnprStats {
  totalReads: number;
  uniquePlates: number;
  watchlistHits: number;
  averageConfidence: number;
  pendingReviews: number;
  activeParkedVehicles: number;
  overstayAlerts: number;
  readsByHour: Array<{ hour: string; count: number }>;
  vehicleTypeBreakdown: Record<string, number>;
  watchlistTypeBreakdown: Record<string, number>;
}
