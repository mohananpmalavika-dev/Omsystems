import type { CredentialResolver } from "../../packages/recorder-sdk/src/transport/recorder-http-client.js";
import { RecorderAuthenticationError } from "../../packages/recorder-sdk/src/core/recorder-driver.types.js";
import { RecorderManager } from "../../packages/recorder-sdk/src/core/recorder-manager.js";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { DeviceCredentialService } from "../services/device-credential-service.js";

export interface RecorderCredentialRecord {
  id?: string;
  tenantId?: string;
  tenant_id?: string;
  deviceId?: string;
  device_id?: string;
  username?: string;
  encryptedSecret?: string;
  encrypted_secret?: string;
  status?: string;
}

export interface RecorderCredentialStore {
  getCurrentDeviceCredential(deviceId: string): Promise<RecorderCredentialRecord | undefined>;
  getDeviceCredential(credentialId: string): Promise<RecorderCredentialRecord | undefined>;
}

export type RecorderSecretDecryptor = (ciphertext: string) => Promise<string>;

/**
 * Resolves only opaque credential references. Plaintext credentials and credentials
 * belonging to another tenant are deliberately rejected.
 *
 * Supported references:
 * - device-credential://<credential-id>
 * - device://<device-id>/credential/current
 */
export class ProductionRecorderCredentialResolver implements CredentialResolver {
  constructor(
    private readonly store: RecorderCredentialStore,
    private readonly decryptSecret: RecorderSecretDecryptor,
  ) {}

  async resolve(credentialRef: string, tenantId: string): Promise<{ username: string; password: string }> {
    const exact = /^device-credential:\/\/([^/?#]+)$/.exec(credentialRef);
    const current = /^device:\/\/([^/?#]+)\/credential\/current$/.exec(credentialRef);

    let record: RecorderCredentialRecord | undefined;
    if (exact?.[1]) {
      record = await this.store.getDeviceCredential(decodeURIComponent(exact[1]));
    } else if (current?.[1]) {
      record = await this.store.getCurrentDeviceCredential(decodeURIComponent(current[1]));
    } else {
      throw new RecorderAuthenticationError("Unsupported opaque recorder credential reference");
    }

    if (!record) {
      throw new RecorderAuthenticationError("Recorder credential was not found");
    }

    const recordTenantId = record.tenantId ?? record.tenant_id;
    if (!recordTenantId || recordTenantId !== tenantId) {
      throw new RecorderAuthenticationError("Recorder credential tenant mismatch");
    }
    if (record.status && record.status !== "active") {
      throw new RecorderAuthenticationError(`Recorder credential is not active (${record.status})`);
    }

    const encryptedSecret = record.encryptedSecret ?? record.encrypted_secret;
    if (!record.username || !encryptedSecret) {
      throw new RecorderAuthenticationError("Recorder credential record is incomplete");
    }

    const password = await this.decryptSecret(encryptedSecret);
    if (!password) {
      throw new RecorderAuthenticationError("Recorder credential decrypted to an empty secret");
    }
    return { username: record.username, password };
  }
}

export function createProductionRecorderManager(store: ControlPlaneStore): RecorderManager {
  const credentialService = new DeviceCredentialService(store);
  const resolver = new ProductionRecorderCredentialResolver(
    store,
    (ciphertext) => credentialService.decryptSecret(ciphertext),
  );
  return new RecorderManager({ credentialResolver: resolver });
}
