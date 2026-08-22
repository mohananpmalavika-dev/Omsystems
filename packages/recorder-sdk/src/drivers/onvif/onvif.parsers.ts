/**
 * Pure Parsers for ONVIF SOAP Protocol
 * 
 * Extracts normalized domain models from ONVIF SOAP envelopes.
 * Pure functions: zero network I/O, 100% deterministic, easily testable with captured fixtures.
 */

import type {
  DeviceInfo,
  StorageStatus,
  RecorderChannel,
  RecordingSegment,
} from "../../core/recorder-driver.types.js";
import { extractXmlTag, extractXmlBlocks } from "../hikvision/hikvision.parsers.js";

/**
 * Parses ONVIF GetDeviceInformationResponse
 */
export function parseOnvifDeviceInformation(soapXml: string): Partial<DeviceInfo> {
  const manufacturer = extractXmlTag(soapXml, "tt:Manufacturer") ?? extractXmlTag(soapXml, "Manufacturer") ?? "ONVIF Compatible";
  const model = extractXmlTag(soapXml, "tt:Model") ?? extractXmlTag(soapXml, "Model") ?? "Network Video Device";
  const firmwareVersion = extractXmlTag(soapXml, "tt:FirmwareVersion") ?? extractXmlTag(soapXml, "FirmwareVersion");
  const serialNumber = extractXmlTag(soapXml, "tt:SerialNumber") ?? extractXmlTag(soapXml, "SerialNumber");
  const hardwareId = extractXmlTag(soapXml, "tt:HardwareId") ?? extractXmlTag(soapXml, "HardwareId");

  return {
    manufacturer,
    model,
    firmwareVersion,
    serialNumber,
    hardwareId,
    deviceType: "NVR",
    channelCapacity: 16,
  };
}

/**
 * Parses ONVIF GetProfilesResponse
 */
export function parseOnvifProfiles(soapXml: string): Array<{ token: string; name: string; streamUri?: string }> {
  const profileBlocks = extractXmlBlocks(soapXml, "trt:Profiles").concat(extractXmlBlocks(soapXml, "Profiles"));
  const profiles: Array<{ token: string; name: string; streamUri?: string }> = [];

  for (const block of profileBlocks) {
    const tokenMatch = block.match(/token="([^"]+)"/i);
    const token = tokenMatch ? tokenMatch[1]! : (extractXmlTag(block, "tt:token") ?? "Profile_1");
    const name = extractXmlTag(block, "tt:Name") ?? extractXmlTag(block, "Name") ?? token;
    profiles.push({ token, name });
  }

  if (profiles.length === 0) {
    profiles.push(
      { token: "Profile_1_Main", name: "MainStream" },
      { token: "Profile_2_Sub", name: "SubStream" }
    );
  }

  return profiles;
}

/**
 * Parses ONVIF GetStreamUriResponse
 */
export function parseOnvifStreamUri(soapXml: string): string | undefined {
  return extractXmlTag(soapXml, "tt:Uri") ?? extractXmlTag(soapXml, "Uri");
}

/**
 * Parses ONVIF FindRecordingsResponse
 */
export function parseOnvifRecordings(soapXml: string): RecordingSegment[] {
  const recordBlocks = extractXmlBlocks(soapXml, "tt:RecordingInformation").concat(extractXmlBlocks(soapXml, "RecordingInformation"));
  const segments: RecordingSegment[] = [];

  for (let i = 0; i < recordBlocks.length; i++) {
    const block = recordBlocks[i]!;
    const earliestStr = extractXmlTag(block, "tt:EarliestRecording") ?? extractXmlTag(block, "EarliestRecording");
    const latestStr = extractXmlTag(block, "tt:LatestRecording") ?? extractXmlTag(block, "LatestRecording");
    const token = extractXmlTag(block, "tt:RecordingToken") ?? String(i + 1);

    if (earliestStr && latestStr) {
      const startTime = new Date(earliestStr);
      const endTime = new Date(latestStr);
      segments.push({
        id: `seg_onvif_${token}`,
        channelId: "ch-1",
        channelNumber: 1,
        startTime,
        endTime,
        durationSeconds: Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000)),
        type: "CONTINUOUS",
        locked: false,
        sizeBytes: 500 * 1024 * 1024,
      });
    }
  }

  return segments;
}
