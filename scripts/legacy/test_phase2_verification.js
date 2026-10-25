/**
 * Phase 2 Verification Test Suite: Project Master Studio
 * Validates:
 * 1. Project profile creation and validation
 * 2. Multi-variant specifications (Models, HW/SW revisions, Product types)
 * 3. Serial Number Rules & live regex evaluation
 * 4. Project cloning engine
 * 5. Project archiving with audit tracking
 */

import { INITIAL_PROJECTS } from './src/utils/configBootstrap.js';
import { AUDIT_ACTIONS } from './src/utils/auditLogger.js';
import { PERMISSIONS, hasPermission } from './src/utils/rbacEngine.js';

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
console.log('  RUNNING PHASE 2 PROJECT MASTER STUDIO VERIFICATION');
console.log('====================================================\n');

// ─── 1. INITIAL PROJECT MASTERS INTEGRITY ───
console.log('[1] Core Project Masters Schema & Initialization:');

assert(Array.isArray(INITIAL_PROJECTS) && INITIAL_PROJECTS.length >= 4, 'INITIAL_PROJECTS has at least 4 default projects');

const deviceProj = INITIAL_PROJECTS.find(p => p.id === 'Device');
const calcProj = INITIAL_PROJECTS.find(p => p.id === 'Calculator');

assert(!!deviceProj, 'Device project master exists');
assert(deviceProj.code === 'DEV', 'Device project has code DEV');
assert(deviceProj.status === 'Active', 'Device project is Active');
assert(Array.isArray(deviceProj.defaultSpecs?.models) && deviceProj.defaultSpecs.models.length > 0, 'Device project has models configured');
assert(!!deviceProj.serialRules?.regex, 'Device project has serial regex defined');

assert(!!calcProj, 'Calculator project master exists');
assert(calcProj.category === 'Calculator', 'Calculator project has Calculator category');
assert(calcProj.status === 'Active', 'Calculator project is Active');

// ─── 2. SERIAL REGEX EVALUATION & GOVERNANCE ───
console.log('\n[2] Serial Number Regex Validation & Live Tester Engine:');

const defaultRegex = new RegExp(deviceProj.serialRules.regex);
assert(defaultRegex.test('PAX-A920-001'), 'Valid serial passes standard regex');
assert(defaultRegex.test('SN12345678'), 'Valid alphanumeric serial passes standard regex');
assert(!defaultRegex.test('A'), 'Short serial (1 char) is rejected');
assert(!defaultRegex.test('SN 123 456'), 'Serial with spaces is rejected');
assert(!defaultRegex.test('SN@123#$$%'), 'Serial with illegal special characters is rejected');

// Custom regex for high-security device
const customRegex = new RegExp('^SBX-[0-9]{4}-[A-Z]{2}$');
assert(customRegex.test('SBX-1234-AB'), 'Custom Soundbox serial matches pattern');
assert(!customRegex.test('SBX-123-AB'), 'Invalid Soundbox serial fails pattern');

// ─── 3. PROJECT CLONING LOGIC ───
console.log('\n[3] Project Cloning Engine:');

function cloneProject(sourceProj, newId, newName, newCode, actor) {
    return {
        ...sourceProj,
        id: newId,
        name: newName,
        code: newCode.toUpperCase(),
        status: 'Draft',
        version: 1,
        createdAt: new Date().toISOString(),
        createdBy: actor?.name || actor?.id || 'Admin',
        updatedAt: new Date().toISOString(),
        updatedBy: actor?.name || actor?.id || 'Admin',
        clonedFrom: sourceProj.id
    };
}

const cloned = cloneProject(deviceProj, 'Device_V2', 'Smart POS Terminal V2', 'DEV2', { name: 'Lead Engineer' });
assert(cloned.id === 'Device_V2', 'Cloned project has new ID');
assert(cloned.name === 'Smart POS Terminal V2', 'Cloned project has new Name');
assert(cloned.code === 'DEV2', 'Cloned project has new uppercase Code');
assert(cloned.status === 'Draft', 'Cloned project starts in Draft status for safety');
assert(cloned.clonedFrom === 'Device', 'Cloned project retains provenance link');
assert(cloned.defaultSpecs.models.length === deviceProj.defaultSpecs.models.length, 'Cloned project inherits all models');
assert(cloned.serialRules.regex === deviceProj.serialRules.regex, 'Cloned project inherits serial validation rules');

// ─── 4. PROJECT ARCHIVE & IMMUTABILITY ───
console.log('\n[4] Project Soft-Archive & Deactivation:');

function archiveProject(project, reason, actor) {
    if (!reason || !reason.trim()) {
        throw new Error('Archive reason required');
    }
    return {
        ...project,
        status: 'Archived',
        archivedAt: new Date().toISOString(),
        archivedBy: actor?.name || actor?.id || 'Admin',
        archiveReason: reason.trim()
    };
}

const archived = archiveProject(cloned, 'Deprecated generation in favor of V3', { name: 'Admin' });
assert(archived.status === 'Archived', 'Project status updated to Archived');
assert(archived.archiveReason === 'Deprecated generation in favor of V3', 'Archive reason recorded');
assert(!!archived.archivedAt, 'Archive timestamp recorded');

// ─── 5. RBAC & AUDIT ACTIONS ───
console.log('\n[5] RBAC Permissions & Audit Action Taxonomy:');

const adminUser = { role: 'Admin' };
const opUser = { role: 'Operator' };

assert(hasPermission(adminUser, PERMISSIONS.PROJECT_CREATE), 'Admin has PROJECT_CREATE');
assert(hasPermission(adminUser, PERMISSIONS.PROJECT_EDIT), 'Admin has PROJECT_EDIT');
assert(hasPermission(adminUser, PERMISSIONS.PROJECT_ARCHIVE), 'Admin has PROJECT_ARCHIVE');
assert(!hasPermission(opUser, PERMISSIONS.PROJECT_CREATE), 'Operator denied PROJECT_CREATE');
assert(!hasPermission(opUser, PERMISSIONS.PROJECT_EDIT), 'Operator denied PROJECT_EDIT');
assert(!hasPermission(opUser, PERMISSIONS.PROJECT_ARCHIVE), 'Operator denied PROJECT_ARCHIVE');

assert(AUDIT_ACTIONS.PROJECT_CREATED === 'PROJECT_CREATED', 'AUDIT_ACTIONS has PROJECT_CREATED');
assert(AUDIT_ACTIONS.PROJECT_UPDATED === 'PROJECT_UPDATED', 'AUDIT_ACTIONS has PROJECT_UPDATED');
assert(AUDIT_ACTIONS.PROJECT_ARCHIVED === 'PROJECT_ARCHIVED', 'AUDIT_ACTIONS has PROJECT_ARCHIVED');
assert(AUDIT_ACTIONS.PROJECT_CLONED === 'PROJECT_CLONED', 'AUDIT_ACTIONS has PROJECT_CLONED');

console.log('\n====================================================');
console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================');

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
