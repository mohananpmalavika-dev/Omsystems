# AI Command Center

The AI Command Center is an evidence-bound operational diagnosis workspace for branch CCTV infrastructure. It correlates authorized inventory, immutable telemetry history, incidents, predictive alerts and maintenance work orders. It does not use a generative model to decide facts or execute actions.

## Operator workflow

Open `/operations/ai-command-center` and ask for a branch by name or ID. A response contains:

- confirmed current branch status;
- a root-cause assessment labelled Confirmed, Likely, Possible or Unknown;
- source-bound evidence and a normalized event timeline;
- current camera and recorder impact;
- reported recovery activity and an ETA only when an authoritative telemetry source supplies one;
- missing evidence and alternative causes;
- approved runbook actions.

The first question establishes branch context for follow-up questions. Conversation context is scoped to the authenticated user and tenant.

## Causal safety contract

`src/services/command-center/rca.ts` contains deterministic rules. A statement is never promoted beyond its source:

- utility failure is Confirmed only when UPS telemetry explicitly reports `utilityPowerAvailable: false`;
- UPS battery operation without utility-input state makes an upstream interruption Likely, not Confirmed;
- network or recorder telemetry can confirm that a component is unavailable, while causal impact remains Likely or Possible based on dependency evidence;
- camera-to-recorder relationships exist only when telemetry supplies `recorderId`;
- recovery time is Unknown unless an authoritative ETA or verified historical recovery sample exists;
- missing evidence produces `insufficient_evidence`, never a guessed cause.

Raw inputs and reason codes remain attached to timeline and evidence records for audit and operator inspection.

## APIs

All endpoints require the normal authenticated platform session and branch-level authorization.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/v1/command-center/query` | Resolve branch and intent, retain conversation context and return an evidence-backed answer |
| GET | `/v1/command-center/branches/:branchId/diagnosis` | Full current diagnosis |
| GET | `/v1/command-center/branches/:branchId/timeline` | Normalized operational timeline |
| GET | `/v1/command-center/branches/:branchId/dependencies` | Operational entities and evidence-backed dependencies |
| GET | `/v1/command-center/branches/:branchId/recovery-estimate` | Reported recovery activity and ETA basis |
| GET | `/v1/command-center/branches/:branchId/similar-incidents` | Prior materialized cases for the same branch and optional cause |
| GET | `/v1/command-center/incidents/:incidentId/root-cause` | RCA for the incident's branch and time window |
| GET | `/v1/command-center/incidents/:incidentId/evidence` | Incident-window evidence and timeline |
| POST | `/v1/command-center/actions/:actionId/approve` | Approve an action after permission checks |
| POST | `/v1/command-center/actions/:actionId/execute` | Execute an approved supported action |
| GET | `/v1/command-center/fleet/priorities` | Rank accessible branches by deterministic impact score |

Example query:

```json
{
  "question": "Why are cameras unavailable at Bengaluru Branch 001?",
  "conversationId": "optional UUID from a prior response",
  "from": "2026-07-30T00:00:00.000Z",
  "to": "2026-07-30T23:59:59.999Z"
}
```

## Actions and audit

Read-only evidence and diagnostic actions require `recording:view`. Mutating actions require `device:configure` and explicit approval. Work-order execution creates a real maintenance work order and records query, approval and execution audit events.

Recorder retry is exposed only as `integration-required` until a recorder adapter implements an acknowledged command/result contract. The API returns a conflict instead of claiming a restart or recovery. High-risk device commands should follow the same approval, execution-result and rollback pattern.

## Storage and deployment

Apply migration `039_ai_command_center.sql`. It adds conversations, messages, materialized RCA cases, source evidence and recommended-action state. The graph itself remains derived from authoritative resources and telemetry so it cannot drift into a second inventory system.

The in-memory store retains immutable telemetry history for tests and development. PostgreSQL reads history from `operational_health_telemetry`; production retention must cover the desired investigation window.

## Verification

Run:

```text
npm run typecheck
npm test -- --run test/ai-command-center.test.ts
npm run typecheck --workspace @sentinel/dashboard
```

The Command Center test suite covers evidence-chain ordering, unknown-cause handling, conversational scope, approval and permission enforcement, real work-order creation, and refusal to execute an unconfigured recorder retry.

## Deliberately deferred

P1/P2 work remains for semantic vector search over runbooks and resolved cases, optional LLM summarization behind the deterministic response, learned recovery prediction with field history, anomaly correlation, automated recovery verification, and hardware-certified recorder command adapters.
