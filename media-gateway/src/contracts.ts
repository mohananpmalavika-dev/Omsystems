export interface ConsumedSession {
  id: string;
  cameraId: string;
  cameraNodeId: string;
  userId: string;
  tenantId: string;
  connectionSecretRef: string;
  profiles: Array<{
    name: string;
    codec: string;
    width: number;
    height: number;
  }>;
}

export interface ControlPlaneClient {
  consumeLiveSession(token: string): Promise<ConsumedSession>;
}

export interface MediaRouter {
  ensurePath(path: string, sourceUri: string): Promise<void>;
  removePath(path: string): Promise<void>;
}

export interface StreamSecretProvider {
  resolve(reference: string): Promise<string | undefined>;
}
