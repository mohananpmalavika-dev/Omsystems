/**
 * Linux TPM 2.0 Attestation Provider
 * Uses tpm2-tools for TPM operations on Linux platforms
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  AttestationProvider,
  AttestationIdentity,
  AttestationChallenge,
  TpmQuoteEvidence,
  AttestationError
} from './attestation-provider.interface.js';

const execAsync = promisify(exec);

export class LinuxTpmProvider implements AttestationProvider {
  private akContextPath: string = '/var/lib/sentinel-agent/ak.ctx';
  private akPublicPath: string = '/var/lib/sentinel-agent/ak.pub';
  private akPemPath: string = '/var/lib/sentinel-agent/ak.pem';

  constructor(
    private config?: {
      akContextPath?: string;
      akPublicPath?: string;
      akPemPath?: string;
    }
  ) {
    if (config?.akContextPath) this.akContextPath = config.akContextPath;
    if (config?.akPublicPath) this.akPublicPath = config.akPublicPath;
    if (config?.akPemPath) this.akPemPath = config.akPemPath;
  }

  /**
   * Check if TPM 2.0 is available
   */
  async isSupported(): Promise<boolean> {
    try {
      // Check if tpm2-tools is available
      await execAsync('which tpm2_createak');
      
      // Check if TPM device exists
      await execAsync('ls /dev/tpm0 || ls /dev/tpmrm0');
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get or create attestation identity
   */
  async getIdentity(): Promise<AttestationIdentity> {
    try {
      // Check if AK already exists
      const akExists = await this.akExists();

      if (!akExists) {
        await this.createAk();
      }

      // Read AK public key in PEM format
      const akPublicKeyPem = await fs.readFile(this.akPemPath, 'utf-8');

      // Get TPM info
      const tpmInfo = await this.getTpmInfo();

      const identity: AttestationIdentity = {
        akPublicKeyPem,
        tpmManufacturer: tpmInfo.manufacturer,
        tpmFirmwareVersion: tpmInfo.firmwareVersion
      };
      if (tpmInfo.akName !== undefined) {
        identity.akName = tpmInfo.akName;
      }
      return identity;
    } catch (error: any) {
      throw new AttestationError(
        'Failed to get attestation identity',
        'IDENTITY_ERROR',
        error
      );
    }
  }

  /**
   * Generate TPM quote
   */
  async quote(challenge: AttestationChallenge): Promise<TpmQuoteEvidence> {
    try {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tpm-quote-'));

      try {
        const quotePath = path.join(tmpDir, 'quote.bin');
        const sigPath = path.join(tmpDir, 'signature.bin');
        const pcrPath = path.join(tmpDir, 'pcrs.bin');

        // Build PCR list
        const pcrList = challenge.pcrSelection.pcrs.join(',');
        const hashAlgo = challenge.pcrSelection.hashAlgorithm;

        // Generate quote
        const quoteCmd = `tpm2_quote \
          -c ${this.akContextPath} \
          -l ${hashAlgo}:${pcrList} \
          -q ${challenge.nonce} \
          -m ${quotePath} \
          -s ${sigPath} \
          -o ${pcrPath}`;

        await execAsync(quoteCmd);

        // Read quote and signature
        const quoteBuffer = await fs.readFile(quotePath);
        const signatureBuffer = await fs.readFile(sigPath);

        // Read PCR values
        const pcrValues = await this.readPcrValues(
          challenge.pcrSelection.pcrs,
          hashAlgo
        );

        // Get secure boot state
        const secureBootState = await this.getSecureBootState();

        const evidence: TpmQuoteEvidence = {
          quote: quoteBuffer.toString('base64'),
          signature: signatureBuffer.toString('base64'),
          pcrSelection: challenge.pcrSelection,
          pcrValues,
        };
        if (secureBootState !== null) {
          evidence.secureBootState = secureBootState;
        }
        return evidence;
      } finally {
        // Cleanup temp files
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    } catch (error: any) {
      throw new AttestationError(
        'Failed to generate TPM quote',
        'QUOTE_GENERATION_ERROR',
        error
      );
    }
  }

  /**
   * Get secure boot state
   */
  async getSecureBootState(): Promise<{ enabled: boolean; mode?: string } | null> {
    try {
      // Read SecureBoot UEFI variable
      const { stdout } = await execAsync(
        'mokutil --sb-state 2>/dev/null || echo "unknown"'
      );

      const enabled = stdout.toLowerCase().includes('enabled');

      const result: { enabled: boolean; mode?: string } = {
        enabled,
      };
      if (enabled) {
        result.mode = 'USER';
      }
      return result;
    } catch (error) {
      // SecureBoot info not available
      return null;
    }
  }

  /**
   * Get measured boot log
   */
  async getMeasuredBootLog(): Promise<Buffer | null> {
    try {
      // Try to read TCG event log
      const logPaths = [
        '/sys/kernel/security/tpm0/binary_bios_measurements',
        '/sys/kernel/security/ima/binary_runtime_measurements'
      ];

      for (const logPath of logPaths) {
        try {
          return await fs.readFile(logPath);
        } catch {
          continue;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if AK exists
   */
  private async akExists(): Promise<boolean> {
    try {
      await fs.access(this.akContextPath);
      await fs.access(this.akPemPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create Attestation Key
   */
  private async createAk(): Promise<void> {
    console.log('Creating TPM Attestation Key...');

    // Ensure directory exists
    const dir = path.dirname(this.akContextPath);
    await fs.mkdir(dir, { recursive: true });

    // Create AK
    const cmd = `tpm2_createak \
      -C e \
      -c ${this.akContextPath} \
      -u ${this.akPublicPath} \
      -f pem \
      -o ${this.akPemPath}`;

    await execAsync(cmd);

    console.log('✓ Attestation Key created');
  }

  /**
   * Read PCR values
   */
  private async readPcrValues(
    pcrs: number[],
    hashAlgo: string
  ): Promise<Record<string, string>> {
    const pcrList = pcrs.join(',');
    const { stdout } = await execAsync(
      `tpm2_pcrread ${hashAlgo}:${pcrList}`
    );

    const pcrValues: Record<string, string> = {};

    // Parse output like:
    // sha256:
    //   0 : 0xA13F2E5B...
    //   2 : 0xB84DC7A1...
    const lines = stdout.split('\n');
    let currentAlgo = '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.endsWith(':')) {
        currentAlgo = trimmed.slice(0, -1);
      } else if (trimmed && currentAlgo === hashAlgo) {
        const match = trimmed.match(/^(\d+)\s*:\s*(?:0x)?([0-9A-Fa-f]+)$/);
        if (match) {
          const [, pcrStr, value] = match;
          if (pcrStr && value) {
            pcrValues[pcrStr] = value.toLowerCase();
          }
        }
      }
    }

    return pcrValues;
  }

  /**
   * Get TPM information
   */
  private async getTpmInfo(): Promise<{
    manufacturer: string;
    firmwareVersion: string;
    akName?: string;
  }> {
    try {
      const { stdout } = await execAsync('tpm2_getcap properties-fixed');

      let manufacturer = 'Unknown';
      let firmwareVersion = 'Unknown';

      // Parse TPM properties
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.includes('TPM2_PT_MANUFACTURER')) {
          const match = line.match(/:\s*(.+)$/);
          if (match?.[1]) manufacturer = match[1].trim();
        }
        if (line.includes('TPM2_PT_FIRMWARE_VERSION')) {
          const match = line.match(/:\s*(.+)$/);
          if (match?.[1]) firmwareVersion = match[1].trim();
        }
      }

      // Get AK name if available
      let akName: string | undefined;
      try {
        const { stdout: nameOut } = await execAsync(
          `tpm2_readpublic -c ${this.akContextPath} | grep "name:"`
        );
        const match = nameOut.match(/name:\s*(.+)$/);
        if (match?.[1]) akName = match[1].trim();
      } catch {
        // AK name not available
      }

      const result: {
        manufacturer: string;
        firmwareVersion: string;
        akName?: string;
      } = {
        manufacturer,
        firmwareVersion,
      };
      if (akName !== undefined) {
        result.akName = akName;
      }
      return result;
    } catch (error) {
      return {
        manufacturer: 'Unknown',
        firmwareVersion: 'Unknown'
      };
    }
  }
}
