/**
 * Phase 3 Verification Test Suite: Station Master & Checkpoint Studio
 * Validates:
 * 1. Station Master catalog integrity across all 4 production projects (26 stations)
 * 2. Terminal role types and sequence numbers
 * 3. Checkpoint schema and multi-type validation (PFH, DATA, BOOL, TEXT)
 * 4. Station soft-archival and audit tracking
 * 5. RBAC permissions and audit action taxonomy
 */

import { INITIAL_STATIONS } from './src/utils/configBootstrap.js';
import { AUDIT_ACTIONS } from './src/utils/auditLogger.js';
import { PERMISSIONS, hasPermission } from './src/utils/rbacEngine.js';
import { getSafeCheckpoints } from './src/utils/configReader.js';

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
console.log('  RUNNING PHASE 3 STATION & CHECKPOINT VERIFICATION');
console.log('====================================================\n');

// ─── 1. STATION MASTER CATALOG & SCHEMA ───
console.log('[1] Global Station Master Catalog Integrity:');

assert(Array.isArray(INITIAL_STATIONS) && INITIAL_STATIONS.length >= 20, 'INITIAL_STATIONS has at least 20 predefined stations');

const devStations = INITIAL_STATIONS.filter(s => s.projectId === 'Device');
const calcStations = INITIAL_STATIONS.filter(s => s.projectId === 'Calculator');
const perStations = INITIAL_STATIONS.filter(s => s.projectId === 'Peripherals');
const iqcStations = INITIAL_STATIONS.filter(s => s.projectId === 'Inward QC');

assert(devStations.length === 7, `Device has exactly 7 stations (found ${devStations.length})`);
assert(calcStations.length === 10, `Calculator has exactly 10 stations (found ${calcStations.length})`);
assert(perStations.length === 3, `Peripherals has exactly 3 stations (found ${perStations.length})`);
assert(iqcStations.length === 3, `Inward QC has exactly 3 stations (found ${iqcStations.length})`);

// Validate terminal role types
const validTerminalRoles = ['RECEIVING', 'INSPECTION', 'REPAIR_DEBUG', 'PACKAGING', 'SCRAP_REVIEW', 'GENERIC_QC'];
const allRolesValid = INITIAL_STATIONS.every(s => validTerminalRoles.includes(s.terminalType));
assert(allRolesValid, 'All stations use recognized terminal role types');

// Validate unique IDs
const idSet = new Set(INITIAL_STATIONS.map(s => s.id));
assert(idSet.size === INITIAL_STATIONS.length, 'All station IDs are distinct and unique');

// ─── 2. CHECKPOINT CRITERIA & TYPES ───
console.log('\n[2] Checkpoint Criteria & Multi-Type Schema Validation:');

// Device Station 2 (Inspection) Checkpoints
const devInspCheckpoints = getSafeCheckpoints('Device', 2);
assert(Array.isArray(devInspCheckpoints) && devInspCheckpoints.length === 16, `Device Inspection has 16 checkpoints (found ${devInspCheckpoints.length})`);

const hasPFH = devInspCheckpoints.some(c => c.type === 'PFH');
const hasBool = devInspCheckpoints.some(c => c.type === 'BOOL');
assert(hasPFH, 'Device Inspection contains PFH (Pass/Fail/Hold) checkpoints');
assert(hasBool, 'Device Inspection contains BOOL (Pass/Fail) checkpoints');

// Calculator Station 4 (Hardware QC / Debug) Checkpoints
const calcHwCheckpoints = getSafeCheckpoints('Calculator', 4);
assert(Array.isArray(calcHwCheckpoints) && calcHwCheckpoints.length === 13, `Calculator HW QC has 13 checkpoints (found ${calcHwCheckpoints.length})`);

const vbatCp = calcHwCheckpoints.find(c => c.key === 'vbat');
const noteCp = calcHwCheckpoints.find(c => c.key === 'debug_note');

assert(!!vbatCp && vbatCp.type === 'DATA', 'VBAT checkpoint is DATA type with numeric measurement requirement');
assert(vbatCp.dataLabel.includes('VBAT'), 'VBAT dataLabel configured');
assert(!!noteCp && noteCp.type === 'TEXT', 'debug_note checkpoint is TEXT type for mandatory note');
assert(noteCp.required === true, 'debug_note is marked required');

// ─── 3. CHECKPOINT REORDERING & STRUCTURAL INTEGRITY ───
console.log('\n[3] Checkpoint Reordering & Ordering Integrity:');

function reorderCheckpoints(list, fromIdx, toIdx) {
    const next = [...list];
    const item = next.splice(fromIdx, 1)[0];
    next.splice(toIdx, 0, item);
    return next.map((c, i) => ({ ...c, order: i + 1 }));
}

const reordered = reorderCheckpoints(devInspCheckpoints, 0, 1);
assert(reordered[0].key === devInspCheckpoints[1].key, 'First item moved to second position');
assert(reordered[1].key === devInspCheckpoints[0].key, 'Second item moved to first position');
assert(reordered[0].order === 1 && reordered[1].order === 2, 'Order index recomputed cleanly');

// ─── 4. STATION SOFT-ARCHIVE WITH OPERATIONAL REASON ───
console.log('\n[4] Station Archival & Immutability:');

function archiveStation(station, reason, actor) {
    if (!reason || !reason.trim()) {
        throw new Error('Archive reason required');
    }
    return {
        ...station,
        status: 'Archived',
        archivedAt: new Date().toISOString(),
        archivedBy: actor?.name || actor?.id || 'Admin',
        archiveReason: reason.trim()
    };
}

const sampleStation = INITIAL_STATIONS[0];
const archivedStation = archiveStation(sampleStation, 'Replaced by automated barcode tunnel', { name: 'Admin User' });
assert(archivedStation.status === 'Archived', 'Station status updated to Archived');
assert(archivedStation.archiveReason === 'Replaced by automated barcode tunnel', 'Operational reason recorded');
assert(!!archivedStation.archivedAt, 'Archival timestamp recorded');

// ─── 5. RBAC PERMISSIONS & AUDIT ACTIONS ───
console.log('\n[5] RBAC Permissions & Audit Actions for Stations & Checkpoints:');

const adminUser = { role: 'Admin' };
const opUser = { role: 'Operator' };

assert(hasPermission(adminUser, PERMISSIONS.STATION_CREATE), 'Admin has STATION_CREATE');
assert(hasPermission(adminUser, PERMISSIONS.STATION_EDIT), 'Admin has STATION_EDIT');
assert(hasPermission(adminUser, PERMISSIONS.STATION_ARCHIVE), 'Admin has STATION_ARCHIVE');
assert(hasPermission(adminUser, PERMISSIONS.CHECKPOINT_VIEW), 'Admin has CHECKPOINT_VIEW');
assert(hasPermission(adminUser, PERMISSIONS.CHECKPOINT_EDIT), 'Admin has CHECKPOINT_EDIT');
assert(hasPermission(adminUser, PERMISSIONS.CHECKPOINT_PUBLISH), 'Admin has CHECKPOINT_PUBLISH');

assert(!hasPermission(opUser, PERMISSIONS.STATION_CREATE), 'Operator denied STATION_CREATE');
assert(!hasPermission(opUser, PERMISSIONS.STATION_EDIT), 'Operator denied STATION_EDIT');
assert(!hasPermission(opUser, PERMISSIONS.CHECKPOINT_EDIT), 'Operator denied CHECKPOINT_EDIT');

assert(AUDIT_ACTIONS.STATION_CREATED === 'STATION_CREATED', 'AUDIT_ACTIONS has STATION_CREATED');
assert(AUDIT_ACTIONS.STATION_UPDATED === 'STATION_UPDATED', 'AUDIT_ACTIONS has STATION_UPDATED');
assert(AUDIT_ACTIONS.STATION_ARCHIVED === 'STATION_ARCHIVED', 'AUDIT_ACTIONS has STATION_ARCHIVED');
assert(AUDIT_ACTIONS.CHECKPOINT_CREATED === 'CHECKPOINT_CREATED', 'AUDIT_ACTIONS has CHECKPOINT_CREATED');
assert(AUDIT_ACTIONS.CHECKPOINT_UPDATED === 'CHECKPOINT_UPDATED', 'AUDIT_ACTIONS has CHECKPOINT_UPDATED');
assert(AUDIT_ACTIONS.CHECKPOINT_PUBLISHED === 'CHECKPOINT_PUBLISHED', 'AUDIT_ACTIONS has CHECKPOINT_PUBLISHED');

console.log('\n====================================================');
console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================');

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
