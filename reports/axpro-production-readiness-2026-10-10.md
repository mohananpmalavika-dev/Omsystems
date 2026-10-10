# AX PRO readiness — 10 October 2026

**Application integration hardened; live receiver/panel acceptance pending.** No production deployment or device configuration was performed.

Panel observed in supplied screenshots: DS-PWA64-L-WB, V1.3.0 build 250430. ARC page is unconfigured and currently selects ADM-CID over TCP. Its server address, listening port, account code and panel LAN IP are unknown.

Implemented verified-session/tenant administration, branch ownership checks, canonical database/TLS access, bounded vault/device requests, digest negotiation, signed receiver ingestion, durable deduplication and atomic event/counter/cursor commits. Added optional replica-safe polling, source-device health recording, pause/enable controls, corrected disarm/restoration/fire/smoke mappings, schema prerequisites/runtime migration, Compose settings and a receiver-side signed forwarding hook.

## Verification

- **78 tests passed** across AX PRO transport/mapping/service/API/forwarding tests and the existing device-discovery suite. XML zone/event identities retain leading zeroes; forwarding signs original bytes and preserves queued files on failures.
- Targeted migrations passed on disposable PostgreSQL 17: fresh dependency ordering, replay, normalized severity, durable deduplication, cursor columns and advisory locks.
- **Backend production build passed** (`npm run build`), including TypeScript compilation.
- **Dashboard production build and separate typecheck passed** (`npm run dashboard:build`, then `npm run dashboard:typecheck`). The earlier parallel check raced Next.js generated files; the sequential rerun passed. Next.js emits an existing warning about the parent `C:/Omsystems/package.json` being outside this Git repository.
- Both production Compose templates passed `config --no-interpolate --quiet` validation.
- Forwarding script syntax check passed. No event was sent to a real receiver or production endpoint.

## Required before live activation

1. Deploy/identify a receiver compatible with the panel's ADM-CID/SIA DC-09 mode and obtain its reachable address, TCP port and unique account code.
2. Wire that receiver's durable decoded-event queue to `scripts/axpro-forward-event.mjs`. This repository supplies the HTTPS hook, not a raw DC-09 listener/native ACK implementation or Hik-Partner Pro cloud connector.
3. Apply migrations and private vault/receiver-secret settings; create the tenant/branch integration and approve the hub/verified zone identities.
4. If ISAPI polling is wanted, establish private panel routing and verify this firmware's actual endpoints. Streaming/paginated vendor endpoints need an appropriate bridge or receiver-push workflow.
5. Test physical alarm/restoration, arm/disarm, faults/tamper/power, heartbeat supervision, reconnect/retry, duplicate delivery, zone attribution and the intended control-room/notification workflow.

Detailed instructions and screenshot field mapping: [AX PRO deployment guide](../docs/axpro-production-integration.md). Private configuration template: [AX PRO environment example](../deploy/axpro.env.example).
