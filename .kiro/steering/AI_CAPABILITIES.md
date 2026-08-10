---
inclusion: always
---

# AI Capability Rule

When planning, implementing, testing, documenting, or presenting AI functionality, use this rule together with the source-of-truth capability catalog in `src/analytics/capability-catalog.ts`.

## Capability inventory

The platform's AI scope includes the following implemented capability domains:

- **Human analytics:** person detection, tracking, re-identification, counting, occupancy, dwell time, crowd density, behaviour, weapon, and PPE analysis.
- **Vehicle analytics:** vehicle detection, ANPR, classification, counting, speed, direction, parking, re-identification, and vehicle attributes.
- **Face analytics:** face detection, recognition, unknown-person detection, consent-aware watchlists, and visual attributes.
- **Fire and safety:** fire, smoke, combined fire/smoke, PPE violations, blocked exits, missing extinguishers, spills, gas-leak indicators, arc flashes, explosions, and falls.
- **Security analytics:** motion, intrusion, tailgating, loitering, line crossing, perimeter and restricted-area events, unattended or removed objects, and camera tamper/video-loss conditions.
- **Retail analytics:** customer and footfall counting, queues and wait times, heat maps, customer flow, shelf monitoring, product events, checkout, and conversion analytics.
- **Banking analytics:** vault, ATM, teller, cash-counter, strong-room, cash-van, and dual-control scenarios.
- **Industrial analytics:** forklifts, cranes, machine activity, conveyor blockage, machinery zones, worker hazards, fall-from-height, and smoke-near-machine events.
- **Smart-city analytics:** traffic counts, congestion, illegal U-turns, accidents, pedestrian crossings, crowd gathering, road blockage, dumping, and water logging.
- **AI camera health:** lens and image quality, exposure, night vision, weather effects, camera alignment/blocking, frame rate, bitrate, frozen video, colour shift, and sensor health.
- **AI search:** attribute-based and natural-language video search.
- **AI investigation:** cross-camera timelines, route reconstruction, last-seen, object-origin, and evidence collection workflows.
- **AI prediction:** camera, HDD, switch, network, storage, recording-interruption, branch-risk, and incident-probability forecasts.
- **AI reporting:** daily, weekly, compliance, executive, incident-location, heat-map, vehicle, and visitor reports.
- **AI assistant:** operations, alert, branch-comparison, and visual-attribute queries.

The supporting operational AI experiences are implemented in `src/services/ai-*.ts`, `src/routes/ai-*.routes.ts`, the command centre, root-cause-analysis engine, prediction services, and their dashboard components. This includes AI video search, incident summaries, evidence building, verification, SOP workflows, investigation reports, real-time intelligence updates, predictive operations, digital-twin prediction integration, and root-cause analysis.

## Activation and status

- Treat `src/analytics/capability-catalog.ts` as the canonical list and its `core`, `open-model`, and `derived` stages as mandatory status labels.
- Treat `analytics-engine/capability-registry.json`, the deployed model manifest, and engine health as the source of runtime availability. Do not describe an unprovisioned model as active or production-ready.
- The automatic per-camera rule bundle in `src/analytics/camera-ai-bundle.ts` enables only these safe whole-frame detections: `motion`, `object`, `person`, `vehicle`, `fire`, `smoke`, `fall`, `no-helmet`, `crowd-density`, `tailgating`, `queue`, `camera-tampering`, `video-loss`, `face`, and `anpr`.
- Features involving zones, direction, watchlists, recognition, identity, calibration, or site-specific thresholds require explicit configuration. The setup-required list in `src/analytics/camera-ai-bundle.ts` is the minimum required configuration boundary.
- Face recognition, watchlists, and biometric or identity-linked workflows require the applicable consent, access-control, retention, and audit controls before activation.

## Implementation requirements

- Validate every analytics rule's `detectionType` through `isAiCapability`; add new capability IDs to the catalog before accepting them in APIs or UI.
- Add a default camera rule only when the detector is executed by the frame pipeline, is safe without site-specific configuration, and has a calibrated severity, confidence, duration, cooldown, and recording policy.
- Keep rule IDs, detector event types, model requirements, API contracts, dashboard labels, and documentation aligned. Do not invent unsupported detection types or silently map one capability to another.
- Preserve the rule-driven, motion-first execution model in the analytics engine. Expensive inference must remain conditional on enabled rules and provisioned models.
- State availability precisely in all user-facing text: **implemented**, **configured**, **model-provisioned**, and **active** are distinct states.

