# Shutter opening and closing alerts

Implemented locally for the requested **every opening and closing** behavior. No server transfer, deployment, production rule creation, or database migration was performed.

## Behavior

- A camera rule compares only the selected shutter area with its own fully open and fully closed reference snapshots.
- A change must match one reference clearly for at least three distinct frames and two seconds (or the configured longer confirmation duration).
- Each confirmed opening and closing creates a separate alert and follows the existing incident, evidence, notification, and siren configuration. Active alerts and resolved-alert cooldowns do not merge the next transition. Duplicate source events remain deduplicated.
- Initial state, repeated static views, ambiguous/covered frames and invalid calibration do not produce transition alarms. A frame gap longer than 30 seconds, detector restart, disabled rule or changed calibration requires a new baseline.
- Shutter processing runs before motion/GPU scheduling so a stationary shutter can finish confirmation.
- Events must identify the calibrated rule and contain consistent previous/current states before matching a shutter alert rule. Existing permission, schedule, false-alarm feedback and alert suppression policies still apply.

The comparison is a calibrated image similarity heuristic, not a trained shutter model or a probability estimate. These checks do not establish accuracy on this camera's real opening/closing footage, partial openings, people covering the shutter, camera movement, or substantial lighting changes. Unclear frames are ignored; transitions during an outage cannot be reconstructed.

## Camera setup

1. In **Analytics → Rules & Automation**, select Hajipur and the **CP PLUS DVR - Channel 7** camera shown in the screenshot.
2. Create a **Shutter opening and closing** rule.
3. Choose full camera snapshots with the shutter fully closed and fully open, from the same camera angle.
4. Drag a box inside the shutter area on the closed snapshot. Exclude the adjacent grill, wall, floor, timestamp and player controls. Choose an area with distinguishable detail in both reference views.
5. Save once the setup shows **References ready**. Defaults are a 90% reference match threshold and two-second confirmation, with no cooldown and no schedule restriction.

The browser processes the reference images locally. The rule stores two 32×32 brightness signatures and the normalized area, rather than uploading these reference image files. Detection snapshots use the existing alert evidence workflow.

Before running the updated control plane against Postgres, apply `database/migrations/20261005_shutter_state_alerts.sql` through the normal migration process. It adds the nullable `analytics_rules.shutter_config` JSONB column. Automatic enable-all does not create uncalibrated shutter rules.

## Verification

- 17 detector/frame API checks passed, including complete repeated cycles, silent initial state, distinct-frame confirmation, occlusion, exposure changes, longer confirmation, rule/camera/tenant isolation, reconnection and authenticated frame submission with snapshots.
- 8 shutter workflow/storage checks passed, including HTTP validation, calibration persistence, separate incidents and dashboard notifications, duplicate delivery, resolved alerts, rule association and Postgres insertion behavior. The final run used a 60-second hook timeout after a concurrent production build caused the first application startup to exceed the default 20 seconds.
- 23 existing analytics and false-alarm regression checks passed: **48 distinct automated checks total**.
- Local Chromium smoke check passed: both references and an explicit area are required; identical references are rejected; replacing a reference clears stale calibration; no browser runtime errors.
- Control plane, analytics engine and dashboard TypeScript checks passed. A pre-existing Device Manager declaration-order error encountered during verification was fixed by moving the existing `registeredStorage` calculation above its first use, preserving the inventory changes.
- Next.js webpack compilation completed and all 197 static pages were generated. The PowerShell wrapper returned exit code 1 after the existing out-of-repository package warning; the output contains no Next.js build failure and includes the completed route listing. The temporary build directory and its generated configuration changes were removed after verification.

Useful reruns:

```powershell
npx.cmd vitest run analytics-engine/test/shutter-detector.test.ts test/shutter-alerts.test.ts --maxWorkers 1 --hookTimeout 60000 --testTimeout 60000
node scripts/verify-shutter-calibration.mjs
```

Actual camera calibration and a real opening/closing replay remain necessary before production activation. The supplied screenshot provides only the closed view.
