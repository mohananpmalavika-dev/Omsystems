/**
 * Hikvision XML Parser
 * 
 * Parses XML responses from Hikvision ISAPI endpoints.
 * Uses xml2js for reliable parsing with namespace handling.
 */

import { parseStringPromise, OptionsV2 } from 'xml2js';
import type {
  DeviceInfo,
  ChannelEvidence,
  StorageEvidence,
  DiskEvidence,
  DiskState,
  RecordingSegment,
  RecordingType,
  DeviceClockEvidence
} from '../../contracts/recorder-evidence.js';
import { logger } from '../../../utils/logger.js';

/**
 * XML parser options
 */
const PARSER_OPTIONS: OptionsV2 = {
  explicitArray: false,
  ignoreAttrs: false,
  tagNameProcessors: [
    // Remove namespace prefixes
    (name: string) => name.replace(/^[^:]+:/, '')
  ],
  attrNameProcessors: [
    (name: string) => name.replace(/^[^:]+:/, '')
  ],
  valueProcessors: [
    // Trim whitespace
    (value: string) => value.trim()
  ]
};

/**
 * Hikvision XML parser
 */
export class HikvisionParser {
  /**
   * Parse XML string
   */
  async parse<T = any>(xml: string): Promise<T> {
    try {
      return await parseStringPromise(xml, PARSER_OPTIONS);
    } catch (error) {
      logger.error('Hikvision XML parse error', {
        error,
        xml: xml.substring(0, 500)
      });
      throw new Error(`XML parse failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  /**
   * Parse device info response
   */
  async parseDeviceInfo(xml: string): Promise<DeviceInfo> {
    const parsed = await this.parse(xml);
    const info = parsed.DeviceInfo || parsed.deviceInfo;

    if (!info) {
      throw new Error('Invalid device info response');
    }

    return {
      manufacturer: this.extractText(info.manufacturer) || 'Hikvision',
      model: this.extractText(info.deviceModel || info.model),
      firmwareVersion: this.extractText(info.firmwareVersion),
      serialNumber: this.extractText(info.serialNumber),
      deviceName: this.extractText(info.deviceName)
    };
  }

  /**
   * Parse channels list
   */
  async parseChannels(xml: string): Promise<Array<{
    id: string;
    name: string;
    enabled: boolean;
    videoInputType?: string;
  }>> {
    const parsed = await this.parse(xml);
    
    // Handle different response structures
    let channelList = parsed.InputProxyChannelList || parsed.VideoInputChannelList;
    
    if (!channelList) {
      return [];
    }

    // Extract channel items
    let channels = channelList.InputProxyChannel || channelList.VideoInputChannel || [];
    
    if (!Array.isArray(channels)) {
      channels = [channels];
    }

    return channels.map((channel: any, index: number) => {
      const id = this.extractAttr(channel, 'id') ||
                 this.extractText(channel.id) ||
                 String(index + 1);

      return {
        id,
        name: this.extractText(channel.name) || `Channel ${id}`,
        enabled: this.parseBoolean(channel.enabled),
        videoInputType: this.extractText(channel.videoInputType)
      };
    });
  }

  /**
   * Parse single channel
   */
  async parseChannel(xml: string, channelId: string): Promise<{
    id: string;
    name: string;
    enabled: boolean;
    videoInputType?: string;
  }> {
    const parsed = await this.parse(xml);
    const channel = parsed.InputProxyChannel || parsed.VideoInputChannel;

    if (!channel) {
      throw new Error('Invalid channel response');
    }

    return {
      id: channelId,
      name: this.extractText(channel.name) || `Channel ${channelId}`,
      enabled: this.parseBoolean(channel.enabled),
      videoInputType: this.extractText(channel.videoInputType)
    };
  }

  /**
   * Parse stream status
   */
  async parseStreamStatus(xml: string): Promise<{
    online: boolean;
    signalStatus?: string;
  }> {
    const parsed = await this.parse(xml);
    const status = parsed.InputProxyChannelStatus || parsed.VideoInputChannelStatus;

    if (!status) {
      throw new Error('Invalid stream status response');
    }

    return {
      online: this.parseBoolean(status.online),
      signalStatus: this.extractText(status.signalStatus)
    };
  }

  /**
   * Parse recording status
   */
  async parseRecordingStatus(xml: string): Promise<{
    recording: boolean;
    enabled: boolean;
  }> {
    const parsed = await this.parse(xml);
    const status = parsed.RecordStatus || parsed.trackStatus;

    if (!status) {
      throw new Error('Invalid recording status response');
    }

    return {
      recording: this.extractText(status.status)?.toLowerCase() === 'record',
      enabled: this.parseBoolean(status.enabled)
    };
  }

  /**
   * Parse recording search results
   */
  async parseSearchResults(xml: string): Promise<RecordingSegment[]> {
    const parsed = await this.parse(xml);
    const searchResult = parsed.CMSearchResult;

    if (!searchResult?.matchList?.searchMatchItem) {
      return [];
    }

    let items = searchResult.matchList.searchMatchItem;
    if (!Array.isArray(items)) {
      items = [items];
    }

    return items
      .map((item: any) => this.parseSearchItem(item))
      .filter((segment): segment is RecordingSegment => segment !== null);
  }

  /**
   * Parse single search item
   */
  private parseSearchItem(item: any): RecordingSegment | null {
    try {
      const trackId = this.extractText(item.trackID);
      const startTime = this.parseDate(item.startTime);
      const endTime = this.parseDate(item.endTime);

      if (!trackId || !startTime || !endTime) {
        return null;
      }

      return {
        id: `${trackId}_${startTime.getTime()}`,
        channelId: this.extractChannelFromTrackId(trackId),
        startTime,
        endTime,
        recordingType: this.mapRecordingType(item.playbackURI || item.mediaSegmentDescriptor?.playbackURI),
        playbackUri: this.extractText(item.playbackURI),
        sizeBytes: this.parseNumber(item.fileSizeBytes),
        locked: this.parseBoolean(item.locked),
        vendorReference: trackId
      };
    } catch (error) {
      logger.warn('Failed to parse search item', { error, item });
      return null;
    }
  }

  /**
   * Extract channel ID from track ID
   * Track ID format: typically "101" = channel 1, main stream
   */
  private extractChannelFromTrackId(trackId: string): string {
    // Remove last two digits (01 = main stream, 02 = sub stream)
    const match = trackId.match(/^(\d+)0[12]$/);
    return match ? match[1] : trackId;
  }

  /**
   * Map recording type from URI or descriptor
   */
  private mapRecordingType(uri?: string): RecordingType {
    if (!uri) return 'unknown';
    
    const lower = uri.toLowerCase();
    if (lower.includes('motion')) return 'motion';
    if (lower.includes('alarm')) return 'alarm';
    if (lower.includes('manual')) return 'manual';
    if (lower.includes('timing')) return 'continuous';
    
    return 'event';
  }

  /**
   * Parse storage status
   */
  async parseStorageStatus(xml: string): Promise<StorageEvidence> {
    const parsed = await this.parse(xml);
    const storage = parsed.storage || parsed.hddList;

    if (!storage) {
      throw new Error('Invalid storage response');
    }

    // Parse individual HDDs
    let hdds = storage.hdd || [];
    if (!Array.isArray(hdds)) {
      hdds = [hdds];
    }

    const disks: DiskEvidence[] = hdds.map((hdd: any, index: number) => 
      this.parseHdd(hdd, index)
    );

    // Calculate totals
    const totalBytes = disks.reduce((sum, disk) => 
      sum + (disk.capacityBytes || 0), 0
    );

    const usedBytes = disks.reduce((sum, disk) => {
      const capacity = disk.capacityBytes || 0;
      const freePercent = this.parseHddFreePercent(hdds.find(h => h.id === disk.diskId));
      return sum + (capacity * (100 - freePercent) / 100);
    }, 0);

    const freeBytes = totalBytes - usedBytes;
    const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

    return {
      totalBytes,
      usedBytes,
      freeBytes,
      usagePercent,
      disks
    };
  }

  /**
   * Parse individual HDD
   */
  private parseHdd(hdd: any, index: number): DiskEvidence {
    const hddId = this.extractAttr(hdd, 'id') || 
                  this.extractText(hdd.id) || 
                  String(index + 1);

    return {
      diskId: hddId,
      state: this.mapDiskState(hdd.status),
      capacityBytes: this.parseCapacity(hdd.capacity),
      type: this.extractText(hdd.type)?.toLowerCase() === 'ssd' ? 'ssd' : 'hdd',
      vendor: {
        model: this.extractText(hdd.diskModel),
        serialNumber: this.extractText(hdd.serialNumber)
      }
    };
  }

  /**
   * Parse HDD free percentage
   */
  private parseHddFreePercent(hdd: any): number {
    if (!hdd) return 0;
    
    const freePercent = this.parseNumber(hdd.freePercent);
    if (freePercent !== undefined) return freePercent;

    // Calculate from capacity and freeSpace
    const capacity = this.parseCapacity(hdd.capacity);
    const freeSpace = this.parseCapacity(hdd.freeSpace);
    
    if (capacity && freeSpace) {
      return (freeSpace / capacity) * 100;
    }

    return 0;
  }

  /**
   * Map disk state
   */
  private mapDiskState(status?: string): DiskState {
    if (!status) return 'unknown';
    
    const lower = status.toLowerCase();
    if (lower === 'ok' || lower === 'normal') return 'normal';
    if (lower === 'error' || lower === 'failed') return 'failed';
    if (lower === 'unformatted') return 'formatting';
    if (lower === 'notexist') return 'missing';
    
    return 'unknown';
  }

  /**
   * Parse capacity string (e.g., "1024MB", "2TB")
   */
  private parseCapacity(capacity?: string): number | undefined {
    if (!capacity) return undefined;
    
    const match = capacity.match(/^(\d+(?:\.\d+)?)\s*(GB|TB|MB|KB)?$/i);
    if (!match) return undefined;

    const value = parseFloat(match[1]);
    const unit = match[2]?.toUpperCase();

    const multipliers: Record<string, number> = {
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'TB': 1024 * 1024 * 1024 * 1024
    };

    return value * (multipliers[unit] || 1);
  }

  /**
   * Parse device time
   */
  async parseDeviceTime(xml: string): Promise<DeviceClockEvidence> {
    const parsed = await this.parse(xml);
    const time = parsed.time;

    if (!time) {
      throw new Error('Invalid time response');
    }

    // Parse time string (format: "2024-08-11T22:30:45+05:30")
    const timeMode = this.extractText(time.timeMode);
    const localTime = this.extractText(time.localTime);
    const timeZone = this.extractText(time.timeZone);

    if (!localTime) {
      throw new Error('Missing local time in response');
    }

    const recorderTime = new Date(localTime);
    const observedLocalTime = new Date();
    const offsetMs = recorderTime.getTime() - observedLocalTime.getTime();

    return {
      recorderTime,
      observedLocalTime,
      offsetMs,
      ntpEnabled: timeMode?.toLowerCase() === 'ntp',
      timezone: timeZone
    };
  }

  /**
   * Parse error response
   */
  async parseError(xml: string): Promise<{
    statusCode: string;
    statusString: string;
    subStatusCode?: string;
  }> {
    const parsed = await this.parse(xml);
    const error = parsed.ResponseStatus;

    if (!error) {
      throw new Error('Invalid error response');
    }

    return {
      statusCode: this.extractText(error.statusCode) || 'UNKNOWN',
      statusString: this.extractText(error.statusString) || 'Unknown error',
      subStatusCode: this.extractText(error.subStatusCode)
    };
  }

  /**
   * Extract text content from element
   */
  private extractText(element: any): string | undefined {
    if (element === undefined || element === null) return undefined;
    if (typeof element === 'string') return element;
    if (element?._) return String(element._);
    if (typeof element === 'number') return String(element);
    if (typeof element === 'boolean') return String(element);
    return undefined;
  }

  /**
   * Extract attribute value
   */
  private extractAttr(element: any, attrName: string): string | undefined {
    return element?.$?.[attrName];
  }

  /**
   * Parse boolean value
   */
  private parseBoolean(value: any): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    
    const str = String(value).toLowerCase();
    return str === 'true' || str === '1' || str === 'yes' || str === 'enabled';
  }

  /**
   * Parse number value
   */
  private parseNumber(value: any): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number') return value;
    
    const num = parseFloat(String(value));
    return isNaN(num) ? undefined : num;
  }

  /**
   * Parse date/time string
   */
  private parseDate(value: any): Date | undefined {
    if (!value) return undefined;
    
    try {
      const date = new Date(String(value));
      return isNaN(date.getTime()) ? undefined : date;
    } catch {
      return undefined;
    }
  }
}

/**
 * Build Hikvision search request XML
 */
export function buildSearchRequest(
  channelId: string,
  startTime: Date,
  endTime: Date,
  options?: {
    maxResults?: number;
    sortOrder?: 'ascending' | 'descending';
    recordTypes?: string[];
  }
): string {
  const trackId = `${channelId}01`; // 01 = main stream
  const maxResults = options?.maxResults ?? 100;

  return `
    <?xml version="1.0" encoding="UTF-8"?>
    <CMSearchDescription>
      <searchID>C${Date.now()}</searchID>
      <trackIDList>
        <trackID>${trackId}</trackID>
      </trackIDList>
      <timeSpanList>
        <timeSpan>
          <startTime>${startTime.toISOString()}</startTime>
          <endTime>${endTime.toISOString()}</endTime>
        </timeSpan>
      </timeSpanList>
      <maxResults>${maxResults}</maxResults>
      <searchResultPosition>0</searchResultPosition>
      ${options?.recordTypes ? buildRecordTypeFilter(options.recordTypes) : ''}
    </CMSearchDescription>
  `.trim();
}

/**
 * Build record type filter
 */
function buildRecordTypeFilter(types: string[]): string {
  return `
    <metadataList>
      ${types.map(type => `<metadataDescriptor>${type}</metadataDescriptor>`).join('\n      ')}
    </metadataList>
  `;
}

/**
 * Sanitize Hikvision URI (remove credentials)
 */
export function sanitizeHikvisionUri(uri: string): string {
  try {
    const url = new URL(uri);
    
    if (url.username || url.password) {
      url.username = '';
      url.password = '';
    }

    return url.toString();
  } catch {
    // If URL parsing fails, return as-is
    return uri;
  }
}
