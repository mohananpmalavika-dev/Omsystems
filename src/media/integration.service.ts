import type { ControlPlaneStore } from "../control-plane-store.js";

export function getMediaIntegrationService(store: ControlPlaneStore) {
  return {
    async initialize() {
      // noop stub
      return;
    },
  };
}
