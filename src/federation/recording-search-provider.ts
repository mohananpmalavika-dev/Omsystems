import type { RecordingSearchService } from "../recording/search-service.js";
import type { FederationLocalSearchProvider } from "./manager.js";
import type { FederatedSearchItem, FederationSearchQuery } from "./types.js";

export class RecordingFederationSearchProvider implements FederationLocalSearchProvider {
  constructor(private readonly recordings: RecordingSearchService) {}

  async search(tenantId: string, query: FederationSearchQuery): Promise<FederatedSearchItem[]> {
    if (query.type === "vehicle" || query.type === "object") {
      const objectClass = query.type === "vehicle" ? "vehicle" : query.term.toLowerCase();
      const result = await this.recordings.searchByObject(tenantId, {
        from: query.from,
        to: query.to,
        objectClass,
        limit: Math.min(500, query.limit * 3),
      });
      const term = query.term.toLowerCase();
      return result.data
        .filter((item) => query.type !== "vehicle" || term === "vehicle" || JSON.stringify(item.attributes ?? {}).toLowerCase().includes(term))
        .slice(0, query.limit)
        .map((item) => ({
          id: item.id,
          type: query.type,
          occurredAt: item.detectedAt,
          cameraId: item.cameraId,
          title: `${item.objectClass} detection`,
          confidence: item.confidence,
          ...(item.thumbnail ? { snapshotUrl: item.thumbnail } : {}),
          metadata: {
            segmentId: item.segmentId,
            objectClass: item.objectClass,
            boundingBox: item.boundingBox,
            attributes: item.attributes ?? {},
          },
        }));
    }

    if (query.type === "recording") {
      const result = await this.recordings.searchRecordings(tenantId, {
        from: query.from,
        to: query.to,
        objectClass: query.term,
      }, { limit: query.limit });
      return result.segments.map((segment) => ({
        id: segment.id,
        type: "recording" as const,
        occurredAt: segment.startedAt,
        cameraId: segment.cameraId,
        title: `Recording ${segment.startedAt}`,
        metadata: {
          endedAt: segment.endedAt,
          durationSeconds: segment.durationSeconds,
          status: segment.status,
        },
      }));
    }

    // Face and incident federation adapters require their respective regional
    // repositories. Returning no matches is explicit and avoids fabricating
    // data from unrelated recording indexes.
    return [];
  }
}

