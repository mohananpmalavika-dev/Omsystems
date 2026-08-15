/**
 * Dahua CGI Driver
 * 
 * Implements Dahua proprietary CGI API.
 * Used by Dahua and CP PLUS (OEM) recorders.
 * 
 * API Endpoints:
 * - /cgi-bin/magicBox.cgi?action=getSystemInfo
 * - /cgi-bin/storageDevice.cgi?action=getDeviceAllInfo
 * - /cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle
 * - /cgi-bin/eventManager.cgi?action=getEventIndexes&code=VideoLoss
 * - /cgi-bin/mediaFileFind.cgi (multi-step archive search)
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
  ChannelConnectionState,
  ChannelRecordingState,
  RecordingSegment
} from "../../core/recorder-driver.types.js";
import { RecorderHttpClient } from "../../transport/recorder-http-client.js";
import { DigestAuthProvider } from "../../transport/recorder-http-transport.js";

/**
 * Dahua CGI Driver
 * 
 * Canonical implementation for Dahua and CP PLUS recorders.
 */
export class DahuaCGIDriver implements RecorderDriver {
  readonly protocol: RecorderProtocol = "dahua-cgi";
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
      "/cgi-bin/magicBox.cgi",
      { action: "getSystemInfo" }
    );
    
    if (response.statusCode !== 200) {
      throw new Error(`Failed to get device info: HTTP ${response.statusCode}`);
    }
    
    const text = response.body;
    
    // Parse Dahua key=value format
    const model = this.extractKey(text, ["model", "modelName", "productName", "deviceType"]);
    const serialNumber = this.extractKey(text, ["serialNumber"]);
    const firmwareVersion = this.extractKey(text, ["softwareVersion", "firmwareVersion", "version"]);
    const manufacturer = this.extractKey(text, ["vendor"]) || "Dahua";
    
    // Detect if this is CP PLUS OEM
    const vendor = manufacturer.toLowerCase().includes("cp") || 
                   model?.toLowerCase().includes("cp") ? "cp-plus" : "dahua";
    
    return {
      vendor,
      protocolFamily: "dahua-cgi",
      manufacturer,
      model: model || "Unknown",
      firmwareVersion,
      serialNumber,
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
      playback: { supported: true, source: "vendor", confidence: 0.9 },
      recordingExport: { supported: false, source: "vendor", confidence: 0.5 },
      storageTelemetry: { supported: true, source: "vendor", confidence: 1.0 },
      retentionTelemetry: { supported: true, source: "vendor", confidence: 1.0 },
      deviceTime: { supported: true, source: "vendor", confidence: 1.0 },
      ntpStatus: { supported: false, source: "unknown", confidence: 0.3 },
      videoLossEvents: { supported: true, source: "vendor", confidence: 1.0 },
      motionEvents: { supported: true, source: "vendor", confidence: 0.8 },
      ptz: { supported: false, source: "unknown", confidence: 0.5 },
      vendorApi: { supported: true, source: "vendor", confidence: 1.0 },
      onvif: { supported: false, source: "unknown", confidence: 0.5 }
    };
  }
  
  /**
   * Get all channels
   */
  async getChannels(ctx: RecorderContext): Promise<RecorderChannel[]> {
    // Get channel titles
    const titleResponse = await this.httpClient.get(
      ctx,
      "/cgi-bin/configManager.cgi",
      { action: "getConfig", name: "ChannelTitle" }
    );
    
    if (titleResponse.statusCode !== 200) {
      throw new Error(`Failed to get channels: HTTP ${titleResponse.statusCode}`);
    }
    
    const titleText = titleResponse.body;
    
    // Parse channel IDs: ChannelTitle[0], ChannelTitle[1], etc.
    const channelIds = [...new Set(
      [...titleText.matchAll(/ChannelTitle\[(\d+)\]/g)].map(match => Number(match[1]))
    )].sort((a, b) => a - b);
    
    // Get video loss status
    let videoLossChannels: Set<number> | null = null;
    try {
      const videoLossResponse = await this.httpClient.get(
        ctx,
        "/cgi-bin/eventManager.cgi",
        { action: "getEventIndexes", code: "VideoLoss" }
      );
      
      if (videoLossResponse.statusCode === 200) {
        videoLossChannels = this.parseVideoLossChannels(videoLossResponse.body);
      }
    } catch {
      // Video loss query failed, connection state will be unknown
    }
    
    // Build channel list
    return channelIds.map(channelId => {
      const hasVideoLoss = videoLossChannels ? videoLossChannels.has(channelId) : null;
      
      return {
        id: String(channelId),
        index: channelId,
        name: `Channel ${channelId + 1}`,
        enabled: true,
        sourceType: "IP",
        connectionState: hasVideoLoss === null ? "UNKNOWN" : 
                        hasVideoLoss ? "VIDEO_LOSS" : "ONLINE",
        recordingState: "UNKNOWN" // Requires archive search
      };
    });
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
    const channelIndex = parseInt(request.channelId);
    
    // Dahua RTSP format: rtsp://<ip>:<port>/cam/realmonitor?channel=<ch>&subtype=<0|1>
    const subtype = request.profile === "SUBSTREAM" ? 1 : 0;
    const uri = `rtsp://${ctx.endpoint.host}:554/cam/realmonitor?channel=${channelIndex}&subtype=${subtype}`;
    
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
    const now = new Date();
    const searchFrom = new Date(now.getTime() - 3600000); // Last hour
    
    try {
      const result = await this.searchRecordingsInternal(
        ctx,
        channelIndex,
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
        const isRecording = ageSeconds < 300; // Within 5 minutes
        
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
        reason: "No recordings found in last hour",
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
    const segments = await this.searchRecordingsInternal(
      ctx,
      channelIndex,
      request.from,
      request.to,
      request.limit || 1000
    );
    
    return {
      segments: segments.segments,
      totalCount: segments.segments.length,
      hasMore: false,
      success: true
    };
  }
  
  /**
   * Internal recording search implementation
   * 
   * Dahua uses multi-step search:
   * 1. factory.create - get search handle
   * 2. findFile - start search
   * 3. findNextFile - paginate results
   * 4. close - cleanup handle
   */
  private async searchRecordingsInternal(
    ctx: RecorderContext,
    channelIndex: number,
    from: Date,
    to: Date,
    maxResults: number
  ): Promise<{ segments: RecordingSegment[] }> {
    let searchHandle: string | undefined;
    
    try {
      // Step 1: Create search handle
      const createResponse = await this.httpClient.get(
        ctx,
        "/cgi-bin/mediaFileFind.cgi",
        { action: "factory.create" }
      );
      
      if (createResponse.statusCode !== 200) {
        throw new Error(`Search factory failed: HTTP ${createResponse.statusCode}`);
      }
      
      searchHandle = this.extractKey(createResponse.body, ["object"]);
      if (!searchHandle) {
        throw new Error("No search handle returned");
      }
      
      // Step 2: Start search
      const findResponse = await this.httpClient.get(
        ctx,
        "/cgi-bin/mediaFileFind.cgi",
        {
          action: "findFile",
          object: searchHandle,
          "condition.Channel": String(channelIndex),
          "condition.StartTime": this.formatDahuaTime(from),
          "condition.EndTime": this.formatDahuaTime(to),
          "condition.Types[0]": "dav"
        }
      );
      
      if (findResponse.statusCode !== 200) {
        throw new Error(`Search find failed: HTTP ${findResponse.statusCode}`);
      }
      
      // Step 3: Paginate results
      const segments: RecordingSegment[] = [];
      const pageSize = Math.min(128, maxResults);
      
      for (let page = 0; page < 40 && segments.length < maxResults; page++) {
        const nextResponse = await this.httpClient.get(
          ctx,
          "/cgi-bin/mediaFileFind.cgi",
          {
            action: "findNextFile",
            object: searchHandle,
            count: String(pageSize)
          }
        );
        
        if (nextResponse.statusCode !== 200) {
          break;
        }
        
        const found = this.extractKey(nextResponse.body, ["found"]);
        if (!this.hasFoundResults(found)) {
          break;
        }
        
        const pageSegments = this.parseDahuaRecordingSegments(
          nextResponse.body,
          String(channelIndex)
        );
        
        if (pageSegments.length === 0) {
          break;
        }
        
        segments.push(...pageSegments);
      }
      
      return { segments };
      
    } finally {
      // Step 4: Always close search handle
      if (searchHandle) {
        try {
          await this.httpClient.get(
            ctx,
            "/cgi-bin/mediaFileFind.cgi",
            { action: "close", object: searchHandle }
          );
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
  
  /**
   * Get storage status
   */
  async getStorageStatus(ctx: RecorderContext): Promise<StorageStatus> {
    const response = await this.httpClient.get(
      ctx,
      "/cgi-bin/storageDevice.cgi",
      { action: "getDeviceAllInfo" }
    );
    
    if (response.statusCode !== 200) {
      throw new Error(`Failed to get storage: HTTP ${response.statusCode}`);
    }
    
    const volumes = this.parseDahuaStorage(response.body);
    
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
      "/cgi-bin/global.cgi",
      { action: "getCurrentTime" }
    );
    
    if (response.statusCode !== 200) {
      throw new Error(`Failed to get device time: HTTP ${response.statusCode}`);
    }
    
    const timeStr = this.extractKey(response.body, ["time"]);
    if (!timeStr) {
      throw new Error("No time in response");
    }
    
    const deviceTime = new Date(timeStr.replace(" ", "T"));
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
   * Extract key from Dahua key=value format
   * Tries multiple key names in order
   */
  private extractKey(text: string, keys: string[]): string | undefined {
    for (const key of keys) {
      const match = text.match(new RegExp(`(?:^|\\n)${key}=([^\\r\\n]+)`, "i"));
      if (match) {
        return match[1]?.trim();
      }
    }
    return undefined;
  }
  
  /**
   * Parse video loss channels
   */
  private parseVideoLossChannels(text: string): Set<number> {
    const channels = new Set<number>();
    const matches = [...text.matchAll(/channels\[(\d+)\]=true/gi)];
    
    for (const match of matches) {
      const channel = Number(match[1]);
      if (Number.isInteger(channel)) {
        channels.add(channel);
      }
    }
    
    return channels;
  }
  
  /**
   * Parse Dahua recording segments
   */
  private parseDahuaRecordingSegments(
    text: string,
    channelId: string
  ): RecordingSegment[] {
    const grouped = new Map<string, {
      startTime?: string;
      endTime?: string;
      channel?: string;
      length?: string;
    }>();
    
    // Parse items[N].Field=Value format
    for (const match of text.matchAll(/(?:items|item)\[(\d+)\]\.(StartTime|EndTime|Channel|Length)=([^\r\n]+)/gi)) {
      const index = match[1]!;
      const field = match[2]!.toLowerCase();
      const value = match[3]!.trim();
      
      const item = grouped.get(index) || {};
      if (field === "starttime") item.startTime = value;
      else if (field === "endtime") item.endTime = value;
      else if (field === "channel") item.channel = value;
      else if (field === "length") item.length = value;
      
      grouped.set(index, item);
    }
    
    // Convert to segments
    const segments: RecordingSegment[] = [];
    
    for (const [index, item] of grouped) {
      if (!item.startTime || !item.endTime) continue;
      
      const startTime = this.parseDahuaTimestamp(item.startTime);
      const endTime = this.parseDahuaTimestamp(item.endTime);
      
      if (!startTime || !endTime) continue;
      
      const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
      
      segments.push({
        id: `${channelId}-${index}`,
        channelId,
        startTime,
        endTime,
        durationSeconds,
        recordingType: "continuous"
      });
    }
    
    return segments;
  }
  
  /**
   * Parse Dahua storage disks
   */
  private parseDahuaStorage(text: string): StorageVolume[] {
    const volumes: StorageVolume[] = [];
    const diskPattern = /(?:^|\n)info\[(\d+)\]\.(\w+)=([^\r\n]+)/gi;
    const disks = new Map<string, Record<string, string>>();
    
    for (const match of text.matchAll(diskPattern)) {
      const index = match[1]!;
      const field = match[2]!.toLowerCase();
      const value = match[3]!.trim();
      
      const disk = disks.get(index) || {};
      disk[field] = value;
      disks.set(index, disk);
    }
    
    for (const [index, disk] of disks) {
      const state = disk.state?.toLowerCase();
      const totalMB = Number(disk.totalbytes) / (1024 * 1024);
      const freeMB = Number(disk.freebytes) / (1024 * 1024);
      
      volumes.push({
        id: `disk-${index}`,
        type: "HDD",
        state: state === "ok" || state === "0" ? "HEALTHY" :
               state === "error" || state === "1" ? "FAILED" : "UNKNOWN",
        capacityBytes: totalMB * 1024 * 1024,
        freeBytes: freeMB * 1024 * 1024,
        usedBytes: (totalMB - freeMB) * 1024 * 1024,
        rawVendorState: state
      });
    }
    
    return volumes;
  }
  
  /**
   * Parse Dahua timestamp
   */
  private parseDahuaTimestamp(value: string): Date | null {
    // Format: "2024-08-15 14:30:00" or "2024-08-15T14:30:00"
    const parsed = Date.parse(value.replace(" ", "T"));
    return Number.isFinite(parsed) ? new Date(parsed) : null;
  }
  
  /**
   * Format time for Dahua API
   */
  private formatDahuaTime(date: Date): string {
    return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
  }
  
  /**
   * Check if search has found results
   */
  private hasFoundResults(found: string | undefined): boolean {
    if (!found) return false;
    const value = Number(found);
    return Number.isInteger(value) && value > 0;
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
