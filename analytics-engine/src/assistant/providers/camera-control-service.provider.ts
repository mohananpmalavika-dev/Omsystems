/**
 * Camera Control Service Provider
 * 
 * Implements camera start/stop with verification by polling camera state.
 * Integrates with existing camera control APIs.
 */

import type {
  CameraControlService,
  CameraOperationResult,
  CameraControlResult,
  CameraService
} from '../services/camera-service.interface.js';
import { CameraStatus } from '../services/camera-service.interface.js';

/**
 * Camera Control Service Provider Implementation
 */
export class CameraControlServiceProvider implements CameraControlService {
  constructor(
    private readonly cameraService: CameraService,
    private readonly cameraApi: CameraApiClient,
    private readonly pollInterval: number = 1000,
    private readonly defaultTimeout: number = 10000
  ) {}
  
  async startAndVerify(
    cameraId: string,
    options?: { timeoutMs?: number; idempotencyKey?: string }
  ): Promise<CameraControlResult> {
    const timeoutMs = options?.timeoutMs || this.defaultTimeout;
    const startTime = Date.now();
    
    // Get initial state
    const initialState = await this.cameraService.getRuntimeState(cameraId);
    
    // If already running, return success immediately
    if (initialState.status === CameraStatus.ONLINE && initialState.streamConnected) {
      return {
        operationId: 'n/a',
        cameraId,
        requestedState: CameraStatus.ONLINE,
        previousState: initialState.status,
        accepted: true,
        verified: true,
        finalState: CameraStatus.ONLINE,
        streamConnected: true
      };
    }
    
    try {
      // Send start command through camera API
      const operation = await this.cameraApi.startCamera(cameraId, {
        idempotencyKey: options?.idempotencyKey
      });
      
      if (!operation.success) {
        return {
          operationId: operation.id || 'unknown',
          cameraId,
          requestedState: CameraStatus.ONLINE,
          previousState: initialState.status,
          accepted: false,
          reason: operation.error || 'Camera start request rejected',
          verified: false,
          finalState: initialState.status,
          streamConnected: false
        };
      }
      
      // Poll for verification
      const maxAttempts = Math.floor(timeoutMs / this.pollInterval);
      let attempts = 0;
      
      while (attempts < maxAttempts) {
        if (Date.now() - startTime >= timeoutMs) {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, this.pollInterval));
        
        const currentState = await this.cameraService.getRuntimeState(cameraId);
        
        // Check if camera reached running state
        if (currentState.status === CameraStatus.ONLINE && currentState.streamConnected) {
          return {
            operationId: operation.id || 'unknown',
            cameraId,
            requestedState: CameraStatus.ONLINE,
            previousState: initialState.status,
            accepted: true,
            verified: true,
            finalState: CameraStatus.ONLINE,
            streamConnected: true
          };
        }
        
        // Check for error state
        if (currentState.status === CameraStatus.ERROR) {
          return {
            operationId: operation.id || 'unknown',
            cameraId,
            requestedState: CameraStatus.ONLINE,
            previousState: initialState.status,
            accepted: true,
            verified: false,
            finalState: CameraStatus.ERROR,
            streamConnected: false,
            reason: 'Camera entered error state during startup'
          };
        }
        
        attempts++;
      }
      
      // Timeout - command accepted but not verified
      const finalState = await this.cameraService.getRuntimeState(cameraId);
      
      return {
        operationId: operation.id || 'unknown',
        cameraId,
        requestedState: CameraStatus.ONLINE,
        previousState: initialState.status,
        accepted: true,
        verified: false,
        finalState: finalState.status,
        streamConnected: finalState.streamConnected,
        reason: 'Verification timeout - camera may still be starting'
      };
      
    } catch (error) {
      console.error('[CameraControlService] Error starting camera:', error);
      
      return {
        operationId: 'error',
        cameraId,
        requestedState: 'ONLINE',
        previousState: initialState.status,
        accepted: false,
        reason: error.message || 'Camera control service error',
        verified: false,
        finalState: initialState.status,
        streamConnected: false
      };
    }
  }
  
  async stopAndVerify(
    cameraId: string,
    options?: { timeoutMs?: number; idempotencyKey?: string }
  ): Promise<CameraControlResult> {
    const timeoutMs = options?.timeoutMs || this.defaultTimeout;
    const startTime = Date.now();
    
    // Get initial state
    const initialState = await this.cameraService.getRuntimeState(cameraId);
    
    // If already stopped, return success immediately
    if (initialState.status === 'OFFLINE') {
      return {
        operationId: 'n/a',
        cameraId,
        requestedState: 'OFFLINE',
        previousState: initialState.status,
        accepted: true,
        verified: true,
        finalState: 'OFFLINE',
        streamConnected: false
      };
    }
    
    try {
      // Send stop command
      const operation = await this.cameraApi.stopCamera(cameraId, {
        idempotencyKey: options?.idempotencyKey
      });
      
      if (!operation.success) {
        return {
          operationId: operation.id || 'unknown',
          cameraId,
          requestedState: 'OFFLINE',
          previousState: initialState.status,
          accepted: false,
          reason: operation.error || 'Camera stop request rejected',
          verified: false,
          finalState: initialState.status,
          streamConnected: initialState.streamConnected
        };
      }
      
      // Poll for verification
      const maxAttempts = Math.floor(timeoutMs / this.pollInterval);
      let attempts = 0;
      
      while (attempts < maxAttempts) {
        if (Date.now() - startTime >= timeoutMs) {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, this.pollInterval));
        
        const currentState = await this.cameraService.getRuntimeState(cameraId);
        
        if (currentState.status === 'OFFLINE') {
          return {
            operationId: operation.id || 'unknown',
            cameraId,
            requestedState: 'OFFLINE',
            previousState: initialState.status,
            accepted: true,
            verified: true,
            finalState: 'OFFLINE',
            streamConnected: false
          };
        }
        
        attempts++;
      }
      
      // Timeout
      const finalState = await this.cameraService.getRuntimeState(cameraId);
      
      return {
        operationId: operation.id || 'unknown',
        cameraId,
        requestedState: 'OFFLINE',
        previousState: initialState.status,
        accepted: true,
        verified: false,
        finalState: finalState.status,
        streamConnected: finalState.streamConnected,
        reason: 'Verification timeout - camera may still be stopping'
      };
      
    } catch (error) {
      console.error('[CameraControlService] Error stopping camera:', error);
      
      return {
        operationId: 'error',
        cameraId,
        requestedState: 'OFFLINE',
        previousState: initialState.status,
        accepted: false,
        reason: error.message || 'Camera control service error',
        verified: false,
        finalState: initialState.status,
        streamConnected: initialState.streamConnected
      };
    }
  }
  
  async restart(
    cameraId: string,
    options?: { timeoutMs?: number; idempotencyKey?: string }
  ): Promise<CameraControlResult> {
    // Stop first, then start
    const stopResult = await this.stopAndVerify(cameraId, options);
    
    if (!stopResult.verified) {
      return stopResult;
    }
    
    return this.startAndVerify(cameraId, options);
  }
  
  async start(cameraId: string): Promise<CameraOperationResult> {
    const initialState = await this.cameraService.getRuntimeState(cameraId);
    
    try {
      const operation = await this.cameraApi.startCamera(cameraId);
      
      return {
        operationId: operation.id || 'unknown',
        cameraId,
        requestedState: 'ONLINE',
        previousState: initialState.status,
        accepted: operation.success,
        reason: operation.error
      };
    } catch (error) {
      return {
        operationId: 'error',
        cameraId,
        requestedState: 'ONLINE',
        previousState: initialState.status,
        accepted: false,
        reason: error.message
      };
    }
  }
  
  async stop(cameraId: string): Promise<CameraOperationResult> {
    const initialState = await this.cameraService.getRuntimeState(cameraId);
    
    try {
      const operation = await this.cameraApi.stopCamera(cameraId);
      
      return {
        operationId: operation.id || 'unknown',
        cameraId,
        requestedState: 'OFFLINE',
        previousState: initialState.status,
        accepted: operation.success,
        reason: operation.error
      };
    } catch (error) {
      return {
        operationId: 'error',
        cameraId,
        requestedState: 'OFFLINE',
        previousState: initialState.status,
        accepted: false,
        reason: error.message
      };
    }
  }
}

/**
 * Camera API Client Interface
 * 
 * This should match your existing camera control API.
 * Adapt to your actual implementation.
 */
export interface CameraApiClient {
  startCamera(
    cameraId: string,
    options?: { idempotencyKey?: string }
  ): Promise<{
    success: boolean;
    id?: string;
    error?: string;
  }>;
  
  stopCamera(
    cameraId: string,
    options?: { idempotencyKey?: string }
  ): Promise<{
    success: boolean;
    id?: string;
    error?: string;
  }>;
}
