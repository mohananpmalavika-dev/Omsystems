import { EventEmitter } from "events";
import type { Pool } from "pg";
import { logger } from "../utils/logger.js";
import { normalizeRecorderHddStatus, type NormalizedDiskHealth } from "../operational-health/disk-health.js";

export interface DVRNVRDevice {
  id: string;
  tenantId: string;
  branchId: string;
  deviceType: "dvr" | "nvr";
  manufacturer: string;
  model: string;
  ipAddress: string;
  port: number;
  protocol: "onvif" | "hikvision-isapi" | "dahua-cgi" | "cp-plus-oem-api" | "http-api";
  credentials?: {
    username: string;
    password: string;
  };
  pollingInterval: number; // seconds
  timeoutMs: number;
  enabled: boolean;
  status: "online" | "offline" | "unknown" | "error" | "degraded";
  lastHeartbeat?: Date;
  lastPolled?: Date;
  consecutiveFailures: number;
}

export interface DVRNVRHealthData {
  deviceId: string;
  timestamp: Date;
  status: "online" | "offline" | "degraded";
  latencyMs?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  hddStatus?: NormalizedDiskHealth[];
  recordingStatus?: "recording" | "stopped" | "error" | "unknown";
  connectedCameras?: number;
  totalCameras?: number;
  firmwareVersion?: string;
  uptime?: number; // seconds
  temperature?: number;
  errorMessage?: string;
}

export interface MonitoringStats {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  degradedDevices: number;
  lastUpdateTime: Date;
  avgLatencyMs: number;
}

export class DVRNVRMonitorService extends EventEmitter {
  private pool: Pool;
  private devices: Map<string, DVRNVRDevice>;
  private pollingTimers: Map<string, NodeJS.Timeout>;
  private isRunning: boolean;
  private healthCache: Map<string, DVRNVRHealthData>;
  private hddAlertStates: Map<string, NormalizedDiskHealth["operationalStatus"]>;

  constructor(pool: Pool) {
    super();
    this.pool = pool;
    this.devices = new Map();
    this.pollingTimers = new Map();
    this.isRunning = false;
    this.healthCache = new Map();
    this.hddAlertStates = new Map();
  }

  /**
   * Start the monitoring service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("DVR/NVR monitor service already running");
      return;
    }

    logger.info("Starting DVR/NVR monitor service");
    this.isRunning = true;

    // Load devices from database
    await this.loadDevices();

    // Start polling for each device
    for (const device of this.devices.values()) {
      if (device.enabled) {
        this.startDevicePolling(device);
      }
    }

    logger.info(`DVR/NVR monitor service started with ${this.devices.size} devices`);
  }

  /**
   * Stop the monitoring service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info("Stopping DVR/NVR monitor service");
    this.isRunning = false;

    // Stop all polling timers
    for (const [deviceId, timer] of this.pollingTimers.entries()) {
      clearInterval(timer);
      this.pollingTimers.delete(deviceId);
    }

    logger.info("DVR/NVR monitor service stopped");
  }

  /**
   * Load devices from database
   */
  private async loadDevices(): Promise<void> {
    try {
      const result = await this.pool.query(
        `SELECT 
          id,
          tenant as "tenantId",
          branch as "branchId",
          device_type as "deviceType",
          manufacturer,
          model,
          ip_address as "ipAddress",
          health_status as "status",
          last_communication as "lastHeartbeat"
        FROM device_inventory
        WHERE device_type IN ('dvr', 'nvr')
        AND lifecycle_state = 'operational'`
      );

      for (const row of result.rows) {
        const device: DVRNVRDevice = {
          id: row.id,
          tenantId: row.tenantId,
          branchId: row.branchId,
          deviceType: row.deviceType,
          manufacturer: row.manufacturer,
          model: row.model,
          ipAddress: row.ipAddress,
          port: this.getDefaultPort(row.manufacturer),
          protocol: this.getProtocol(row.manufacturer),
          pollingInterval: 30, // 30 seconds default
          timeoutMs: 10000, // 10 seconds
          enabled: true,
          status: row.status || "unknown",
          lastHeartbeat: row.lastHeartbeat ? new Date(row.lastHeartbeat) : undefined,
          consecutiveFailures: 0,
        };

        this.devices.set(device.id, device);
      }

      logger.info(`Loaded ${this.devices.size} DVR/NVR devices`);
    } catch (error) {
      logger.error("Failed to load DVR/NVR devices", { error });
      throw error;
    }
  }

  /**
   * Get default port based on manufacturer
   */
  private getDefaultPort(manufacturer: string): number {
    const lowerManufacturer = manufacturer.toLowerCase();
    if (lowerManufacturer.includes("hikvision")) return 80;
    if (lowerManufacturer.includes("dahua")) return 80;
    if (lowerManufacturer.includes("cp plus") || lowerManufacturer.includes("cpplus")) return 80;
    return 80; // Default HTTP port
  }

  /**
   * Get protocol based on manufacturer
   */
  private getProtocol(manufacturer: string): DVRNVRDevice["protocol"] {
    const lowerManufacturer = manufacturer.toLowerCase();
    if (lowerManufacturer.includes("hikvision")) return "hikvision-isapi";
    if (lowerManufacturer.includes("dahua")) return "dahua-cgi";
    if (lowerManufacturer.includes("cp plus") || lowerManufacturer.includes("cpplus")) return "cp-plus-oem-api";
    return "onvif"; // Default to ONVIF
  }

  /**
   * Start polling for a specific device
   */
  private startDevicePolling(device: DVRNVRDevice): void {
    if (this.pollingTimers.has(device.id)) {
      logger.warn(`Polling already active for device ${device.id}`);
      return;
    }

    // Immediate first poll
    this.pollDevice(device).catch((error) => {
      logger.error(`Initial poll failed for device ${device.id}`, { error });
    });

    // Set up recurring poll
    const timer = setInterval(() => {
      this.pollDevice(device).catch((error) => {
        logger.error(`Polling failed for device ${device.id}`, { error });
      });
    }, device.pollingInterval * 1000);

    this.pollingTimers.set(device.id, timer);
    logger.debug(`Started polling for device ${device.id} every ${device.pollingInterval}s`);
  }

  /**
   * Stop polling for a specific device
   */
  private stopDevicePolling(deviceId: string): void {
    const timer = this.pollingTimers.get(deviceId);
    if (timer) {
      clearInterval(timer);
      this.pollingTimers.delete(deviceId);
      logger.debug(`Stopped polling for device ${deviceId}`);
    }
  }

  /**
   * Poll a single device
   */
  private async pollDevice(device: DVRNVRDevice): Promise<void> {
    const startTime = Date.now();
    device.lastPolled = new Date();

    try {
      let healthData: DVRNVRHealthData;

      // Route to appropriate polling method based on protocol
      switch (device.protocol) {
        case "hikvision-isapi":
          healthData = await this.pollHikvisionDevice(device);
          break;
        case "dahua-cgi":
          healthData = await this.pollDahuaDevice(device);
          break;
        case "cp-plus-oem-api":
          healthData = await this.pollCPPlusDevice(device);
          break;
        case "onvif":
          healthData = await this.pollONVIFDevice(device);
          break;
        case "http-api":
          healthData = await this.pollHTTPDevice(device);
          break;
        default:
          healthData = await this.pollHTTPDevice(device);
      }

      // Calculate latency
      healthData.latencyMs = Date.now() - startTime;

      // Update device status
      const previousStatus = device.status;
      device.status = healthData.status;
      device.lastHeartbeat = new Date();
      device.consecutiveFailures = 0;

      // Store health data
      this.healthCache.set(device.id, healthData);

      // Save to database
      await this.saveHealthData(healthData);
      await this.updateDeviceStatus(device);
      await this.createHddHealthAlerts(device, healthData.hddStatus ?? []);

      // Emit status change event
      if (previousStatus !== device.status) {
        this.emit("statusChange", {
          deviceId: device.id,
          previousStatus,
          currentStatus: device.status,
          device,
        });

        // Create alert for offline devices
        if (device.status === "offline") {
          await this.createOfflineAlert(device);
        }
      }

      logger.debug(`Polled device ${device.id}: ${device.status} (${healthData.latencyMs}ms)`);
    } catch (error) {
      device.consecutiveFailures++;

      // Mark as offline after 3 consecutive failures
      if (device.consecutiveFailures >= 3 && device.status !== "offline") {
        const previousStatus = device.status;
        device.status = "offline";

        await this.updateDeviceStatus(device);

        this.emit("statusChange", {
          deviceId: device.id,
          previousStatus,
          currentStatus: "offline",
          device,
        });

        await this.createOfflineAlert(device);
      }

      logger.error(`Failed to poll device ${device.id}`, {
        error,
        consecutiveFailures: device.consecutiveFailures,
      });
    }
  }

  /**
   * Poll Hikvision device using ISAPI
   */
  private async pollHikvisionDevice(device: DVRNVRDevice): Promise<DVRNVRHealthData> {
    const baseUrl = `http://${device.ipAddress}:${device.port}`;

    try {
      // Fetch system info
      const systemInfoResponse = await fetch(
        `${baseUrl}/ISAPI/System/deviceInfo`,
        {
          method: "GET",
          headers: {
            Authorization: this.getBasicAuth(device.credentials),
          },
          signal: AbortSignal.timeout(device.timeoutMs),
        }
      );

      if (!systemInfoResponse.ok) {
        throw new Error(`HTTP ${systemInfoResponse.status}`);
      }

      // Fetch HDD info
      const hddInfoResponse = await fetch(
        `${baseUrl}/ISAPI/ContentMgmt/Storage`,
        {
          method: "GET",
          headers: {
            Authorization: this.getBasicAuth(device.credentials),
          },
          signal: AbortSignal.timeout(device.timeoutMs),
        }
      ).catch(() => null);

      const systemInfo = await systemInfoResponse.text();
      const hddInfo = hddInfoResponse ? await hddInfoResponse.text() : null;

      // Parse XML responses (simplified)
      const firmwareVersion = this.extractXMLValue(systemInfo, "firmwareVersion");
      const uptime = parseInt(this.extractXMLValue(systemInfo, "upTime") || "0");

      const healthData: DVRNVRHealthData = {
        deviceId: device.id,
        timestamp: new Date(),
        status: "online",
        firmwareVersion,
        uptime,
        hddStatus: this.parseHikvisionHDDInfo(hddInfo),
        // DeviceInfo and storage endpoints do not prove that media is currently
        // being written. The edge agent's archive probe is authoritative.
        recordingStatus: "unknown",
      };

      return healthData;
    } catch (error) {
      return {
        deviceId: device.id,
        timestamp: new Date(),
        status: "offline",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Poll Dahua device
   */
  private async pollDahuaDevice(device: DVRNVRDevice): Promise<DVRNVRHealthData> {
    const baseUrl = `http://${device.ipAddress}:${device.port}`;

    try {
      const response = await fetch(
        `${baseUrl}/cgi-bin/magicBox.cgi?action=getSystemInfo`,
        {
          method: "GET",
          headers: {
            Authorization: this.getBasicAuth(device.credentials),
          },
          signal: AbortSignal.timeout(device.timeoutMs),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.text();
      const storageResponse = await fetch(
        `${baseUrl}/cgi-bin/storageDevice.cgi?action=getDeviceAllInfo`,
        {
          method: "GET",
          headers: { Authorization: this.getBasicAuth(device.credentials) },
          signal: AbortSignal.timeout(device.timeoutMs),
        },
      ).catch(() => null);
      const storageText = storageResponse?.ok ? await storageResponse.text() : null;

      return {
        deviceId: device.id,
        timestamp: new Date(),
        status: "online",
        firmwareVersion: this.extractKeyValue(data, "version"),
        uptime: parseInt(this.extractKeyValue(data, "uptime") || "0"),
        hddStatus: this.parseRecorderStorageInfo(storageText),
      };
    } catch (error) {
      return {
        deviceId: device.id,
        timestamp: new Date(),
        status: "offline",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Poll CP Plus device
   */
  private async pollCPPlusDevice(device: DVRNVRDevice): Promise<DVRNVRHealthData> {
    // CP Plus recorders supported by this adapter expose the OEM storage CGI.
    // The Dahua-compatible path also retains the normal reachability/system checks.
    return this.pollDahuaDevice(device);
  }

  /**
   * Poll ONVIF device
   */
  private async pollONVIFDevice(device: DVRNVRDevice): Promise<DVRNVRHealthData> {
    const baseUrl = `http://${device.ipAddress}:${device.port}`;

    try {
      // Simple HTTP GET to check if device is responsive
      const response = await fetch(`${baseUrl}/onvif/device_service`, {
        method: "GET",
        signal: AbortSignal.timeout(device.timeoutMs),
      });

      return {
        deviceId: device.id,
        timestamp: new Date(),
        status: response.ok ? "online" : "degraded",
      };
    } catch (error) {
      return {
        deviceId: device.id,
        timestamp: new Date(),
        status: "offline",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Poll HTTP-based device
   */
  private async pollHTTPDevice(device: DVRNVRDevice): Promise<DVRNVRHealthData> {
    const baseUrl = `http://${device.ipAddress}:${device.port}`;

    try {
      const response = await fetch(baseUrl, {
        method: "GET",
        signal: AbortSignal.timeout(device.timeoutMs),
      });

      return {
        deviceId: device.id,
        timestamp: new Date(),
        status: response.ok ? "online" : "degraded",
      };
    } catch (error) {
      return {
        deviceId: device.id,
        timestamp: new Date(),
        status: "offline",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Parse Hikvision HDD info from XML
   */
  private parseHikvisionHDDInfo(xml: string | null): DVRNVRHealthData["hddStatus"] {
    if (!xml) return undefined;
    const blocks = [...xml.matchAll(/<(?:hdd|HDD)>([\s\S]*?)<\/(?:hdd|HDD)>/g)].map((match) => match[1]);
    const sources = blocks.length ? blocks : [xml];
    const raw = sources.map((block, index) => {
      if (!block) return null;
      const read = (tag: string) => block.match(new RegExp(`<${tag}>([^<]+)<\\/${tag}>`, "i"))?.[1];
      return {
        diskNo: read("id") ?? index + 1,
        devicePath: read("name") ?? `HDD ${index + 1}`,
        model: read("model") ?? read("modelName"),
        serialNumber: read("serialNumber"),
        capacity: read("capacity"), freeSpace: read("freeSpace"),
        state: read("status"), temperature: read("temperature"),
        powerOnHours: read("powerOnHours"), reallocatedSectors: read("reallocatedSectors"),
        pendingSectors: read("pendingSectors"), uncorrectableSectors: read("uncorrectableSectors"),
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);
    const disks = normalizeRecorderHddStatus(raw);
    return disks.length ? disks : undefined;
  }

  private parseRecorderStorageInfo(payload: string | null): DVRNVRHealthData["hddStatus"] {
    if (!payload) return undefined;
    try {
      const disks = normalizeRecorderHddStatus(JSON.parse(payload));
      return disks.length ? disks : undefined;
    } catch {
      const grouped = new Map<string, Record<string, unknown>>();
      for (const line of payload.split(/\r?\n/)) {
        const match = line.match(/(?:Storage|Disk|HDD)(?:\[|\.)(\d+)\]?\.([^=]+)=(.*)$/i);
        if (!match || !match[1] || !match[2] || !match[3]) continue;
        const diskIndex = match[1];
        const record = grouped.get(diskIndex) ?? { diskNo: Number(diskIndex) + 1 };
        record[match[2]] = match[3].trim();
        grouped.set(diskIndex, record);
      }
      const disks = normalizeRecorderHddStatus([...grouped.values()]);
      return disks.length ? disks : undefined;
    }
  }

  /**
   * Extract value from XML
   */
  private extractXMLValue(xml: string, tag: string): string | undefined {
    const regex = new RegExp(`<${tag}>([^<]+)<\/${tag}>`, "i");
    const match = xml.match(regex);
    return match ? match[1] : undefined;
  }

  /**
   * Extract key-value from plain text response
   */
  private extractKeyValue(text: string, key: string): string | undefined {
    const regex = new RegExp(`${key}=([^\\n\\r]+)`, "i");
    const match = text.match(regex);
    return match ? match[1].trim() : undefined;
  }

  /**
   * Get Basic Auth header
   */
  private getBasicAuth(credentials?: { username: string; password: string }): string {
    if (!credentials) {
      return "Basic " + Buffer.from("admin:admin12345").toString("base64");
    }
    return "Basic " + Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64");
  }

  /**
   * Save health data to database
   */
  private async saveHealthData(healthData: DVRNVRHealthData): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO dvr_nvr_health (
          device_id,
          timestamp,
          status,
          latency_ms,
          cpu_usage,
          memory_usage,
          hdd_status,
          recording_status,
          connected_cameras,
          total_cameras,
          firmware_version,
          uptime,
          temperature,
          error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          healthData.deviceId,
          healthData.timestamp,
          healthData.status,
          healthData.latencyMs,
          healthData.cpuUsage,
          healthData.memoryUsage,
          healthData.hddStatus ? JSON.stringify(healthData.hddStatus) : null,
          healthData.recordingStatus,
          healthData.connectedCameras,
          healthData.totalCameras,
          healthData.firmwareVersion,
          healthData.uptime,
          healthData.temperature,
          healthData.errorMessage,
        ]
      );
    } catch (error) {
      logger.error(`Failed to save health data for device ${healthData.deviceId}`, { error });
    }
  }

  /**
   * Update device status in database
   */
  private async updateDeviceStatus(device: DVRNVRDevice): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE device_inventory 
         SET health_status = $1,
             last_communication = $2
         WHERE id = $3`,
        [device.status, device.lastHeartbeat, device.id]
      );
    } catch (error) {
      logger.error(`Failed to update device status for ${device.id}`, { error });
    }
  }

  /**
   * Create alert for offline device
   */
  private async createOfflineAlert(device: DVRNVRDevice): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO incidents (
          tenant_id,
          branch_id,
          incident_type,
          severity,
          title,
          description,
          status,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          device.tenantId,
          device.branchId,
          "device_offline",
          "high",
          `${device.deviceType.toUpperCase()} Offline: ${device.manufacturer} ${device.model}`,
          `Device ${device.id} (${device.ipAddress}) is offline. Last seen: ${device.lastHeartbeat?.toISOString() || "Never"}`,
          "open",
          new Date(),
        ]
      );

      logger.info(`Created offline alert for device ${device.id}`);
    } catch (error) {
      logger.error(`Failed to create offline alert for device ${device.id}`, { error });
    }
  }

  private async createHddHealthAlerts(device: DVRNVRDevice, disks: NormalizedDiskHealth[]): Promise<void> {
    for (const disk of disks) {
      const key = `${device.id}:slot:${disk.id}`;
      const previous = this.hddAlertStates.get(key);
      this.hddAlertStates.set(key, disk.operationalStatus);
      if (["healthy", "unknown"].includes(disk.operationalStatus) || previous === disk.operationalStatus) continue;
      const critical = disk.operationalStatus === "critical";
      const issue = disk.reasonCodes.find((code) => code !== "disk_detected" && !code.endsWith("_unavailable")) ?? disk.operationalStatus;
      try {
        await this.pool.query(
          `INSERT INTO incidents (
            tenant_id, branch_id, incident_type, severity, title, description, status, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            device.tenantId, device.branchId, "hdd_health", critical ? "critical" : "high",
            `HDD ${issue.replaceAll("_", " ")}: ${device.manufacturer} ${device.model}`,
            `${disk.devicePath} (${disk.serialNumber}): slot ${disk.slotStatus}, SMART ${disk.smartStatus}, RAID ${disk.raidStatus}, write ${disk.writeVerification}, capacity ${disk.usagePercent.toFixed(1)}% used.`,
            "open", new Date(),
          ],
        );
        this.emit("hddAlert", { device, disk, severity: critical ? "critical" : "high" });
      } catch (error) {
        logger.error(`Failed to create HDD alert for device ${device.id}`, { error, disk: disk.id });
      }
    }
  }

  /**
   * Get device by ID
   */
  getDevice(deviceId: string): DVRNVRDevice | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Get all devices
   */
  getAllDevices(): DVRNVRDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get device health data
   */
  getDeviceHealth(deviceId: string): DVRNVRHealthData | undefined {
    return this.healthCache.get(deviceId);
  }

  /**
   * Get monitoring statistics
   */
  getStatistics(): MonitoringStats {
    const devices = Array.from(this.devices.values());
    const onlineDevices = devices.filter((d) => d.status === "online");
    const offlineDevices = devices.filter((d) => d.status === "offline");
    const degradedDevices = devices.filter((d) => d.status === "degraded");

    const healthData = Array.from(this.healthCache.values());
    const avgLatencyMs = healthData.length > 0
      ? healthData.reduce((sum, h) => sum + (h.latencyMs || 0), 0) / healthData.length
      : 0;

    return {
      totalDevices: devices.length,
      onlineDevices: onlineDevices.length,
      offlineDevices: offlineDevices.length,
      degradedDevices: degradedDevices.length,
      lastUpdateTime: new Date(),
      avgLatencyMs: Math.round(avgLatencyMs),
    };
  }

  /**
   * Add a device to monitoring
   */
  async addDevice(device: DVRNVRDevice): Promise<void> {
    this.devices.set(device.id, device);

    if (device.enabled && this.isRunning) {
      this.startDevicePolling(device);
    }

    logger.info(`Added device ${device.id} to monitoring`);
  }

  /**
   * Remove a device from monitoring
   */
  async removeDevice(deviceId: string): Promise<void> {
    this.stopDevicePolling(deviceId);
    this.devices.delete(deviceId);
    this.healthCache.delete(deviceId);

    logger.info(`Removed device ${deviceId} from monitoring`);
  }

  /**
   * Update device configuration
   */
  async updateDevice(deviceId: string, updates: Partial<DVRNVRDevice>): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    // Stop polling if needed
    if (updates.enabled === false || updates.pollingInterval !== undefined) {
      this.stopDevicePolling(deviceId);
    }

    // Update device
    Object.assign(device, updates);
    this.devices.set(deviceId, device);

    // Restart polling if needed
    if (device.enabled && this.isRunning) {
      this.startDevicePolling(device);
    }

    logger.info(`Updated device ${deviceId} configuration`);
  }
}
