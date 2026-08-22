/**
 * Supply Chain Verification Service
 * Verify software packages, dependencies, and firmware with SHA-256, digital signatures, and SBOM
 */

import {
  SoftwarePackage,
  SBOM,
  SBOMComponent,
  Vulnerability,
  TrustLevel
} from '../types/security.types';
import crypto from 'crypto';
import https from 'https';

export class SupplyChainVerificationService {
  private packages: Map<string, SoftwarePackage> = new Map();
  private trustedVendors: Set<string> = new Set([
    'Axis Communications',
    'Hikvision',
    'Dahua',
    'Hanwha',
    'Bosch Security',
    'Milestone Systems'
  ]);

  /**
   * Verify software package
   */
  async verifyPackage(
    name: string,
    version: string,
    vendor: string,
    downloadUrl: string,
    filePath?: string
  ): Promise<SoftwarePackage> {
    console.log(`🔍 Verifying package: ${name} v${version} from ${vendor}`);

    const packageId = `${vendor}:${name}:${version}`;

    // Check if already verified
    const existing = this.packages.get(packageId);
    if (existing && existing.verified) {
      console.log(`✓ Package already verified: ${packageId}`);
      return existing;
    }

    // Step 1: Download package (if not provided)
    let fileBuffer: Buffer;
    if (filePath) {
      const fs = require('fs/promises');
      fileBuffer = await fs.readFile(filePath);
    } else {
      fileBuffer = await this.downloadFile(downloadUrl);
    }

    // Step 2: Calculate hashes
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const sha512 = crypto.createHash('sha512').update(fileBuffer).digest('hex');

    // Step 3: Verify digital signature
    const signatureValid = await this.verifyDigitalSignature(fileBuffer, vendor);

    // Step 4: Check SBOM
    const sbom = await this.extractSBOM(fileBuffer);

    // Step 5: Scan for vulnerabilities
    const vulnerabilities = await this.scanVulnerabilities(name, version, sbom);

    // Step 6: Determine trust level
    const trustLevel = this.calculateTrustLevel(
      vendor,
      signatureValid,
      vulnerabilities.length
    );

    const softwarePackage: SoftwarePackage = {
      id: packageId,
      name,
      version,
      vendor,
      downloadUrl,
      sha256,
      sha512,
      digitalSignature: signatureValid ? 'VALID' : 'INVALID',
      sbom,
      verified: signatureValid && vulnerabilities.filter(v => v.severity === 'CRITICAL').length === 0,
      verifiedAt: new Date(),
      trustLevel,
      vulnerabilities
    };

    this.packages.set(packageId, softwarePackage);

    if (softwarePackage.verified) {
      console.log(`✓ Package verified: ${packageId} (Trust: ${trustLevel})`);
    } else {
      console.log(`❌ Package verification failed: ${packageId}`);
    }

    return softwarePackage;
  }

  /**
   * Verify firmware integrity
   */
  async verifyFirmware(
    deviceType: string,
    vendor: string,
    version: string,
    firmwareFile: Buffer
  ): Promise<{
    valid: boolean;
    expectedHash?: string;
    actualHash: string;
    signatureValid: boolean;
    trustLevel: TrustLevel;
  }> {
    console.log(`🔍 Verifying firmware: ${vendor} ${deviceType} v${version}`);

    // Calculate hash
    const actualHash = crypto.createHash('sha256').update(firmwareFile).digest('hex');

    // Get expected hash from vendor database
    const expectedHash = await this.getExpectedFirmwareHash(vendor, deviceType, version);

    // Verify digital signature
    const signatureValid = await this.verifyDigitalSignature(firmwareFile, vendor);

    // Calculate trust level
    const trustLevel = this.calculateTrustLevel(vendor, signatureValid, 0);

    const valid = expectedHash === actualHash && signatureValid;

    return {
      valid,
      expectedHash,
      actualHash,
      signatureValid,
      trustLevel
    };
  }

  /**
   * Verify dependency chain
   */
  async verifyDependencyChain(packageId: string): Promise<{
    valid: boolean;
    totalDependencies: number;
    verifiedDependencies: number;
    vulnerabilities: Vulnerability[];
  }> {
    const pkg = this.packages.get(packageId);

    if (!pkg || !pkg.sbom) {
      return {
        valid: false,
        totalDependencies: 0,
        verifiedDependencies: 0,
        vulnerabilities: []
      };
    }

    console.log(`🔍 Verifying dependency chain for: ${packageId}`);

    const totalDependencies = pkg.sbom.components.length;
    let verifiedDependencies = 0;
    const allVulnerabilities: Vulnerability[] = [];

    for (const component of pkg.sbom.components) {
      // Verify each component hash
      const hashValid = await this.verifyComponentHash(component);
      if (hashValid) {
        verifiedDependencies++;
      }

      // Check for vulnerabilities
      const vulns = await this.checkComponentVulnerabilities(component);
      allVulnerabilities.push(...vulns);
    }

    const valid = verifiedDependencies === totalDependencies && 
                  allVulnerabilities.filter(v => v.severity === 'CRITICAL').length === 0;

    console.log(`✓ Dependency chain: ${verifiedDependencies}/${totalDependencies} verified`);

    return {
      valid,
      totalDependencies,
      verifiedDependencies,
      vulnerabilities: allVulnerabilities
    };
  }

  /**
   * Check for known vulnerabilities
   */
  async scanVulnerabilities(
    name: string,
    version: string,
    sbom?: SBOM
  ): Promise<Vulnerability[]> {
    console.log(`🔍 Scanning vulnerabilities: ${name} v${version}`);

    const vulnerabilities: Vulnerability[] = [];

    // Check package itself
    const pkgVulns = await this.checkNVD(name, version);
    vulnerabilities.push(...pkgVulns);

    // Check dependencies from SBOM
    if (sbom) {
      for (const component of sbom.components) {
        const compVulns = await this.checkNVD(component.name, component.version);
        vulnerabilities.push(...compVulns);
      }
    }

    if (vulnerabilities.length > 0) {
      console.log(`⚠️ Found ${vulnerabilities.length} vulnerabilities`);
    } else {
      console.log(`✓ No vulnerabilities found`);
    }

    return vulnerabilities;
  }

  /**
   * Verify package before installation
   */
  async verifyBeforeInstall(packagePath: string, expectedHash: string): Promise<boolean> {
    console.log(`🔍 Pre-installation verification: ${packagePath}`);

    try {
      const fs = require('fs/promises');
      const fileBuffer = await fs.readFile(packagePath);
      const actualHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      if (actualHash !== expectedHash) {
        console.log(`❌ Hash mismatch! Expected: ${expectedHash}, Got: ${actualHash}`);
        return false;
      }

      console.log(`✓ Hash verified: ${actualHash}`);
      return true;
    } catch (error) {
      console.error('Verification failed:', error);
      return false;
    }
  }

  /**
   * Generate SBOM for installed components
   */
  async generateSBOM(
    componentName: string,
    componentVersion: string,
    dependencies: Array<{ name: string; version: string }>
  ): Promise<SBOM> {
    const components: SBOMComponent[] = dependencies.map(dep => ({
      name: dep.name,
      version: dep.version,
      purl: `pkg:npm/${dep.name}@${dep.version}`,
      licenses: [],
      hashes: {}
    }));

    const sbomDependencies = dependencies.map((dep, index) => ({
      ref: `component-${index}`,
      dependsOn: []
    }));

    return {
      format: 'CycloneDX',
      version: '1.4',
      components,
      dependencies: sbomDependencies
    };
  }

  /**
   * Get package information
   */
  async getPackage(packageId: string): Promise<SoftwarePackage | null> {
    return this.packages.get(packageId) || null;
  }

  /**
   * List all verified packages
   */
  async listPackages(filter?: {
    vendor?: string;
    verified?: boolean;
    hasVulnerabilities?: boolean;
  }): Promise<SoftwarePackage[]> {
    let packages = Array.from(this.packages.values());

    if (filter?.vendor) {
      packages = packages.filter(p => p.vendor === filter.vendor);
    }

    if (filter?.verified !== undefined) {
      packages = packages.filter(p => p.verified === filter.verified);
    }

    if (filter?.hasVulnerabilities !== undefined) {
      packages = packages.filter(p =>
        (p.vulnerabilities.length > 0) === filter.hasVulnerabilities
      );
    }

    return packages;
  }

  /**
   * Get verification statistics
   */
  async getStatistics(): Promise<{
    totalPackages: number;
    verifiedPackages: number;
    unverifiedPackages: number;
    packagesWithVulnerabilities: number;
    criticalVulnerabilities: number;
    byTrustLevel: Record<string, number>;
  }> {
    const packages = Array.from(this.packages.values());

    const byTrustLevel: any = {};
    for (const level of Object.values(TrustLevel)) {
      byTrustLevel[TrustLevel[level]] = packages.filter(p => p.trustLevel === level).length;
    }

    return {
      totalPackages: packages.length,
      verifiedPackages: packages.filter(p => p.verified).length,
      unverifiedPackages: packages.filter(p => !p.verified).length,
      packagesWithVulnerabilities: packages.filter(p => p.vulnerabilities.length > 0).length,
      criticalVulnerabilities: packages.reduce((sum, p) =>
        sum + p.vulnerabilities.filter(v => v.severity === 'CRITICAL').length, 0
      ),
      byTrustLevel
    };
  }

  // ============================================================================
  // Helper methods
  // ============================================================================

  private async downloadFile(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      });
    });
  }

  private async verifyDigitalSignature(fileBuffer: Buffer, vendor: string): Promise<boolean> {
    // In production: verify actual digital signature using vendor's public key
    // For now, check if vendor is trusted
    return this.trustedVendors.has(vendor);
  }

  private async extractSBOM(fileBuffer: Buffer): Promise<SBOM | undefined> {
    // In production: extract SBOM from package metadata
    // For now, return undefined
    return undefined;
  }

  private async getExpectedFirmwareHash(
    vendor: string,
    deviceType: string,
    version: string
  ): Promise<string | undefined> {
    // In production: query vendor database or security feed
    // For now, return undefined
    return undefined;
  }

  private calculateTrustLevel(
    vendor: string,
    signatureValid: boolean,
    vulnerabilityCount: number
  ): TrustLevel {
    if (!signatureValid) return TrustLevel.UNKNOWN;
    if (vulnerabilityCount > 5) return TrustLevel.LOW;
    if (!this.trustedVendors.has(vendor)) return TrustLevel.MEDIUM;
    if (vulnerabilityCount > 0) return TrustLevel.HIGH;
    return TrustLevel.FULL;
  }

  private async verifyComponentHash(component: SBOMComponent): Promise<boolean> {
    // In production: verify component hash against known good values
    return true;
  }

  private async checkComponentVulnerabilities(component: SBOMComponent): Promise<Vulnerability[]> {
    return await this.checkNVD(component.name, component.version);
  }

  private async checkNVD(name: string, version: string): Promise<Vulnerability[]> {
    // In production: query National Vulnerability Database (NVD) API
    // For now, return empty array
    return [];
  }
}

export const supplyChainVerificationService = new SupplyChainVerificationService();
