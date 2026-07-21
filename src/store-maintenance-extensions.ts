// Enhanced Maintenance Module - Additional Store Methods
// Add these methods to src/store.ts

// ============ HEALTH MONITORING ============

async recordCameraHealth(input: {
  tenantId: string;
  cameraId: string;
  onlineStatus: 'online' | 'offline' | 'degraded';
  fps?: number;
  bitrate?: number;
  streamQuality?: string;
  temperature?: number;
  tampering?: boolean;
  recordingRunning?: boolean;
  latencyMs?: number;
  packetLoss?: number;
}) {
  const cameraHealth = {
    id: randomUUID(),
    tenantId: input.tenantId,
    cameraId: input.cameraId,
    onlineStatus: input.onlineStatus,
    fps: input.fps,
    bitrate: input.bitrate,
    streamQuality: input.streamQuality,
    temperature: input.temperature,
    tampering: input.tampering ?? false,
    recordingRunning: input.recordingRunning,
    latencyMs: input.latencyMs,
    packetLoss: input.packetLoss,
    lastFrameAt: new Date().toISOString(),
    lastCheckAt: new Date().toISOString(),
  };
  this.cameraHealth.push(cameraHealth);
  return cameraHealth;
}

async recordStorageHealth(input: {
  tenantId: string;
  assetId: string;
  totalCapacityGb: number;
  usedCapacityGb: number;
  availableCapacityGb: number;
  smartStatus?: string;
  temperature?: number;
  badSectors?: number;
  readSpeedMbs?: number;
  writeSpeedMbs?: number;
  remainingLifetimeYears?: number;
  errorCount?: number;
}) {
  const usagePercentage = (input.usedCapacityGb / input.totalCapacityGb) * 100;
  const status = usagePercentage >= 90 ? 'critical' : usagePercentage >= 80 ? 'warning' : 'healthy';
  
  const storageHealth = {
    id: randomUUID(),
    tenantId: input.tenantId,
    assetId: input.assetId,
    totalCapacityGb: input.totalCapacityGb,
    usedCapacityGb: input.usedCapacityGb,
    availableCapacityGb: input.availableCapacityGb,
    usagePercentage,
    status,
    smartStatus: input.smartStatus,
    temperature: input.temperature,
    badSectors: input.badSectors,
    readSpeedMbs: input.readSpeedMbs,
    writeSpeedMbs: input.writeSpeedMbs,
    remainingLifetimeYears: input.remainingLifetimeYears,
    errorCount: input.errorCount,
    lastCheckAt: new Date().toISOString(),
  };
  this.storageHealth.push(storageHealth);
  return storageHealth;
}

async recordNetworkHealth(input: {
  tenantId: string;
  branchNodeId?: string;
  assetId?: string;
  checkType: string;
  latencyMs?: number;
  packetLossPercentage?: number;
  jitterMs?: number;
  bandwidthAvailableMbps?: number;
  rtspAvailable?: boolean;
  onvifAvailable?: boolean;
}) {
  const status = (input.packetLossPercentage ?? 0) > 5 ? 'critical' 
    : (input.packetLossPercentage ?? 0) > 1 ? 'warning' : 'healthy';
  
  const networkHealth = {
    id: randomUUID(),
    tenantId: input.tenantId,
    branchNodeId: input.branchNodeId,
    assetId: input.assetId,
    checkType: input.checkType,
    latencyMs: input.latencyMs,
    packetLossPercentage: input.packetLossPercentage,
    jitterMs: input.jitterMs,
    bandwidthAvailableMbps: input.bandwidthAvailableMbps,
    rtspAvailable: input.rtspAvailable ?? true,
    onvifAvailable: input.onvifAvailable ?? true,
    status,
    lastCheckAt: new Date().toISOString(),
  };
  this.networkHealth.push(networkHealth);
  return networkHealth;
}

async recordUpsHealth(input: {
  tenantId: string;
  assetId: string;
  batteryHealthPercentage: number;
  runtimeMinutes?: number;
  chargingStatus?: string;
  loadPercentage?: number;
  temperature?: number;
  alarmStatus?: string;
}) {
  const status = input.batteryHealthPercentage < 70 ? 'critical'
    : input.batteryHealthPercentage < 85 ? 'warning' : 'healthy';
  
  const upsHealth = {
    id: randomUUID(),
    tenantId: input.tenantId,
    assetId: input.assetId,
    batteryHealthPercentage: input.batteryHealthPercentage,
    runtimeMinutes: input.runtimeMinutes,
    chargingStatus: input.chargingStatus,
    loadPercentage: input.loadPercentage,
    temperature: input.temperature,
    alarmStatus: input.alarmStatus,
    status,
    lastCheckAt: new Date().toISOString(),
  };
  this.upsHealth.push(upsHealth);
  return upsHealth;
}

async getHealthCheckSummary(tenantId: string) {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  
  const camerasOnline = this.cameraHealth.filter(
    h => h.tenantId === tenantId && h.lastCheckAt > oneHourAgo && h.onlineStatus === 'online'
  ).length;
  
  const camerasOffline = this.cameraHealth.filter(
    h => h.tenantId === tenantId && h.lastCheckAt > oneHourAgo && h.onlineStatus === 'offline'
  ).length;
  
  const storageWarnings = this.storageHealth.filter(
    h => h.tenantId === tenantId && h.lastCheckAt > oneHourAgo && h.status !== 'healthy'
  ).length;
  
  const networkIssues = this.networkHealth.filter(
    h => h.tenantId === tenantId && h.lastCheckAt > oneHourAgo && h.status !== 'healthy'
  ).length;

  const totalCameras = this.cameras.size;
  const healthPercentage = totalCameras > 0 ? Math.round((camerasOnline / totalCameras) * 100) : 100;
  
  return {
    healthPercentage,
    camerasOnline,
    camerasOffline,
    camerasCount: totalCameras,
    storageAlerts: storageWarnings,
    networkIssues,
    recordingIssues: 0,
    amcExpiring: 0,
    overdueMaintenanceCount: this.maintenanceVisits.filter(
      v => v.tenantId === tenantId && v.status === 'pending' && new Date(v.dueAt) < now
    ).length,
    openWorkOrders: this.workOrders.filter(
      w => w.tenantId === tenantId && w.status !== 'closed'
    ).length,
  };
}

// ============ FIRMWARE MANAGEMENT ============

async recordFirmwareVersion(input: {
  tenantId: string;
  assetId: string;
  deviceType: string;
  currentVersion: string;
  latestVersion?: string;
  requiresUpdate?: boolean;
  criticalUpdate?: boolean;
}) {
  const firmware = {
    id: randomUUID(),
    tenantId: input.tenantId,
    assetId: input.assetId,
    deviceType: input.deviceType,
    currentVersion: input.currentVersion,
    latestVersion: input.latestVersion,
    requiresUpdate: input.requiresUpdate ?? false,
    criticalUpdate: input.criticalUpdate ?? false,
    lastCheckAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  this.firmwareInventory.push(firmware);
  return firmware;
}

async listFirmwareUpdatesRequired(tenantId: string) {
  return this.firmwareInventory.filter(
    f => f.tenantId === tenantId && f.requiresUpdate
  ).sort((a, b) => (b.criticalUpdate ? 1 : 0) - (a.criticalUpdate ? 1 : 0));
}

async recordSoftwareVersion(input: {
  tenantId: string;
  componentName: string;
  environment: string;
  currentVersion: string;
  previousVersion?: string;
  upgradeApprovedBy?: string;
  upgradeApprovedAt?: string;
}) {
  const software = {
    id: randomUUID(),
    tenantId: input.tenantId,
    componentName: input.componentName,
    environment: input.environment,
    currentVersion: input.currentVersion,
    previousVersion: input.previousVersion,
    upgradeStatus: 'completed' as const,
    upgradeApprovedBy: input.upgradeApprovedBy,
    upgradeApprovedAt: input.upgradeApprovedAt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  this.softwareVersions.push(software);
  return software;
}

// ============ SPARE PARTS INVENTORY ============

async recordSparePart(input: {
  tenantId: string;
  partName: string;
  partCode: string;
  category: string;
  vendorId?: string;
  quantity: number;
  reorderLevel?: number;
  unitCost?: number;
  warrantyMonths?: number;
  location?: string;
  branchNodeId?: string;
}) {
  const sparePart = {
    id: randomUUID(),
    tenantId: input.tenantId,
    partName: input.partName,
    partCode: input.partCode,
    category: input.category,
    vendorId: input.vendorId,
    quantity: input.quantity,
    reorderLevel: input.reorderLevel,
    unitCost: input.unitCost,
    warrantyMonths: input.warrantyMonths,
    location: input.location,
    branchNodeId: input.branchNodeId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  this.spareParts.push(sparePart);
  return sparePart;
}

async recordInventoryTransaction(input: {
  tenantId: string;
  partId: string;
  workOrderId?: string;
  transactionType: 'add' | 'remove' | 'used' | 'damaged';
  quantity: number;
  referenceNumber?: string;
  notes?: string;
  recordedBy?: string;
}) {
  const transaction = {
    id: randomUUID(),
    tenantId: input.tenantId,
    partId: input.partId,
    workOrderId: input.workOrderId,
    transactionType: input.transactionType,
    quantity: input.quantity,
    referenceNumber: input.referenceNumber,
    notes: input.notes,
    recordedBy: input.recordedBy,
    recordedAt: new Date().toISOString(),
  };
  this.inventoryTransactions.push(transaction);

  // Update part quantity
  const part = this.spareParts.find(p => p.id === input.partId);
  if (part) {
    if (input.transactionType === 'add') {
      part.quantity += input.quantity;
    } else if (['remove', 'used', 'damaged'].includes(input.transactionType)) {
      part.quantity -= input.quantity;
    }
    part.updatedAt = new Date().toISOString();
  }

  return transaction;
}

async listLowStockParts(tenantId: string) {
  return this.spareParts.filter(
    p => p.tenantId === tenantId && p.reorderLevel && p.quantity <= p.reorderLevel
  );
}

// ============ REPORTING ============

async generateMaintenanceReport(input: {
  tenantId: string;
  reportType: string;
  periodStart: string;
  periodEnd: string;
  branchNodeId?: string;
  assetId?: string;
}) {
  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);

  let metrics: any = {};

  switch (input.reportType) {
    case 'preventive':
      metrics = {
        scheduledVisits: this.maintenanceVisits.filter(
          v => v.tenantId === input.tenantId
            && new Date(v.dueAt) >= periodStart
            && new Date(v.dueAt) <= periodEnd
        ).length,
        completedVisits: this.maintenanceVisits.filter(
          v => v.tenantId === input.tenantId
            && v.status === 'completed'
            && new Date(v.visited_at ?? new Date()) >= periodStart
            && new Date(v.visited_at ?? new Date()) <= periodEnd
        ).length,
        overdueVisits: this.maintenanceVisits.filter(
          v => v.tenantId === input.tenantId
            && v.status !== 'completed'
            && new Date(v.dueAt) < new Date()
        ).length,
      };
      break;

    case 'corrective':
      metrics = {
        totalWorkOrders: this.workOrders.filter(
          w => w.tenantId === input.tenantId
            && new Date(w.created_at) >= periodStart
            && new Date(w.created_at) <= periodEnd
        ).length,
        closedWorkOrders: this.workOrders.filter(
          w => w.tenantId === input.tenantId
            && w.status === 'closed'
            && new Date(w.updated_at) >= periodStart
            && new Date(w.updated_at) <= periodEnd
        ).length,
        openWorkOrders: this.workOrders.filter(
          w => w.tenantId === input.tenantId && w.status !== 'closed'
        ).length,
        averageResolutionHours: 24, // placeholder
      };
      break;

    case 'amc':
      metrics = {
        activeContracts: this.amcContracts.filter(
          c => c.tenantId === input.tenantId && c.status === 'active'
        ).length,
        expiringContracts: this.amcContracts.filter(
          c => c.tenantId === input.tenantId
            && new Date(c.end_date) <= new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        ).length,
        totalAnnualCost: this.amcContracts.filter(
          c => c.tenantId === input.tenantId && c.status === 'active'
        ).reduce((sum, c) => sum + (c.cost ?? 0), 0),
      };
      break;
  }

  const report = {
    id: randomUUID(),
    tenantId: input.tenantId,
    reportType: input.reportType,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    branchNodeId: input.branchNodeId,
    assetId: input.assetId,
    metrics,
    summary: `${input.reportType} maintenance report for ${input.periodStart} to ${input.periodEnd}`,
    generatedBy: 'system',
    generatedAt: new Date().toISOString(),
    filename: `${input.reportType}-report-${new Date().toISOString().split('T')[0]}.pdf`,
  };
  this.maintenanceReports.push(report);
  return report;
}

async listMaintenanceReports(tenantId: string, filters?: { reportType?: string; limit?: number }) {
  return this.maintenanceReports.filter(
    r => r.tenantId === tenantId && (!filters?.reportType || r.reportType === filters.reportType)
  ).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .slice(0, filters?.limit ?? 50);
}

// ============ COMPLIANCE INTEGRATION ============

async getMaintenanceComplianceStatus(tenantId: string) {
  const overdueVisits = this.maintenanceVisits.filter(
    v => v.tenantId === tenantId && v.status !== 'completed' && new Date(v.dueAt) < new Date()
  ).length;

  const openWorkOrders = this.workOrders.filter(
    w => w.tenantId === tenantId && w.status !== 'closed'
  ).length;

  const criticalAlerts = this.predictiveAlerts.filter(
    p => p.tenantId === tenantId && p.score > 0.8
  ).length;

  return {
    compliant: overdueVisits === 0 && openWorkOrders === 0 && criticalAlerts === 0,
    overdueMaintenanceCount: overdueVisits,
    openIssuesCount: openWorkOrders,
    criticalAlertsCount: criticalAlerts,
    status: overdueVisits > 0 || openWorkOrders > 5 ? 'non-compliant' : 'compliant',
  };
}

// ============ IN-MEMORY COLLECTIONS (Add to constructor) ============

private cameraHealth: any[] = [];
private storageHealth: any[] = [];
private networkHealth: any[] = [];
private upsHealth: any[] = [];
private firmwareInventory: any[] = [];
private softwareVersions: any[] = [];
private spareParts: any[] = [];
private inventoryTransactions: any[] = [];
private maintenanceReports: any[] = [];
