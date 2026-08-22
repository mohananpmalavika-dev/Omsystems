import type { ApiFamily, RecorderOperation } from "../types/recorder-profile.types.js";

export interface RecorderRequest {
  recorderId: string;
  host: string;
  port: number;
  secure?: boolean | undefined;
  username?: string | undefined;
  password?: string | undefined;
  rtspPort?: number | undefined;
  timeoutMs?: number | undefined;
  params?: Record<string, unknown> | undefined;
}

export interface RecorderAdapter {
  readonly family: ApiFamily;
  execute<T>(operation: RecorderOperation, req: RecorderRequest): Promise<T>;
}
