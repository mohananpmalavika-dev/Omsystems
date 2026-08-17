import { randomUUID } from "node:crypto";
import type {
  LogicalDevice,
  PhysicalAsset,
  AssetAssignmentHistory,
  ReplacementTransaction,
  RegionalSpareStock,
  ChannelMappingPreservation,
  DeviceConfigurationSnapshot,
  AssetType,
} from "../domain/asset-lifecycle.types.js";

export class AssetLifecycleService {
  private logicalDevices = new Map<string, LogicalDevice>();
  private physicalAssets = new Map<string, PhysicalAsset>();
  private assignments: AssetAssignmentHistory[] = [];
  private replacementTransactions = new Map<string, ReplacementTransaction>();
  private regionalSpares = new Map<string, RegionalSpareStock>();

  constructor() {
    this.seedEnterpriseData();
  }

  private seedEnterpriseData() {
    const now = new Date();

    // 1. Seed Logical Device (Permanent Role)
    const rec118: LogicalDevice = {
      id: "REC-BR118-01",
      tenantId: "omsystems",
      branchId: "BR-118",
      branchName: "Ernakulam South Hub",
      type: "RECORDER",
      role: "PRIMARY_RECORDER",
      name: "Branch 118 Main Surveillance NVR",
      positionName: "Main Server Rack Bay 1",
      currentAssetId: "AST-DVR-118-01",
      currentSerialNumber: "CP-UNR-432T8-SN88301",
      currentModel: "CP PLUS 32-Channel 4K NVR",
      channelsCount: 24,
      digitalTwinNodeId: "twin-node-br118-nvr",
      status: "DEGRADED",
      createdAt: "2024-03-12T00:00:00Z",
      updatedAt: now.toISOString(),
    };
    this.logicalDevices.set(rec118.id, rec118);

    // 2. Seed Installed Physical Asset (Faulty)
    const assetOld: PhysicalAsset = {
      id: "AST-DVR-118-01",
      assetTag: "TAG-OMS-REC-1182",
      serialNumber: "CP-UNR-432T8-SN88301",
      manufacturer: "CP PLUS",
      model: "CP-UNR-432T8-V2",
      hardwareRevision: "Rev 2.1",
      firmwareVersion: "v3.4.1",
      assetType: "RECORDER",
      purchaseDate: "2024-01-10T00:00:00Z",
      installationDate: "2024-03-12T00:00:00Z",
      warrantyStart: "2024-01-10T00:00:00Z",
      warrantyEnd: "2027-01-10T00:00:00Z",
      warrantyStatus: "IN_WARRANTY",
      supplier: "Aditya Infotech Ltd",
      invoiceNumber: "INV-2024-KL-9982",
      lifecycleStatus: "REPAIR_REQUIRED",
      condition: "FAULTY",
      custody: "BRANCH",
      regionId: "kerala-south",
      currentBranchId: "BR-118",
      currentLogicalDeviceId: "REC-BR118-01",
      specs: {
        channelCount: 32,
        supportedCodecs: ["H.264", "H.265", "H.265+"],
        maxResolution: "4K (3840x2160)",
        onvifCompliant: true,
        storageCapacityTb: 32,
      },
      createdAt: "2024-01-10T00:00:00Z",
      updatedAt: now.toISOString(),
    };
    this.physicalAssets.set(assetOld.id, assetOld);

    // 3. Seed Available Spare Physical Asset in Regional Warehouse
    const assetSpare: PhysicalAsset = {
      id: "AST-SPARE-REC-092",
      assetTag: "TAG-OMS-SPARE-4401",
      serialNumber: "CP-UNR-432T8-SN99402",
      manufacturer: "CP PLUS",
      model: "CP-UNR-432T8-V2 Certified Spare",
      hardwareRevision: "Rev 2.4",
      firmwareVersion: "v3.7.2",
      assetType: "RECORDER",
      purchaseDate: "2025-11-20T00:00:00Z",
      warrantyStart: "2025-11-20T00:00:00Z",
      warrantyEnd: "2028-11-20T00:00:00Z",
      warrantyStatus: "IN_WARRANTY",
      supplier: "Aditya Infotech Ltd",
      invoiceNumber: "INV-2025-SPARE-110",
      lifecycleStatus: "IN_STOCK",
      condition: "NEW",
      custody: "REGIONAL_OFFICE",
      regionId: "kerala-south",
      specs: {
        channelCount: 32,
        supportedCodecs: ["H.264", "H.265", "H.265+"],
        maxResolution: "4K (3840x2160)",
        onvifCompliant: true,
        storageCapacityTb: 32,
      },
      createdAt: "2025-11-20T00:00:00Z",
      updatedAt: now.toISOString(),
    };
    this.physicalAssets.set(assetSpare.id, assetSpare);

    // 4. Initial Assignment History
    this.assignments.push({
      id: "ASN-001",
      assetId: assetOld.id,
      serialNumber: assetOld.serialNumber,
      logicalDeviceId: rec118.id,
      branchId: "BR-118",
      installedAt: "2024-03-12T10:00:00Z",
      installedBy: "System Installer",
      reason: "Initial Branch Deployment",
      isCurrent: true,
    });

    // 5. Seed Regional Spare Stock Pools
    const stocks: RegionalSpareStock[] = [
      { regionId: "kerala-south", regionName: "Kerala South Hub (Kochi)", assetType: "RECORDER", inStockCount: 12, reservedCount: 1, inTransitCount: 2, minThreshold: 5, status: "HEALTHY" },
      { regionId: "kerala-south", regionName: "Kerala South Hub (Kochi)", assetType: "CAMERA", inStockCount: 34, reservedCount: 4, inTransitCount: 6, minThreshold: 20, status: "HEALTHY" },
      { regionId: "kerala-south", regionName: "Kerala South Hub (Kochi)", assetType: "STORAGE_DISK", inStockCount: 18, reservedCount: 2, inTransitCount: 0, minThreshold: 10, status: "HEALTHY" },
      { regionId: "kerala-south", regionName: "Kerala South Hub (Kochi)", assetType: "EDGE_GATEWAY", inStockCount: 4, reservedCount: 1, inTransitCount: 1, minThreshold: 3, status: "HEALTHY" },
      { regionId: "kerala-north", regionName: "Kerala North Hub (Calicut)", assetType: "RECORDER", inStockCount: 3, reservedCount: 1, inTransitCount: 0, minThreshold: 4, status: "LOW_STOCK" },
      { regionId: "tamil-nadu", regionName: "Tamil Nadu Region (Chennai)", assetType: "RECORDER", inStockCount: 0, reservedCount: 2, inTransitCount: 1, minThreshold: 5, status: "CRITICAL_EMPTY" },
    ];
    for (const s of stocks) {
      this.regionalSpares.set(`${s.regionId}:${s.assetType}`, s);
    }
  }

  validateCompatibility(oldAsset: PhysicalAsset, newAsset: PhysicalAsset, logicalDevice: LogicalDevice) {
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (oldAsset.assetType !== newAsset.assetType) {
      blockers.push(`Asset type mismatch: Cannot replace ${oldAsset.assetType} with ${newAsset.assetType}.`);
    }

    if (oldAsset.assetType === "RECORDER") {
      const oldCh = oldAsset.specs.channelCount || 16;
      const newCh = newAsset.specs.channelCount || 16;
      if (newCh < logicalDevice.channelsCount) {
        blockers.push(`Channel count insufficient: Replacement unit only has ${newCh} channels, but logical device requires ${logicalDevice.channelsCount} channels.`);
      }
      if (!newAsset.specs.onvifCompliant) {
        warnings.push("Replacement recorder lacks certified ONVIF Profile S support.");
      }
    }

    return {
      passed: blockers.length === 0,
      blockers,
      warnings,
    };
  }

  async executeReplacementTransaction(input: {
    logicalDeviceId: string;
    newAssetId: string;
    replacementType: ReplacementTransaction["replacementType"];
    performedBy: string;
    workOrderId?: string;
    oldAssetDisposition?: "RETIRED" | "RMA" | "REPAIR_DEPOT";
  }): Promise<ReplacementTransaction> {
    const logical = this.logicalDevices.get(input.logicalDeviceId);
    if (!logical) throw new Error("logical_device_not_found");

    const oldAsset = this.physicalAssets.get(logical.currentAssetId);
    if (!oldAsset) throw new Error("old_asset_not_found");

    const newAsset = this.physicalAssets.get(input.newAssetId);
    if (!newAsset) throw new Error("replacement_spare_asset_not_found");

    const compatibility = this.validateCompatibility(oldAsset, newAsset, logical);
    if (!compatibility.passed) {
      throw new Error(`Replacement blocked by compatibility check: ${compatibility.blockers.join(", ")}`);
    }

    const txId = `REP-${Date.now()}-${logical.branchId}`;
    const now = new Date().toISOString();

    // 1. Capture Existing Configuration Snapshot
    const configSnapshot: DeviceConfigurationSnapshot = {
      logicalDeviceId: logical.id,
      assetSerial: oldAsset.serialNumber,
      capturedAt: now,
      firmware: oldAsset.firmwareVersion,
      network: {
        ip: "192.168.29.200",
        subnet: "255.255.255.0",
        gateway: "192.168.29.1",
        ntp: "time.bank.internal",
      },
      channels: Array.from({ length: logical.channelsCount }, (_, i) => ({
        channel: i + 1,
        cameraId: `CAM-${logical.branchId}-${i + 1}`,
        resolution: "1080p",
        fps: 25,
        bitrateKbps: 2048,
      })),
      retentionDays: 90,
      recordingMode: "CONTINUOUS",
    };

    // 2. Generate Preserved Channel Mappings
    const channelMappings: ChannelMappingPreservation[] = Array.from({ length: logical.channelsCount }, (_, i) => ({
      logicalChannel: i + 1,
      cameraId: `CAM-${logical.branchId}-${i + 1}`,
      cameraName: `Camera ${i + 1} (${i === 0 ? "Main Entrance" : i === 1 ? "Vault Door" : "Banking Hall"})`,
      oldPhysicalInput: i + 1,
      newPhysicalInput: i + 1,
      streamUrl: `rtsp://192.168.29.200:554/ch${i + 1}/main`,
      migrationStatus: "VERIFIED",
    }));

    // 3. Update Asset Assignment History (Close old, open new)
    const currentAssignment = this.assignments.find((a) => a.logicalDeviceId === logical.id && a.isCurrent);
    if (currentAssignment) {
      currentAssignment.isCurrent = false;
      currentAssignment.removedAt = now;
      currentAssignment.removedBy = input.performedBy;
      currentAssignment.reason = `Hardware replacement via ${txId}`;
      currentAssignment.replacementId = txId;
    }

    this.assignments.push({
      id: `ASN-${Date.now()}`,
      assetId: newAsset.id,
      serialNumber: newAsset.serialNumber,
      logicalDeviceId: logical.id,
      branchId: logical.branchId,
      installedAt: now,
      installedBy: input.performedBy,
      reason: `Installed as replacement for ${oldAsset.serialNumber}`,
      workOrderId: input.workOrderId,
      replacementId: txId,
      isCurrent: true,
    });

    // 4. Update Physical Assets Statuses
    oldAsset.lifecycleStatus = input.oldAssetDisposition === "RMA" ? "RMA" : "RETIRED";
    oldAsset.condition = "FAULTY";
    oldAsset.currentLogicalDeviceId = undefined;
    oldAsset.updatedAt = now;

    newAsset.lifecycleStatus = "IN_SERVICE";
    newAsset.condition = "GOOD";
    newAsset.custody = "BRANCH";
    newAsset.currentBranchId = logical.branchId;
    newAsset.currentLogicalDeviceId = logical.id;
    newAsset.installationDate = now;
    newAsset.updatedAt = now;

    // 5. Update Logical Device (Survives replacement with zero breaking changes)
    logical.currentAssetId = newAsset.id;
    logical.currentSerialNumber = newAsset.serialNumber;
    logical.currentModel = newAsset.model;
    logical.status = "ONLINE";
    logical.updatedAt = now;

    // 6. Create Transaction Saga Record
    const tx: ReplacementTransaction = {
      id: txId,
      tenantId: logical.tenantId,
      branchId: logical.branchId,
      branchName: logical.branchName,
      logicalDeviceId: logical.id,
      oldAssetId: oldAsset.id,
      oldSerialNumber: oldAsset.serialNumber,
      oldModel: oldAsset.model,
      newAssetId: newAsset.id,
      newSerialNumber: newAsset.serialNumber,
      newModel: newAsset.model,
      replacementType: input.replacementType,
      status: "COMPLETED",
      workOrderId: input.workOrderId,
      compatibilityCheck: compatibility,
      configSnapshot,
      channelMappings,
      verification: {
        deviceReachable: true,
        authSuccess: true,
        channelsRestoredCount: logical.channelsCount,
        liveViewVerified: true,
        recordingVerified: true,
        digitalTwinUpdated: true,
        verifiedBy: input.performedBy,
        verifiedAt: now,
      },
      oldAssetDisposition: input.oldAssetDisposition || "RMA",
      startedAt: now,
      completedAt: now,
      performedBy: input.performedBy,
    };

    this.replacementTransactions.set(tx.id, tx);
    return tx;
  }

  listLogicalDevices(branchId?: string): LogicalDevice[] {
    const list = [...this.logicalDevices.values()];
    if (branchId) return list.filter((d) => d.branchId === branchId);
    return list;
  }

  listPhysicalAssets(filter?: { type?: AssetType; status?: string; regionId?: string }): PhysicalAsset[] {
    let list = [...this.physicalAssets.values()];
    if (filter?.type) list = list.filter((a) => a.assetType === filter.type);
    if (filter?.status) list = list.filter((a) => a.lifecycleStatus === filter.status);
    if (filter?.regionId) list = list.filter((a) => a.regionId === filter.regionId);
    return list;
  }

  listSpares(regionId?: string): RegionalSpareStock[] {
    const list = [...this.regionalSpares.values()];
    if (regionId) return list.filter((s) => s.regionId === regionId);
    return list;
  }

  listReplacements(branchId?: string): ReplacementTransaction[] {
    const list = [...this.replacementTransactions.values()];
    if (branchId) return list.filter((r) => r.branchId === branchId);
    return list;
  }

  getHardwareLineage(logicalDeviceId: string) {
    const logical = this.logicalDevices.get(logicalDeviceId);
    const history = this.assignments.filter((a) => a.logicalDeviceId === logicalDeviceId);
    return {
      logicalDevice: logical,
      history,
    };
  }
}
