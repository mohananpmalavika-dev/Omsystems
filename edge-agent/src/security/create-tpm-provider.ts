/**
 * TPM Provider Factory for Edge Agent
 * Automatically resolves Windows or Linux hardware TPM provider based on runtime platform
 */

import os from 'os';
import { AttestationProvider } from './attestation-provider.interface.js';
import { LinuxTpmProvider } from './linux-tpm-provider.js';
import { WindowsTpmProvider } from './windows-tpm-provider.js';

export function createPlatformTpmProvider(): AttestationProvider {
  if (os.platform() === 'win32') {
    return new WindowsTpmProvider();
  }
  return new LinuxTpmProvider();
}
