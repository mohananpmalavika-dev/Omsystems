import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface SmartTelemetry {
  devicePath: string;
  telemetrySource: 'real' | 'simulated';
  /** `smart` has drive attributes; `storage-status` is a recorder-reported disk state only. */
  telemetryCapability: 'smart' | 'storage-status' | 'unknown';
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
    telemetryCapability: 'unknown',
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
        telemetryCapability: parsed.telemetryCapability,
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

  if (vendor.includes('dahua') || vendor.includes('cp plus') || vendor.includes('cpplus')) {
    let response = await fetch(`${baseUrl}/cgi-bin/storageDevice.cgi?action=getDeviceAllInfo`, { headers, signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      response = await fetch(`${baseUrl}/cgi-bin/magicBox.cgi?action=getSystemInfo`, { headers, signal: AbortSignal.timeout(5000) });
    }
    if (!response.ok) throw new Error(`Recorder storage endpoint returned ${response.status}`);
    const text = await response.text();
    const parsed = parseDahuaStorageText(text);
    if (parsed) {
      return {
        devicePath: config.devicePath ?? baseUrl,
        telemetrySource: 'real',
        telemetryCapability: parsed.telemetryCapability,
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

export function parseHikvisionStorageXml(xml: string): { telemetryCapability: SmartTelemetry['telemetryCapability']; smartStatus: SmartTelemetry['smartStatus']; temperature?: number; reallocatedSectors?: number; pendingSectors?: number; uncorrectableSectors?: number; failureProbability?: number } | null {
  const temperature = parseInt(xml.match(/<temperature>(-?\d+)<\/temperature>/i)?.[1] ?? '', 10);
  const reallocated = parseInt(xml.match(/<reallocatedSectors>(\d+)<\/reallocatedSectors>/i)?.[1] ?? '', 10);
  const pending = parseInt(xml.match(/<pendingSectors>(\d+)<\/pendingSectors>/i)?.[1] ?? '', 10);
  const uncorrectable = parseInt(xml.match(/<uncorrectableSectors>(\d+)<\/uncorrectableSectors>/i)?.[1] ?? '', 10);
  const status = xml.match(/<status>([^<]+)<\/status>/i)?.[1]?.toLowerCase();

  if (![temperature, reallocated, pending, uncorrectable].some((value) => Number.isFinite(value) && value > 0) && !status) {
    return null;
  }

  const hasSmartAttributes = [temperature, reallocated, pending, uncorrectable].some((value) => Number.isFinite(value));
  let smartStatus: SmartTelemetry['smartStatus'] = 'healthy';
  if (/(?:warning|degraded|abnormal)/.test(status ?? '') || reallocated > 0 || pending > 0 || uncorrectable > 0 || temperature > 55) {
    smartStatus = 'warning';
  }
  if (/(?:critical|fail|error|fault|bad)/.test(status ?? '') || temperature > 65 || reallocated > 20 || pending > 5 || uncorrectable > 5) {
    smartStatus = 'critical';
  }

  return {
    telemetryCapability: hasSmartAttributes ? 'smart' : 'storage-status',
    smartStatus,
    temperature: Number.isFinite(temperature) ? temperature : undefined,
    reallocatedSectors: Number.isFinite(reallocated) ? reallocated : undefined,
    pendingSectors: Number.isFinite(pending) ? pending : undefined,
    uncorrectableSectors: Number.isFinite(uncorrectable) ? uncorrectable : undefined,
    // A recorder-reported state is useful health evidence, but it does not
    // expose enough SMART attributes to justify a numeric failure prediction.
    failureProbability: hasSmartAttributes ? (smartStatus === 'critical' ? 90 : smartStatus === 'warning' ? 45 : 10) : undefined,
  };
}

export function parseDahuaStorageText(text: string): { telemetryCapability: SmartTelemetry['telemetryCapability']; smartStatus: SmartTelemetry['smartStatus']; temperature?: number; reallocatedSectors?: number; pendingSectors?: number; uncorrectableSectors?: number; failureProbability?: number } | null {
  const temperature = parseInt(text.match(/temperature\s*[:=]\s*(-?\d+)/i)?.[1] ?? '', 10);
  const reallocated = parseInt(text.match(/reallocated\s*[:=]\s*(\d+)/i)?.[1] ?? '', 10);
  const pending = parseInt(text.match(/pending\s*[:=]\s*(\d+)/i)?.[1] ?? '', 10);
  const uncorrectable = parseInt(text.match(/uncorrectable\s*[:=]\s*(\d+)/i)?.[1] ?? '', 10);

  const diskStates = [...text.matchAll(/(?:^|\r?\n)(?:Storage(?:\.Disk)?|Disk|HDD)(?:\[\d+\]|\.\d+)?\.(?:state|status|health|smartstatus)\s*[:=]\s*([^\r\n]+)/gi)]
    .map((match) => match[1]!.trim().toLowerCase());
  const hasSmartAttributes = [temperature, reallocated, pending, uncorrectable].some((value) => Number.isFinite(value));
  if (!hasSmartAttributes && diskStates.length === 0) {
    return null;
  }

  let smartStatus: SmartTelemetry['smartStatus'] = 'healthy';
  if (diskStates.some((state) => /warning|degraded|abnormal/.test(state)) || reallocated > 0 || pending > 0 || uncorrectable > 0 || temperature > 55) {
    smartStatus = 'warning';
  }
  if (diskStates.some((state) => /critical|fail|error|fault|bad|missing/.test(state)) || temperature > 65 || reallocated > 20 || pending > 5 || uncorrectable > 5) {
    smartStatus = 'critical';
  }

  return {
    telemetryCapability: hasSmartAttributes ? 'smart' : 'storage-status',
    smartStatus,
    temperature: Number.isFinite(temperature) ? temperature : undefined,
    reallocatedSectors: Number.isFinite(reallocated) ? reallocated : undefined,
    pendingSectors: Number.isFinite(pending) ? pending : undefined,
    uncorrectableSectors: Number.isFinite(uncorrectable) ? uncorrectable : undefined,
    failureProbability: hasSmartAttributes ? (smartStatus === 'critical' ? 90 : smartStatus === 'warning' ? 45 : 10) : undefined,
  };
}

export function parseSmartctlJson(payload: Record<string, unknown>, devicePath: string): SmartTelemetry {
  const smartStatusPayload = payload.smart_status as { passed?: boolean } | undefined;
  const passed = smartStatusPayload?.passed ?? true;
  const attributes = (payload.ata_smart_attributes as { table?: Array<Record<string, unknown>> } | undefined)?.table ?? [];

  const lookup = (name: string) => attributes.find((attribute) => attribute.name === name);
  const asNumber = (value: unknown) => typeof value === 'number' ? value : Number(value ?? 0);
  const rawNumber = (name: string) => {
    const attribute = lookup(name);
    const raw = attribute?.raw as { value?: unknown } | undefined;
    return asNumber(raw?.value ?? attribute?.value);
  };

  const temperature = rawNumber('Temperature_Celsius');
  const powerOnHours = rawNumber('Power_On_Hours');
  const reallocatedSectors = rawNumber('Reallocated_Sector_Ct');
  const pendingSectors = rawNumber('Current_Pending_Sector');
  const uncorrectableSectors = rawNumber('Offline_Uncorrectable');
  const readErrors = rawNumber('UDMA_CRC_Error_Count');

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
    telemetryCapability: 'smart',
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
