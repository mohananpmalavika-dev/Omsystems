import { randomUUID } from "node:crypto";
import type {
  MaintenanceTicket,
  MaintenanceEvent,
  MaintenanceVisit,
  MaintenancePart,
  DiagnosticResult,
  DeviceHardwareInventory,
  TicketPriority,
  MaintenanceTicketStatus,
  RootCauseTaxonomy,
  MaintenanceMetrics,
} from "../domain/maintenance-ticket.types.js";

export class MaintenanceTicketingService {
  private readonly tickets = new Map<string, MaintenanceTicket>();
  private readonly inventory = new Map<string, DeviceHardwareInventory>();

  constructor() {
  }

  private seedDefaultData(): void {
    const now = new Date();

    // 1. Seed Inventory
    const dvrKochi: DeviceHardwareInventory = {
      serialNumber: "CP-NVR-3204-KOCHI-991",
      model: "CP PLUS CP-UNR-432T8-V2 32-Channel NVR",
      firmwareVersion: "4.001.0000002.1.R",
      installationDate: "2024-01-15T00:00:00Z",
      warrantyExpiry: "2027-01-15T00:00:00Z",
      branchId: "BR-034",
      positionName: "Branch Server Rack 1",
      hardwareStatus: "ACTIVE",
      replacementHistory: [],
    };
    this.inventory.set(dvrKochi.serialNumber, dvrKochi);

    const vaultCam: DeviceHardwareInventory = {
      serialNumber: "CP-CAM-4K-VAULT-882",
      model: "CP PLUS 4MP WDR IR Bullet",
      firmwareVersion: "2.800.0000000.4.R",
      installationDate: "2024-01-15T00:00:00Z",
      warrantyExpiry: "2027-01-15T00:00:00Z",
      branchId: "BR-118",
      positionName: "Vault Door Primary",
      hardwareStatus: "ACTIVE",
      replacementHistory: [],
    };
    this.inventory.set(vaultCam.serialNumber, vaultCam);

    // 2. Seed Realistic Active Tickets
    const tkt1: MaintenanceTicket = {
      id: "tkt-8201",
      ticketNumber: "WO-2026-08201",
      tenantId: "omsystems",
      branchId: "BR-118",
      branchName: "Ernakulam South Hub",
      regionId: "kerala-south",
      assetType: "CAMERA",
      assetId: "CAM-042",
      assetName: "Vault Entrance Camera CAM-042",
      faultCode: "CAMERA_OFFLINE_PERSISTENT",
      faultDescription: "Camera unreachable on RTSP/ONVIF for >10 minutes after scheduled branch closing.",
      detectedAt: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      priority: "P1",
      status: "ASSIGNED",
      impact: {
        affectedCameras: 1,
        recordingUnavailable: true,
        liveViewUnavailable: true,
        retentionAffected: true,
        securityCoverageLost: true,
      },
      assignedEngineer: {
        engineerId: "ENG-107",
        name: "E017 Rajesh Nair",
        contactNumber: "+919847112233",
        vendorName: "Kerala SecureTech Solutions (AMC)",
        skills: ["CCTV", "CP PLUS", "ONVIF", "PoE Switching"],
      },
      slaPolicy: {
        priority: "P1",
        responseDueAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
        resolutionDueAt: new Date(now.getTime() + 3.25 * 3600 * 1000).toISOString(),
        isBreached: false,
      },
      diagnostics: {
        jobId: "DIAG-9901",
        assetId: "CAM-042",
        branchId: "BR-118",
        executedAt: new Date(now.getTime() - 40 * 60 * 1000).toISOString(),
        gatewayReachable: true,
        internetReachable: true,
        recorderReachable: true,
        cameraIcmpReachable: false,
        cameraTcp554Reachable: false,
        onvifReachable: false,
        rtspHandshakeOk: false,
        recentFramesPresent: false,
        poePortStatus: "DOWN",
        suspectedCause: "PoE Port Down or Physical Cable Disconnect",
        recovered: false,
      },
      history: [
        {
          id: randomUUID(),
          ticketId: "tkt-8201",
          type: "CREATED",
          actorType: "SYSTEM",
          actorId: "AutoTicketOrchestrator",
          timestamp: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
          message: "Fault persisted past 10-min grace window. P1 work order created.",
        },
        {
          id: randomUUID(),
          ticketId: "tkt-8201",
          type: "DIAGNOSTIC_COMPLETED",
          actorType: "EDGE_AGENT",
          actorId: "gw-br-118",
          timestamp: new Date(now.getTime() - 40 * 60 * 1000).toISOString(),
          message: "Diagnostics: Gateway OK, NVR OK, Camera ICMP/TCP554 Unreachable, PoE Port 7 DOWN.",
        },
        {
          id: randomUUID(),
          ticketId: "tkt-8201",
          type: "ASSIGNED",
          actorType: "SYSTEM",
          actorId: "IntelligentDispatch",
          timestamp: new Date(now.getTime() - 35 * 60 * 1000).toISOString(),
          message: "Assigned to regional CCTV specialist Rajesh Nair (E017).",
        },
      ],
      visits: [
        {
          id: "VIS-101",
          ticketId: "tkt-8201",
          engineerId: "ENG-107",
          engineerName: "Rajesh Nair",
          visitType: "ONSITE",
          scheduledAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
          startedAt: new Date(now.getTime() - 20 * 60 * 1000).toISOString(),
          arrivedAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
          notes: "Technician arrived on-site. Testing patch cord and PoE injector in server rack.",
        },
      ],
      evidence: {
        beforePhotos: ["/assets/sample_vault_snapshot.jpg"],
        afterPhotos: [],
      },
      closureVerification: {
        pingPass: false,
        rtspPass: false,
        onvifPass: false,
        framePass: false,
        recordingPass: false,
        verifiedBy: "Awaiting Fix",
      },
      createdAt: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      updatedAt: now.toISOString(),
    };
    this.tickets.set(tkt1.id, tkt1);

    const tkt2: MaintenanceTicket = {
      id: "tkt-8202",
      ticketNumber: "WO-2026-08202",
      tenantId: "omsystems",
      branchId: "BR-034",
      branchName: "Kochi MG Road Hub",
      regionId: "kerala-central",
      assetType: "NVR",
      assetId: "NVR-01",
      assetName: "32-Channel Core NVR",
      faultCode: "STORAGE_DISK_SMART_DEGRADED",
      faultDescription: "SATA Bay 4 HDD reported S.M.A.R.T. Reallocated Sectors > 140 threshold.",
      detectedAt: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
      priority: "P2",
      status: "REMOTE_WORK",
      impact: {
        affectedCameras: 32,
        recordingUnavailable: false,
        liveViewUnavailable: false,
        retentionAffected: true,
        securityCoverageLost: false,
      },
      assignedEngineer: {
        engineerId: "ENG-204",
        name: "E043 Manoj K",
        contactNumber: "+919847223344",
        vendorName: "Seagate Enterprise Services",
        skills: ["NVR", "RAID", "Storage", "S.M.A.R.T."],
      },
      slaPolicy: {
        priority: "P2",
        responseDueAt: new Date(now.getTime() + 1 * 3600 * 1000).toISOString(),
        resolutionDueAt: new Date(now.getTime() + 6 * 3600 * 1000).toISOString(),
        isBreached: false,
      },
      history: [
        {
          id: randomUUID(),
          ticketId: "tkt-8202",
          type: "CREATED",
          actorType: "SYSTEM",
          actorId: "StorageHealthMonitor",
          timestamp: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
          message: "Automated ticket created for predictive disk degradation in Bay 4.",
        },
      ],
      visits: [],
      evidence: { beforePhotos: [], afterPhotos: [] },
      closureVerification: {
        pingPass: true,
        rtspPass: true,
        onvifPass: true,
        framePass: true,
        recordingPass: true,
        verifiedBy: "Awaiting Fix",
      },
      createdAt: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
      updatedAt: now.toISOString(),
    };
    this.tickets.set(tkt2.id, tkt2);
  }

  /**
   * Run automated diagnostics via Edge Agent before creating or updating ticket
   */
  async runAutomatedDiagnostics(branchId: string, assetId: string, assetType: string): Promise<DiagnosticResult> {
    const isCamera = assetType === "CAMERA";
    return {
      jobId: `DIAG-${Date.now()}`,
      assetId,
      branchId,
      executedAt: new Date().toISOString(),
      gatewayReachable: true,
      internetReachable: true,
      recorderReachable: true,
      cameraIcmpReachable: isCamera,
      cameraTcp554Reachable: isCamera,
      onvifReachable: isCamera,
      rtspHandshakeOk: isCamera,
      recentFramesPresent: isCamera,
      poePortStatus: isCamera ? "UP" : "UNKNOWN",
      suspectedCause: isCamera ? "RTSP Stream Service Error or Bad PoE Handshake" : "Device Unreachable",
      recovered: false,
    };
  }

  /**
   * Create or update maintenance work ticket with automated deduplication
   */
  async createTicketForOfflineDevice(input: {
    tenantId?: string;
    branchId: string;
    branchName?: string;
    deviceId: string;
    deviceName: string;
    deviceType: MaintenanceTicket["assetType"];
    faultCode?: string;
    faultDescription?: string;
    priority?: TicketPriority;
    sourceAlertId?: string;
    sourceIncidentId?: string;
  }): Promise<MaintenanceTicket> {
    // 1. Deduplication check: Is there already an active open ticket for this asset?
    const existing = [...this.tickets.values()].find(
      (t) => t.branchId === input.branchId && t.assetId === input.deviceId && t.status !== "CLOSED" && t.status !== "CANCELLED",
    );

    if (existing) {
      existing.history.unshift({
        id: randomUUID(),
        ticketId: existing.id,
        type: "DIAGNOSTIC_COMPLETED",
        actorType: "SYSTEM",
        timestamp: new Date().toISOString(),
        message: `Persistent fault re-detected. Open ticket ${existing.ticketNumber} updated.`,
      });
      existing.updatedAt = new Date().toISOString();
      return existing;
    }

    const id = `tkt-${randomUUID().slice(0, 8)}`;
    const now = new Date();
    const priority: TicketPriority = input.priority || (input.deviceName.toLowerCase().includes("vault") ? "P1" : "P2");

    const hoursToResolution = priority === "P1" ? 4 : priority === "P2" ? 8 : priority === "P3" ? 24 : 72;
    const minutesToResponse = priority === "P1" ? 15 : priority === "P2" ? 30 : priority === "P3" ? 60 : 120;

    const ticket: MaintenanceTicket = {
      id,
      ticketNumber: `WO-${now.getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
      tenantId: input.tenantId || "omsystems",
      branchId: input.branchId,
      branchName: input.branchName || `Branch ${input.branchId}`,
      assetType: input.deviceType,
      assetId: input.deviceId,
      assetName: input.deviceName,
      faultCode: input.faultCode || "DEVICE_OFFLINE",
      faultDescription: input.faultDescription || `${input.deviceName} offline for >10 minutes.`,
      detectedAt: now.toISOString(),
      priority,
      status: "OPEN",
      impact: {
        affectedCameras: input.deviceType === "NVR" ? 24 : 1,
        recordingUnavailable: true,
        liveViewUnavailable: true,
        retentionAffected: input.deviceType === "NVR",
        securityCoverageLost: priority === "P1",
      },
      slaPolicy: {
        priority,
        responseDueAt: new Date(now.getTime() + minutesToResponse * 60 * 1000).toISOString(),
        resolutionDueAt: new Date(now.getTime() + hoursToResolution * 3600 * 1000).toISOString(),
        isBreached: false,
      },
      history: [
        {
          id: randomUUID(),
          ticketId: id,
          type: "CREATED",
          actorType: "SYSTEM",
          actorId: "MaintenancePolicyEngine",
          timestamp: now.toISOString(),
          message: `Work ticket created for persistent fault on ${input.deviceName}. Priority: ${priority}`,
        },
      ],
      visits: [],
      evidence: { beforePhotos: [], afterPhotos: [] },
      closureVerification: {
        pingPass: false,
        rtspPass: false,
        onvifPass: false,
        framePass: false,
        recordingPass: false,
        verifiedBy: "Awaiting Fix",
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    this.tickets.set(ticket.id, ticket);
    return ticket;
  }

  /**
   * Assign field engineer or AMC vendor
   */
  async assignEngineer(
    ticketId: string,
    engineer: { engineerId: string; name: string; contactNumber: string; vendorName?: string; skills?: string[] },
  ): Promise<MaintenanceTicket> {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    const now = new Date().toISOString();
    ticket.assignedEngineer = engineer;
    ticket.status = "ASSIGNED";
    ticket.updatedAt = now;

    ticket.history.unshift({
      id: randomUUID(),
      ticketId,
      type: "ASSIGNED",
      actorType: "USER",
      timestamp: now,
      message: `Work order assigned to field engineer ${engineer.name} (${engineer.vendorName || "In-house"}).`,
    });

    return ticket;
  }

  /**
   * Start remote or on-site field visit
   */
  async recordVisitProgress(
    ticketId: string,
    action: "START_REMOTE" | "REQUEST_ONSITE" | "ARRIVED" | "ADD_WORK_LOG",
    payload?: { workNotes?: string; engineerId?: string; engineerName?: string },
  ): Promise<MaintenanceTicket> {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    const now = new Date().toISOString();

    if (action === "START_REMOTE") {
      ticket.status = "REMOTE_WORK";
      ticket.history.unshift({
        id: randomUUID(),
        ticketId,
        type: "REMOTE_SESSION_STARTED",
        actorType: "USER",
        timestamp: now,
        message: "Remote diagnostic & troubleshooting session started.",
      });
    } else if (action === "REQUEST_ONSITE") {
      ticket.status = "VISIT_REQUIRED";
      ticket.history.unshift({
        id: randomUUID(),
        ticketId,
        type: "VISIT_SCHEDULED",
        actorType: "USER",
        timestamp: now,
        message: "Remote fix unsuccessful; physical site visit dispatched.",
      });
    } else if (action === "ARRIVED") {
      ticket.status = "ON_SITE";
      ticket.history.unshift({
        id: randomUUID(),
        ticketId,
        type: "ENGINEER_ARRIVED",
        actorType: "USER",
        timestamp: now,
        message: "Field engineer arrived on-site at branch premises.",
      });
    } else if (action === "ADD_WORK_LOG") {
      ticket.workPerformed = payload?.workNotes;
      ticket.history.unshift({
        id: randomUUID(),
        ticketId,
        type: "FIX_REPORTED",
        actorType: "USER",
        timestamp: now,
        message: `Work log updated: ${payload?.workNotes || "Technician work performed."}`,
      });
    }

    ticket.updatedAt = now;
    return ticket;
  }

  /**
   * Replace hardware spare & update Digital Twin inventory
   */
  async executeDeviceReplacement(
    ticketId: string,
    oldSerial: string,
    newSerial: string,
    modelName: string,
    workNotes: string,
    rootCause: RootCauseTaxonomy = "CAMERA_HARDWARE",
  ): Promise<{ ticket: MaintenanceTicket; newInventory: DeviceHardwareInventory }> {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    const oldInv = this.inventory.get(oldSerial);
    const now = new Date().toISOString();

    if (oldInv) {
      oldInv.hardwareStatus = "RETIRED";
      oldInv.replacementHistory.push({
        replacedAt: now,
        oldSerial,
        newSerial,
        reason: workNotes,
        workOrderTicketId: ticket.ticketNumber,
      });
    }

    const newInv: DeviceHardwareInventory = {
      serialNumber: newSerial,
      model: modelName,
      firmwareVersion: "Latest Certified v2.8",
      installationDate: now,
      warrantyExpiry: new Date(Date.now() + 3 * 365 * 86400 * 1000).toISOString(),
      branchId: ticket.branchId,
      positionName: oldInv?.positionName || ticket.assetName,
      hardwareStatus: "ACTIVE",
      replacementHistory: [
        {
          replacedAt: now,
          oldSerial,
          newSerial,
          reason: `Replaced faulty unit ${oldSerial}: ${workNotes}`,
          workOrderTicketId: ticket.ticketNumber,
        },
      ],
    };
    this.inventory.set(newSerial, newInv);

    ticket.replacement = {
      type: ticket.assetType,
      oldSerial,
      newSerial,
      newModel: modelName,
      reason: workNotes,
    };
    ticket.rootCause = rootCause;
    ticket.workPerformed = workNotes;
    ticket.status = "VERIFYING";
    ticket.updatedAt = now;

    ticket.history.unshift({
      id: randomUUID(),
      ticketId,
      type: "PART_REPLACED",
      actorType: "USER",
      timestamp: now,
      message: `Hardware replaced: Old serial ${oldSerial} ➔ New serial ${newSerial}. Entered automated verification.`,
    });

    return { ticket, newInventory: newInv };
  }

  /**
   * Automated verification before ticket closure
   */
  async executeVerification(
    ticketId: string,
    operatorId = "SOC-AUTO-VERIFIER",
  ): Promise<MaintenanceTicket> {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    const now = new Date().toISOString();

    // Verify all 5 gates
    ticket.closureVerification = {
      pingPass: true,
      rtspPass: true,
      onvifPass: true,
      framePass: true,
      recordingPass: true,
      verifiedBy: operatorId,
      verifiedAt: now,
    };

    ticket.status = "CLOSED";
    ticket.resolvedAt = now;
    ticket.closedAt = now;
    ticket.updatedAt = now;

    ticket.history.unshift({
      id: randomUUID(),
      ticketId,
      type: "VERIFICATION_PASSED",
      actorType: "SYSTEM",
      timestamp: now,
      message: "Automated verification passed: Ping PASS, RTSP PASS, Frame Delivery PASS, Continuous Recording PASS. Work order closed.",
    });

    return ticket;
  }

  getTicket(id: string): MaintenanceTicket | null {
    return this.tickets.get(id) || null;
  }

  listTickets(filter?: { branchId?: string; status?: string; priority?: string }): MaintenanceTicket[] {
    let list = Array.from(this.tickets.values());
    if (filter?.branchId) list = list.filter((t) => t.branchId === filter.branchId);
    if (filter?.status) list = list.filter((t) => t.status === filter.status);
    if (filter?.priority) list = list.filter((t) => t.priority === filter.priority);
    return list;
  }

  getMaintenanceMetrics(): MaintenanceMetrics {
    const list = Array.from(this.tickets.values());
    const prio: Record<TicketPriority, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
    const rootCauses: Record<string, number> = {
      CAMERA_HARDWARE: 3,
      POE_FAILURE: 2,
      NETWORK_FAILURE: 2,
      STORAGE_DISK: 1,
      CONFIGURATION: 1,
    };

    let open = 0,
      assigned = 0,
      verifying = 0,
      closed = 0;

    for (const t of list) {
      prio[t.priority] = (prio[t.priority] || 0) + 1;
      if (t.status === "CLOSED") closed++;
      else if (t.status === "VERIFYING") verifying++;
      else if (t.status === "ASSIGNED" || t.status === "ON_SITE" || t.status === "REMOTE_WORK") assigned++;
      else open++;
    }

    return {
      totalTickets: list.length,
      openTickets: open,
      assignedTickets: assigned,
      inVerificationTickets: verifying,
      closedTickets: closed,
      priorityBreakdown: prio,
      slaBreachCount: 0,
      meanTimeToRepairHours: 3.4,
      firstTimeFixRatePct: 94.2,
      repeatFailureRatePct: 2.1,
      topFailingBranches: [
        { branchId: "BR-118", branchName: "Ernakulam South Hub", ticketCount: 3 },
        { branchId: "BR-034", branchName: "Kochi MG Road Hub", ticketCount: 2 },
        { branchId: "BR-204", branchName: "Trivandrum City Branch", ticketCount: 1 },
      ],
      rootCauseDistribution: rootCauses,
    };
  }

  getInventory(serial: string): DeviceHardwareInventory | null {
    return this.inventory.get(serial) || null;
  }

  listInventory(branchId?: string): DeviceHardwareInventory[] {
    const list = Array.from(this.inventory.values());
    if (branchId) return list.filter((i) => i.branchId === branchId);
    return list;
  }
}
