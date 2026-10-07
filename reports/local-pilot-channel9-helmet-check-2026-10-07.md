# Local Camera Pilot CH9 missing helmet alert

The screenshot footer identifies Local Camera Pilot / CP PLUS DVR Channel 9.
The browser's find text "Channel 8" and tile number #06 are not the selected
recorder channel. Camera ID: `e66e3498-1c13-4f59-91d7-5a3386d269d2`.

## Configuration and current result

At 18:21 IST on 7 October 2026, the helmet-worn rule was enabled, confidence
0.70, duration 1 second, cooldown 60 seconds. No helmet events or alerts were
found in the queried previous two hours. The service reported AI_OPERATIONAL
and a healthy helmet detector, version 1.3.1. The shared frame cache held
691,200 bytes, consistent with 640x360 RGB24; its capture was already about
19 seconds old at the first check. At 18:25 IST another capture was about
45 seconds old. The latest reporting pilot gateway was version 0.1.48.

## Exact raw-frame observations

An isolated reader captured distinct frames at 18:22:23.184, 18:23:01.107 and
18:23:02.174 IST. This demonstrates an observed gap of 37.923 seconds followed
by 1.067 seconds; it is not a measurement of the normal long-term cadence.
Original RGB frames and lossy previews were retained locally.

The visually reviewed previews did not show a complete helmet wearer in the
same position as the user's screenshot. The object detector returned weak
person boxes on the right, scores 0.4009, 0.4506 and 0.4113. These correspond
to the scooter/background area rather than the screenshot's wearer at the
left entrance. The first frame localized no head. Later frames localized a
helmet-shaped background object at approximately x=0.378, y=0.148, scores
0.2823 and 0.4262, unrelated to the person boxes. Spatial verification rejected
the candidates. All three frames made **zero helmet classification calls**,
retained no pending confirmation and produced no helmet result. The isolated
diagnostic submitted **zero events**.

## What explains the screenshot, and what remains uncertain

The rule is on, but production recorded no verified helmet event from which
to create an alert. The screenshot's distant person appears much smaller
than the current learned-head path supports. That path requires a real person
at confidence >=0.80 and height >=35% of frame height, plus a localized head
with at least 20x20 source pixels. Enlarging the HD live player does not enlarge
the 640x360 analytics input. Those gates can reject distant people even when
the new classifier is enabled for every camera.

The original screenshot frame was not available as an exact analytics replay;
the user's confirmation that the wearer was in view does not make later
different cache frames an equivalent input. Accordingly, the original frame's
exact failure is **not established**. Low-detail/small-person gates and the
observed sparse/uneven delivery are concrete limitations; they must not be
reported as an exact original-frame classifier score.

A subsequent request asked for a fully visible stationary wearer for 45 seconds
to obtain a conclusive frame. No threshold, rule, model, gateway or service was
changed in this investigation. A reliable distant-person fix needs usable head
detail, more consistent capture and validation of appropriate person/head
gates, rather than merely lowering the dashboard rule confidence.

Evidence: `tmp/pilot-channel9-status-20261007.log`,
`reports/pilot-channel9-helmet-live-2026-10-07.json`, and locally referenced raw
frames/previews. The distinction between the live HD player and analytics
capture should be preserved when diagnosing future screenshots.
