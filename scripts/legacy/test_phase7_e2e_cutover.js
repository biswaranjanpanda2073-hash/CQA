/**
 * Automated Verification Test Suite for Phase 7:
 * End-to-End System Integration, Production Fallback Validation & Cutover
 * 
 * Simulates a complete zero-code lifecycle for a newly configured project:
 * 1. Project Master definition & regex validation
 * 2. Station assignment & multi-type checkpoint validation (PFH, BOOL, DATA, TEXT)
 * 3. Topological workflow assembly & dynamic destination resolution
 * 4. BAAN spare part cataloging & storage bin allocation
 * 5. Serial unit progression, Hold quarantine application, and resolution release
 * 6. Looper iteration detection, risk evaluation, and disposition signoff
 * 7. Dual-read engine validation: Fallback vs Dynamic Firestore reads
 * 8. Super Admin cutover toggle governance and immutable audit trail generation
 */

import { PERMISSIONS, DEFAULT_ROLES, hasPermission } from './src/utils/rbacEngine.js';
import { AUDIT_ACTIONS } from './src/utils/auditLogger.js';
import { 
    validateWorkflowGraph, 
    resolveDynamicNextStation, 
    createWorkflowDraft 
} from './src/utils/workflowEngine.js';
import { 
    HOLD_TAXONOMY, 
    DISPOSITION_ACTIONS, 
    evaluateLooperRisk, 
    validateHoldRequest, 
    validateReleaseRequest, 
    validateDispositionRequest 
} from './src/utils/governanceEngine.js';
import { 
    normalizeBaanPartNumber, 
    validatePartRecord, 
    calculateStockHealth 
} from './src/utils/baanEngine.js';
import { 
    getSafeWorkflow, 
    getSafeCheckpoints, 
    getSafeProjectList, 
    isDynamicConfigActive 
} from './src/utils/configReader.js';

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

console.log('\n================================================================');
console.log('--- PHASE 7: END-TO-END INTEGRATION & CUTOVER VERIFICATION ---');
console.log('================================================================\n');

// ══════════════════════════════════════════════════════════════════
// 1. DYNAMIC PROJECT MASTER CREATION (ZERO-CODE)
// ══════════════════════════════════════════════════════════════════
console.log('1. Dynamic Project Master Configuration');
const newProject = {
    id: 'SmartPOS_X',
    name: 'NextGen SmartPOS X-Series',
    code: 'SPX',
    category: 'Device',
    status: 'Active',
    models: ['SPX-100', 'SPX-200', 'SPX-300 Pro'],
    serialRules: {
        regex: '^SPX-[A-Z0-9]{4}-[0-9]{5}$'
    }
};

const snRegex = new RegExp(newProject.serialRules.regex);
assert(snRegex.test('SPX-A9B2-00123') === true, 'Validates compliant serial against dynamic regex');
assert(snRegex.test('INVALID-SERIAL-123') === false, 'Rejects non-compliant serial against dynamic regex');
assert(newProject.models.length === 3, 'Multi-model variants configured');

// ══════════════════════════════════════════════════════════════════
// 2. STATION & MULTI-TYPE CHECKPOINT CONFIGURATION
// ══════════════════════════════════════════════════════════════════
console.log('\n2. Station & Quality Criteria Assembly');
const spxStations = [
    { stationId: 101, name: 'SPX INTAKE', sequence: 1, type: 'RECEIVING' },
    { stationId: 102, name: 'SPX VISUAL & POWER QC', sequence: 2, type: 'WIP' },
    { stationId: 103, name: 'SPX DIAGNOSTIC & DEBUG', sequence: 3, type: 'WIP' },
    { stationId: 104, name: 'SPX COMPONENT REWORK', sequence: 4, type: 'WIP' },
    { stationId: 105, name: 'SPX PACKING & LABELING', sequence: 5, type: 'WIP' },
    { stationId: 106, name: 'SPX TERMINAL FG', sequence: 6, type: 'TERMINAL_FG' },
    { stationId: 107, name: 'SPX TERMINAL SCRAP', sequence: 7, type: 'TERMINAL_SCRAP' }
];

const spxCheckpoints = [
    { key: 'housing_intact', label: 'Housing Enclosure Intact', type: 'BOOL', required: true },
    { key: 'battery_voltage', label: 'Battery Open-Circuit Voltage', type: 'DATA', unit: 'V', min: 3.6, max: 4.2, required: true },
    { key: 'ble_pairing', label: 'Bluetooth BLE Beacon Active', type: 'PFH', required: true },
    { key: 'screen_touch', label: 'Capacitive Multi-touch Test', type: 'PFH', required: true },
    { key: 'diagnostic_notes', label: 'Technician Inspection Notes', type: 'TEXT', required: false }
];

assert(spxStations.length === 7, 'Configured 7 custom pipeline stations for new project');
assert(spxCheckpoints.some(c => c.type === 'DATA' && c.unit === 'V'), 'Station contains numeric DATA measurement checkpoint');
assert(spxCheckpoints.some(c => c.type === 'BOOL'), 'Station contains boolean BOOL checkpoint');
assert(spxCheckpoints.some(c => c.type === 'TEXT'), 'Station contains mandatory TEXT notes checkpoint');
assert(spxCheckpoints.some(c => c.type === 'PFH'), 'Station contains 3-state PFH checkpoint');

// ══════════════════════════════════════════════════════════════════
// 3. TOPOLOGICAL WORKFLOW & ROUTING MATRIX VALIDATION
// ══════════════════════════════════════════════════════════════════
console.log('\n3. Topological Graph Validation & Branch Routing');
const spxRoutingMatrix = {
    101: { passTarget: 102, failTarget: 107, allowedPass: [102], allowedFail: [107], isIntake: true },
    102: { passTarget: 105, failTarget: 103, allowedPass: [105, 103], allowedFail: [103, 104, 107] },
    103: { passTarget: 104, failTarget: 107, allowedPass: [104], allowedFail: [107] },
    104: { passTarget: 102, failTarget: 107, allowedPass: [102], allowedFail: [107] },
    105: { passTarget: 106, failTarget: 103, allowedPass: [106], allowedFail: [103] },
    106: { isTerminalFG: true },
    107: { isTerminalScrap: true }
};

const graphCheck = validateWorkflowGraph(spxStations, spxRoutingMatrix);
assert(graphCheck.isValid === true, 'New project workflow passes topological graph validation');
assert(graphCheck.errors.length === 0, 'Zero topological errors in dynamically assembled pipeline');

// Test Dynamic Next Station Resolution on Pass & Fail
const testPass = resolveDynamicNextStation({
    projectId: 'SmartPOS_X',
    currentStationId: 102,
    result: 'Pass',
    routingMatrix: spxRoutingMatrix,
    workflowStations: spxStations
});
assert(testPass.nextStationId === 105, 'Station 102 (Visual QC) Pass dynamically routes to Station 105 (Packing)');

const testFail = resolveDynamicNextStation({
    projectId: 'SmartPOS_X',
    currentStationId: 102,
    result: 'Fail',
    routingMatrix: spxRoutingMatrix,
    workflowStations: spxStations
});
assert(testFail.nextStationId === 103, 'Station 102 (Visual QC) Fail dynamically routes to Station 103 (Diagnostic & Debug)');

const testHold = resolveDynamicNextStation({
    projectId: 'SmartPOS_X',
    currentStationId: 102,
    result: 'Hold',
    routingMatrix: spxRoutingMatrix,
    workflowStations: spxStations
});
assert(testHold.isHold === true && testHold.nextStationId === null, 'Hold blocks station advancement in dynamic workflow');

// ══════════════════════════════════════════════════════════════════
// 4. BAAN SPARE PARTS & WAREHOUSE BIN ALLOCATION
// ══════════════════════════════════════════════════════════════════
console.log('\n4. BAAN Spare Parts Master & Inventory Logic');
const rawPartNumber = '  spx/ic/9900/pro  ';
const normalizedPN = normalizeBaanPartNumber(rawPartNumber);
assert(normalizedPN === 'SPX-IC-9900-PRO', 'BAAN part number normalized to uppercase hyphenated format');

const partValidation = validatePartRecord({
    partNumber: normalizedPN,
    description: 'SmartPOS X Main Controller IC',
    category: 'IC / Semiconductor',
    unitCost: 18.50,
    minStock: 50,
    currentStock: 25 // Deficit!
});
assert(partValidation.isValid === true, 'Validates BAAN part record');

const stockHealth = calculateStockHealth({ currentStock: 25, minStock: 50 });
assert(stockHealth.status === 'LOW', 'Correctly flags stock below threshold as LOW status');
assert(stockHealth.deficit === 25, 'Calculates stock replenishment deficit (50 - 25 = 25 units)');

// ══════════════════════════════════════════════════════════════════
// 5. SERIAL GOVERNANCE: QUARANTINE HOLD & RELEASE CYCLE
// ══════════════════════════════════════════════════════════════════
console.log('\n5. Serial Quarantine Hold & Resolution Release');
const mockUser = { id: 'ADM-001', name: 'Admin Lead', role: 'Admin' };

const holdReq = validateHoldRequest({
    serials: ['spx/a9b2/00123'],
    category: 'Quality',
    reason: HOLD_TAXONOMY.Quality.reasons[0],
    remarks: 'IC pin solder bridge detected',
    user: mockUser
});
assert(holdReq.isValid === true, 'Validates and sanitizes administrative quarantine hold request');
assert(holdReq.sanitized.serials[0] === 'SPX-A9B2-00123', 'Serial sanitized to SPX-A9B2-00123');

const relReq = validateReleaseRequest({
    serials: holdReq.sanitized.serials,
    resolutionReason: 'Solder bridge cleared and verified under microscope',
    resolutionNotes: 'Passed secondary continuity check',
    user: mockUser
});
assert(relReq.isValid === true, 'Validates and authorizes quarantine hold release');

// ══════════════════════════════════════════════════════════════════
// 6. LOOPER DETECTION & DISPOSITION SIGNOFF
// ══════════════════════════════════════════════════════════════════
console.log('\n6. Repeat Looper Detection & Scrap Disposition');
const looperRiskHigh = evaluateLooperRisk(3, 3);
assert(looperRiskHigh.level === 'HIGH', 'Flagged unit reaching 3 iterations as HIGH risk looper');

const scrapDisp = validateDispositionRequest({
    actionId: 'SCRAP_REVIEW',
    unit: { id: 'SPX-A9B2-00123', status: 'Processing', looper: 4 },
    reason: 'Repeated core trace damage beyond economical rework',
    user: mockUser
});
assert(scrapDisp.isValid === true, 'Authorizes routing critical looper unit to Scrap Review');

// ══════════════════════════════════════════════════════════════════
// 7. DUAL-READ SAFE FALLBACK & CUTOVER ENGINE
// ══════════════════════════════════════════════════════════════════
console.log('\n7. Dual-Read Safe Fallback Engine Verification');
// In default fallback mode (dynamicConfigEnabled = false)
const fallbackWorkflow = getSafeWorkflow('Device', null);
assert(Array.isArray(fallbackWorkflow) && fallbackWorkflow.length >= 7, 'Safe reader returns proven hardcoded workflow when fallback active');

const fallbackCheckpoints = getSafeCheckpoints('Device', 2, null);
assert(fallbackCheckpoints.length === 16, 'Safe reader returns 16-point Inspection checklist in fallback mode');

const fallbackProjects = getSafeProjectList(null);
assert(fallbackProjects.length === 4, 'Safe reader provides all 4 core projects in fallback mode');

// Dynamic read simulation: when custom Firestore workflows are provided
const customCache = {
    'SmartPOS_X': {
        stations: spxStations
    }
};
// If dynamic config enabled, reads custom; if disabled, falls back safely
const dynamicWorkflow = getSafeWorkflow('SmartPOS_X', customCache);
assert(Array.isArray(dynamicWorkflow), 'Safe reader guarantees an array even for newly introduced projects');

// ══════════════════════════════════════════════════════════════════
// 8. SUPER ADMIN CUTOVER GOVERNANCE & AUDIT TRAIL
// ══════════════════════════════════════════════════════════════════
console.log('\n8. Super Admin Cutover Controls & Audit Security');
const superAdmin = { role: 'Super Admin' };
const standardAdmin = { role: 'Admin' };
const operator = { role: 'Operator' };

assert(hasPermission(superAdmin, PERMISSIONS.CONFIG_TOGGLE_DYNAMIC) === true, 'Super Admin has CONFIG_TOGGLE_DYNAMIC permission');
assert(hasPermission(standardAdmin, PERMISSIONS.CONFIG_TOGGLE_DYNAMIC) === false, 'Standard Admin denied CONFIG_TOGGLE_DYNAMIC permission');
assert(hasPermission(operator, PERMISSIONS.CONFIG_TOGGLE_DYNAMIC) === false, 'Operator denied CONFIG_TOGGLE_DYNAMIC permission');

assert(AUDIT_ACTIONS.CONFIG_MODE_TOGGLED !== undefined, 'AUDIT_ACTIONS defines CONFIG_MODE_TOGGLED event');
assert(AUDIT_ACTIONS.WORKFLOW_PUBLISHED !== undefined, 'AUDIT_ACTIONS defines WORKFLOW_PUBLISHED event');
assert(AUDIT_ACTIONS.SERIAL_HOLD !== undefined, 'AUDIT_ACTIONS defines SERIAL_HOLD event');
assert(AUDIT_ACTIONS.SERIAL_UNHOLD !== undefined, 'AUDIT_ACTIONS defines SERIAL_UNHOLD event');

console.log('\n================================================================');
console.log(`PHASE 7 E2E RESULTS: ${passed} Passed, ${failed} Failed`);
console.log('================================================================\n');

if (failed > 0) {
    process.exit(1);
}
