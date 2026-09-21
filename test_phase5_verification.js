/**
 * Automated Verification Test Suite for Phase 5:
 * Serial & Production Governance Studio
 * 
 * Verifies:
 * 1. Hold Taxonomy integrity & standard reason categories
 * 2. Disposition actions metadata & risk classification
 * 3. Looper risk evaluation across iteration counts & thresholds
 * 4. Hold request validation & input sanitization
 * 5. Release request validation & resolution enforcement
 * 6. Disposition request validation & Super Admin privileges on locked units
 * 7. History event timeline normalizer & event badge mapping
 * 8. RBAC permission integrity for Serial Movement, Hold/Unhold, and Scrap Review
 */

import {
    HOLD_TAXONOMY,
    DISPOSITION_ACTIONS,
    evaluateLooperRisk,
    validateHoldRequest,
    validateReleaseRequest,
    validateDispositionRequest,
    formatHistoryEvent
} from './src/utils/governanceEngine.js';
import { PERMISSIONS, DEFAULT_ROLES, hasPermission } from './src/utils/rbacEngine.js';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  ✓ ${testName}`);
        passed++;
    } else {
        console.error(`  ✗ FAIL: ${testName}`);
        failed++;
    }
}

console.log('\n======================================================');
console.log('--- PHASE 5: SERIAL & PRODUCTION GOVERNANCE TESTS ---');
console.log('======================================================\n');

// 1. HOLD TAXONOMY
console.log('1. Hold Taxonomy & Standard Reason Verification');
assert(HOLD_TAXONOMY.Quality !== undefined, 'Quality hold category is defined');
assert(HOLD_TAXONOMY.Engineering !== undefined, 'Engineering hold category is defined');
assert(HOLD_TAXONOMY.Material !== undefined, 'Material hold category is defined');
assert(HOLD_TAXONOMY.Process !== undefined, 'Process hold category is defined');
assert(HOLD_TAXONOMY.Other !== undefined, 'Administrative/Other hold category is defined');
assert(Array.isArray(HOLD_TAXONOMY.Quality.reasons) && HOLD_TAXONOMY.Quality.reasons.length >= 3, 'Quality category has standard reason templates');
assert(Array.isArray(HOLD_TAXONOMY.Engineering.reasons) && HOLD_TAXONOMY.Engineering.reasons.length >= 3, 'Engineering category has standard reason templates');
assert(Array.isArray(HOLD_TAXONOMY.Material.reasons) && HOLD_TAXONOMY.Material.reasons.length >= 3, 'Material category has standard reason templates');

// 2. DISPOSITION ACTIONS
console.log('\n2. Disposition Actions & Risk Profiles');
assert(DISPOSITION_ACTIONS.SCRAP_REVIEW !== undefined, 'SCRAP_REVIEW disposition action exists');
assert(DISPOSITION_ACTIONS.MRB_ESCALATION !== undefined, 'MRB_ESCALATION disposition action exists');
assert(DISPOSITION_ACTIONS.RESET_LOOPER !== undefined, 'RESET_LOOPER disposition action exists');
assert(DISPOSITION_ACTIONS.RESTART_LINE !== undefined, 'RESTART_LINE disposition action exists');
assert(DISPOSITION_ACTIONS.SCRAP_REVIEW.riskLevel === 'HIGH', 'Scrap review is classified as HIGH risk');
assert(DISPOSITION_ACTIONS.SCRAP_REVIEW.targetType === 'TERMINAL_SCRAP', 'Scrap review targets terminal scrap');
assert(DISPOSITION_ACTIONS.RESET_LOOPER.requiresConfirmation === true, 'Reset looper requires confirmation');

// 3. LOOPER RISK EVALUATION
console.log('\n3. Looper Risk Evaluation Logic');
const riskNormal = evaluateLooperRisk(1, 3);
assert(riskNormal.level === 'NORMAL' && riskNormal.badgeClass === 'success', 'Loop count 1 is classified as NORMAL');

const riskMedium = evaluateLooperRisk(2, 3);
assert(riskMedium.level === 'MEDIUM' && riskMedium.badgeClass === 'info', 'Loop count 2 is classified as MEDIUM risk');

const riskHigh = evaluateLooperRisk(3, 3);
assert(riskHigh.level === 'HIGH' && riskHigh.badgeClass === 'warning', 'Loop count 3 (meeting threshold) is classified as HIGH risk');

const riskCritical = evaluateLooperRisk(4, 3);
assert(riskCritical.level === 'CRITICAL' && riskCritical.badgeClass === 'danger', 'Loop count 4 (exceeding threshold) is classified as CRITICAL risk');
assert(riskCritical.recommendedAction === 'SCRAP_REVIEW', 'Critical looper recommends SCRAP_REVIEW');

// 4. HOLD REQUEST VALIDATION & SANITIZATION
console.log('\n4. Hold Request Validation');
const unauthHold = validateHoldRequest({ serials: ['L001-A23-001'], category: 'Quality', reason: 'Defect', user: null });
assert(unauthHold.isValid === false, 'Rejects unauthenticated hold request');

const emptySerialsHold = validateHoldRequest({ serials: [], category: 'Quality', reason: 'Defect', user: { role: 'Admin' } });
assert(emptySerialsHold.isValid === false, 'Rejects hold request with empty serials');

const invalidCatHold = validateHoldRequest({ serials: ['L001-A23-001'], category: 'InvalidCategory', reason: 'Defect', user: { role: 'Admin' } });
assert(invalidCatHold.isValid === false, 'Rejects hold request with invalid taxonomy category');

const shortReasonHold = validateHoldRequest({ serials: ['L001-A23-001'], category: 'Quality', reason: 'A', user: { role: 'Admin' } });
assert(shortReasonHold.isValid === false, 'Rejects hold request with reason shorter than 3 characters');

const validHold = validateHoldRequest({
    serials: ['sn/001/a', 'SN-002 '],
    category: 'Quality',
    reason: 'Critical Defect Spike observed on line',
    remarks: 'Lot #4492',
    user: { role: 'Admin' }
});
assert(validHold.isValid === true, 'Accepts valid hold request');
assert(validHold.sanitized.serials[0] === 'SN-001-A', 'Normalizes slashes to dashes and uppercases serial 1');
assert(validHold.sanitized.serials[1] === 'SN-002', 'Trims whitespace and uppercases serial 2');

// 5. RELEASE REQUEST VALIDATION
console.log('\n5. Release Request Validation');
const unauthRel = validateReleaseRequest({ serials: ['SN-001'], resolutionReason: 'Fixed', user: null });
assert(unauthRel.isValid === false, 'Rejects unauthenticated release request');

const missingReasonRel = validateReleaseRequest({ serials: ['SN-001'], resolutionReason: '', user: { role: 'Admin' } });
assert(missingReasonRel.isValid === false, 'Rejects release request without resolution justification');

const validRel = validateReleaseRequest({
    serials: ['sn/001'],
    resolutionReason: 'Cleared by QA Lead inspection',
    resolutionNotes: 'Passed full recalibration loop',
    user: { role: 'Admin' }
});
assert(validRel.isValid === true, 'Accepts valid release request');
assert(validRel.sanitized.serials[0] === 'SN-001', 'Sanitizes serial number on release');
assert(validRel.sanitized.resolutionReason === 'Cleared by QA Lead inspection', 'Captures sanitized resolution justification');

// 6. DISPOSITION REQUEST VALIDATION
console.log('\n6. Disposition Request Validation');
const unknownDisp = validateDispositionRequest({
    actionId: 'UNKNOWN_ACTION',
    unit: { id: 'SN-001', status: 'Processing' },
    reason: 'Valid reason here',
    user: { role: 'Admin' }
});
assert(unknownDisp.isValid === false, 'Rejects unknown disposition action ID');

const scrapUnitWIP = validateDispositionRequest({
    actionId: 'SCRAP_REVIEW',
    unit: { id: 'SN-001', status: 'Processing' },
    reason: 'Irreparable core damage confirmed by debug lead',
    user: { role: 'Admin' }
});
assert(scrapUnitWIP.isValid === true, 'Permits admin to route WIP unit to Scrap Review');

const reopenLockedNonSuper = validateDispositionRequest({
    actionId: 'RESTART_LINE',
    unit: { id: 'SN-001', status: 'Scrap' },
    reason: 'Mistaken scrap disposition',
    user: { role: 'Admin' } // Not Super Admin
});
assert(reopenLockedNonSuper.isValid === false, 'Blocks normal Admin from redisposing locked/scrapped unit');

const reopenLockedSuper = validateDispositionRequest({
    actionId: 'RESTART_LINE',
    unit: { id: 'SN-001', status: 'Scrap' },
    reason: 'Super admin authorization after vendor root cause analysis',
    user: { role: 'Super Admin' }
});
assert(reopenLockedSuper.isValid === true, 'Allows Super Admin to redispose/restart scrapped unit');

// 7. TIMELINE EVENT FORMATTING
console.log('\n7. Timeline Event Normalizer');
const passEvt = formatHistoryEvent({ station: 'DEBUG', result: 'Pass', timestamp: '2026-09-20T10:00:00Z', operator: 'John' }, 0);
assert(passEvt.eventType === 'PASS' && passEvt.badgeClass === 'success', 'Formats PASS event with success badge');

const failEvt = formatHistoryEvent({ station: 'INSPECTION', result: 'Fail', timestamp: '2026-09-20T10:10:00Z', operator: 'Jane' }, 1);
assert(failEvt.eventType === 'FAIL' && failEvt.badgeClass === 'danger', 'Formats FAIL event with danger badge');

const holdEvt = formatHistoryEvent({ station: 'REWORK', result: 'ADMIN_HOLD', reason: 'Component alert', operator: 'Admin' }, 2);
assert(holdEvt.eventType === 'HOLD' && holdEvt.badgeClass === 'warning', 'Formats ADMIN_HOLD event with warning badge');

const unholdEvt = formatHistoryEvent({ station: 'REWORK', result: 'ADMIN_UNHOLD', reason: 'Cleared', operator: 'Admin' }, 3);
assert(unholdEvt.eventType === 'UNHOLD' && unholdEvt.badgeClass === 'info', 'Formats ADMIN_UNHOLD event with info badge');

const overrideEvt = formatHistoryEvent({ station: 'ADMIN OVERRIDE: -> FINAL QC', result: 'ADMIN_REROUTE', operator: 'Admin' }, 4);
assert(overrideEvt.eventType === 'OVERRIDE' && overrideEvt.badgeClass === 'primary', 'Formats ADMIN_REROUTE event with primary badge');

// 8. RBAC PERMISSIONS FOR SERIAL GOVERNANCE
console.log('\n8. RBAC Permissions Verification');
assert(PERMISSIONS.SERIAL_VIEW === 'serial.view', 'SERIAL_VIEW permission is defined');
assert(PERMISSIONS.SERIAL_MOVE === 'serial.move', 'SERIAL_MOVE permission is defined');
assert(PERMISSIONS.SERIAL_HOLD_UNHOLD === 'serial.hold_unhold', 'SERIAL_HOLD_UNHOLD permission is defined');
assert(PERMISSIONS.SERIAL_SCRAP_REVIEW === 'serial.scrap.review', 'SERIAL_SCRAP_REVIEW permission is defined');

const superAdminUser = { role: 'Super Admin' };
const adminUser = { role: 'Admin' };
const operatorUser = { role: 'Operator' };

assert(hasPermission(superAdminUser, PERMISSIONS.SERIAL_MOVE) === true, 'Super Admin has SERIAL_MOVE');
assert(hasPermission(superAdminUser, PERMISSIONS.SERIAL_HOLD_UNHOLD) === true, 'Super Admin has SERIAL_HOLD_UNHOLD');
assert(hasPermission(adminUser, PERMISSIONS.SERIAL_MOVE) === true, 'Admin has SERIAL_MOVE');
assert(hasPermission(adminUser, PERMISSIONS.SERIAL_HOLD_UNHOLD) === true, 'Admin has SERIAL_HOLD_UNHOLD');
assert(hasPermission(operatorUser, PERMISSIONS.SERIAL_MOVE) === false, 'Operator lacks SERIAL_MOVE permission');
assert(hasPermission(operatorUser, PERMISSIONS.SERIAL_HOLD_UNHOLD) === false, 'Operator lacks SERIAL_HOLD_UNHOLD permission');

console.log('\n======================================================');
console.log(`PHASE 5 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
console.log('======================================================\n');

if (failed > 0) {
    process.exit(1);
}
