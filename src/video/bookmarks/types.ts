import { z } from 'zod';

export type BookmarkPriority = 'low' | 'medium' | 'high' | 'critical';

export type BookmarkReason =
  | 'suspicious-activity'
  | 'cash-discrepancy'
  | 'unauthorized-entry'
  | 'customer-dispute'
  | 'equipment-failure'
  | 'safety-incident'
  | 'theft-attempt'
  | 'perimeter-breach'
  | 'traffic-violation'
  | 'audit'
  | 'other';

export type BookmarkReviewStatus = 'pending' | 'reviewed' | 'approved' | 'rejected';

export interface VideoBookmarkIncidentAssociation {
  id: string;
  bookmarkId: string;
  incidentId: string;
  incidentTable: 'incidents' | 'live_incidents';
  incidentNumber?: string;
  title?: string;
  severity?: string;
  status?: string;
  associatedBy?: string;
  associatedByName?: string;
  associationNotes?: string;
  createdAt: string;
}

export interface VideoTimelineBookmark {
  id: string;
  tenantId: string;
  cameraId: string;
  cameraName?: string;
  operatorId: string;
  operatorName?: string;
  timestamp: string; // ISO 8601
  bookmarkedAt: string; // ISO 8601
  title: string;
  notes?: string;
  reason: string;
  priority: BookmarkPriority;
  tags: string[];
  incidentId?: string; // primary linked incident ID
  incidentAssociations: VideoBookmarkIncidentAssociation[];
  recordingSegmentId?: string;
  snapshotReference?: string;
  thumbnailUrl?: string;
  evidenceCaseId?: string;
  frameOffsetMs?: number;
  verifiedBy?: string;
  verifiedAt?: string;
  reviewStatus?: BookmarkReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  exportCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BookmarkMetrics {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  incidentLinkedCount: number;
  unlinkedCount: number;
  verifiedCount: number;
  recentCount: number;
}

export const createBookmarkSchema = z.object({
  cameraId: z.string().uuid('Invalid camera ID'),
  timestamp: z.string().datetime({ message: 'Timestamp must be a valid ISO 8601 datetime' }),
  title: z.string().min(1, 'Title is required').max(255),
  notes: z.string().max(4000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  reason: z.string().min(1).default('other'),
  tags: z.array(z.string().min(1)).default([]),
  incidentId: z.string().uuid().optional(),
  incidentTable: z.enum(['incidents', 'live_incidents']).default('incidents').optional(),
  associationNotes: z.string().max(1000).optional(),
  recordingSegmentId: z.string().uuid().optional(),
  snapshotReference: z.string().optional(),
  evidenceCaseId: z.string().uuid().optional(),
  frameOffsetMs: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;

export const updateBookmarkSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  notes: z.string().max(4000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  reason: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  reviewStatus: z.enum(['pending', 'reviewed', 'approved', 'rejected']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateBookmarkInput = z.infer<typeof updateBookmarkSchema>;

export const listBookmarksQuerySchema = z.object({
  cameraId: z.string().uuid().optional(),
  cameraIds: z.union([z.string(), z.array(z.string())]).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  reason: z.string().optional(),
  hasIncident: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return undefined;
  }, z.boolean().optional()),
  incidentId: z.string().uuid().optional(),
  operatorId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  search: z.string().max(200).optional(),
  reviewStatus: z.enum(['pending', 'reviewed', 'approved', 'rejected']).optional(),
  verifiedOnly: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return undefined;
  }, z.boolean().optional()),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z.enum(['timestamp', 'priority', 'created_at', 'title']).default('timestamp'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListBookmarksQuery = z.infer<typeof listBookmarksQuerySchema>;

export const associateIncidentSchema = z.object({
  incidentId: z.string().uuid('Invalid incident ID'),
  incidentTable: z.enum(['incidents', 'live_incidents']).default('incidents'),
  associationNotes: z.string().max(1000).optional(),
});

export type AssociateIncidentInput = z.infer<typeof associateIncidentSchema>;

export const createIncidentFromBookmarkSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255).optional(),
  description: z.string().max(2000).optional(),
  severity: z.enum(['P1', 'P2', 'P3', 'P4', 'P5']).default('P2'),
  preRollSeconds: z.number().int().min(0).max(3600).default(120),
  postRollSeconds: z.number().int().min(0).max(3600).default(180),
  applyLegalHold: z.boolean().default(true),
  notes: z.string().max(1000).optional(),
});

export type CreateIncidentFromBookmarkInput = z.infer<typeof createIncidentFromBookmarkSchema>;
