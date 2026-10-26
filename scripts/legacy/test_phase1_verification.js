/**
 * Phase 1 Verification Test Suite
 * Validates:
 * 1. RBAC Engine (Roles, Granular Permissions, Super Admin bypass, Role resolution)
 * 2. Audit Logging Engine (Payload format, Action constants)
 * 3. Safe Configuration Reader (Dual-read safe defaults, Calculator & standard workflow fallbacks)
 */

import { PERMISSIONS, DEFAULT_ROLES, hasPermission, hasAnyPermission, getUserRolePermissions } from './src/utils/rbacEngine.js';
import { AUDIT_ACTIONS } from './src/utils/auditLogger.js';
import { getSafeWorkflow, getSafeCheckpoints, getSafeProjectList, isDynamicConfigActive } from './src/utils/configReader.js';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  ✓ PASS: ${testName}`);
        passed++;
    } else {
        console.error(`  ✗ FAIL: ${testName}`);
        failed++;
    }
}

console.log('====================================================');
console.log('  RUNNING PHASE 1 VERIFICATION TESTS');
console.log('====================================================\n');

// ─── 1. RBAC ENGINE TESTS ───
console.log('[1] RBAC Engine Tests:');

const superAdmin = { id: 'sa-1', name: 'Super User', role: 'Super Admin' };
const admin = { id: 'adm-1', name: 'Admin User', role: 'Admin' };
const operator = { id: 'op-1', name: 'Line Operator', role: 'Operator' };
const customUser = { id: 'cu-1', name: 'Custom Auditor', role: 'Auditor' };

const customRoles = {
    'Auditor': {
        name: 'Auditor',
        permissions: [PERMISSIONS.AUDIT_READ, PERMISSIONS.PROJECT_VIEW]
    }
};

assert(hasPermission(superAdmin, PERMISSIONS.CONFIG_TOGGLE_DYNAMIC), 'Super Admin has CONFIG_TOGGLE_DYNAMIC');
assert(hasPermission(superAdmin, 'ANY_ARBITRARY_PERMISSION_FUTURE'), 'Super Admin has wildcard * access to any permission');
assert(!hasPermission(admin, PERMISSIONS.CONFIG_TOGGLE_DYNAMIC), 'Admin is RESTRICTED from CONFIG_TOGGLE_DYNAMIC (Super Admin only)');
assert(hasPermission(admin, PERMISSIONS.USER_CREATE), 'Admin has USER_CREATE permission');
assert(hasPermission(admin, PERMISSIONS.PROJECT_VIEW), 'Admin has PROJECT_VIEW permission');

assert(!hasPermission(operator, PERMISSIONS.USER_CREATE), 'Operator is RESTRICTED from USER_CREATE');
assert(!hasPermission(operator, PERMISSIONS.ROLE_ASSIGN), 'Operator is RESTRICTED from ROLE_ASSIGN');
assert(hasPermission(operator, PERMISSIONS.SERIAL_SCAN), 'Operator has SERIAL_SCAN permission');

assert(hasPermission(customUser, PERMISSIONS.AUDIT_READ, customRoles), 'Custom Auditor has AUDIT_READ via customRoles');
assert(!hasPermission(customUser, PERMISSIONS.USER_DELETE, customRoles), 'Custom Auditor denied USER_DELETE');

const opPerms = getUserRolePermissions(operator);
assert(opPerms.includes(PERMISSIONS.SERIAL_SCAN), 'getUserRolePermissions returns correct permissions for Operator');
assert(hasAnyPermission(operator, [PERMISSIONS.SERIAL_SCAN, PERMISSIONS.USER_CREATE]), 'Operator hasAnyPermission matches SERIAL_SCAN');
assert(!hasAnyPermission(operator, [PERMISSIONS.USER_CREATE, PERMISSIONS.ROLE_ASSIGN]), 'Operator hasAnyPermission rejects unpermitted list');

// ─── 2. AUDIT LOGGER TESTS ───
console.log('\n[2] Audit Logger Action Definitions:');
assert(AUDIT_ACTIONS.CONFIG_MODE_TOGGLED === 'CONFIG_MODE_TOGGLED', 'AUDIT_ACTIONS has CONFIG_MODE_TOGGLED');
assert(AUDIT_ACTIONS.ROLE_UPDATED === 'ROLE_UPDATED', 'AUDIT_ACTIONS has ROLE_UPDATED');
assert(AUDIT_ACTIONS.SERIAL_MOVED === 'SERIAL_MOVED', 'AUDIT_ACTIONS has SERIAL_MOVED');

// ─── 3. SAFE CONFIGURATION READER TESTS ───
console.log('\n[3] Safe Configuration Reader Tests:');

assert(isDynamicConfigActive() === false, 'Safe Mode Default: dynamicConfigEnabled is false by default');

const devWorkflow = getSafeWorkflow('Device');
assert(Array.isArray(devWorkflow) && devWorkflow.length >= 6, 'Safe Workflow returns valid stations for Device');

const calcWorkflow = getSafeWorkflow('Calculator');
assert(Array.isArray(calcWorkflow) && calcWorkflow.length >= 8, 'Safe Workflow returns valid stations for Calculator');

const missingWorkflow = getSafeWorkflow('NonExistentProject_XYZ');
assert(Array.isArray(missingWorkflow) && missingWorkflow.length > 0, 'Safe Workflow falls back seamlessly for unknown project');

const devCheckpoints = getSafeCheckpoints('Device', 2);
assert(Array.isArray(devCheckpoints) && devCheckpoints.length >= 10, 'Safe Checkpoints returns checklist for Device Station 2');

const calcCheckpoints = getSafeCheckpoints('Calculator', 2);
assert(Array.isArray(calcCheckpoints) && calcCheckpoints.length > 0, 'Safe Checkpoints returns checklist for Calculator Station 2');

const unknownCheckpoints = getSafeCheckpoints('UnknownProject', 99);
assert(Array.isArray(unknownCheckpoints) && unknownCheckpoints.length === 0, 'Safe Checkpoints handles unknown checkpoint gracefully with empty array');

const projectList = getSafeProjectList();
assert(projectList.length >= 4, 'Safe Project List contains all 4 standard production projects');
const projNames = projectList.map(p => p.id);
assert(projNames.includes('Device') && projNames.includes('Calculator') && projNames.includes('Peripherals') && projNames.includes('Inward QC'), 'All core project IDs present');

console.log('\n====================================================');
console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================');

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
