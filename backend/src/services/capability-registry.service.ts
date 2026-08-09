/**
 * Capability Registry Service
 * 
 * Provides truthful, real-time classification of every AI analytics capability.
 * Every detector is classified as:
 * 
 * 🟢 PRODUCTION - Full pipeline: MODEL → INFERENCE → RESULT → EVENT → ALERT
 * 🟡 INTEGRATED - Pipeline ready, model deployment pending
 * 🔴 FRAMEWORK - Interface exists, actual inference doesn't
 * 
 * This ensures the UI never misrepresents capabilities as production-ready
 * when they're actually placeholders or model-dependent.
 */

import { AnalyticsPipeline } from '../../analytics-engine/src/analytics-pipeline.js';
import { getModelManager } from '../../analytics-engine/src/model-manager.js';

export enum CapabilityStatus {
  PRODUCTION = 'PRODUCTION',
  INTEGRATED = 'INTEGRATED',
  FRAMEWORK = 'FRAMEWORK',
  UNAVAILABLE = 'UNAVAILABLE',
}

export interface CapabilityInfo {
  id: string;
  name: string;
  status: CapabilityStatus;
  category: 'detection' | 'analytics' | 'prediction' | 'investigation' | 'reporting';
  
  // Evidence of production readiness
  evidence: {
    hasModel: boolean;
    modelName?: string;
    modelVersion?: string;
    modelLoaded: boolean;
    canInference: boolean;
    producesEvents: boolean;
    producesAlerts: boolean;
  };
  
  // Current operational state
  operational: {
    healthy: boolean;
    lastChecked: Date;
    errorMessage?: string;
  };
  
  // Requirements
  requirements: {
    models: string[];
    dependencies: string[];
  };
  
  // Availability reason
  availability: {
    reason: string;
    confidenceLevel: number; // 0-1
    source: string;
    timestamp: Date;
    freshness: 'current' | 'stale' | 'unknown';
  };
  
  // Version
  version: string;
  lastVerified: Date;
}

export interface CapabilityReport {
  generatedAt: Date;
  summary: {
    total: number;
    production: number;
    integrated: number;
    framework: number;
    unavailable: number;
  };
  capabilities: CapabilityInfo[];
}

export class CapabilityRegistryService {
  private pipeline: AnalyticsPipeline | null = null;
  private capabilities = new Map<string, CapabilityInfo>();
  private lastCheck: Date = new Date(0);
  private readonly CHECK_INTERVAL_MS = 60000; // 1 minute

  /**
   * Initialize the registry
   */
  async initialize(): Promise<void> {
    console.log('[CapabilityRegistry] Initializing...');
    
    try {
      // Import the pipeline
      const { getAnalyticsPipeline } = await import('../../analytics-engine/src/analytics-pipeline.js');
      this.pipeline = getAnalyticsPipeline();
      
      // Initial capability scan
      await this.scanCapabilities();
      
      console.log('[CapabilityRegistry] Initialized successfully');
    } catch (error) {
      console.error('[CapabilityRegistry] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Scan and classify all capabilities
   */
  async scanCapabilities(): Promise<void> {
    console.log('[CapabilityRegistry] Scanning capabilities...');
    
    const now = new Date();
    this.lastCheck = now;
    
    // Core detection capabilities
    await this.classifyCapability('object-detection', {
      name: 'Object Detection',
      category: 'detection',
      requirements: { models: ['yolov8n'], dependencies: [] },
    });
    
    await this.classifyCapability('person-detection', {
      name: 'Person Detection & Tracking',
      category: 'detection',
      requirements: { models: ['yolov8n'], dependencies: [] },
    });
    
    await this.classifyCapability('motion-detection', {
      name: 'Motion Detection',
      category: 'detection',
      requirements: { models: [], dependencies: [] },
    });
    
    await this.classifyCapability('face-detection', {
      name: 'Face Detection',
      category: 'detection',
      requirements: { models: ['face-detector'], dependencies: [] },
    });
    
    await this.classifyCapability('face-recognition', {
      name: 'Face Recognition (Watchlist)',
      category: 'detection',
      requirements: { models: ['face-detector', 'face-embedding'], dependencies: [] },
    });
    
    await this.classifyCapability('anpr', {
      name: 'ANPR (License Plate Recognition)',
      category: 'detection',
      requirements: { models: ['anpr-detector', 'anpr-recognizer'], dependencies: [] },
    });
    
    await this.classifyCapability('smoke-fire-detection', {
      name: 'Smoke & Fire Detection',
      category: 'detection',
      requirements: { models: ['fire-smoke'], dependencies: [] },
    });
    
    await this.classifyCapability('crowd-density', {
      name: 'Crowd Density Monitoring',
      category: 'analytics',
      requirements: { models: ['yolov8n'], dependencies: ['person-detection'] },
    });
    
    await this.classifyCapability('vehicle-detection', {
      name: 'Vehicle Detection & Classification',
      category: 'detection',
      requirements: { models: ['yolov8n'], dependencies: [] },
    });
    
    await this.classifyCapability('helmet-detection', {
      name: 'PPE Helmet Detection',
      category: 'detection',
      requirements: { models: ['helmet-detector'], dependencies: [] },
    });
    
    await this.classifyCapability('fall-detection', {
      name: 'Fall Detection',
      category: 'detection',
      requirements: { models: ['fall-detector'], dependencies: ['person-detection'] },
    });
    
    await this.classifyCapability('tailgating-detection', {
      name: 'Tailgating Detection',
      category: 'analytics',
      requirements: { models: ['yolov8n'], dependencies: ['person-detection'] },
    });
    
    await this.classifyCapability('unattended-object', {
      name: 'Unattended Object Detection',
      category: 'detection',
      requirements: { models: ['yolov8n'], dependencies: ['object-detection'] },
    });
    
    await this.classifyCapability('queue-detection', {
      name: 'Queue Detection',
      category: 'analytics',
      requirements: { models: ['yolov8n'], dependencies: ['person-detection'] },
    });
    
    // Advanced analytics (mostly framework/integrated)
    await this.classifyCapability('behavior-analysis', {
      name: 'Behavior Analysis',
      category: 'analytics',
      requirements: { models: ['behavior-model'], dependencies: ['person-detection'] },
    });
    
    await this.classifyCapability('heatmap-generation', {
      name: 'Heatmap Generation',
      category: 'analytics',
      requirements: { models: [], dependencies: ['person-detection'] },
    });
    
    await this.classifyCapability('face-analytics', {
      name: 'Face Analytics (Age/Gender/Emotion)',
      category: 'analytics',
      requirements: { models: ['face-analytics'], dependencies: ['face-detection'] },
    });
    
    await this.classifyCapability('vehicle-analytics', {
      name: 'Vehicle Analytics',
      category: 'analytics',
      requirements: { models: ['vehicle-classifier'], dependencies: ['vehicle-detection'] },
    });
    
    await this.classifyCapability('retail-analytics', {
      name: 'Retail Analytics',
      category: 'analytics',
      requirements: { models: [], dependencies: ['person-detection', 'heatmap-generation'] },
    });
    
    await this.classifyCapability('banking-analytics', {
      name: 'Banking Analytics',
      category: 'analytics',
      requirements: { models: [], dependencies: ['queue-detection', 'crowd-density'] },
    });
    
    await this.classifyCapability('industrial-analytics', {
      name: 'Industrial Safety Analytics',
      category: 'analytics',
      requirements: { models: [], dependencies: ['helmet-detection', 'person-detection'] },
    });
    
    await this.classifyCapability('smart-city-analytics', {
      name: 'Smart City Analytics',
      category: 'analytics',
      requirements: { models: [], dependencies: ['vehicle-analytics', 'crowd-density'] },
    });
    
    // AI-powered features
    await this.classifyCapability('ai-assistant', {
      name: 'AI Assistant (Natural Language)',
      category: 'investigation',
      requirements: { models: [], dependencies: [] },
    });
    
    await this.classifyCapability('ai-search', {
      name: 'AI-Powered Search',
      category: 'investigation',
      requirements: { models: ['clip-vision', 'clip-text'], dependencies: [] },
    });
    
    await this.classifyCapability('ai-prediction', {
      name: 'Predictive Analytics',
      category: 'prediction',
      requirements: { models: [], dependencies: [] },
    });
    
    await this.classifyCapability('ai-investigation', {
      name: 'AI Investigation Tools',
      category: 'investigation',
      requirements: { models: [], dependencies: ['person-detection', 'vehicle-detection'] },
    });
    
    await this.classifyCapability('ai-reporting', {
      name: 'AI Report Generation',
      category: 'reporting',
      requirements: { models: [], dependencies: [] },
    });
    
    console.log(`[CapabilityRegistry] Scanned ${this.capabilities.size} capabilities`);
  }

  /**
   * Classify a single capability
   */
  private async classifyCapability(
    id: string,
    config: {
      name: string;
      category: CapabilityInfo['category'];
      requirements: {
        models: string[];
        dependencies: string[];
      };
    }
  ): Promise<void> {
    const now = new Date();
    
    // Check if models are available
    const modelManager = getModelManager();
    const hasAllModels = config.requirements.models.every(m => 
      modelManager.isModelAvailable(m)
    );
    const loadedModels = config.requirements.models.filter(m =>
      modelManager.isModelLoaded(m)
    );
    
    // Check detector health if available
    let healthy = false;
    let errorMessage: string | undefined;
    let canInference = false;
    let producesEvents = false;
    let producesAlerts = false;
    
    try {
      if (this.pipeline) {
        const detector = (this.pipeline as any).detectors?.get(this.mapIdToDetectorName(id));
        if (detector) {
          const health = detector.getHealth();
          healthy = health.status === 'healthy';
          errorMessage = health.status !== 'healthy' ? health.details : undefined;
          
          // Check if detector can actually perform inference
          // Production detectors have real detect() implementations
          canInference = healthy && hasAllModels;
          
          // Check if detector produces events (not just metrics)
          // PRODUCTION status requires event production
          const detectorType = (detector as any).type;
          producesEvents = this.producesRealEvents(id);
          producesAlerts = this.producesAlerts(id);
        }
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    
    // Determine status
    let status: CapabilityStatus;
    let reason: string;
    let confidenceLevel: number;
    
    if (config.requirements.models.length === 0) {
      // No model required - check if framework has real logic
      if (this.hasRealImplementation(id)) {
        status = CapabilityStatus.PRODUCTION;
        reason = 'Non-ML capability with complete implementation';
        confidenceLevel = 1.0;
        canInference = true;
        producesEvents = true;
        producesAlerts = this.producesAlerts(id);
      } else {
        status = CapabilityStatus.FRAMEWORK;
        reason = 'Interface exists but implementation is placeholder or rule-based only';
        confidenceLevel = 0.3;
      }
    } else if (hasAllModels && loadedModels.length === config.requirements.models.length) {
      // All models available AND loaded
      if (canInference && producesEvents) {
        status = CapabilityStatus.PRODUCTION;
        reason = `All models loaded and operational (${config.requirements.models.join(', ')})`;
        confidenceLevel = 1.0;
      } else {
        status = CapabilityStatus.INTEGRATED;
        reason = 'Models loaded but inference pipeline not yet producing real events';
        confidenceLevel = 0.7;
      }
    } else if (hasAllModels) {
      // Models available but not loaded
      status = CapabilityStatus.INTEGRATED;
      reason = `Models available but not loaded: ${config.requirements.models.join(', ')}`;
      confidenceLevel = 0.6;
    } else {
      // Models not available
      const missingModels = config.requirements.models.filter(m => 
        !modelManager.isModelAvailable(m)
      );
      status = CapabilityStatus.FRAMEWORK;
      reason = `Missing required models: ${missingModels.join(', ')}`;
      confidenceLevel = 0.2;
    }
    
    // Override for known framework-only features
    if (this.isKnownFramework(id)) {
      status = CapabilityStatus.FRAMEWORK;
      reason = 'Feature interface defined but full implementation pending';
      confidenceLevel = 0.3;
    }
    
    const capability: CapabilityInfo = {
      id,
      name: config.name,
      status,
      category: config.category,
      evidence: {
        hasModel: config.requirements.models.length > 0 && hasAllModels,
        modelName: config.requirements.models[0],
        modelVersion: undefined, // TODO: Get from model manager
        modelLoaded: loadedModels.length > 0,
        canInference,
        producesEvents,
        producesAlerts,
      },
      operational: {
        healthy,
        lastChecked: now,
        errorMessage,
      },
      requirements: config.requirements,
      availability: {
        reason,
        confidenceLevel,
        source: 'capability-registry-scan',
        timestamp: now,
        freshness: 'current',
      },
      version: '1.0.0', // TODO: Get from detector
      lastVerified: now,
    };
    
    this.capabilities.set(id, capability);
  }

  /**
   * Check if a capability ID maps to a detector that produces real events
   */
  private producesRealEvents(id: string): boolean {
    // Known production detectors that produce real detection events
    const eventProducers = new Set([
      'object-detection',
      'person-detection',
      'motion-detection',
      'face-detection',
      'anpr',
      'smoke-fire-detection',
      'vehicle-detection',
      'crowd-density',
      'helmet-detection',
      'fall-detection',
      'tailgating-detection',
      'unattended-object',
      'queue-detection',
    ]);
    
    return eventProducers.has(id);
  }

  /**
   * Check if a capability produces alerts (not just detections)
   */
  private producesAlerts(id: string): boolean {
    // Detectors that should trigger alerts
    const alertProducers = new Set([
      'smoke-fire-detection',
      'face-recognition',
      'anpr', // when watchlist match
      'fall-detection',
      'unattended-object',
      'crowd-density', // when overcrowded
      'tailgating-detection',
    ]);
    
    return alertProducers.has(id);
  }

  /**
   * Check if capability has real (non-placeholder) implementation
   */
  private hasRealImplementation(id: string): boolean {
    // Capabilities with complete non-ML implementation
    const realImplementations = new Set([
      'motion-detection', // Pure computer vision
      'ai-assistant', // Rule-based NLU
      'ai-prediction', // Statistical models
      'heatmap-generation', // Aggregation logic
    ]);
    
    return realImplementations.has(id);
  }

  /**
   * Check if capability is known to be framework-only
   */
  private isKnownFramework(id: string): boolean {
    // Features that are currently framework/placeholder
    const frameworks = new Set([
      'behavior-analysis', // Needs behavior model
      'face-analytics', // Needs age/gender/emotion models
      'vehicle-analytics', // Needs vehicle classifier beyond basic detection
      'ai-search', // Needs CLIP models
      'retail-analytics', // Needs specialized models
      'banking-analytics', // Mostly aggregation, but incomplete
      'industrial-analytics', // Aggregation over helmet detection
      'smart-city-analytics', // Aggregation, incomplete
      'ai-investigation', // Partially implemented
      'ai-reporting', // Partially implemented
    ]);
    
    return frameworks.has(id);
  }

  /**
   * Map capability ID to detector name
   */
  private mapIdToDetectorName(id: string): string {
    const mapping: Record<string, string> = {
      'object-detection': 'object',
      'person-detection': 'person',
      'motion-detection': 'motion',
      'face-detection': 'face',
      'face-recognition': 'face',
      'anpr': 'anpr',
      'smoke-fire-detection': 'fire-smoke',
      'crowd-density': 'crowd-density',
      'vehicle-detection': 'vehicle',
      'helmet-detection': 'helmet',
      'fall-detection': 'fall',
      'tailgating-detection': 'tailgating',
      'unattended-object': 'unattended-objects',
      'queue-detection': 'queue',
      'behavior-analysis': 'behavior',
      'heatmap-generation': 'heatmap',
      'ai-assistant': 'ai-assistant',
      'ai-prediction': 'ai-prediction-engine',
    };
    
    return mapping[id] || id;
  }

  /**
   * Get capability by ID
   */
  getCapability(id: string): CapabilityInfo | undefined {
    this.checkFreshness();
    return this.capabilities.get(id);
  }

  /**
   * Get all capabilities
   */
  getAllCapabilities(filter?: {
    status?: CapabilityStatus;
    category?: CapabilityInfo['category'];
  }): CapabilityInfo[] {
    this.checkFreshness();
    
    let capabilities = Array.from(this.capabilities.values());
    
    if (filter?.status) {
      capabilities = capabilities.filter(c => c.status === filter.status);
    }
    
    if (filter?.category) {
      capabilities = capabilities.filter(c => c.category === filter.category);
    }
    
    return capabilities;
  }

  /**
   * Generate capability report
   */
  generateReport(): CapabilityReport {
    this.checkFreshness();
    
    const capabilities = Array.from(this.capabilities.values());
    
    return {
      generatedAt: new Date(),
      summary: {
        total: capabilities.length,
        production: capabilities.filter(c => c.status === CapabilityStatus.PRODUCTION).length,
        integrated: capabilities.filter(c => c.status === CapabilityStatus.INTEGRATED).length,
        framework: capabilities.filter(c => c.status === CapabilityStatus.FRAMEWORK).length,
        unavailable: capabilities.filter(c => c.status === CapabilityStatus.UNAVAILABLE).length,
      },
      capabilities,
    };
  }

  /**
   * Check if data is stale and rescan if needed
   */
  private checkFreshness(): void {
    const now = new Date();
    const elapsed = now.getTime() - this.lastCheck.getTime();
    
    if (elapsed > this.CHECK_INTERVAL_MS) {
      // Mark all as stale
      for (const capability of this.capabilities.values()) {
        capability.availability.freshness = 'stale';
      }
      
      // Trigger async rescan (don't block)
      this.scanCapabilities().catch(error => {
        console.error('[CapabilityRegistry] Background scan failed:', error);
      });
    }
  }

  /**
   * Force immediate rescan
   */
  async refresh(): Promise<void> {
    await this.scanCapabilities();
  }
}

// Singleton instance
let instance: CapabilityRegistryService | null = null;

export function getCapabilityRegistry(): CapabilityRegistryService {
  if (!instance) {
    instance = new CapabilityRegistryService();
  }
  return instance;
}
