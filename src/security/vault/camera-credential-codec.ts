import { CentralStreamVault } from "./central-stream-vault.js";

export function encryptCameraPassword(id: string, password: string): string {
  return new CentralStreamVault().encrypt(`camera-credential:${id}`, password);
}

export function readCameraPassword(row: { id: string; password_encrypted?: string | null; password?: string | null }): string {
  if (row.password_encrypted) {
    return new CentralStreamVault().decrypt(`camera-credential:${row.id}`, row.password_encrypted);
  }
  return row.password ?? "";
}
