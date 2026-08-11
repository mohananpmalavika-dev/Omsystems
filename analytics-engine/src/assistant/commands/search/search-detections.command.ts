/**
 * Search Detections Command
 * 
 * Searches for detections using real event/detection stores.
 * Replaces fake search results with actual queries.
 * Returns only IDs that genuinely exist in storage.
 */

import type {
  AssistantCommand,
  CommandResult,
  AssistantContext,
  AssistantErrorCode,
  AssistantEvidence
} from '../../types/index.js';
import { CommandResultBuilder } from '../../types/index.js';
import type { AuthorizationService } from '../../types/authorization.js';
import type { AssistantAuditService } from '../../types/audit.js';
import type {
  DetectionSearchService,
  DetectionSearchQuery,
  DetectionSearchResult
} from '../../services/detection-search-service.interface.js';
import type { CameraService } from '../../services/camera-service.interface.js';

/**
 * Search detections input
 */
export interface SearchDetectionsInput {
  /** Object type filter */
  objectType?: 'person' | 'vehicle' | 'face' | 'license_plate';
  
  /** Attribute filters */
  color?: string;
  attributes?: Record<string, unknown>;
  
  /** Time range */
  timeRange?: {
    from?: Date;
    to?: Date;
  };
  
  /** Location/camera filters */
  location?: string;
  cameraIds?: string[];
  
  /** Free text search */
  freeText?: string;
  
  /** Result limit */
  limit?: number;
}

/**
 * Search detections result
 */
export interface SearchDetectionsResult {
  searchResult: DetectionSearchResult;
  summary: {
    totalResults: number;
    query: string;
    topMatches: string[];
  };
}

/**
 * Search Detections Command
 */
export class SearchDetectionsCommand implements AssistantCommand<SearchDetectionsInput, SearchDetectionsResult> {
  constructor(
    private detectionSearch: DetectionSearchService,
    private cameraService: CameraService,
    private authorization: AuthorizationService,
    private audit: AssistantAuditService
  ) {}
  
  async execute(
    input: SearchDetectionsInput,
    context: AssistantContext
  ): Promise<CommandResult<SearchDetectionsResult>> {
    const startTime = Date.now();
    
    try {
      // Check authorization
      const authDecision = await this.authorization.can({
        actor: context.user,
        action: 'detection.search'
      });
      
      if (!authDecision.allowed) {
        await this.auditFailure(context, input, 'DENIED', Date.now() - startTime);
        
        return CommandResultBuilder.failure(
          'FORBIDDEN' as AssistantErrorCode,
          authDecision.reason || 'You are not authorized to search detections.',
          { retryable: false }
        );
      }
      
      // Resolve location to camera IDs if needed
      let cameraIds = input.cameraIds;
      
      if (input.location && !cameraIds) {
        const cameras = await this.cameraService.findByLocation(input.location);
        
        if (cameras.length === 0) {
          await this.auditFailure(context, input, 'FAILED', Date.now() - startTime);
          
          return CommandResultBuilder.failure(
            'RESOURCE_NOT_FOUND' as AssistantErrorCode,
            `No cameras found at location "${input.location}".`,
            { retryable: false }
          );
        }
        
        cameraIds = cameras.map(cam => cam.id);
      }
      
      // Filter cameras by user's site access
      if (cameraIds && context.user.siteIds.length > 0) {
        // Filter to cameras user can access
        const accessibleCameras = await Promise.all(
          cameraIds.map(async (camId) => {
            const camera = await this.cameraService.getById(camId);
            if (camera && context.user.siteIds.includes(camera.siteId)) {
              return camId;
            }
            return null;
          })
        );
        
        cameraIds = accessibleCameras.filter((id): id is string => id !== null);
        
        if (cameraIds.length === 0) {
          await this.auditFailure(context, input, 'DENIED', Date.now() - startTime);
          
          return CommandResultBuilder.failure(
            'FORBIDDEN' as AssistantErrorCode,
            'You do not have access to cameras at the requested location.',
            { retryable: false }
          );
        }
      }
      
      // Build search query
      const searchQuery: DetectionSearchQuery = {
        cameraIds,
        siteIds: context.user.siteIds.length > 0 ? context.user.siteIds : undefined,
        objectTypes: input.objectType ? [input.objectType] : undefined,
        attributes: {
          ...(input.color ? { color: input.color } : {}),
          ...input.attributes
        },
        timeRange: input.timeRange ? {
          from: input.timeRange.from || new Date(Date.now() - 24 * 60 * 60 * 1000), // Default: last 24 hours
          to: input.timeRange.to || new Date()
        } : undefined,
        freeText: input.freeText,
        limit: input.limit || 50,
        minConfidence: 0.7 // Reasonable default
      };
      
      // Execute search
      try {
        const searchResult = await this.detectionSearch.search(searchQuery);
        
        // Build evidence from actual query results
        const evidence: AssistantEvidence[] = [{
          source: 'event-store',
          recordIds: searchResult.results.map(r => r.detectionId),
          queriedAt: searchResult.queriedAt,
          queryDetails: {
            totalResults: searchResult.totalResults,
            executionTimeMs: searchResult.executionTimeMs,
            query: searchQuery
          }
        }];
        
        // If no results, this is still a valid verified result
        // We verified that there ARE no matches, rather than inventing fake ones
        
        // Build summary
        const summary = this.buildSummary(searchResult, input);
        
        // Audit successful search
        await this.audit.record({
          eventId: `audit_${Date.now()}`,
          requestId: context.requestId,
          timestamp: new Date(),
          userId: context.user.id,
          sessionId: context.sessionId,
          originalText: this.buildQueryText(input),
          parsedIntent: 'SEARCH_DETECTIONS',
          intentConfidence: 1.0,
          parsedEntities: this.buildEntities(input),
          authorizationDecision: 'ALLOW',
          command: 'SearchDetectionsCommand',
          commandInput: input,
          resultStatus: 'SUCCESS',
          verified: true,
          evidenceIds: searchResult.results.map(r => r.detectionId),
          durationMs: Date.now() - startTime
        });
        
        return CommandResultBuilder.verifiedSuccess(
          {
            searchResult,
            summary
          },
          evidence
        );
        
      } catch (searchError) {
        console.error('[SearchDetectionsCommand] Search service error:', searchError);
        
        await this.auditFailure(context, input, 'FAILED', Date.now() - startTime);
        
        return CommandResultBuilder.failure(
          'SERVICE_UNAVAILABLE' as AssistantErrorCode,
          'Detection search service is currently unavailable. Please try again later.',
          { retryable: true }
        );
      }
      
    } catch (error) {
      console.error('[SearchDetectionsCommand] Unexpected error:', error);
      
      await this.auditFailure(context, input, 'FAILED', Date.now() - startTime);
      
      return CommandResultBuilder.failure(
        'INTERNAL_ERROR' as AssistantErrorCode,
        'An unexpected error occurred while searching detections.',
        { retryable: true }
      );
    }
  }
  
  /**
   * Build human-readable summary
   */
  private buildSummary(
    result: DetectionSearchResult,
    input: SearchDetectionsInput
  ): SearchDetectionsResult['summary'] {
    // Build query description
    let query = 'detections';
    
    if (input.objectType) {
      query = `${input.objectType} detections`;
    }
    
    if (input.color) {
      query = `${input.color} ${query}`;
    }
    
    if (input.location) {
      query += ` at ${input.location}`;
    }
    
    if (input.timeRange?.from) {
      query += ` from ${input.timeRange.from.toLocaleString()}`;
    }
    
    // Top matches
    const topMatches = result.results.slice(0, 3).map(match => {
      const time = match.timestamp.toLocaleTimeString();
      const confidence = Math.round(match.confidence * 100);
      return `${match.cameraName || match.cameraId} at ${time} (${confidence}% confidence)`;
    });
    
    return {
      totalResults: result.totalResults,
      query,
      topMatches
    };
  }
  
  /**
   * Build query text for audit
   */
  private buildQueryText(input: SearchDetectionsInput): string {
    const parts: string[] = ['Search for'];
    
    if (input.color) {
      parts.push(input.color);
    }
    
    if (input.objectType) {
      parts.push(input.objectType);
    } else {
      parts.push('detections');
    }
    
    if (input.location) {
      parts.push(`at ${input.location}`);
    }
    
    return parts.join(' ');
  }
  
  /**
   * Build entities for audit
   */
  private buildEntities(input: SearchDetectionsInput): Array<{
    type: string;
    value: string;
    confidence: number;
  }> {
    const entities: Array<{ type: string; value: string; confidence: number }> = [];
    
    if (input.objectType) {
      entities.push({ type: 'object', value: input.objectType, confidence: 1.0 });
    }
    
    if (input.color) {
      entities.push({ type: 'color', value: input.color, confidence: 1.0 });
    }
    
    if (input.location) {
      entities.push({ type: 'location', value: input.location, confidence: 1.0 });
    }
    
    return entities;
  }
  
  /**
   * Audit failure helper
   */
  private async auditFailure(
    context: AssistantContext,
    input: SearchDetectionsInput,
    status: string,
    durationMs: number
  ): Promise<void> {
    try {
      await this.audit.record({
        eventId: `audit_${Date.now()}`,
        requestId: context.requestId,
        timestamp: new Date(),
        userId: context.user.id,
        sessionId: context.sessionId,
        originalText: this.buildQueryText(input),
        parsedIntent: 'SEARCH_DETECTIONS',
        intentConfidence: 1.0,
        parsedEntities: this.buildEntities(input),
        authorizationDecision: status === 'DENIED' ? 'DENY' : 'ALLOW',
        command: 'SearchDetectionsCommand',
        commandInput: input,
        resultStatus: status as any,
        verified: false,
        durationMs
      });
    } catch (auditError) {
      console.error('[SearchDetectionsCommand] Failed to audit:', auditError);
    }
  }
}
