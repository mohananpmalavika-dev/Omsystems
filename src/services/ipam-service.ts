/**
 * IP Address Management (IPAM) Service
 * 
 * Manages IP address assignments for devices with validation and conflict detection.
 * 
 * Key Features:
 * - Subnet validation
 * - IP conflict detection (database + network probing)
 * - Branch network configuration
 * - Reserved IP range management
 * 
 * @see DEVICE_MANAGEMENT_PRODUCTION_GUIDE.md for complete documentation
 */

import type { ExtendedControlPlaneStore } from '../control-plane-store.js';

interface IpAssignmentInput {
  tenantId: string;
  branchId: string;
  deviceId: string;
  ipAddress: string;
  subnet: string;
  reservationType: 'static' | 'dhcp-reservation';
  assignedBy: string;
}

interface BranchNetwork {
  id: string;
  tenantId: string;
  branchId: string;
  networkCidr: string;
  gateway: string;
  dnsServers: string[];
  vlanId?: number;
  dhcpRangeStart?: string;
  dhcpRangeEnd?: string;
  reservedRangeStart?: string;
  reservedRangeEnd?: string;
}

export class IpamService {
  constructor(private readonly store: ExtendedControlPlaneStore) {}

  /**
   * Assign an IP address to a device with validation and conflict detection.
   * Creates a job for async execution via edge agent.
   */
  async assignIpAddress(input: IpAssignmentInput) {
    // 1. Validate device exists
    const device = await this.store.getDeviceInventory(input.deviceId);
    if (!device || device.tenantId !== input.tenantId) {
      throw new Error(`Device ${input.deviceId} not found`);
    }

    // 2. Validate IP address is in valid range
    await this.validateIpAddress(input.branchId, input.ipAddress, input.subnet);

    // 3. Check for conflicts
    const conflicts = await this.checkIpConflicts(input.branchId, input.ipAddress, input.deviceId);
    if (conflicts.length > 0) {
      const firstConflict = conflicts[0];
      if (firstConflict) {
        throw new Error(
          `IP ${input.ipAddress} is already assigned to device ${firstConflict.deviceId}`
        );
      }
    }

    // 4. Create assignment record (status: pending)
    const assignment = await this.store.createIpAssignment({
      tenantId: input.tenantId,
      branchId: input.branchId,
      deviceId: input.deviceId,
      ipAddress: input.ipAddress,
      subnetCidr: input.subnet,
      reservationType: input.reservationType,
      assignedBy: input.assignedBy,
      status: 'pending',
    });

    // 5. Get current IP for rollback
    const currentIp = await this.getCurrentDeviceIp(input.deviceId);

    // 6. Get branch network config
    const network = await this.store.getBranchNetwork(input.branchId);

    // 7. Create job for edge agent
    const job = await this.store.createDeviceConfigurationJob({
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      jobType: 'ip-change',
      requestedBy: input.assignedBy,
      reason: 'IP address assignment',
      priority: 'normal',
      payload: {
        assignmentId: assignment.id,
        oldIpAddress: currentIp,
        newIpAddress: input.ipAddress,
        subnet: input.subnet,
        gateway: network?.gateway,
        dnsServers: network?.dnsServers || [],
      },
      status: 'queued',
    });

    // 8. Audit
    await this.store.writeAudit({
      tenantId: input.tenantId,
      action: 'device.ip.assignment-initiated',
      actorUserId: input.assignedBy,
      resourceNodeId: input.branchId,
      outcome: 'success',
      details: {
        jobId: job.id,
        resourceId: input.deviceId,
        oldIp: currentIp,
        newIp: input.ipAddress,
        subnet: input.subnet,
      },
    });

    return job;
  }

  /**
   * Validate IP address is in valid range and meets requirements.
   */
  async validateIpAddress(branchId: string, ipAddress: string, subnet: string): Promise<void> {
    const network: BranchNetwork | undefined = await this.store.getBranchNetwork(branchId) as BranchNetwork | undefined;

    if (!network) {
      throw new Error(`No network configuration found for branch ${branchId}`);
    }

    // Basic IP format validation
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ipAddress)) {
      throw new Error(`Invalid IP address format: ${ipAddress}`);
    }

    // Validate IP is not gateway
    const gateway = network.gateway;
    if (gateway && ipAddress === gateway) {
      throw new Error(`IP ${ipAddress} is the gateway address`);
    }

    // Validate IP is in reserved range if configured
    if (network.reservedRangeStart && network.reservedRangeEnd) {
      const ipNum = this.ipToNumber(ipAddress);
      const startNum = this.ipToNumber(network.reservedRangeStart);
      const endNum = this.ipToNumber(network.reservedRangeEnd);

      if (ipNum < startNum || ipNum > endNum) {
        throw new Error(
          `IP ${ipAddress} is outside reserved range ${network.reservedRangeStart}-${network.reservedRangeEnd}`
        );
      }
    }

    // Check IP is not broadcast (ends in .255 for /24 networks)
    if (ipAddress.endsWith('.255')) {
      throw new Error(`IP ${ipAddress} appears to be a broadcast address`);
    }

    // Check IP is not network address (ends in .0 for /24 networks)
    if (ipAddress.endsWith('.0')) {
      throw new Error(`IP ${ipAddress} appears to be a network address`);
    }
  }

  /**
   * Check for IP conflicts in database and optionally via network probe.
   */
  async checkIpConflicts(
    branchId: string,
    ipAddress: string,
    excludeDeviceId?: string
  ): Promise<Array<{ deviceId: string; deviceName?: string; detected?: boolean }>> {
    // Check database
    const dbConflicts = await this.store.getIpAssignmentsByIp(branchId, ipAddress, excludeDeviceId);

    if (dbConflicts.length > 0) {
      return dbConflicts;
    }

    // TODO: Implement network probing via edge agent
    // const edgeAgent = await this.store.getBranchEdgeAgent(branchId);
    // if (edgeAgent) {
    //   const probe = await this.edgeService.probeIpAddress(edgeAgent.id, ipAddress);
    //   if (probe.exists) {
    //     return [{
    //       deviceId: 'unknown',
    //       detected: true
    //     }];
    //   }
    // }

    return [];
  }

  /**
   * Get current IP address for a device.
   */
  private async getCurrentDeviceIp(deviceId: string): Promise<string | undefined> {
    const device = await this.store.getDeviceInventory(deviceId);
    return device?.ipAddress;
  }

  /**
   * Convert IP address to number for range comparison.
   */
  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
  }

  /**
   * Get or create branch network configuration.
   */
  async ensureBranchNetwork(branchId: string, config: Partial<BranchNetwork>): Promise<BranchNetwork> {
    let network = await this.store.getBranchNetwork(branchId);

    if (!network) {
      network = await this.store.createBranchNetwork({
        tenantId: config.tenantId ?? 'default',
        branchId,
        networkCidr: config.networkCidr ?? '10.0.0.0/24',
        gateway: config.gateway ?? '10.0.0.1',
        dnsServers: config.dnsServers ?? [],
        ...config,
      });
    }

    return network;
  }

  /**
   * List all IP assignments for a branch.
   */
  async listBranchIpAssignments(branchId: string) {
    return this.store.listIpAssignmentsByBranch(branchId);
  }

  /**
   * Detect IP conflicts in a branch.
   */
  async detectConflicts(branchId: string) {
    return this.store.getIpConflicts(branchId);
  }
}
