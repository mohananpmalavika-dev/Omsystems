# Report and query audit ? 23 October 2026

This is a source-level review of the control-plane reporting paths and their query repositories. It is not a certification of every SQL statement in the repository or a production performance benchmark. Existing unrelated workspace changes were preserved. No database migrations were applied.

## Changes made

| Area | Finding | Correction |
| --- | --- | --- |
| Summary/export reports | Analytics visibility was applied after the row limit, potentially hiding permitted events behind other cameras' alerts | Pass permitted camera IDs to the repository before LIMIT; short-circuit explicitly empty scopes |
| Incident reports | Joining multiple incident cameras duplicated incidents, inflated totals, and consumed row limits | Select one deterministic active camera with a lateral join; prefer the primary marker where the installed schema has it |
| Employee timeline and comprehensive report | User lookup could switch the report to another tenant; UUID column casts and DATE(timestamp) expressions obstructed index use | Resolve subjects inside the caller tenant; keep the tenant fixed; compare native UUIDs and use inclusive-day lower/exclusive-next-day upper bounds |
| Maintenance work orders | Several report collectors ignored branch, asset, vendor, and severity filters | Apply shared period/scope filters in SQL and in the in-memory implementation; retain collector filtering for store compatibility |
| Maintenance numeric mapping | PostgreSQL NUMERIC costs can arrive as strings | Normalize costs before summation |
| Corrective maintenance | Resolution averages required an SLA and used later edits as the closure timestamp | Include closed work orders without SLAs and prefer resolvedAt, with updatedAt as a legacy fallback |
| Preventive maintenance | Branch breakdown was empty; cancelled visits counted as overdue | Build branch counts from visits/schedules and exclude cancellations from overdue counts |
| AMC performance | Any vendor-assigned work order counted as contract-covered | Require a matching vendor contract covering the work-order date; include the final contract day |
| Cost analysis | Contract costs ignored the selected period; month advancement could skip February and omit final-day activity | Prorate contract costs for the overlapping period; accumulate UTC month buckets in one pass |
| Predictive reports | Historical reports included alerts outside the period; database field names did not match collector expectations | Apply period/asset scope and alias alert_type/failure_probability to type/score |
| Capacity forecast | Rounding a small daily ingestion rate to zero flattened forecasts | Keep precision through forecast arithmetic; apply branch scope to cameras and telemetry |
| Daily surveillance | Only 1,000 unbounded alerts were loaded; current critical alerts bypassed report dates | Page through selected branches and period; deduplicate with a Set and count branch alerts in one pass |
| Daily surveillance | Current offline cameras were assigned 1,440 minutes of downtime; WAN outages were assigned 1,800 seconds | Return missing historical camera measurements as null and unknown outage start/duration as absent; retain current state and observation evidence |
| Daily surveillance | Closed/acknowledged alerts could be called overdue based only on their age | Compare recorded SLA deadlines with recorded acknowledgement/resolution times; use report end only for still-pending alerts |
| MIS | SLA treated a resolved incident as an on-time acknowledgement and averaged branch percentages equally | Read first acknowledgement from incident_status_history; weight SLA rollups by evaluated P1 incidents |
| MIS queries | UUID casts and unnecessary DISTINCTs on non-multiplying joins | Use native UUID predicates and ordinary counts where one row represents one entity |
| Historical trends | Obsolete nodes/maintenance_records/recording_jobs fields, camera-incident fanout, missing FULL JOIN month keys, five-row ranking across all months | Use resource_nodes, work_orders, camera_health_daily, and recording_status_daily; preaggregate independently; coalesce month keys; rank five branches per month |
| Historical trends | Current camera state and estimated amounts were presented as historical evidence | Use daily measurements; return null for unmeasured capital expenditure, historical point-in-time online counts, and unsupported scores; expose calculation basis |
| SLA availability | Overlapping samples/exclusions could double count time, including subtracting maintenance more than once | Sweep interval boundaries, exclude maintenance unions, retain missing time as UNKNOWN, and prefer observed failure over conflicting healthy samples |
| SLA aggregation | Fully unknown observations could produce NaN; camera retention was hardcoded; ongoing outages were unbounded; removed cameras survived recalculation | Use measured denominators, nullable unmeasured retention, clipped outage windows, and replace camera snapshots on re-aggregation |
| SLA status | Recorder/retention targets and some monitoring coverage were ignored | Evaluate all declared availability/retention targets and the required coverage |
| Report delivery | One INSERT round trip per recipient | Insert recipients in one parameterized UNNEST statement, deduplicating conflict keys and preserving result order |
| Operational worker | Every branch rescanned all telemetry | Group telemetry by branch once |
| CSV exports | Daily/SLA CSV fields could contain spreadsheet formulas | Neutralize formula-leading string cells while preserving numeric values |
| Retention report | Missing or zero retention generated a fabricated 85-day prediction | Require measured retention and preserve measured zero |

## Database indexes

`database/migrations/20261023_reporting_query_indexes.sql` adds candidate indexes for employee/tenant/time ranges, incident branch/time ranges, acknowledgement history, work-order branch/time ranges, and scoped analytics alert ordering. Existing indexes were inspected to avoid exact duplicates.

The migration is prepared, not executed. Use representative data and `EXPLAIN (ANALYZE, BUFFERS)` to assess row estimates, reads, sort costs, and write overhead before treating these indexes as proven production improvements. The migration runner uses transactions, so these are ordinary index builds; plan their deployment window accordingly.

## Validation

- 66 tests passed across nine files, including 25 new audit regressions, existing report routes and hierarchy/branch isolation, operational report generation/delivery, retention, and dashboard management-report calculations.
- A first parallel run hit application startup hook timeouts; the rerun with one worker and a 60-second hook allowance passed.
- Typechecking is blocked by unrelated NBFC detector/runtime/zone typing errors in the existing working tree. The focused test compilation is also checked with the application Fastify type augmentation included.
- Changed reporting files pass `git diff --check`.
- Database tests use recording query doubles: they verify query scope, parameters, mapping, and query shape, not execution plans or compatibility with a live deployed schema.

## Remaining findings and boundaries

1. **Legacy executive, financial TCO, branch benchmarking, and compliance scorecard registration needs repair.** Their factories return Express Routers, while `src/app.ts` invokes them as if they register Fastify routes and ignores the returned Routers. Their business logic also contains estimated costs and simplified compliance scores. They were inspected but not enabled or represented as validated production reports. A deliberate Fastify migration, branch authorization, canonical query rewrite, and endpoint tests are needed together.
2. **Maintenance filters are not uniformly implemented across every section.** The health summary remains tenant-wide; AMC contract costs have no branch/asset allocation model. Preventive/capacity data cannot consistently apply every generic vendor/severity filter. These sections need an explicit scope/allocation contract rather than inferring financial allocations or silently treating global totals as scoped figures.
3. **Current health is a snapshot, not historical availability.** Daily surveillance still collects current branch/device health; historical camera downtime is now explicitly unmeasured. Exact historical results require interval/archive evidence and appropriate daily-summary population.
4. **Daily SLA and some generated report/schedule services keep state in memory.** Restart persistence and multi-worker coordination need separate integration work. Historical trend endpoints depend on the relevant daily-summary migrations and populated evidence.
5. **Some data-quality semantics remain simplified.** Daily surveillance freshness counts are inferred from health categories, and missing SLA deadlines are not assessed. MIS still uses its existing five-minute P1 acknowledgement rule rather than a per-tenant SLA policy. Alert occurrence totals count stored correlated occurrences, not exact per-occurrence timestamps within a requested interval.
6. **Employee activity totals use sessions/visits starting within the selected calendar days.** They are not time-sliced allocations of sessions crossing the period boundaries. Calendar-day boundaries preserve the existing PostgreSQL session-timezone behavior.
7. **Performance remains unmeasured against production.** OFFSET-based exports, recursive alert hierarchy enrichment, very large exports, and branch snapshot collection should be profiled with actual cardinalities before further query/index changes. Live PostgreSQL execution and the complete repository test suite were not run.

These findings mean the audit should not be described as every report being fully correct or every repository query being optimized.
