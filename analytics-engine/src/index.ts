import { z } from "zod";
import { buildAnalyticsEngine, createControlPlaneSubmitter } from "./app.js";

const config = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8092),
  CONTROL_PLANE_URL: z.string().url(),
  ANALYTICS_ENGINE_SHARED_KEY: z.string().min(32),
  ANALYTICS_SOURCE_SHARED_KEY: z.string().min(32),
}).parse(process.env);

const app = buildAnalyticsEngine({
  sourceSharedKey: config.ANALYTICS_SOURCE_SHARED_KEY,
  controlPlaneSharedKey: config.ANALYTICS_ENGINE_SHARED_KEY,
  submit: createControlPlaneSubmitter({
    controlPlaneUrl: config.CONTROL_PLANE_URL,
    sharedKey: config.ANALYTICS_ENGINE_SHARED_KEY,
  }),
  logger: true,
});

await app.listen({ host: config.HOST, port: config.PORT });
process.once("SIGTERM", () => void app.close());
process.once("SIGINT", () => void app.close());
