export interface ObservabilityService {
  record(event: string, details?: Record<string, unknown>): void;
}

export function createObservabilityService(): ObservabilityService {
  return {
    record(event: string, details?: Record<string, unknown>) {
      void event;
      void details;
    }
  };
}
