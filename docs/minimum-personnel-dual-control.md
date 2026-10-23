# Minimum Personnel / Dual Control

The template is `tmpl-02-minimum-personnel`. Its default condition requires both:

- `vault_operation_active` is explicitly `true`.
- `person_count` is below two for ten seconds within the configured schedule.

An active vault with zero or one observed person is a shortfall. An idle vault does
not alert. `staff_count` can replace `person_count` when the source supplies verified
staff counts; a person detector alone does not verify staff identity.

The editor preserves the operation guard when changing the count threshold. It
restores the guard for existing template rules flattened by older editor versions.
Reopen and save any affected rule after deployment, reviewing the threshold, scope,
schedule, actions and execution mode. No saved production rules are rewritten by
this source change. The API rejects incomplete replacement conditions.

Evaluation requires a boolean operation signal and a nonnegative integer count.
Missing or malformed telemetry suppresses evaluation and resets pending duration;
it is not interpreted as zero occupancy. Repeated/older timestamps do not advance
confirmation. A gap exceeding ten seconds, a changed rule version, an inactive
schedule, or the end of vault operations restarts pending confirmation. Zones have
separate confirmation state. The default cooldown is sixty seconds and remains
effective across short recoveries. Shadow mode records a decision without external
alert, incident or evidence actions.

Provide the operation signal and count from the actual vault telemetry source.
These code changes do not infer vault activity from arbitrary movement, install
models, configure camera inputs, or connect an alert delivery integration. The
control-plane evaluation API returns the action decision; the caller must dispatch
that decision through its configured alert workflow.

Validation: `test/minimum-personnel-rule.test.ts` covers condition integrity,
telemetry validity, persistence, cooldown, zone isolation, shadow behavior and API
save validation. `dashboard/test/nbfc-rule-save.browser.test.ts` covers editor saves
for both intact and previously flattened dual-control conditions.
