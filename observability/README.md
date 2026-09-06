# Performance observability

The control plane starts OpenTelemetry automatically and instruments Fastify and `pg`.

- Prometheus metrics: `http://localhost:9464/metrics`
- JSON dashboard feed: `/api/observability/performance/snapshot`
- Endpoint percentiles: `/api/observability/performance/endpoints`
- Database percentiles: `/api/observability/performance/queries`
- Browser Core Web Vitals ingestion: `POST /api/observability/web-vitals`
- Grafana dashboard: `grafana/performance-dashboard.json`

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to export traces over OTLP HTTP. Set `OTEL_SDK_DISABLED=true` to disable instrumentation, and `OTEL_SERVICE_NAME` to override the service identity.