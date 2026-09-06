import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

let sdk: NodeSDK | undefined;

export async function initializeTelemetry(): Promise<void> {
  if (sdk || process.env.OTEL_SDK_DISABLED === "true") return;

  if (process.env.OTEL_LOG_LEVEL === "debug") {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const metricsPort = Number(process.env.OTEL_PROMETHEUS_PORT ?? 9464);
  const metricReader = new PrometheusExporter({
    port: Number.isInteger(metricsPort) && metricsPort > 0 ? metricsPort : 9464,
    endpoint: "/metrics",
  });
  const traceExporter = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? new OTLPTraceExporter({ url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, "")}/v1/traces` })
    : undefined;

  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "sentinel-control-plane",
    metricReader,
    ...(traceExporter ? { traceExporter } : {}),
    instrumentations: [getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
    })],
  });

  await sdk.start();
  process.once("SIGTERM", () => {
    void sdk?.shutdown();
  });
}