import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface SmartTelemetry {
  devicePath: string;
  telemetrySource: 'real' | 'simulated';
  smartStatus: 'healthy' | 'warning' | 'critical' | 'unknown';
  model?: string;
  serialNumber?: string;
  temperature?: number;
  powerOnHours?: number;
  reallocatedSectors?: number;
  pendingSectors?: number;
  uncorrectableSectors?: number;
  readErrors?: number;
  writeErrors?: number;
  failureProbability?: number;
  raw?: Record<string, unknown>;
}

export interface SmartCollectorConfig {
  devicePath?: string;
  vendor?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  endpoint?: string;
}

export async function collectSmartTelemetry(input: string | SmartCollectorConfig): Promise<SmartTelemetry> {
  const config = typeof input === 'string' ? { devicePath: input } : input;

  if (config.devicePath) {
    try {
      const { stdout } = await execFileAsync('smartctl', ['--json', config.devicePath], { timeout: 10000 });
      const parsed = JSON.parse(stdout) as Record<string, unknown>;
      return parseSmartctlJson(parsed, config.devicePath);
    } catch (error) {
      // Fall back to vendor-specific polling when smartctl is unavailable or the path is not a local disk.
    }
  }

  if (config.host || config.endpoint) {
    try {
      return await collectVendorTelemetry(config);
    } catch (error) {
      // Fall through to simulated state below.
    }
  }

  return {
    devicePath: config.devicePath ?? config.host ?? config.endpoint ?? 'unknown',
    telemetrySource: 'simulated',
    smartStatus: 'unknown',
    failureProbability: 0,
    raw: { error: 'No real device polling path available' },
  };
}

async function collectVendorTelemetry(config: SmartCollectorConfig): Promise<SmartTelemetry> {
  const vendor = (config.vendor ?? '').toLowerCase();
  const baseUrl = (config.endpoint ?? (config.host ? `http://${config.host}${config.port ? `:${config.port}` : ''}` : '')).trim();

  if (!baseUrl) {
    throw new Error('No vendor endpoint configured');
  }

  const headers: Record<string, string> = {};
  if (config.username && config.password) {
    headers.Authorization = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
  }

  if (vendor.includes('hikvision')) {
    const storageResponse = await fetch(`${baseUrl}/ISAPI/ContentMgmt/Storage`, { headers, signal: AbortSignal.timeout(5000) });
    if (!storageResponse.ok) {
      throw new Error(`Hikvision storage endpoint returned ${storageResponse.status}`);
    }

    const xml = await storageResponse.text();
    const parsed = parseHikvisionStorageXml(xml);
    if (parsed) {
      return {
        devicePath: config.devicePath ?? baseUrl,
        telemetrySource: 'real',
        smartStatus: parsed.smartStatus,
        temperature: parsed.temperature,
        reallocatedSectors: parsed.reallocatedSectors,
        pendingSectors: parsed.pendingSectors,
        uncorrectableSectors: parsed.uncorrectableSectors,
        failureProbability: parsed.failureProbability,
        raw: { vendor, source: 'hikvision-storage', xml },
      };
    }
  }

  if (vendor.includes('dahua')) {
    const response = await fetch(`${baseUrl}/cgi-bin/magicBox.cgi?action=getSystemInfo`, { headers, signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      throw new Error(`Dahua system endpoint returned ${response.status}`);
    }

    const text = await response.text();
    const parsed = parseDahuaStorageText(text);
    if (parsed) {
      return {
        devicePath: config.devicePath ?? baseUrl,
        telemetrySource: 'real',
        smartStatus: parsed.smartStatus,
        temperature: parsed.temperature,
        reallocatedSectors: parsed.reallocatedSectors,
        pendingSectors: parsed.pendingSectors,
        uncorrectableSectors: parsed.uncorrectableSectors,
        failureProbability: parsed.failureProbability,
        raw: { vendor, source: 'dahua-system', text },
      };
    }
  }

  throw new Error('Vendor endpoint did not yield parseable storage telemetry');
}

function parseHikvisionStorageXml(xml: string): { smartStatus: SmartTelemetry['smartStatus']; temperature?: number; reallocatedSectors?: number; pendingSectors?: number; uncorrectableSectors?: number; failureProbability?: number } | null {
  const temperature = parseInt(xml.match(/<temperature>(-?\d+)<\/temperature>/i)?.[1] ?? '', 10);
  const reallocated = parseInt(xml.match(/<reallocatedSectors>(\d+)<\/reallocatedSectors>/i)?.[1] ?? '', 10);
  const pending = parseInt(xml.match(/<pendingSectors>(\d+)<\/pendingSectors>/i)?.[1] ?? '', 10);
  const uncorrectable = parseInt(xml.match(/<uncorrectableSectors>(\d+)<\/uncorrectableSectors>/i)?.[1] ?? '', 10);
  const status = xml.match(/<status>([^<]+)<\/status>/i)?.[1]?.toLowerCase();

  if (![temperature, reallocated, pending, uncorrectable].some((value) => Number.isFinite(value) && value > 0) && !status) {
    return null;
  }

  let smartStatus: SmartTelemetry['smartStatus'] = 'healthy';
  if (status === 'warning' || reallocated > 0 || pending > 0 || uncorrectable > 0 || temperature > 55) {
    smartStatus = 'warning';
  }
  if (status === 'critical' || temperature > 65 || reallocated > 20 || pending > 5 || uncorrectable > 5) {
    smartStatus = 'critical';
  }

  return {
    smartStatus,
    temperature: Number.isFinite(temperature) ? temperature : undefined,
    reallocatedSectors: Number.isFinite(reallocated) ? reallocated : undefined,
    pendingSectors: Number.isFinite(pending) ? pending : undefined,
    uncorrectableSectors: Number.isFinite(uncorrectable) ? uncorrectable : undefined,
    failureProbability: smartStatus === 'critical' ? 90 : smartStatus === 'warning' ? 45 : 10,
  };
}

function parseDahuaStorageText(text: string): { smartStatus: SmartTelemetry['smartStatus']; temperature?: number; reallocatedSectors?: number; pendingSectors?: number; uncorrectableSectors?: number; failureProbability?: number } | null {
  const temperature = parseInt(text.match(/temperature\s*[:=]\s*(-?\d+)/i)?.[1] ?? '', 10);
  const reallocated = parseInt(text.match(/reallocated\s*[:=]\s*(\d+)/i)?.[1] ?? '', 10);
  const pending = parseInt(text.match(/pending\s*[:=]\s*(\d+)/i)?.[1] ?? '', 10);
  const uncorrectable = parseInt(text.match(/uncorrectable\s*[:=]\s*(\d+)/i)?.[1] ?? '', 10);

  if (![temperature, reallocated, pending, uncorrectable].some((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }

  let smartStatus: SmartTelemetry['smartStatus'] = 'healthy';
  if (reallocated > 0 || pending > 0 || uncorrectable > 0 || temperature > 55) {
    smartStatus = 'warning';
  }
  if (temperature > 65 || reallocated > 20 || pending > 5 || uncorrectable > 5) {
    smartStatus = 'critical';
  }

  return {
    smartStatus,
    temperature: Number.isFinite(temperature) ? temperature : undefined,
    reallocatedSectors: Number.isFinite(reallocated) ? reallocated : undefined,
    pendingSectors: Number.isFinite(pending) ? pending : undefined,
    uncorrectableSectors: Number.isFinite(uncorrectable) ? uncorrectable : undefined,
    failureProbability: smartStatus === 'critical' ? 90 : smartStatus === 'warning' ? 45 : 10,
  };
}

export function parseSmartctlJson(payload: Record<string, unknown>, devicePath: string): SmartTelemetry {
  const smartStatusPayload = payload.smart_status as { passed?: boolean } | undefined;
  const passed = smartStatusPayload?.passed ?? true;
  const attributes = (payload.ata_smart_attributes as { table?: Array<Record<string, unknown>> } | undefined)?.table ?? [];

  const lookup = (name: string) => attributes.find((attribute) => attribute.name === name);
  const asNumber = (value: unknown) => typeof value === 'number' ? value : Number(value ?? 0);

  const temperature = asNumber(lookup('Temperature_Celsius')?.value);
  const powerOnHours = asNumber(lookup('Power_On_Hours')?.value);
  const reallocatedSectors = asNumber(lookup('Reallocated_Sector_Ct')?.value);
  const pendingSectors = asNumber(lookup('Current_Pending_Sector')?.value);
  const uncorrectableSectors = asNumber(lookup('Offline_Uncorrectable')?.value);
  const readErrors = asNumber(lookup('UDMA_CRC_Error_Count')?.value);

  let smartStatus: SmartTelemetry['smartStatus'] = 'healthy';
  if (!passed || reallocatedSectors > 0 || pendingSectors > 0 || uncorrectableSectors > 0 || temperature > 55) {
    smartStatus = 'warning';
  }
  if (temperature > 65 || reallocatedSectors > 20 || pendingSectors > 5 || uncorrectableSectors > 5) {
    smartStatus = 'critical';
  }

  return {
    devicePath,
    telemetrySource: 'real',
    smartStatus,
    model: typeof payload.model_name === 'string' ? payload.model_name : undefined,
    serialNumber: typeof payload.serial_number === 'string' ? payload.serial_number : undefined,
    temperature: Number.isFinite(temperature) ? temperature : undefined,
    powerOnHours: Number.isFinite(powerOnHours) ? powerOnHours : undefined,
    reallocatedSectors: Number.isFinite(reallocatedSectors) ? reallocatedSectors : undefined,
    pendingSectors: Number.isFinite(pendingSectors) ? pendingSectors : undefined,
    uncorrectableSectors: Number.isFinite(uncorrectableSectors) ? uncorrectableSectors : undefined,
    readErrors: Number.isFinite(readErrors) ? readErrors : undefined,
    writeErrors: undefined,
    failureProbability: smartStatus === 'critical' ? 90 : smartStatus === 'warning' ? 45 : 10,
    raw: payload,
  };
}
