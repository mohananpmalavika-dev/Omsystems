/**
 * Face Recognition API Client
 * TypeScript client for face recognition endpoints
 */

import { apiClient } from './client';

export interface Watchlist {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  listType: 'security' | 'vip' | 'staff' | 'blacklist' | 'missing-person';
  enabled: boolean;
  alertOnMatch: boolean;
  alertSeverity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  matchThreshold: number;
  reviewThreshold: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistPerson {
  id: string;
  tenantId: string;
  watchlistId: string;
  externalId?: string;
  fullName: string;
  dateOfBirth?: string;
  gender?: string;
  notes?: string;
  metadata: Record<string, unknown>;
  enrolledBy: string;
  enrolledAt: string;
  lastSeenAt?: string;
  matchCount: number;
  embeddingCount: number;
}

export interface EnrollmentResult {
  personId: string;
  acceptedImages: number;
  rejectedImages: number;
  embeddings: Array<{
    id: string;
    quality: number;
  }>;
  failures: Array<{
    imageIndex: number;
    reason: string;
    details?: string[];
  }>;
}

export interface FaceRecognitionEvent {
  id: string;
  tenantId: string;
  cameraId: string;
  watchlistId?: string;
  personId?: string;
  similarityScore: number;
  faceBbox: any;
  faceQuality?: number;
  ageEstimate?: number;
  genderEstimate?: string;
  wearingMask?: boolean;
  snapshotReference?: string;
  occurredAt: string;
  createdAt: string;
}

export const faceWatchlistAPI = {
  // Watchlist management
  async listWatchlists(params?: {
    listType?: string;
    enabled?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ watchlists: Watchlist[]; total: number }> {
    const response = await apiClient.get('/face-watchlists', { params });
    return response.data;
  },

  async getWatchlist(watchlistId: string): Promise<Watchlist> {
    const response = await apiClient.get(`/face-watchlists/${watchlistId}`);
    return response.data;
  },

  async createWatchlist(data: {
    name: string;
    description?: string;
    listType: Watchlist['listType'];
    enabled?: boolean;
    alertOnMatch?: boolean;
    alertSeverity?: Watchlist['alertSeverity'];
    matchThreshold?: number;
    reviewThreshold?: number;
  }): Promise<Watchlist> {
    const response = await apiClient.post('/face-watchlists', data);
    return response.data;
  },

  async updateWatchlist(
    watchlistId: string,
    data: Partial<Omit<Watchlist, 'id' | 'tenantId' | 'createdBy' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Watchlist> {
    const response = await apiClient.patch(`/face-watchlists/${watchlistId}`, data);
    return response.data;
  },

  async deleteWatchlist(watchlistId: string): Promise<void> {
    await apiClient.delete(`/face-watchlists/${watchlistId}`);
  },

  async getWatchlistStats(watchlistId: string): Promise<{
    personCount: number;
    embeddingCount: number;
    matchCount: number;
    lastMatchAt?: string;
  }> {
    const response = await apiClient.get(`/face-watchlists/${watchlistId}/stats`);
    return response.data;
  },

  // Person management
  async listPersons(
    watchlistId: string,
    params?: { limit?: number; offset?: number; search?: string },
  ): Promise<{ persons: WatchlistPerson[]; total: number }> {
    const response = await apiClient.get(`/face-watchlists/${watchlistId}/persons`, { params });
    return response.data;
  },

  async getPerson(watchlistId: string, personId: string): Promise<WatchlistPerson> {
    const response = await apiClient.get(`/face-watchlists/${watchlistId}/persons/${personId}`);
    return response.data;
  },

  async enrollPerson(watchlistId: string, formData: FormData): Promise<EnrollmentResult> {
    const response = await apiClient.post(`/face-watchlists/${watchlistId}/persons`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  async updatePerson(
    watchlistId: string,
    personId: string,
    data: {
      fullName?: string;
      externalId?: string;
      notes?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<WatchlistPerson> {
    const response = await apiClient.patch(
      `/face-watchlists/${watchlistId}/persons/${personId}`,
      data,
    );
    return response.data;
  },

  async removePerson(watchlistId: string, personId: string): Promise<void> {
    await apiClient.delete(`/face-watchlists/${watchlistId}/persons/${personId}`);
  },

  async addPersonImages(
    watchlistId: string,
    personId: string,
    formData: FormData,
  ): Promise<{ added: number; failed: number; embeddingIds: string[] }> {
    const response = await apiClient.post(
      `/face-watchlists/${watchlistId}/persons/${personId}/images`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    );
    return response.data;
  },
};

export const faceRecognitionAPI = {
  // Recognition events
  async searchEvents(params?: {
    watchlistId?: string;
    personId?: string;
    cameraId?: string;
    startDate?: string;
    endDate?: string;
    minSimilarity?: number;
    limit?: number;
    offset?: number;
  }): Promise<{
    events: FaceRecognitionEvent[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const response = await apiClient.get('/face-recognition/events', { params });
    return response.data;
  },

  async getEvent(eventId: string): Promise<FaceRecognitionEvent> {
    const response = await apiClient.get(`/face-recognition/events/${eventId}`);
    return response.data;
  },

  async reviewMatch(
    eventId: string,
    data: {
      decision: 'confirmed' | 'rejected' | 'unsure';
      notes?: string;
    },
  ): Promise<any> {
    const response = await apiClient.post(`/face-recognition/events/${eventId}/review`, data);
    return response.data;
  },

  async getEventReviews(eventId: string): Promise<any[]> {
    const response = await apiClient.get(`/face-recognition/events/${eventId}/reviews`);
    return response.data;
  },

  async getActiveTracks(params?: { cameraId?: string; status?: string }): Promise<any[]> {
    const response = await apiClient.get('/face-recognition/tracks', { params });
    return response.data;
  },

  async getAnalytics(params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<{
    matchesByWatchlist: any[];
    topMatches: any[];
    matchesByHour: any[];
  }> {
    const response = await apiClient.get('/face-recognition/analytics', { params });
    return response.data;
  },
};
