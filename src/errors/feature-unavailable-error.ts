export class FeatureUnavailableError extends Error {
  constructor(message?: string) {
    super(message || 'feature_not_implemented');
    this.name = 'FeatureUnavailableError';
  }
}
