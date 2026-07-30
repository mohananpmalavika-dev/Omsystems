# Digital Twin deployment

Use the current deployment contract in [`docs/DIGITAL_TWIN.md`](docs/DIGITAL_TWIN.md#storage-and-deployment).

In short: apply migrations 037, 040 and 041, configure `DIGITAL_TWIN_ASSET_ROOT` on private persistent storage, deploy the main control plane and dashboard, and verify with `test/digital-twin.test.ts`. The old unregistered Express/Socket.IO deployment instructions are obsolete.
