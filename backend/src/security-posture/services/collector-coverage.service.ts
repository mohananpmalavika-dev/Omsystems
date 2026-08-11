/**
 * Collector Coverage Service
 * 
 * Tracks and reports security collector coverage across target types and controls.
 */

import { getCollectorRegistry } from '../collectors/collector-registry';
import { CollectorCapability } from '../contracts/security-evidence';

/**
 * Coverage status for a control
 */
export type CoverageStatus = 
  | 'implemented'      // Live collector exists
  | 'partial'          // Framework exists, needs completion
  | 'unsupported'      // Target type doesn't support this control
  | 'planned'          // Not yet implemented
  | 'vendor-specific'; // Requires vendor-specific implementation

/**
 * Control coverage entry
 */
export interface ControlCoverage {
  /** Control ID */
  controlId: string;
  
  /** Control name */
  name: string;
  
  /** Control category */
  category: string;
  
  /** Coverage by target type */
  targets: {
    camera: CoverageStatus;
    nvr: CoverageStatus;
    server: CoverageStatus;
    edgeAgent: CoverageStatus;
  };
  
  /** Implementation notes */
  notes?: string;
  
  /** Collector IDs providing this control */
  collectors: string[];
}

/**
 * Coverage summary statistics
 */
export interface CoverageSummary {
  /** Total controls defined */
  totalControls: number;
  
  /** Implemented controls */
  implementedControls: number;
  
  /** Partial implementations */
  partialControls: number;
  
  /** Unsupported controls */
  unsupportedControls: number;
  
  /** Planned controls */
  plannedControls: number;
  
  /** Coverage percentage */
  coveragePercentage: number;
  
  /** Coverage by category */
  byCategory: Record<string, {
    total: number;
    implemented: number;
    percentage: number;
  }>;
  
  /** Coverage by target type */
  byTargetType: Record<string, {
    applicable: number;
    implemented: number;
    percentage: number;
  }>;
}

/**
 * Collector Coverage Service
 */
export class CollectorCoverageService {
  /**
   * Get comprehensive coverage matrix
   */
  getCoverageMatrix(): ControlCoverage[] {
    const registry = getCollectorRegistry();
    const registeredCollectors = registry.all();
    
    // Define all known controls
    const controls: ControlCoverage[] = [
      // Network Security - TLS
      {
        controlId: 'tls-protocol',
        name: 'TLS Protocol Version',
        category: 'network-security',
        targets: {
          camera: 'implemented',
          nvr: 'implemented',
          server: 'implemented',
          edgeAgent: 'implemented',
        },
        collectors: ['tls-protocol'],
      },
      {
        controlId: 'cipher-strength',
        name: 'Cipher Suite Strength',
        category: 'network-security',
        targets: {
          camera: 'implemented',
          nvr: 'implemented',
          server: 'implemented',
          edgeAgent: 'implemented',
        },
        collectors: ['cipher-strength'],
      },
      
      // Network Security - Certificates
      {
        controlId: 'certificate-chain',
        name: 'Certificate Chain Validation',
        category: 'certificates',
        targets: {
          camera: 'implemented',
          nvr: 'implemented',
          server: 'implemented',
          edgeAgent: 'implemented',
        },
        collectors: ['certificate-chain'],
      },
      {
        controlId: 'ocsp-check',
        name: 'OCSP Revocation Check',
        category: 'certificates',
        targets: {
          camera: 'implemented',
          nvr: 'implemented',
          server: 'implemented',
          edgeAgent: 'implemented',
        },
        collectors: ['ocsp-check'],
        notes: 'Framework ready, OCSP library integration needed for full implementation',
      },
      {
        controlId: 'ocsp-stapling',
        name: 'OCSP Stapling',
        category: 'certificates',
        targets: {
          camera: 'implemented',
          nvr: 'implemented',
          server: 'implemented',
          edgeAgent: 'implemented',
        },
        collectors: ['ocsp-stapling'],
        notes: 'Framework ready, TLS extension parsing needed',
      },
      {
        controlId: 'crl-check',
        name: 'CRL Revocation Check',
        category: 'certificates',
        targets: {
          camera: 'planned',
          nvr: 'planned',
          server: 'planned',
          edgeAgent: 'planned',
        },
        collectors: [],
        notes: 'CRL download and parsing needed',
      },
      {
        controlId: 'ct-verification',
        name: 'Certificate Transparency',
        category: 'certificates',
        targets: {
          camera: 'implemented',
          nvr: 'implemented',
          server: 'implemented',
          edgeAgent: 'implemented',
        },
        collectors: ['ct-log-verification'],
        notes: 'Framework ready, SCT extraction and validation needed',
      },
      {
        controlId: 'certificate-rotation',
        name: 'Certificate Rotation Tracking',
        category: 'certificates',
        targets: {
          camera: 'partial',
          nvr: 'partial',
          server: 'partial',
          edgeAgent: 'partial',
        },
        collectors: [],
        notes: 'Requires historical observation tracking in evidence repository',
      },
      
      // Video Security
      {
        controlId: 'video-transport-encryption',
        name: 'Video Transport Encryption',
        category: 'video-security',
        targets: {
          camera: 'implemented',
          nvr: 'implemented',
          server: 'unsupported',
          edgeAgent: 'unsupported',
        },
        collectors: ['video-transport-encryption'],
      },
      
      // Platform Integrity
      {
        controlId: 'secure-boot',
        name: 'Secure Boot',
        category: 'platform-integrity',
        targets: {
          camera: 'unsupported',
          nvr: 'unsupported',
          server: 'partial',
          edgeAgent: 'partial',
        },
        collectors: [],
        notes: 'Requires agent-based collection with OS-specific APIs',
      },
      {
        controlId: 'uefi-validation',
        name: 'UEFI Validation',
        category: 'platform-integrity',
        targets: {
          camera: 'unsupported',
          nvr: 'unsupported',
          server: 'partial',
          edgeAgent: 'partial',
        },
        collectors: [],
        notes: 'Part of secure boot validation',
      },
      {
        controlId: 'tpm-detection',
        name: 'TPM Detection',
        category: 'platform-integrity',
        targets: {
          camera: 'unsupported',
          nvr: 'unsupported',
          server: 'partial',
          edgeAgent: 'partial',
        },
        collectors: [],
        notes: 'Requires agent-based collection',
      },
      {
        controlId: 'tpm-attestation',
        name: 'TPM Attestation',
        category: 'platform-integrity',
        targets: {
          camera: 'unsupported',
          nvr: 'unsupported',
          server: 'partial',
          edgeAgent: 'partial',
        },
        collectors: [],
        notes: 'Requires TPM 2.0 and agent with TPM access',
      },
      {
        controlId: 'firmware-integrity',
        name: 'Firmware Integrity',
        category: 'platform-integrity',
        targets: {
          camera: 'vendor-specific',
          nvr: 'vendor-specific',
          server: 'partial',
          edgeAgent: 'partial',
        },
        collectors: [],
        notes: 'Requires vendor-specific APIs or measured boot log access',
      },
      
      // Physical Security
      {
        controlId: 'enclosure-tamper',
        name: 'Enclosure Tamper Detection',
        category: 'physical-security',
        targets: {
          camera: 'vendor-specific',
          nvr: 'vendor-specific',
          server: 'partial',
          edgeAgent: 'partial',
        },
        collectors: [],
        notes: 'Requires tamper sensors (GPIO, accelerometer, door sensor)',
      },
      {
        controlId: 'sensor-health',
        name: 'Security Sensor Health',
        category: 'physical-security',
        targets: {
          camera: 'vendor-specific',
          nvr: 'vendor-specific',
          server: 'partial',
          edgeAgent: 'partial',
        },
        collectors: [],
        notes: 'Monitor tamper, temperature, fan, voltage sensors',
      },
      
      // Endpoint Protection
      {
        controlId: 'firewall-status',
        name: 'Firewall Status',
        category: 'endpoint-protection',
        targets: {
          camera: 'unsupported',
          nvr: 'unsupported',
          server: 'partial',
          edgeAgent: 'partial',
        },
        collectors: [],
        notes: 'Requires agent-based collection with OS firewall APIs',
      },
      {
        controlId: 'edr-status',
        name: 'EDR Status',
        category: 'endpoint-protection',
        targets: {
          camera: 'unsupported',
          nvr: 'unsupported',
          server: 'partial',
          edgeAgent: 'partial',
        },
        collectors: [],
        notes: 'Requires EDR agent integration',
      },
      {
        controlId: 'anti-malware-status',
        name: 'Anti-Malware Status',
        category: 'endpoint-protection',
        targets: {
          camera: 'unsupported',
          nvr: 'unsupported',
          server: 'partial',
          edgeAgent: 'partial',
        },
        collectors: [],
        notes: 'Requires anti-malware agent integration',
      },
      {
        controlId: 'disk-encryption',
        name: 'Disk Encryption',
        category: 'endpoint-protection',
        targets: {
          camera: 'unsupported',
          nvr: 'planned',
          server: 'partial',
          edgeAgent: 'partial',
        },
        collectors: [],
        notes: 'Requires agent-based collection (LUKS, BitLocker)',
      },
    ];
    
    // Update collector lists based on registry
    for (const control of controls) {
      if (control.collectors.length > 0) {
        // Verify collectors exist in registry
        const registered = control.collectors.filter(id => registry.get(id));
        
        if (registered.length < control.collectors.length) {
          control.notes = (control.notes || '') + ' (Some collectors not registered)';
        }
      }
    }
    
    return controls;
  }
  
  /**
   * Get coverage summary statistics
   */
  getCoverageSummary(): CoverageSummary {
    const matrix = this.getCoverageMatrix();
    
    // Calculate overall statistics
    const totalControls = matrix.length;
    
    const statusCounts = {
      implemented: 0,
      partial: 0,
      unsupported: 0,
      planned: 0,
      vendorSpecific: 0,
    };
    
    for (const control of matrix) {
      const statuses = Object.values(control.targets);
      
      // Control is implemented if any target has it implemented
      if (statuses.some(s => s === 'implemented')) {
        statusCounts.implemented++;
      } else if (statuses.some(s => s === 'partial')) {
        statusCounts.partial++;
      } else if (statuses.some(s => s === 'planned')) {
        statusCounts.planned++;
      } else if (statuses.some(s => s === 'vendor-specific')) {
        statusCounts.vendorSpecific++;
      } else {
        statusCounts.unsupported++;
      }
    }
    
    const coveragePercentage = totalControls > 0
      ? Math.round((statusCounts.implemented / totalControls) * 100)
      : 0;
    
    // Calculate by category
    const byCategory: Record<string, { total: number; implemented: number; percentage: number }> = {};
    
    for (const control of matrix) {
      if (!byCategory[control.category]) {
        byCategory[control.category] = { total: 0, implemented: 0, percentage: 0 };
      }
      
      byCategory[control.category].total++;
      
      if (Object.values(control.targets).some(s => s === 'implemented')) {
        byCategory[control.category].implemented++;
      }
    }
    
    for (const category in byCategory) {
      const stats = byCategory[category];
      stats.percentage = stats.total > 0
        ? Math.round((stats.implemented / stats.total) * 100)
        : 0;
    }
    
    // Calculate by target type
    const targetTypes = ['camera', 'nvr', 'server', 'edgeAgent'] as const;
    const byTargetType: Record<string, { applicable: number; implemented: number; percentage: number }> = {};
    
    for (const targetType of targetTypes) {
      const applicable = matrix.filter(c => 
        c.targets[targetType] !== 'unsupported'
      ).length;
      
      const implemented = matrix.filter(c =>
        c.targets[targetType] === 'implemented'
      ).length;
      
      byTargetType[targetType] = {
        applicable,
        implemented,
        percentage: applicable > 0
          ? Math.round((implemented / applicable) * 100)
          : 0,
      };
    }
    
    return {
      totalControls,
      implementedControls: statusCounts.implemented,
      partialControls: statusCounts.partial,
      unsupportedControls: statusCounts.unsupported,
      plannedControls: statusCounts.planned,
      coveragePercentage,
      byCategory,
      byTargetType,
    };
  }
  
  /**
   * Get controls by status
   */
  getControlsByStatus(status: CoverageStatus): ControlCoverage[] {
    const matrix = this.getCoverageMatrix();
    
    return matrix.filter(control =>
      Object.values(control.targets).some(s => s === status)
    );
  }
  
  /**
   * Get controls needing implementation
   */
  getImplementationPriority(): {
    priority: 'high' | 'medium' | 'low';
    controls: ControlCoverage[];
    reason: string;
  }[] {
    const matrix = this.getCoverageMatrix();
    
    return [
      {
        priority: 'high',
        controls: matrix.filter(c =>
          c.category === 'platform-integrity' &&
          Object.values(c.targets).some(s => s === 'partial')
        ),
        reason: 'Platform integrity controls provide high-value attestation',
      },
      {
        priority: 'high',
        controls: matrix.filter(c =>
          c.category === 'certificates' &&
          Object.values(c.targets).some(s => s === 'planned')
        ),
        reason: 'Certificate controls have full framework, need completion',
      },
      {
        priority: 'medium',
        controls: matrix.filter(c =>
          c.category === 'endpoint-protection' &&
          Object.values(c.targets).some(s => s === 'partial')
        ),
        reason: 'Endpoint protection requires agent infrastructure',
      },
      {
        priority: 'low',
        controls: matrix.filter(c =>
          Object.values(c.targets).every(s => s === 'vendor-specific')
        ),
        reason: 'Vendor-specific controls need per-vendor implementation',
      },
    ];
  }
}

/**
 * Singleton instance
 */
let serviceInstance: CollectorCoverageService | null = null;

/**
 * Get collector coverage service
 */
export function getCollectorCoverageService(): CollectorCoverageService {
  if (!serviceInstance) {
    serviceInstance = new CollectorCoverageService();
  }
  return serviceInstance;
}
