/**
 * Target Capabilities Contract
 * 
 * Defines what security evidence each target type can provide.
 * Prevents collectors from attempting impossible measurements.
 */

/**
 * Security capabilities by target type
 */
export interface SecurityCapabilities {
  /** TLS/Transport capabilities */
  tls: {
    supported: boolean;
    introspectionAvailable: boolean;
    canProbeDirectly: boolean;
  };
  
  /** Certificate capabilities */
  certificates: {
    available: boolean;
    ocsp: boolean;
    ocspStapling: boolean;
    crl: boolean;
    ctLogs: boolean;
    rotationTracking: boolean;
  };
  
  /** Platform integrity capabilities */
  platform: {
    secureBoot: boolean;
    uefi: boolean;
    tpm: boolean;
    tpmVersion?: '1.2' | '2.0';
    attestation: boolean;
    measuredBoot: boolean;
  };
  
  /** Video encryption capabilities */
  video: {
    rtspSupported: boolean;
    srtpSupported: boolean;
    rtspOverTlsSupported: boolean;
    encryptionIntrospection: boolean;
  };
  
  /** Physical security capabilities */
  physical: {
    tamperSensor: boolean;
    enclosureSensor: boolean;
    accelerometer: boolean;
    temperatureSensor: boolean;
    fanSensor: boolean;
    voltageSensor: boolean;
  };
  
  /** Agent capabilities */
  agent: {
    installed: boolean;
    authenticated: boolean;
    privilegedTelemetry: boolean;
    signedReporting: boolean;
    version?: string;
  };
  
  /** Endpoint protection capabilities */
  protection: {
    firewall: boolean;
    edr: boolean;
    antiMalware: boolean;
    diskEncryption: boolean;
    exploitProtection: boolean;
    applicationControl: boolean;
  };
  
  /** Storage capabilities */
  storage: {
    encryptionSupported: boolean;
    encryptionType?: 'luks' | 'dm-crypt' | 'bitlocker' | 'filesystem' | 'hardware';
    encryptionIntrospection: boolean;
  };
}

/**
 * Capability detection result
 */
export interface CapabilityDetection {
  /** Target identifier */
  targetId: string;
  
  /** Target type */
  targetType: 'camera' | 'nvr' | 'server' | 'edge-agent' | 'network';
  
  /** Detected capabilities */
  capabilities: SecurityCapabilities;
  
  /** When capabilities were detected */
  detectedAt: Date;
  
  /** Detection confidence (0-1) */
  confidence: number;
  
  /** Detection method */
  method: 'api-query' | 'version-detection' | 'feature-probe' | 'agent-report' | 'configuration';
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Capability provider interface
 */
export interface CapabilityProvider {
  /**
   * Detect capabilities for a target
   */
  detectCapabilities(
    targetType: string,
    targetId: string,
    context?: Record<string, unknown>
  ): Promise<SecurityCapabilities>;
}

/**
 * Default capabilities by target type
 */
export const DEFAULT_CAPABILITIES: Record<string, Partial<SecurityCapabilities>> = {
  camera: {
    tls: {
      supported: true,
      introspectionAvailable: false,
      canProbeDirectly: true,
    },
    certificates: {
      available: true,
      ocsp: false,
      ocspStapling: false,
      crl: false,
      ctLogs: false,
      rotationTracking: false,
    },
    video: {
      rtspSupported: true,
      srtpSupported: false,
      rtspOverTlsSupported: false,
      encryptionIntrospection: false,
    },
    physical: {
      tamperSensor: false, // Vendor-specific
      enclosureSensor: false,
      accelerometer: false,
      temperatureSensor: false,
      fanSensor: false,
      voltageSensor: false,
    },
    platform: {
      secureBoot: false,
      uefi: false,
      tpm: false,
      attestation: false,
      measuredBoot: false,
    },
    agent: {
      installed: false,
      authenticated: false,
      privilegedTelemetry: false,
      signedReporting: false,
    },
    protection: {
      firewall: false,
      edr: false,
      antiMalware: false,
      diskEncryption: false,
      exploitProtection: false,
      applicationControl: false,
    },
  },
  
  nvr: {
    tls: {
      supported: true,
      introspectionAvailable: false,
      canProbeDirectly: true,
    },
    certificates: {
      available: true,
      ocsp: true,
      ocspStapling: false,
      crl: true,
      ctLogs: false,
      rotationTracking: true,
    },
    video: {
      rtspSupported: true,
      srtpSupported: false,
      rtspOverTlsSupported: false,
      encryptionIntrospection: false,
    },
    storage: {
      encryptionSupported: true,
      encryptionIntrospection: false,
    },
    platform: {
      secureBoot: false,
      uefi: false,
      tpm: false,
      attestation: false,
      measuredBoot: false,
    },
    agent: {
      installed: false,
      authenticated: false,
      privilegedTelemetry: false,
      signedReporting: false,
    },
  },
  
  server: {
    tls: {
      supported: true,
      introspectionAvailable: true,
      canProbeDirectly: true,
    },
    certificates: {
      available: true,
      ocsp: true,
      ocspStapling: true,
      crl: true,
      ctLogs: true,
      rotationTracking: true,
    },
    platform: {
      secureBoot: true,
      uefi: true,
      tpm: true,
      tpmVersion: '2.0',
      attestation: true,
      measuredBoot: true,
    },
    storage: {
      encryptionSupported: true,
      encryptionType: 'luks',
      encryptionIntrospection: true,
    },
    agent: {
      installed: true,
      authenticated: true,
      privilegedTelemetry: true,
      signedReporting: true,
    },
    protection: {
      firewall: true,
      edr: true,
      antiMalware: true,
      diskEncryption: true,
      exploitProtection: true,
      applicationControl: true,
    },
  },
  
  'edge-agent': {
    tls: {
      supported: true,
      introspectionAvailable: true,
      canProbeDirectly: false,
    },
    certificates: {
      available: true,
      ocsp: true,
      ocspStapling: true,
      crl: true,
      ctLogs: true,
      rotationTracking: true,
    },
    platform: {
      secureBoot: true,
      uefi: true,
      tpm: true,
      tpmVersion: '2.0',
      attestation: true,
      measuredBoot: true,
    },
    storage: {
      encryptionSupported: true,
      encryptionIntrospection: true,
    },
    agent: {
      installed: true,
      authenticated: true,
      privilegedTelemetry: true,
      signedReporting: true,
    },
    protection: {
      firewall: true,
      edr: true,
      antiMalware: true,
      diskEncryption: true,
      exploitProtection: true,
      applicationControl: true,
    },
  },
};

/**
 * Helper: Get default capabilities for target type
 */
export function getDefaultCapabilities(targetType: string): SecurityCapabilities {
  const defaults = DEFAULT_CAPABILITIES[targetType] || DEFAULT_CAPABILITIES.camera;
  
  // Fill in missing capability groups with false defaults
  return {
    tls: defaults.tls || {
      supported: false,
      introspectionAvailable: false,
      canProbeDirectly: false,
    },
    certificates: defaults.certificates || {
      available: false,
      ocsp: false,
      ocspStapling: false,
      crl: false,
      ctLogs: false,
      rotationTracking: false,
    },
    platform: defaults.platform || {
      secureBoot: false,
      uefi: false,
      tpm: false,
      attestation: false,
      measuredBoot: false,
    },
    video: defaults.video || {
      rtspSupported: false,
      srtpSupported: false,
      rtspOverTlsSupported: false,
      encryptionIntrospection: false,
    },
    physical: defaults.physical || {
      tamperSensor: false,
      enclosureSensor: false,
      accelerometer: false,
      temperatureSensor: false,
      fanSensor: false,
      voltageSensor: false,
    },
    agent: defaults.agent || {
      installed: false,
      authenticated: false,
      privilegedTelemetry: false,
      signedReporting: false,
    },
    protection: defaults.protection || {
      firewall: false,
      edr: false,
      antiMalware: false,
      diskEncryption: false,
      exploitProtection: false,
      applicationControl: false,
    },
    storage: defaults.storage || {
      encryptionSupported: false,
      encryptionIntrospection: false,
    },
  };
}

/**
 * Helper: Check if target supports capability
 */
export function supportsCapability(
  capabilities: SecurityCapabilities,
  capabilityPath: string
): boolean {
  const parts = capabilityPath.split('.');
  let current: any = capabilities;
  
  for (const part of parts) {
    if (current[part] === undefined) return false;
    current = current[part];
  }
  
  return current === true;
}
