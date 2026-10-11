# Administrator Manual

## Purpose and prerequisites

This manual is for authorized platform, tenant, and branch administrators. The
actions visible to a user depend on tenant scope, role/permission assignments,
feature configuration, and connected services. Use the actual deployment's
approved access policy; this guide does not grant permissions.

## Sign in and verify scope

1. Open the configured dashboard URL over the organization's approved HTTPS
   ingress.
2. Sign in with the configured identity method.
3. Verify the displayed organization and branch context before changing
   inventory, retention, alerts, or user assignments.
4. If a page is absent or an operation is denied, ask the platform
   administrator to verify feature enablement and authorization rather than
   attempting a direct API bypass.

The repository contains local/development identity handling; that is not a
production authentication recommendation.

## Organization and user administration

The dashboard includes administration pages for organization, roles, users,
feature management, and onboarding. The control plane includes corresponding
organization, user, auth, and feature-management routes and tenant-scoped data.

Administrative checklist:

- Confirm tenant, branch, and organizational hierarchy before onboarding.
- Assign only the minimum required role and branch/resource scope.
- Confirm the user's access using a non-administrator test identity.
- Revoke sessions/credentials promptly when an account or device is retired.
- Review audit events for privileged changes where audit views are enabled.
- Do not assume role labels imply permissions; inspect the configured
  permission/grant data for the deployment.

## Cameras, devices, and edge agents

The dashboard has device inventory, camera import/export, discovery, edge
fleet, edge-agent branch assignment, and zero-touch administration areas.

1. Enroll the branch/agent using the deployment's approved provisioning
   workflow.
2. Verify branch assignment and organization scope.
3. Add or discover authorized cameras and verify connection status, model,
   protocol, and credential reference.
4. Review device health and telemetry freshness before relying on alerts.
5. Validate live view and recording on a test camera before treating an
   inventory record as operational.

Credentials and device support differ by vendor/adapter operation; see
[Feature status](features.md).

## Alerts and incidents

Operational pages include alert and incident views, command-center workflows,
notification policy, incident workspaces, and related evidence/response areas.
Where those pages and routes are enabled:

- acknowledge, assign, or escalate alerts according to local procedures;
- record incident context in the incident workflow;
- verify notification provider delivery and attempt history;
- preserve associated evidence and legal holds under organizational policy.

The repository does not define universal severity response times or a complete
customer escalation policy.

## Recording, storage, and retention

Use recording, storage, health, recovery, and retention pages to inspect
configured systems. A displayed retention value is not by itself proof that
every interval is playable; use the continuity/retention verification behavior
where enabled. Before changing retention or legal holds, follow the
organization's records-management and legal process.

For storage replacement or restore:

1. Identify the exact branch, node, volume, and database.
2. Capture the current state and verified backup.
3. Follow the approved maintenance window and recovery runbook.
4. Verify recording continuity, evidence integrity indicators, and application
   health after the change.

## Compliance and privacy administration

The repository contains compliance and privacy pages/routes/schema. Use those
surfaces as operational records, not as proof of legal compliance. Obtain legal
and privacy approval for retention, face/biometric processing, exports,
redaction, subject access, and camera purpose settings.

## Escalation

For startup, connection, migration, and model errors, consult
[Troubleshooting](testing-deployment.md#troubleshooting). Record the deployed
revision, relevant redacted logs, service health, migration status, and scope
information. Never send passwords, tokens, camera credentials, or unredacted
personal data in a support report.
