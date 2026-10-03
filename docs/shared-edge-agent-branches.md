# Connect branches to an existing VPN agent

Open **Administration → Shared edge agents** (`/admin/edge-agent-branches`), or use **Connect branches to an existing agent** on branch onboarding.

1. Choose the already installed agent at HO, a regional office, or a zone office.
2. Choose a branch, region, or zone. Select the branches inside that scope.
3. Enter each branch's VPN-reachable camera/recorder IP addresses or subnets, separated by commas. Use private IPv4 addresses or CIDRs from `/20` through `/32`. A single IP is stored as `/32`.
4. Save the assignment. When the agent is online, select **Discover cameras**, then open branch onboarding to review devices and supply camera credentials.

One agent keeps its original home branch and serves the selected additional branches. Credentials, discoveries, cameras, recovery, commands, and health telemetry retain the destination branch. Remote scans use only the branch's assigned VPN networks and do not expand into the HO agent's local LAN. The home scan excludes remote branch ranges. Automatic discovery scans one branch per idle iteration, checking operator commands between branches. Region and zone selections save the selected current branches; newly created branches must be assigned separately.

The administrator needs device configuration permission for the agent's home branch, the selected scope, and every selected branch. The installed agent must already be activated with its unique gateway identity. Overlapping routed IP ranges across branches on the same agent are rejected. Branches with cameras on that agent must have their cameras moved before the assignment can be removed. Removing an empty branch cancels its pending scan jobs and branch commands.

## Rollout

Apply `database/migrations/20261003_shared_edge_agent_branches.sql` before deploying the updated control plane and dashboard. Update the existing agent once to **v0.1.47 or newer**; no separate installations or enrollment tokens are needed for the additional branches. Existing single-branch agents continue using their home branch.

The agent's installed machine must already have working VPN routes and firewall access to the destination camera/recorder ports. Saving an assignment does not provision the VPN or prove device connectivity; discovery verifies reachable devices. The branch uses the shared agent's media endpoint and its verified media runtime health.

## Verification

`npm test -- test/shared-edge-agent-branches.test.ts test/edge-scan-job-routing.test.ts edge-agent/test/shared-branch-isolation.test.ts edge-agent/test/vpn-branch-scan.test.ts`

`node dashboard/e2e/shared-edge-agent-branches.qa.mjs` runs browser checks of bulk assignment, VPN IP entry, discovery routing, removal, older agent gating, and mobile layouts, and prints the screenshot directory.

Control-plane, edge-agent, and dashboard typechecks passed. Focused API, PostgreSQL repository, gateway, credentials, monitoring, and discovery isolation checks passed, together with desktop/mobile browser checks. The v0.1.47 agent bundle built successfully and its version command was verified.

Five existing failures in `test/discovery-enhancements.test.ts` also reproduce against the unchanged baseline. The migration has not been applied to a live database; no local PostgreSQL instance was available for executing it. No production deployment was performed.
