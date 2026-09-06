# Performance observability

The control plane starts OpenTelemetry automatically and instruments Fastify and `pg`.

- Prometheus metrics: `http://localhost:9464/metrics`
- Prometheus UI: `http://localhost:9090`
- Grafana: `http://localhost:3001` (default credentials: `admin` / `sentinel-admin`; override them in `.env`)
- Alertmanager: `http://localhost:9093`
- JSON dashboard feed: `/api/observability/performance/snapshot`
- Endpoint percentiles: `/api/observability/performance/endpoints`
- Database percentiles: `/api/observability/performance/queries`
- Browser Core Web Vitals ingestion: `POST /api/observability/web-vitals`
- Grafana dashboard: `grafana/performance-dashboard.json`

Start the full local stack with `docker compose up -d api postgres prometheus alertmanager grafana`. Replace the default Grafana password and configure a real Alertmanager receiver before exposing this stack outside a development network.

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to export traces over OTLP HTTP. Set `OTEL_SDK_DISABLED=true` to disable instrumentation, and `OTEL_SERVICE_NAME` to override the service identity.