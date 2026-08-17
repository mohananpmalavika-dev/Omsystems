import { randomUUID } from "node:crypto";
import type {
  MaintenanceTicket,
  DeviceHardwareInventory,
  TicketPriority,
} from "../domain/maintenance-ticket.types.js";

export class MaintenanceTicketingService {
  private readonly tickets = new Map<string, MaintenanceTicket>();
  private readonly inventory = new Map<string, DeviceHardwareInventory>(); // serialNumber -> inventory

  constructor() {
    this.seedDefaultInventory();
  }

  private seedDefaultInventory(): void {
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
      branchId: "BR-034",
      positionName: "Vault Door Primary",
      hardwareStatus: "ACTIVE",
      replacementHistory: [],
    };
    this.inventory.set(vaultCam.serialNumber, vaultCam);
  }

  /**
   * Automatically generate maintenance work ticket for offline device (>10 min offline).
   */
  async createTicketForOfflineDevice(input: {
    branchId: string;
    deviceId: string;
    deviceName: string;
    deviceType: MaintenanceTicket["deviceType"];
    faultType?: MaintenanceTicket["faultType"];
    priority?: TicketPriority;
  }): Promise<MaintenanceTicket> {
    const id = `tkt-${randomUUID().slice(0, 8)}`;
    const now = new Date();
    const slaDue = new Date(now.getTime() + (input.priority === "P1_URGENT" ? 4 : 24) * 3600 * 1000);

    const ticket: MaintenanceTicket = {
      id,
      ticketNumber: `WO-${now.getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
      branchId: input.branchId,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      deviceType: input.deviceType,
      faultType: input.faultType || "DEVICE_OFFLINE",
      impactLevel: input.priority === "P1_URGENT" ? "CRITICAL_SECURITY" : "PARTIAL_COVERAGE",
      priority: input.priority || "P2_HIGH",
      slaDueAt: slaDue.toISOString(),
      closureVerification: {
        streamOnlineVerified: false,
        recordingVerified: false,
      },
      status: "OPEN",
      createdAt: now.toISOString(),
    };

    this.tickets.set(ticket.id, ticket);
    return ticket;
  }

  /**
   * Assign field engineer or AMC vendor to ticket.
   */
  async assignEngineer(
    ticketId: string,
    engineer: { engineerId: string; name: string; contactNumber: string; vendorName?: string },
  ): Promise<MaintenanceTicket> {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    ticket.assignedEngineer = engineer;
    ticket.status = "ASSIGNED";
    return ticket;
  }

  /**
   * Replace hardware component (e.g. faulty DVR / Camera) with spare unit:
   * - Retires old serial number in inventory.
   * - Registers new serial number at exact branch & position.
   * - Preserves channel and Digital Twin configuration.
   */
  async executeDeviceReplacement(
    ticketId: string,
    oldSerial: string,
    newSerial: string,
    modelName: string,
    workNotes: string,
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
      firmwareVersion: "Latest Certified",
      installationDate: now,
      warrantyExpiry: new Date(Date.now() + 3 * 365 * 86400 * 1000).toISOString(),
      branchId: ticket.branchId,
      positionName: oldInv?.positionName || ticket.deviceName,
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

    ticket.replacementDevice = {
      oldSerialNumber: oldSerial,
      newSerialNumber: newSerial,
      modelName,
      replacedAt: now,
    };
    ticket.workPerformedNotes = workNotes;
    ticket.status = "PENDING_VERIFICATION";

    return { ticket, newInventory: newInv };
  }

  /**
   * Verify stream online & recording before closing maintenance work order.
   */
  async closeTicketWithVerification(
    ticketId: string,
    verification: {
      streamOnlineVerified: boolean;
      recordingVerified: boolean;
      verifiedByOperatorId: string;
    },
  ): Promise<MaintenanceTicket> {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    if (!verification.streamOnlineVerified || !verification.recordingVerified) {
      throw new Error("Cannot close ticket: Both Live Stream Online and Continuous Recording must be verified by SOC operator.");
    }

    const now = new Date().toISOString();
    ticket.closureVerification = {
      streamOnlineVerified: true,
      recordingVerified: true,
      verifiedByOperatorId: verification.verifiedByOperatorId,
      verifiedAt: now,
    };
    ticket.status = "CLOSED";
    ticket.closedAt = now;

    return ticket;
  }

  getTicket(id: string): MaintenanceTicket | null {
    return this.tickets.get(id) || null;
  }

  listTickets(branchId?: string): MaintenanceTicket[] {
    const list = Array.from(this.tickets.values());
    if (branchId) return list.filter((t) => t.branchId === branchId);
    return list;
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
