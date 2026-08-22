/**
 * Surgical Work Order & Smart Dispatch Service
 * Generates precision-guided work orders containing exact part numbers,
 * branch physical coordinates, and diagnostic checklists only when physical hardware intervention is mandatory.
 */

import { randomUUID } from 'node:crypto';
import {
  RootCauseDiagnosis,
  SurgicalWorkOrder,
} from '../domain/remote-ops.types.js';

export class SurgicalDispatchService {
  private workOrders = new Map<string, SurgicalWorkOrder>();

  /**
   * Generates a surgical work order for an issue requiring physical repair.
   */
  generateWorkOrder(
    diagnosis: RootCauseDiagnosis,
    branchInfo: {
      branchName: string;
      branchCode: string;
      physicalLocationInBranch?: string;
      modelNumber?: string;
      macAddress?: string;
      ipAddress?: string;
    }
  ): SurgicalWorkOrder {
    const workOrderId = `wo-surg-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const now = new Date().toISOString();

    let requiredSpareParts: string[] = [];
    let diagnosticChecklist: string[] = [];
    let estimatedRepairMinutes = 45;
    let priority: 'EMERGENCY_P1' | 'HIGH' | 'NORMAL' = 'HIGH';

    switch (diagnosis.category) {
      case 'PHYSICAL_CABLE_SEVERED':
        requiredSpareParts = [
          '1x 20m Cat6 UTP Solid Copper Cable',
          '4x RJ45 Gold-Plated Shielded Connectors',
          '1x RJ45 Crimping Tool & Cable Tester',
        ];
        diagnosticChecklist = [
          'Inspect physical cable conduit along ceiling / duct for breaks or rodent damage.',
          'Re-terminate both ends with standard T568B pinout.',
          'Verify wire-map continuity using cable continuity tester.',
          'Plug into Switch Port and verify link LED lights up green (1000 Mbps).',
          'Confirm RTSP live video streams into Sentinel Grid console before closing ticket.',
        ];
        estimatedRepairMinutes = 35;
        break;

      case 'LOCAL_SWITCH_POWER_OR_UPLINK_FAILURE':
        priority = 'EMERGENCY_P1';
        requiredSpareParts = [
          '1x 16-Port Managed Gigabit PoE Switch (250W)',
          '1x 2m C13 Power Cord',
          '2x 10G SFP+ Fiber Transceiver Modules',
        ];
        diagnosticChecklist = [
          'Test AC mains outlet and UPS power strip voltage with multimeter (expect 230V ±10%).',
          'Inspect switch power supply indicator LEDs.',
          'Replace faulty PoE switch unit if power supply has blown.',
          'Verify all 16 camera ports power on and negotiate IP addresses via DHCP.',
          'Verify central monitoring station receives telemetry from all 16 cameras.',
        ];
        estimatedRepairMinutes = 60;
        break;

      default:
        requiredSpareParts = [
          `1x Replacement ${branchInfo.modelNumber || 'Camera Unit'}`,
          '1x Mounting Bracket & Screws',
        ];
        diagnosticChecklist = [
          'Replace physical hardware unit at designated branch mounting bracket.',
          'Verify power delivery and optical alignment.',
          'Perform remote onboarding scan from Sentinel Grid console.',
        ];
        break;
    }

    const workOrder: SurgicalWorkOrder = {
      workOrderId,
      branchId: diagnosis.branchId,
      branchName: branchInfo.branchName,
      branchCode: branchInfo.branchCode,
      physicalLocationInBranch: branchInfo.physicalLocationInBranch || 'Main Banking Hall, Vault Entrance Overhead',
      faultyComponentId: diagnosis.componentId,
      faultyComponentName: diagnosis.componentName,
      modelNumber: branchInfo.modelNumber || 'Hikvision DS-2CD2143G0-I (4MP Dome)',
      macAddress: branchInfo.macAddress,
      ipAddress: branchInfo.ipAddress,
      requiredSpareParts,
      diagnosticChecklist,
      priority,
      estimatedRepairMinutes,
      reason: diagnosis.narrative,
      createdAt: now,
    };

    this.workOrders.set(workOrderId, workOrder);
    return workOrder;
  }

  getWorkOrder(workOrderId: string): SurgicalWorkOrder | null {
    return this.workOrders.get(workOrderId) || null;
  }

  listWorkOrders(branchId?: string): SurgicalWorkOrder[] {
    const all = Array.from(this.workOrders.values());
    if (branchId) return all.filter((w) => w.branchId === branchId);
    return all;
  }
}

export const surgicalDispatch = new SurgicalDispatchService();
