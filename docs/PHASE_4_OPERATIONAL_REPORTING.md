# Phase 4: Operational reporting

Phase 4 adds persistent daily surveillance reports to the control plane. It uses the same tenant, branch authorization, operational-health projection, actual recording-segment retention verification, and analytics-alert data as the live dashboards.

## Delivered scope

- Persistent schedules with recipients, IANA timezone, daily time, formats, filters, last run and next run.
- Seven report templates: comprehensive, branch health, camera availability, alert summary, DVR/NVR status, HDD health and retention compliance.
- Asynchronous manual and scheduled runs with progress, retry state, terminal dead state, row totals and reconciled summary totals.
- Branch, camera, recorder, disk, internet, retention, analytics-alert, acknowledgement, escalation and SLA exception data.
- CSV, multi-sheet XLSX and PDF artifacts with SHA-256 checksums and configurable archive retention (365 days by default).
- Tenant-authorized, HMAC-signed downloads with download audit events and storage-path confinement.
- Email provider delivery outbox with attempt history, provider IDs, exponential retry, terminal dead state, and signed artifact links.
- Database leases recover generation and delivery work abandoned by an interrupted process.
- Dashboard controls for run-now, saved schedules, filters, run progress, delivery status and downloads.

## Runtime configuration

| Variable | Purpose |
| --- | --- |
| `REPORT_EXPORT_ROOT` | Artifact filesystem root. Use durable shared storage in multi-instance deployments. |
| `REPORT_DOWNLOAD_SECRET` | HMAC secret for expiring artifact links. Required as a strong secret in production. |
| `REPORT_PUBLIC_BASE_URL` | External control-plane origin added to links sent to the email provider. |
| `REPORT_ARCHIVE_RETENTION_DAYS` | Number of days generated artifacts remain downloadable. Defaults to 365. |
| `REPORT_EMAIL_WEBHOOK_URL` | Email provider adapter endpoint. |
| `REPORT_EMAIL_PROVIDER_TOKEN` | Optional bearer token for the provider adapter. |
| `REPORT_WORKER_SHARED_KEY` | Identity key for the protected manual drain endpoint. |

The application drains the queue every 30 seconds. An external scheduler may also call `POST /internal/reports/operational/drain` with `x-report-worker-key` so queue processing can be separated from web instances.

## API

- `GET|POST /v1/reports/operational/schedules`
- `GET /v1/reports/operational/templates`
- `PATCH|DELETE /v1/reports/operational/schedules/:id`
- `GET|POST /v1/reports/operational/runs`
- `GET /v1/reports/operational/runs/:id`
- `GET /v1/reports/operational/artifacts/:id/download`

All public endpoints require `analytics:export`. A branch filter is accepted only when the requester can view that branch. Downloads also require the current authenticated tenant to own the artifact.

## Validation

`npm run test:phase4` verifies schedule persistence, health and alert reconciliation, email delivery history, signed CSV/XLSX/PDF downloads and a 5,000-camera report window. `npm run ci:phase4` includes every earlier phase gate plus the Phase 4 suite.
