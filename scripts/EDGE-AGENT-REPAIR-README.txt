Sentinel Grid Edge Agent 0.1.17 Repair

Use this package only on the Windows computer that already runs the branch
scanner. It preserves the existing branch identity and camera credentials.

1. Extract the complete ZIP file on the branch computer.
2. Double-click Run-Sentinel-Edge-Repair.cmd.
3. Approve the Windows Administrator prompt.
4. Wait for the green success message (up to about three minutes).

The repair replaces the faulty agent executable, clears a stale process lock,
enables automatic Task Scheduler restart, starts the scanner, and confirms the
local media gateway health endpoint before reporting success.

Detailed status is written to:
C:\ProgramData\Sentinel Grid\edge-agent-repair-status.json
