import fs from 'fs';
import path from 'path';

const file = path.resolve('analytics-engine/src/analytics-pipeline.ts');
let content = fs.readFileSync(file, 'utf8');

// 1. Add state tracking properties
const stateProps = `  // Vault dual-control state tracking per camera
  private vaultDualControlStates = new Map<string, {
    lastMultiPersonTimestamp: number;
    singlePersonStartTimestamp: number;
    consecutiveSingleFrames: number;
    lastAlertTimestamp: number;
  }>();
  private readonly VAULT_SINGLE_PERSON_CONFIRM_MS = 10_000;
  private readonly VAULT_DUAL_CUSTODY_MEMORY_MS = 45_000;
  private readonly VAULT_ALERT_COOLDOWN_MS = 60_000;
`;

if (!content.includes('vaultDualControlStates')) {
  const target = 'private readonly CACHE_TTL_MS = 30_000; // 30 seconds';
  content = content.replace(target, `${target}\n\n${stateProps}`);
  console.log('Added vaultDualControlStates properties');
}

// 2. Add dual-control to face detector scheduling
const oldFaceCheck = `        this.needsDetection(rules, [
          'face',
          'face-recognition',
          'unknown-person',
          'watchlist-match',
          'vip-detection',
          'blacklist-detection',
        ])`;

const newFaceCheck = `        this.needsDetection(rules, [
          'face',
          'face-recognition',
          'unknown-person',
          'watchlist-match',
          'vip-detection',
          'blacklist-detection',
          'dual-control-verification',
          'dual-control',
          'vault-violation',
        ])`;

if (content.includes(oldFaceCheck)) {
  content = content.replace(oldFaceCheck, newFaceCheck);
  console.log('Updated face detector scheduling for dual control');
}

// 3. Replace dual-control logic
const oldDualControl = `      // Dual-control verification (Single person in vault exception)
      // When dual-control-verification rule is enabled on a vault area camera:
      // Minimum 2 persons required. If exactly 1 person is present (persons.length === 1),
      // raise a dual-control exception. If 0 persons (idle) or >= 2 persons (dual custody satisfied), no exception.
      if (this.needsDetection(rules, ['dual-control-verification', 'dual-control', 'vault-violation'])) {
        const dualControlRules = rules.filter(r => r.enabled && ['dual-control-verification', 'dual-control', 'vault-violation'].map(normalizeDetectionType).includes(normalizeDetectionType(r.detectionType)));
        for (const rule of dualControlRules) {
          if (persons.length === 1) {
            events.push(await this.createEvent(frame, {
              detectionType: "dual-control-verification",
              confidence: Math.max(0.92, persons[0]?.confidence ?? 0.92),
              objects: persons,
              requiresAlert: true,
              metadata: {
                ruleName: rule.name,
                actualPersons: 1,
                requiredPersons: 2,
                violation: "SINGLE_PERSON_IN_VAULT",
                description: "Single person detected in vault area (dual control requires minimum 2 persons)",
              },
            }));
          }
        }
      }`;

const newDualControl = `      // Dual-control verification (Single person in vault exception)
      // When dual-control-verification rule is enabled on a vault area camera:
      // Minimum 2 persons required.
      // - 0 persons: Vault idle / unoccupied (no alert)
      // - >= 2 persons: Dual custody satisfied (no alert, updates lastMultiPersonTimestamp)
      // - 1 person: Mitigates camera occlusion when 2 officers stand together in front of the safe/lockers.
      //   Checks face detection count, recent dual custody memory (last 45s), and minimum continuous dwell
      //   persistence (10s) before raising a violation.
      if (this.needsDetection(rules, ['dual-control-verification', 'dual-control', 'vault-violation'])) {
        const dualControlRules = rules.filter(r => r.enabled && ['dual-control-verification', 'dual-control', 'vault-violation'].map(normalizeDetectionType).includes(normalizeDetectionType(r.detectionType)));
        if (dualControlRules.length > 0) {
          const cameraId = frame.cameraId;
          let vaultState = this.vaultDualControlStates.get(cameraId);
          if (!vaultState) {
            vaultState = {
              lastMultiPersonTimestamp: 0,
              singlePersonStartTimestamp: 0,
              consecutiveSingleFrames: 0,
              lastAlertTimestamp: 0,
            };
            this.vaultDualControlStates.set(cameraId, vaultState);
          }

          // Count faces detected in frame (e.g. YuNet face detector)
          const faceResult = specializedResults.flat().find(r => r?.detectionType === 'face');
          const faceCount = (faceResult?.objects?.length ?? faceResult?.metadata?.faceCount) || 0;

          // Effective count of individuals observed in the vault area
          const effectivePersons = Math.max(persons.length, faceCount);
          const currentTimestamp = frame.timestamp?.getTime?.() || Date.now();

          if (effectivePersons >= 2) {
            // Dual custody satisfied: update timestamp so brief occlusions don't falsely alert
            vaultState.lastMultiPersonTimestamp = currentTimestamp;
            vaultState.singlePersonStartTimestamp = 0;
            vaultState.consecutiveSingleFrames = 0;
          } else if (effectivePersons === 0) {
            // Vault empty / idle: reset single person tracking
            vaultState.singlePersonStartTimestamp = 0;
            vaultState.consecutiveSingleFrames = 0;
          } else if (effectivePersons === 1) {
            // Exactly 1 person detected in this frame.
            // Check if dual custody was active recently (within memory window, e.g. 45s).
            // When two officers work in a vault together, one frequently leans over the locks or stands behind the other,
            // causing momentary occlusion or bounding box overlap. If 2 persons were confirmed in the vault recently,
            // this is recognized as active dual custody operation, NOT a single-person violation.
            const timeSinceDualCustody = currentTimestamp - vaultState.lastMultiPersonTimestamp;
            const isWithinCustodyMemory = vaultState.lastMultiPersonTimestamp > 0 && timeSinceDualCustody < this.VAULT_DUAL_CUSTODY_MEMORY_MS;

            if (!isWithinCustodyMemory) {
              // Not in active dual custody memory: track single-person dwell persistence
              if (!vaultState.singlePersonStartTimestamp) {
                vaultState.singlePersonStartTimestamp = currentTimestamp;
              }
              vaultState.consecutiveSingleFrames++;

              const singlePersonDuration = currentTimestamp - vaultState.singlePersonStartTimestamp;
              const hasElapsedConfirmation = singlePersonDuration >= this.VAULT_SINGLE_PERSON_CONFIRM_MS && vaultState.consecutiveSingleFrames >= 3;
              const hasElapsedCooldown = (currentTimestamp - vaultState.lastAlertTimestamp) >= this.VAULT_ALERT_COOLDOWN_MS;

              if (hasElapsedConfirmation && hasElapsedCooldown) {
                vaultState.lastAlertTimestamp = currentTimestamp;
                for (const rule of dualControlRules) {
                  events.push(await this.createEvent(frame, {
                    detectionType: "dual-control-verification",
                    confidence: Math.max(0.92, persons[0]?.confidence ?? 0.92),
                    objects: persons,
                    requiresAlert: true,
                    metadata: {
                      ruleName: rule.name,
                      actualPersons: 1,
                      requiredPersons: 2,
                      durationSeconds: Math.round(singlePersonDuration / 1000),
                      violation: "SINGLE_PERSON_IN_VAULT",
                      description: \`Single person detected in vault area for \${Math.round(singlePersonDuration / 1000)}s (dual control requires minimum 2 persons)\`,
                    },
                  }));
                }
              }
            } else {
              // Within dual custody memory window: maintain dual custody, reset single person persistence
              vaultState.singlePersonStartTimestamp = 0;
              vaultState.consecutiveSingleFrames = 0;
            }
          }
        }
      }`;

// Handle CRLF vs LF matching
const normalizeLf = (s) => s.replace(/\r\n/g, '\n');
const normalizedContent = normalizeLf(content);
const normalizedOld = normalizeLf(oldDualControl);

if (normalizedContent.includes(normalizedOld)) {
  const isCrlf = content.includes('\r\n');
  const replacedNormalized = normalizedContent.replace(normalizedOld, normalizeLf(newDualControl));
  content = isCrlf ? replacedNormalized.replace(/\n/g, '\r\n') : replacedNormalized;
  console.log('Updated dual-control verification logic');
} else {
  console.error('Could not find oldDualControl block');
}

// 4. In cleanup:
if (!content.includes('this.vaultDualControlStates.clear();')) {
  content = content.replace('for (const detector of this.detectors) {', 'this.vaultDualControlStates.clear();\n    for (const detector of this.detectors) {');
  console.log('Added cleanup for vaultDualControlStates');
}

fs.writeFileSync(file, content, 'utf8');
console.log('File updated successfully!');
