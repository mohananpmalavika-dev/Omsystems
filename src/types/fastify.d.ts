import type { FastifyRequest } from "fastify";
import type { ControlPlaneStore } from "../control-plane-store.js";

declare module "fastify" {
  interface FastifyInstance {
    store: ControlPlaneStore;
    authenticateRequest: (request: FastifyRequest) => Promise<any>;
  }
}
