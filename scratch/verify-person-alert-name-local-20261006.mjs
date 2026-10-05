import assert from 'node:assert/strict';
import { analyticsAlertTitle } from '../src/analytics/rule-engine.ts';
assert.equal(analyticsAlertTitle({detectionType:'person',schedule:{start:'20:00',end:'08:00'}}),'Person Detected after office hour');
assert.equal(analyticsAlertTitle({detectionType:'person'}),'Person detected');
assert.equal(analyticsAlertTitle({detectionType:'person',schedule:{start:'08:00',end:'20:00'}}),'Person detected');
assert.equal(analyticsAlertTitle({detectionType:'helmet-worn'}),'Helmet worn detected');
console.log('Local title checks passed');
