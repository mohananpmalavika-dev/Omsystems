import { z } from "zod";
import { buildAnalyticsEngine, createControlPlaneSubmitter } from "./app.js";

const serviceUrl = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`;
}, z.string().url());

const config = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8092),
  CONTROL_PLANE_URL: serviceUrl,
  ANALYTICS_ENGINE_SHARED_KEY: z.string().min(32),
  ANALYTICS_SOURCE_SHARED_KEY: z.string().min(32),
  INCIDENT_API_URL: serviceUrl.optional(),
  INCIDENT_API_KEY: z.string().min(32).optional(),
}).superRefine((value, context) => {
  if (Boolean(value.INCIDENT_API_URL) !== Boolean(value.INCIDENT_API_KEY)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "INCIDENT_API_URL and INCIDENT_API_KEY must be configured together",
    });
  }
}).parse(process.env);

const app = buildAnalyticsEngine({
  sourceSharedKey: config.ANALYTICS_SOURCE_SHARED_KEY,
  controlPlaneSharedKey: config.ANALYTICS_ENGINE_SHARED_KEY,
  controlPlaneUrl: config.CONTROL_PLANE_URL,
  submit: createControlPlaneSubmitter({
    controlPlaneUrl: config.CONTROL_PLANE_URL,
    sharedKey: config.ANALYTICS_ENGINE_SHARED_KEY,
    fallbackSharedKey: config.ANALYTICS_SOURCE_SHARED_KEY,
  }),
  logger: true,
  ...(config.INCIDENT_API_URL && config.INCIDENT_API_KEY
    ? { incidentIntegration: { url: config.INCIDENT_API_URL, apiKey: config.INCIDENT_API_KEY } }
    : {}),
});

await app.listen({ host: config.HOST, port: config.PORT });
process.once("SIGTERM", () => void app.close());
process.once("SIGINT", () => void app.close());
