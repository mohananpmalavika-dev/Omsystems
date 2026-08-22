/**
 * Hikvision ISAPI Driver
 * 
 * Implements Hikvision ISAPI 2.0 (XML over HTTP/HTTPS).
 * 
 * API Endpoints:
 * - /ISAPI/System/deviceInfo
 * - /ISAPI/ContentMgmt/Storage
 * - /ISAPI/System/Video/inputs/channels
 * - /ISAPI/ContentMgmt/InputProxy/channels/status
 * - /ISAPI/ContentMgmt/search (POST XML for recording search)
 */

import type {
  RecorderDriver,
  ProbeOptions,
  ChannelStatus,
  RecordingStatus,
  DeviceTimeResult
} from "../../core/recorder-driver.interface.js";
import type {
  RecorderContext,
  RecorderProtocol,
  RecorderCapabilities,
  DeviceInfo,
  StorageStatus,
  RecorderChannel,
  StreamEndpoint,
  StreamRequest,
  RecordingSearchRequest,
  RecordingSearchResult,
  RecorderProbeResult,
  StorageVolume,
  HealthState,
  RecordingSegment
} from "../../core/recorder-driver.types.js";
import { RecorderHttpClient } from "../../transport/recorder-http-client.js";
import { DigestAuthProvider } from "../../transport/recorder-http-transport.js";

/**
 * Hikvision ISAPI Driver
 * 
 * Canonical implementation for Hikvision recorders using ISAPI protocol.
 */
export class HikvisionISAPIDriver implements RecorderDriver {
  readonly protocol: RecorderProtocol = "hikvision-isapi";
  readonly version = "1.0.0";
  
  private httpClient: RecorderHttpClient;
  
  constructor() {
    this.httpClient = new RecorderHttpClient(
      undefined,
      new DigestAuthProvider()
    );
  }
  
  /**
   * Probe recorder health
   */
  async probe(
    ctx: RecorderContext,
    options?: ProbeOptions
  ): Promise<RecorderProbeResult> {
    const startTime = Date.now();
    const reasonCodes: string[] = [];
    
    try {
      // Get system info
      const deviceInfo = await this.getDeviceInfo(ctx);
      
      // Get capabilities
      const capabilities = await this.getCapabilities(ctx);
      
      // Get storage status
      let storage: StorageStatus | undefined;
      if (options?.includeStorage !== false) {
        try {
          storage = await this.getStorageStatus(ctx);
        } catch (error) {
          reasonCodes.push("storage_query_failed");
        }
      }
      
      // Get channels
      let channels: RecorderChannel[] = [];
      if (options?.includeChannels !== false) {
        try {
          channels = await this.getChannels(ctx);
        } catch (error) {
          reasonCodes.push("channel_enumeration_failed");
        }
      }
      
      // Determine overall status
      const status = this.determineOverallStatus(storage, channels);
      
      return {
        recorderId: ctx.recorderId,
        reachable: true,
        status,
        identity: deviceInfo,
        capabilities,
        storage,
        channels,
        probeDurationMs: Date.now() - startTime,
        probedAt: new Date(),
        reasonCodes
      };
      
    } catch (error) {
      return {
        recorderId: ctx.recorderId,
        reachable: false,
        status: "FAILED",
        capabilities: this.getDefaultCapabilities(),
        channels: [],
        probeDurationMs: Date.now() - startTime,
        probedAt: new Date(),
        reasonCodes: ["probe_failed", String(error)]
      };
    }
  }
  
  /**
   * Get device information
   */
  async getDeviceInfo(ctx: RecorderContext): Promise<DeviceInfo> {
    const response = await this.httpClient.get(
      ctx,
      "/ISAPI/System/deviceInfo"
    );
    
    if (response.statusCode !== 200) {
      throw new Error(`Failed to get device info: HTTP ${response.statusCode}`);
    }
    
    const xml = response.body;
    
    // Parse Hikvision XML response
    const deviceName = this.extractTag(xml, "deviceName");
    const model = this.extractTag(xml, "model");
    const serialNumber = this.extractTag(xml, "serialNumber");
    const firmwareVersion = this.extractTag(xml, "firmwareVersion");
    const macAddress = this.extractTag(xml, "macAddress");
    
    return {
      vendor: "hikvision",
      protocolFamily: "hikvision-isapi",
      manufacturer: "Hikvision",
      model: model || "Unknown",
      firmwareVersion,
      serialNumber,
      deviceName,
      macAddress,
      detectedAt: new Date()
    };
  }
  
  /**
   * Get capabilities
   */
  async getCapabilities(ctx: RecorderContext): Promise<RecorderCapabilities> {
    return {
      liveVideo: { supported: true, source: "vendor", confidence: 1.0 },
      subStream: { supported: true, source: "vendor", confidence: 1.0 },
      channelEnumeration: { supported: true, source: "vendor", confidence: 1.0 },
      recordingStatus: { supported: true, source: "vendor", confidence: 1.0 },
      recordingSearch: { supported: true, source: "vendor", confidence: 1.0 },
      playback: { supported: true, source: "vendor", confidence: 1.0 },
      recordingExport: { supported: true, source: "vendor", confidence: 0.9 },
      storageTelemetry: { supported: true, source: "vendor", confidence: 1.0 },
      retentionTelemetry: { supported: true, source: "vendor", confidence: 1.0 },
      deviceTime: { supported: true, source: "vendor", confidence: 1.0 },
      ntpStatus: { supported: true, source: "vendor", confidence: 0.9 },
      videoLossEvents: { supported: true, source: "vendor", confidence: 1.0 },
      motionEvents: { supported: true, source: "vendor", confidence: 1.0 },
      ptz: { supported: true, source: "vendor", confidence: 0.8 },
      vendorApi: { supported: true, source: "vendor", confidence: 1.0 },
      onvif: { supported: true, source: "vendor", confidence: 0.9 }
    };
  }
  
  /**
   * Get all channels
   */
  async getChannels(ctx: RecorderContext): Promise<RecorderChannel[]> {
    // Get channel list
    const channelResponse = await this.httpClient.get(
      ctx,
      "/ISAPI/System/Video/inputs/channels"
    );
    
    if (channelResponse.statusCode !== 200) {
      throw new Error(`Failed to get channels: HTTP ${channelResponse.statusCode}`);
    }
    
    // Get channel status
    let statusXml = "";
    try {
      const statusResponse = await this.httpClient.get(
        ctx,
        "/ISAPI/ContentMgmt/InputProxy/channels/status"
      );
      
      if (statusResponse.statusCode === 200) {
        statusXml = statusResponse.body;
      }
    } catch {
      // Status query failed, connection state will be unknown
    }
    
    return this.parseHikvisionChannels(channelResponse.body, statusXml);
  }
  
  /**
   * Get specific channel
   */
  async getChannel(
    ctx: RecorderContext,
    channelId: string
  ): Promise<RecorderChannel> {
    const channels = await this.getChannels(ctx);
    const channel = channels.find(ch => ch.id === channelId);
    
    if (!channel) {
      throw new Error(`Channel not found: ${channelId}`);
    }
    
    return channel;
  }
  
  /**
   * Get stream URI
   */
  async getStreamUri(
    ctx: RecorderContext,
    request: StreamRequest
  ): Promise<StreamEndpoint> {
    const channelId = parseInt(request.channelId);
    const trackId = this.hikvisionTrackId(channelId);
    
    // Hikvision RTSP format: rtsp://<ip>:<port>/Streaming/Channels/<trackId>
    // Main stream: <channelId>01, Sub stream: <channelId>02
    const streamCode = request.profile === "SUBSTREAM" ? "02" : "01";
    const uri = `rtsp://${ctx.endpoint.host}:554/Streaming/Channels/${trackId.replace("01", streamCode)}`;
    
    return {
      protocol: "RTSP",
      uri,
      codec: "H265"
    };
  }
  
  /**
   * Get channel status
   */
  async getChannelStatus(
    ctx: RecorderContext,
    channelId: string
  ): Promise<ChannelStatus> {
    const channel = await this.getChannel(ctx, channelId);
    
    return {
      channelId,
      state: channel.connectionState === "ONLINE" ? "HEALTHY" : 
             channel.connectionState === "VIDEO_LOSS" ? "FAILED" : "UNKNOWN",
      connected: channel.connectionState === "ONLINE",
      hasSignal: channel.connectionState === "ONLINE",
      recording: channel.recordingState === "RECORDING",
      observedAt: new Date()
    };
  }
  
  /**
   * Get recording status
   * 
   * CRITICAL: Queries actual archive to verify recording activity
   */
  async getRecordingStatus(
    ctx: RecorderContext,
    channelId: string
  ): Promise<RecordingStatus> {
    const channelIndex = parseInt(channelId);
    const trackId = this.hikvisionTrackId(channelIndex);
    const now = new Date();
    const searchFrom = new Date(now.getTime() - 300000); // Last 5 minutes
    
    try {
      const result = await this.searchRecordingsInternal(
        ctx,
        [trackId],
        searchFrom,
        now,
        10
      );
      
      if (result.segments.length > 0) {
        const latest = result.segments.reduce((max, seg) => 
          seg.endTime > max ? seg.endTime : max, 
          result.segments[0].endTime
        );
        
        const ageSeconds = (now.getTime() - latest.getTime()) / 1000;
        const isRecording = ageSeconds < 120; // Within 2 minutes
        
        return {
          channelId,
          state: isRecording ? "RECORDING" : "NOT_RECORDING",
          activelyWriting: isRecording,
          latestRecordingAt: latest,
          configEnabled: true,
          reason: isRecording ? undefined : "No recent recording evidence",
          observedAt: new Date()
        };
      }
      
      return {
        channelId,
        state: "NOT_RECORDING",
        activelyWriting: false,
        configEnabled: true,
        reason: "No recordings found in last 5 minutes",
        observedAt: new Date()
      };
      
    } catch (error) {
      return {
        channelId,
        state: "UNKNOWN",
        activelyWriting: false,
        configEnabled: true,
        reason: `Archive query failed: ${error}`,
        observedAt: new Date()
      };
    }
  }
  
  /**
   * Search recordings
   */
  async searchRecordings(
    ctx: RecorderContext,
    request: RecordingSearchRequest
  ): Promise<RecordingSearchResult> {
    const channelIndex = parseInt(request.channelId);
    const trackId = this.hikvisionTrackId(channelIndex);
    
    const result = await this.searchRecordingsInternal(
      ctx,
      [trackId],
      request.from,
      request.to,
      request.limit || 1000
    );
    
    return {
      segments: result.segments,
      totalCount: result.segments.length,
      hasMore: !result.complete,
      success: true
    };
  }
  
  /**
   * Internal recording search implementation
   * 
   * Hikvision uses XML POST to /ISAPI/ContentMgmt/search
   */
  private async searchRecordingsInternal(
    ctx: RecorderContext,
    trackIds: string[],
    from: Date,
    to: Date,
    maxResults: number
  ): Promise<{ segments: RecordingSegment[]; complete: boolean }> {
    const pageSize = Math.min(1000, maxResults);
    const segments: RecordingSegment[] = [];
    
    for (let position = 0; segments.length < maxResults; position += pageSize) {
      const body = this.buildSearchXml(trackIds, from, to, pageSize, position);
      
      const response = await this.httpClient.post(
        ctx,
        "/ISAPI/ContentMgmt/search",
        body,
        {
          method: "POST",
          contentType: "application/xml"
        }
      );
      
      if (response.statusCode !== 200) {
        throw new Error(`Search failed: HTTP ${response.statusCode}`);
      }
      
      const pageSegments = this.parseSearchResults(response.body);
      
      if (pageSegments.length === 0) {
        return { segments, complete: true };
      }
      
      segments.push(...pageSegments);
      
      // Check if we got all results
      const totalMatches = this.extractTotalMatches(response.body);
      if (totalMatches !== null && segments.length >= totalMatches) {
        return { segments, complete: true };
      }
      
      if (pageSegments.length < pageSize) {
        return { segments, complete: true };
      }
    }
    
    return { segments, complete: false };
  }
  
  /**
   * Get storage status
   */
  async getStorageStatus(ctx: RecorderContext): Promise<StorageStatus> {
    const response = await this.httpClient.get(
      ctx,
      "/ISAPI/ContentMgmt/Storage"
    );
    
    if (response.statusCode !== 200) {
      throw new Error(`Failed to get storage: HTTP ${response.statusCode}`);
    }
    
    const volumes = this.parseHikvisionStorage(response.body);
    
    // Calculate totals
    let totalCapacity = 0;
    let totalUsed = 0;
    let totalFree = 0;
    let overallState: HealthState = "HEALTHY";
    
    for (const volume of volumes) {
      if (volume.capacityBytes) totalCapacity += volume.capacityBytes;
      if (volume.usedBytes) totalUsed += volume.usedBytes;
      if (volume.freeBytes) totalFree += volume.freeBytes;
      
      if (volume.state === "FAILED") {
        overallState = "FAILED";
      } else if (volume.state === "DEGRADED" && overallState === "HEALTHY") {
        overallState = "DEGRADED";
      }
    }
    
    const usagePercent = totalCapacity > 0 ? (totalUsed / totalCapacity) * 100 : undefined;
    
    return {
      state: overallState,
      volumes,
      totalCapacityBytes: totalCapacity || undefined,
      totalFreeBytes: totalFree || undefined,
      totalUsedBytes: totalUsed || undefined,
      usagePercent,
      observedAt: new Date()
    };
  }
  
  /**
   * Get device time
   */
  async getDeviceTime(ctx: RecorderContext): Promise<DeviceTimeResult> {
    const systemTime = new Date();
    
    const response = await this.httpClient.get(
      ctx,
      "/ISAPI/System/time"
    );
    
    if (response.statusCode !== 200) {
      throw new Error(`Failed to get device time: HTTP ${response.statusCode}`);
    }
    
    const timeStr = this.extractTag(response.body, "localTime");
    if (!timeStr) {
      throw new Error("No time in response");
    }
    
    const deviceTime = new Date(timeStr);
    const driftSeconds = (deviceTime.getTime() - systemTime.getTime()) / 1000;
    
    return {
      deviceTime,
      systemTime,
      driftSeconds,
      observedAt: new Date()
    };
  }
  
  // ============================================================================
  // Parser Helpers
  // ============================================================================
  
  /**
   * Extract XML tag value (handles namespaces)
   */
  private extractTag(xml: string, tagName: string): string | undefined {
    const match = xml.match(
      new RegExp(`<(?:[^:>]+:)?${tagName}>([^<]+)<\\/(?:[^:>]+:)?${tagName}>`, "i")
    );
    return match?.[1]?.trim();
  }
  
  /**
   * Extract all values for a tag
   */
  private extractAllTags(xml: string, tagName: string): string[] {
    const matches = xml.matchAll(
      new RegExp(`<(?:[^:>]+:)?${tagName}>([^<]+)<\\/(?:[^:>]+:)?${tagName}>`, "gi")
    );
    return Array.from(matches).map(m => m[1].trim());
  }
  
  /**
   * Extract first matching tag from multiple options
   */
  private extractFirstTag(xml: string, tagNames: string[]): string | undefined {
    for (const tagName of tagNames) {
      const value = this.extractTag(xml, tagName);
      if (value) return value;
    }
    return undefined;
  }
  
  /**
   * Parse Hikvision channels
   */
  private parseHikvisionChannels(
    channelXml: string,
    statusXml: string
  ): RecorderChannel[] {
    const channels: RecorderChannel[] = [];
    
    // Parse VideoInputChannel blocks
    const channelBlocks = channelXml.matchAll(
      /<(?:[^:>]+:)?VideoInputChannel\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?VideoInputChannel>/gi
    );
    
    for (const block of channelBlocks) {
      const channelBody = block[1];
      const idStr = this.extractTag(channelBody, "id");
      if (!idStr) continue;
      
      const channelId = parseInt(idStr);
      if (!Number.isInteger(channelId) || channelId <= 0) continue;
      
      const enabled = this.extractTag(channelBody, "enabled")?.toLowerCase() === "true";
      const name = this.extractTag(channelBody, "name") || `Channel ${channelId}`;
      
      channels.push({
        id: String(channelId),
        index: channelId,
        name,
        enabled,
        sourceType: "IP",
        connectionState: "UNKNOWN",
        recordingState: "UNKNOWN"
      });
    }
    
    // Parse status if available
    if (statusXml) {
      const statusMap = new Map<number, boolean>();
      
      const statusBlocks = statusXml.matchAll(
        /<(?:[^:>]+:)?InputProxyChannelStatus\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?InputProxyChannelStatus>/gi
      );
      
      for (const block of statusBlocks) {
        const statusBody = block[1];
        const idStr = this.extractTag(statusBody, "id");
        const onlineStr = this.extractTag(statusBody, "online")?.toLowerCase();
        
        if (idStr && (onlineStr === "true" || onlineStr === "false")) {
          statusMap.set(parseInt(idStr), onlineStr === "true");
        }
      }
      
      // Update connection states
      for (const channel of channels) {
        const online = statusMap.get(parseInt(channel.id));
        if (online !== undefined) {
          channel.connectionState = online ? "ONLINE" : "OFFLINE";
        }
      }
    }
    
    return channels;
  }
  
  /**
   * Parse Hikvision storage
   */
  private parseHikvisionStorage(xml: string): StorageVolume[] {
    const volumes: StorageVolume[] = [];
    
    // Extract RAID info (if present)
    const raidStatus = this.extractFirstTag(xml, ["raidStatus", "arrayStatus", "raidState"]);
    const raidLevel = this.extractFirstTag(xml, ["raidLevel", "arrayLevel"]);
    
    // Parse HDD blocks
    const hddBlocks = xml.matchAll(/<hdd>([\s\S]*?)<\/hdd>/gi);
    
    let index = 0;
    for (const block of hddBlocks) {
      const hddBody = block[1];
      
      const id = this.extractTag(hddBody, "id") || String(index + 1);
      const name = this.extractTag(hddBody, "name") || `HDD ${index + 1}`;
      const status = this.extractTag(hddBody, "status")?.toLowerCase();
      const capacity = this.extractTag(hddBody, "capacity");
      const freeSpace = this.extractTag(hddBody, "freeSpace");
      
      const capacityBytes = capacity ? parseFloat(capacity) * 1024 * 1024 : undefined;
      const freeBytes = freeSpace ? parseFloat(freeSpace) * 1024 * 1024 : undefined;
      const usedBytes = capacityBytes && freeBytes ? capacityBytes - freeBytes : undefined;
      
      volumes.push({
        id: `hdd-${id}`,
        type: "HDD",
        state: status === "ok" || status === "normal" ? "HEALTHY" :
               status === "error" || status === "failed" ? "FAILED" :
               status === "unformat" || status === "formating" ? "DEGRADED" : "UNKNOWN",
        capacityBytes,
        freeBytes,
        usedBytes,
        rawVendorState: status,
        groupId: raidLevel ? "raid" : undefined
      });
      
      index++;
    }
    
    return volumes;
  }
  
  /**
   * Build search XML request
   */
  private buildSearchXml(
    trackIds: string[],
    from: Date,
    to: Date,
    maxResults: number,
    position: number
  ): string {
    const trackIdTags = trackIds.map(id => `<trackID>${id}</trackID>`).join("\n");
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<CMSearchDescription>
  <searchID>${this.generateSearchId()}</searchID>
  <trackList>
    ${trackIdTags}
  </trackList>
  <timeSpanList>
    <timeSpan>
      <startTime>${this.formatISO(from)}</startTime>
      <endTime>${this.formatISO(to)}</endTime>
    </timeSpan>
  </timeSpanList>
  <maxResults>${maxResults}</maxResults>
  <searchResultPosition>${position}</searchResultPosition>
  <metadataList>
    <metadataDescriptor>//recordType.meta.std-cgi.com</metadataDescriptor>
  </metadataList>
</CMSearchDescription>`;
  }
  
  /**
   * Parse search results
   */
  private parseSearchResults(xml: string): RecordingSegment[] {
    const segments: RecordingSegment[] = [];
    
    const items = xml.matchAll(
      /<(?:[^:>]+:)?(?:searchMatchItem|matchItem)\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?(?:searchMatchItem|matchItem)>/gi
    );
    
    for (const item of items) {
      const itemBody = item[1];
      
      const startTimeStr = this.extractTag(itemBody, "startTime");
      const endTimeStr = this.extractTag(itemBody, "endTime");
      const trackIdStr = this.extractTag(itemBody, "trackID");
      
      if (!startTimeStr || !endTimeStr) continue;
      
      const startTime = new Date(startTimeStr);
      const endTime = new Date(endTimeStr);
      
      if (!isFinite(startTime.getTime()) || !isFinite(endTime.getTime())) continue;
      
      const trackId = trackIdStr ? parseInt(trackIdStr) : null;
      const channelId = trackId ? this.hikvisionSourceChannel(trackId) : null;
      
      segments.push({
        id: `${channelId}-${startTime.getTime()}`,
        channelId: channelId ? String(channelId) : "unknown",
        startTime,
        endTime,
        durationSeconds: (endTime.getTime() - startTime.getTime()) / 1000,
        recordingType: "continuous"
      });
    }
    
    return segments;
  }
  
  /**
   * Extract total matches from search response
   */
  private extractTotalMatches(xml: string): number | null {
    const values = [
      ...this.extractAllTags(xml, "numOfMatches"),
      ...this.extractAllTags(xml, "totalMatches")
    ];
    
    for (const value of values) {
      const num = parseInt(value);
      if (Number.isFinite(num)) return num;
    }
    
    return null;
  }
  
  /**
   * Convert channel number to Hikvision track ID
   * Hikvision uses trackID = channelNum * 100 + 1 for channels < 100
   */
  private hikvisionTrackId(channelNum: number): string {
    return String(channelNum >= 100 ? channelNum : channelNum * 100 + 1);
  }
  
  /**
   * Convert Hikvision track ID to channel number
   */
  private hikvisionSourceChannel(trackId: number): number | null {
    if (!Number.isInteger(trackId) || trackId <= 0) return null;
    return trackId >= 100 ? Math.floor(trackId / 100) : trackId;
  }
  
  /**
   * Format date for Hikvision API (ISO 8601)
   */
  private formatISO(date: Date): string {
    return date.toISOString();
  }
  
  /**
   * Generate unique search ID
   */
  private generateSearchId(): string {
    return `search-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Determine overall recorder status
   */
  private determineOverallStatus(
    storage: StorageStatus | undefined,
    channels: RecorderChannel[]
  ): HealthState {
    if (storage?.state === "FAILED") return "FAILED";
    
    const allChannelsOffline = channels.length > 0 && 
      channels.every(ch => ch.connectionState === "OFFLINE" || ch.connectionState === "VIDEO_LOSS");
    
    if (allChannelsOffline) return "DEGRADED";
    
    if (storage?.state === "DEGRADED") return "DEGRADED";
    
    return "HEALTHY";
  }
  
  /**
   * Get default capabilities
   */
  private getDefaultCapabilities(): RecorderCapabilities {
    return {
      liveVideo: { supported: false, source: "unknown", confidence: 0 },
      subStream: { supported: false, source: "unknown", confidence: 0 },
      channelEnumeration: { supported: false, source: "unknown", confidence: 0 },
      recordingStatus: { supported: false, source: "unknown", confidence: 0 },
      recordingSearch: { supported: false, source: "unknown", confidence: 0 },
      playback: { supported: false, source: "unknown", confidence: 0 },
      recordingExport: { supported: false, source: "unknown", confidence: 0 },
      storageTelemetry: { supported: false, source: "unknown", confidence: 0 },
      retentionTelemetry: { supported: false, source: "unknown", confidence: 0 },
      deviceTime: { supported: false, source: "unknown", confidence: 0 },
      ntpStatus: { supported: false, source: "unknown", confidence: 0 },
      videoLossEvents: { supported: false, source: "unknown", confidence: 0 },
      motionEvents: { supported: false, source: "unknown", confidence: 0 },
      ptz: { supported: false, source: "unknown", confidence: 0 },
      vendorApi: { supported: false, source: "unknown", confidence: 0 },
      onvif: { supported: false, source: "unknown", confidence: 0 }
    };
  }
}
