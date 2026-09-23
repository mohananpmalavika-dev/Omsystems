with open('/tmp/analytics-repository.js', 'r') as f:
    text = f.read()

target = "ORDER BY last_detected_at DESC LIMIT 1 FOR UPDATE`, [rule.id, input.cameraId]);"
replacement = "ORDER BY last_detected_at DESC LIMIT 1 FOR UPDATE`, [rule.id, input.cameraId, input.occurredAt, Math.max(rule.cooldownSeconds || 60, 30)]);"

filter_target = "AND status NOT IN ('resolved', 'false_alarm', 'suppressed')"
filter_replacement = "AND status NOT IN ('resolved', 'false_alarm', 'suppressed')\n             AND last_detected_at >= $3::timestamptz - ($4::double precision * interval '1 second')"

if filter_target in text and target in text:
    text = text.replace(filter_target, filter_replacement, 1)
    text = text.replace(target, replacement, 1)
    with open('/tmp/analytics-repository.js', 'w') as f:
        f.write(text)
    print("SUCCESSFULLY_PATCHED")
else:
    print("NOT_FOUND")
