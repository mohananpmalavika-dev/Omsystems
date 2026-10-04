# Storage summary capacity correction — 4 October 2026

The Storage & Disks summary counted healthy disks but summed capacity and
usage across all disk reports. This caused “1 Healthy (9.9 TB)” even though
the healthy recorder reported 1,971,123,650,560 bytes (displayed as 2.0 TB).
The 9.9 TB included full disks and two Hajipur device IDs reporting the same
3,951,451,701,248-byte disk. Historical telemetry was also summed despite
being excluded from the healthy count.

`dashboard/app/api/operations/storage/route.ts` now filters each medium's
aggregate through the existing healthy/current-storage predicate. Count,
capacity and usage therefore describe the same disk population. Individual
disk reports stay visible for diagnosis. When no disks qualify, the capacity
is Unavailable. No telemetry records or recording settings were modified.

All 16 storage API tests pass, including regressions for the reported mix of
healthy, stale, full and duplicate critical disk reports, and for an entirely
unavailable inventory. Dashboard typecheck and git whitespace checks pass.

Commit `71ae3f73` was picked up by an existing server deployment during
verification. The separate prepared deployment stopped at its source hash
guard without overwriting that deployment. The existing deployment built
and activated the dashboard with this correction.

Final authenticated live API verification returned HTTP 200. For the test
account's accessible branches, zero healthy HDDs now returns capacity and
usage `Unavailable`, replacing the erroneous historical 7.9 TB total seen
before activation. The five obsolete/failed reports remain visible. The
healthy pilot disk scenario is covered by the 2.0 TB regression test; the
test account does not have access to the pilot branch. Browser rendering
was not separately exercised; the existing page directly displays these
summary fields and refreshes every 20 seconds.
