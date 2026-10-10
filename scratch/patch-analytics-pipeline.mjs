import fs from 'fs';

// 1. Patch analytics-engine/src/analytics-pipeline.ts
let pipelineCode = fs.readFileSync('analytics-engine/src/analytics-pipeline.ts', 'utf8');

// A. Banking analytics needsDetection list (around line 516)
const oldBankingNeeds = `['banking', 'banking-analytics', 'atm-abnormal-activity', 'atm-tampering', 'vault-violation', 'teller-unattended']`;
const newBankingNeeds = `['banking', 'banking-analytics', 'atm-abnormal-activity', 'atm-tampering', 'vault-violation', 'teller-unattended', 'dual-control-verification', 'dual-control']`;
if (pipelineCode.includes(oldBankingNeeds)) {
  pipelineCode = pipelineCode.replace(oldBankingNeeds, newBankingNeeds);
  console.log('✓ Patched banking analytics needsDetection');
}

// B. Dual-control verification evaluation (after specializedResults loop around line 536)
const oldSpecializedEnd = `      // Process specialized results
      for (const results of specializedResults) {
        for (const result of results) {
          if (this.matchesAnyRule(result.detectionType, rules)) {
            events.push(await this.createEvent(frame, result));
          }
        }
      }`;

const newSpecializedEnd = `      // Process specialized results
      for (const results of specializedResults) {
        for (const result of results) {
          if (this.matchesAnyRule(result.detectionType, rules)) {
            events.push(await this.createEvent(frame, result));
          }
        }
      }

      // Dual-control verification (Single person in vault exception)
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

if (pipelineCode.includes(oldSpecializedEnd)) {
  pipelineCode = pipelineCode.replace(oldSpecializedEnd, newSpecializedEnd);
  console.log('✓ Patched dual-control verification in processFrame');
} else {
  // Try CRLF matching
  const oldSpecializedEndCRLF = oldSpecializedEnd.replace(/\n/g, '\r\n');
  const newSpecializedEndCRLF = newSpecializedEnd.replace(/\n/g, '\r\n');
  if (pipelineCode.includes(oldSpecializedEndCRLF)) {
    pipelineCode = pipelineCode.replace(oldSpecializedEndCRLF, newSpecializedEndCRLF);
    console.log('✓ Patched dual-control verification in processFrame (CRLF)');
  } else {
    console.warn('⚠️ Could not match specializedResults block in pipeline');
  }
}

// C. matchesAnyRule
const oldTargetMatch = `      if (target === "vehicle-watchlist-match") {\r\n        return ruleType === "vehicle-watchlist" || ruleType === "blocked-vehicle" || ruleType === "watchlist-match";\r\n      }`;
const newTargetMatch = `      if (target === "vehicle-watchlist-match") {\r\n        return ruleType === "vehicle-watchlist" || ruleType === "blocked-vehicle" || ruleType === "watchlist-match";\r\n      }\r\n      if (target === "dual-control-verification" || target === "dual-control-violation") {\r\n        return ruleType === "dual-control-verification" || ruleType === "dual-control-violation" || ruleType === "dual-control";\r\n      }`;
if (pipelineCode.includes(oldTargetMatch)) {
  pipelineCode = pipelineCode.replace(oldTargetMatch, newTargetMatch);
  console.log('✓ Patched matchesAnyRule (CRLF)');
} else {
  const oldTargetMatchLF = oldTargetMatch.replace(/\r\n/g, '\n');
  const newTargetMatchLF = newTargetMatch.replace(/\r\n/g, '\n');
  if (pipelineCode.includes(oldTargetMatchLF)) {
    pipelineCode = pipelineCode.replace(oldTargetMatchLF, newTargetMatchLF);
    console.log('✓ Patched matchesAnyRule (LF)');
  }
}

// D. needsPersonDetection
const oldPersonTypes = `"atm-abnormal-activity",\r\n      "atm-tampering",\r\n    ];`;
const newPersonTypes = `"atm-abnormal-activity",\r\n      "atm-tampering",\r\n      "dual-control-verification",\r\n      "dual-control",\r\n      "vault-violation",\r\n    ];`;
if (pipelineCode.includes(oldPersonTypes)) {
  pipelineCode = pipelineCode.replace(oldPersonTypes, newPersonTypes);
  console.log('✓ Patched needsPersonDetection (CRLF)');
} else {
  const oldPersonTypesLF = oldPersonTypes.replace(/\r\n/g, '\n');
  const newPersonTypesLF = newPersonTypes.replace(/\r\n/g, '\n');
  if (pipelineCode.includes(oldPersonTypesLF)) {
    pipelineCode = pipelineCode.replace(oldPersonTypesLF, newPersonTypesLF);
    console.log('✓ Patched needsPersonDetection (LF)');
  }
}

// E. needsObjectDetection
const oldObjectTypes = `"atm-abnormal-activity", "atm-tampering", "vehicle-watchlist", "blocked-vehicle",\r\n    ]);`;
const newObjectTypes = `"atm-abnormal-activity", "atm-tampering", "vehicle-watchlist", "blocked-vehicle",\r\n      "dual-control-verification", "dual-control", "vault-violation",\r\n    ]);`;
if (pipelineCode.includes(oldObjectTypes)) {
  pipelineCode = pipelineCode.replace(oldObjectTypes, newObjectTypes);
  console.log('✓ Patched needsObjectDetection (CRLF)');
} else {
  const oldObjectTypesLF = oldObjectTypes.replace(/\r\n/g, '\n');
  const newObjectTypesLF = newObjectTypes.replace(/\r\n/g, '\n');
  if (pipelineCode.includes(oldObjectTypesLF)) {
    pipelineCode = pipelineCode.replace(oldObjectTypesLF, newObjectTypesLF);
    console.log('✓ Patched needsObjectDetection (LF)');
  }
}

// F. shouldRunObjectDetection
const oldShouldObject = `"employee-only-zone",\r\n      "restricted-multiple-person",\r\n      "atm-abnormal-activity",\r\n    ];`;
const newShouldObject = `"employee-only-zone",\r\n      "restricted-multiple-person",\r\n      "atm-abnormal-activity",\r\n      "dual-control-verification",\r\n      "dual-control",\r\n      "vault-violation",\r\n    ];`;
if (pipelineCode.includes(oldShouldObject)) {
  pipelineCode = pipelineCode.replace(oldShouldObject, newShouldObject);
  console.log('✓ Patched shouldRunObjectDetection (CRLF)');
} else {
  const oldShouldObjectLF = oldShouldObject.replace(/\r\n/g, '\n');
  const newShouldObjectLF = newShouldObject.replace(/\r\n/g, '\n');
  if (pipelineCode.includes(oldShouldObjectLF)) {
    pipelineCode = pipelineCode.replace(oldShouldObjectLF, newShouldObjectLF);
    console.log('✓ Patched shouldRunObjectDetection (LF)');
  }
}

// G. normalizeDetectionType
const oldNorm = `    case "atm-abnormal":\r\n    case "atm-loitering":\r\n    case "atm-tampering":\r\n      return "atm-abnormal-activity";`;
const newNorm = `    case "atm-abnormal":\r\n    case "atm-loitering":\r\n    case "atm-tampering":\r\n      return "atm-abnormal-activity";\r\n    case "dual-control":\r\n    case "dual-control-violation":\r\n    case "dual-control-verification":\r\n      return "dual-control-verification";`;
if (pipelineCode.includes(oldNorm)) {
  pipelineCode = pipelineCode.replace(oldNorm, newNorm);
  console.log('✓ Patched normalizeDetectionType (CRLF)');
} else {
  const oldNormLF = oldNorm.replace(/\r\n/g, '\n');
  const newNormLF = newNorm.replace(/\r\n/g, '\n');
  if (pipelineCode.includes(oldNormLF)) {
    pipelineCode = pipelineCode.replace(oldNormLF, newNormLF);
    console.log('✓ Patched normalizeDetectionType (LF)');
  }
}

fs.writeFileSync('analytics-engine/src/analytics-pipeline.ts', pipelineCode, 'utf8');
console.log('Saved analytics-engine/src/analytics-pipeline.ts');

// 2. Patch src/analytics/rule-engine.ts
let ruleEngineCode = fs.readFileSync('src/analytics/rule-engine.ts', 'utf8');

// A. eventDetectionTypes in rule-engine.ts
const oldEventTypes = `  if (event.detectionType === "helmet" || event.detectionType === "helmet-worn") {\r\n    types.push("helmet", "helmet-worn");\r\n  }`;
const newEventTypes = `  if (event.detectionType === "helmet" || event.detectionType === "helmet-worn") {\r\n    types.push("helmet", "helmet-worn");\r\n  }\r\n  if (event.detectionType === "dual-control-verification" || event.detectionType === "dual-control-violation") {\r\n    types.push("dual-control-verification", "dual-control-violation");\r\n  }`;
if (ruleEngineCode.includes(oldEventTypes)) {
  ruleEngineCode = ruleEngineCode.replace(oldEventTypes, newEventTypes);
  console.log('✓ Patched eventDetectionTypes in rule-engine.ts (CRLF)');
} else {
  const oldEventTypesLF = oldEventTypes.replace(/\r\n/g, '\n');
  const newEventTypesLF = newEventTypes.replace(/\r\n/g, '\n');
  if (ruleEngineCode.includes(oldEventTypesLF)) {
    ruleEngineCode = ruleEngineCode.replace(oldEventTypesLF, newEventTypesLF);
    console.log('✓ Patched eventDetectionTypes in rule-engine.ts (LF)');
  }
}

// B. analyticsAlertTitle in rule-engine.ts
const oldTitleCheck = `  if (rule.detectionType === "person" && rule.schedule && rule.schedule.start > rule.schedule.end) {\r\n    return "Person Detected after office hour";\r\n  }`;
const newTitleCheck = `  if (rule.detectionType === "person" && rule.schedule && rule.schedule.start > rule.schedule.end) {\r\n    return "Person Detected after office hour";\r\n  }\r\n  if (rule.detectionType === "dual-control-verification" || rule.detectionType === "dual-control-violation") {\r\n    return "Dual control violation detected";\r\n  }`;
if (ruleEngineCode.includes(oldTitleCheck)) {
  ruleEngineCode = ruleEngineCode.replace(oldTitleCheck, newTitleCheck);
  console.log('✓ Patched analyticsAlertTitle in rule-engine.ts (CRLF)');
} else {
  const oldTitleCheckLF = oldTitleCheck.replace(/\r\n/g, '\n');
  const newTitleCheckLF = newTitleCheck.replace(/\r\n/g, '\n');
  if (ruleEngineCode.includes(oldTitleCheckLF)) {
    ruleEngineCode = ruleEngineCode.replace(oldTitleCheckLF, newTitleCheckLF);
    console.log('✓ Patched analyticsAlertTitle in rule-engine.ts (LF)');
  }
}

// C. analyticsAlertDescription in rule-engine.ts
const oldDescCheck = `  if (rule.detectionType === "unknown-person") return "An unrecognised face was detected in this configured camera area.";`;
const newDescCheck = `  if (rule.detectionType === "unknown-person") return "An unrecognised face was detected in this configured camera area.";\r\n  if (rule.detectionType === "dual-control-verification" || rule.detectionType === "dual-control-violation") return "Single person detected in vault area. Dual control policy requires minimum 2 authorized persons.";`;
if (ruleEngineCode.includes(oldDescCheck)) {
  ruleEngineCode = ruleEngineCode.replace(oldDescCheck, newDescCheck);
  console.log('✓ Patched analyticsAlertDescription in rule-engine.ts (CRLF)');
} else {
  const oldDescCheckLF = oldDescCheck.replace(/\r\n/g, '\n');
  const newDescCheckLF = newDescCheck.replace(/\r\n/g, '\n');
  if (ruleEngineCode.includes(oldDescCheckLF)) {
    ruleEngineCode = ruleEngineCode.replace(oldDescCheckLF, newDescCheckLF);
    console.log('✓ Patched analyticsAlertDescription in rule-engine.ts (LF)');
  }
}

fs.writeFileSync('src/analytics/rule-engine.ts', ruleEngineCode, 'utf8');
console.log('Saved src/analytics/rule-engine.ts');
