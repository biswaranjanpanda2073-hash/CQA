/**
 * Automated Verification Test Suite for Phase 6:
 * Visual Workflow Studio & Routing Matrix Builder
 * 
 * Verifies:
 * 1. Default routing matrices structure for all projects
 * 2. Topological graph integrity validation (intake, terminals, reachability, dangling targets)
 * 3. Station re-sequencing and reordering mechanics
 * 4. Workflow draft creation and version incrementing
 * 5. Dynamic next-station resolution for Pass, Fail, and Hold states
 * 6. RBAC permissions for workflow viewing, editing, and publishing
 */

import {
    DEFAULT_ROUTING_MATRICES,
    validateWorkflowGraph,
    resequenceWorkflowStations,
    moveStationSequence,
    createWorkflowDraft,
    resolveDynamicNextStation
} from './src/utils/workflowEngine.js';
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

console.log('\n========================================================');
console.log('--- PHASE 6: VISUAL WORKFLOW & ROUTING MATRIX TESTS ---');
console.log('========================================================\n');

// 1. DEFAULT ROUTING MATRICES
console.log('1. Default Routing Matrices Verification');
assert(DEFAULT_ROUTING_MATRICES.Device !== undefined, 'Device default routing matrix exists');
assert(DEFAULT_ROUTING_MATRICES.Peripherals !== undefined, 'Peripherals default routing matrix exists');
assert(DEFAULT_ROUTING_MATRICES['Inward QC'] !== undefined, 'Inward QC default routing matrix exists');
assert(DEFAULT_ROUTING_MATRICES.Calculator !== undefined, 'Calculator default routing matrix exists');
assert(DEFAULT_ROUTING_MATRICES.Device[1].passTarget === 2, 'Device Station 1 routes to Station 2 on Pass');
assert(DEFAULT_ROUTING_MATRICES.Device[7].isTerminalFG === true, 'Device Station 7 is Terminal FG');
assert(DEFAULT_ROUTING_MATRICES.Device[8].isTerminalScrap === true, 'Device Station 8 is Terminal Scrap');
assert(DEFAULT_ROUTING_MATRICES.Calculator[10].isTerminalFG === true, 'Calculator Station 10 is Terminal FG');

// 2. TOPOLOGICAL GRAPH VALIDATION
console.log('\n2. Topological Graph Validation');
const emptyGraph = validateWorkflowGraph([], {});
assert(emptyGraph.isValid === false, 'Rejects empty workflow graph');

const singleStationGraph = validateWorkflowGraph([{ id: 1, name: 'RECEIVING', sequence: 1 }], {});
assert(singleStationGraph.isValid === false, 'Rejects single-station workflow graph (requires at least 2)');

const validDeviceStations = [
    { stationId: 1, name: 'RECEIVING', sequence: 1, type: 'RECEIVING' },
    { stationId: 2, name: 'INSPECTION', sequence: 2, type: 'WIP' },
    { stationId: 3, name: 'DEBUG', sequence: 3, type: 'WIP' },
    { stationId: 4, name: 'REWORK', sequence: 4, type: 'WIP' },
    { stationId: 5, name: 'FINAL QC', sequence: 5, type: 'WIP' },
    { stationId: 6, name: 'PACKING', sequence: 6, type: 'WIP' },
    { stationId: 7, name: 'MOVE TO FG', sequence: 7, type: 'TERMINAL_FG' },
    { stationId: 8, name: 'SCRAP REVIEW', sequence: 8, type: 'TERMINAL_SCRAP' }
];

const validGraphRes = validateWorkflowGraph(validDeviceStations, DEFAULT_ROUTING_MATRICES.Device);
assert(validGraphRes.isValid === true, 'Accepts valid standard Device workflow graph');
assert(validGraphRes.errors.length === 0, 'Valid Device graph produces 0 topological errors');

// Duplicate IDs test
const duplicateIdStations = [
    { stationId: 1, name: 'RECEIVING', sequence: 1 },
    { stationId: 1, name: 'RECEIVING 2', sequence: 2 },
    { stationId: 7, name: 'FG', sequence: 3, type: 'TERMINAL_FG' }
];
const dupRes = validateWorkflowGraph(duplicateIdStations, {});
assert(dupRes.isValid === false, 'Detects duplicate station IDs');

// Dangling target reference test
const danglingTargetMatrix = {
    1: { passTarget: 999, failTarget: 8 } // Station 999 does not exist
};
const danglingRes = validateWorkflowGraph(validDeviceStations, danglingTargetMatrix);
assert(danglingRes.isValid === false, 'Detects dangling/non-existent passTarget (ID 999)');

// Unreachable station test
const disconnectedStations = [
    { stationId: 1, name: 'RECEIVING', sequence: 1, type: 'RECEIVING' },
    { stationId: 2, name: 'INSPECTION', sequence: 2, type: 'WIP' },
    { stationId: 3, name: 'ISLAND STATION', sequence: 3, type: 'WIP' }, // No inbound path
    { stationId: 7, name: 'FG', sequence: 4, type: 'TERMINAL_FG' },
    { stationId: 8, name: 'SCRAP', sequence: 5, type: 'TERMINAL_SCRAP' }
];
const disconnectedMatrix = {
    1: { passTarget: 2, failTarget: 8 },
    2: { passTarget: 7, failTarget: 8 },
    3: { passTarget: 7, failTarget: 8 }, // 3 can reach 7, but 1 or 2 never route to 3!
    7: { isTerminalFG: true },
    8: { isTerminalScrap: true }
};
const disconnectRes = validateWorkflowGraph(disconnectedStations, disconnectedMatrix);
assert(disconnectRes.warnings.some(w => w.includes('ISLAND STATION')), 'Flags unreachable island station in warnings');

// 3. RE-SEQUENCING & REORDERING
console.log('\n3. Station Re-sequencing & Reordering');
const reordered = moveStationSequence(validDeviceStations, 0, 1);
assert(reordered[0].stationId === 2, 'Station 2 moved to sequence 1');
assert(reordered[1].stationId === 1, 'Station 1 moved to sequence 2');
assert(reordered[0].sequence === 1 && reordered[1].sequence === 2, 'Sequences updated to 1..N contiguously');

const reseqTest = resequenceWorkflowStations([
    { stationId: 10, sequence: 99 },
    { stationId: 20, sequence: 105 }
]);
assert(reseqTest[0].sequence === 1 && reseqTest[1].sequence === 2, 'Resequence normalizes scattered sequences to 1..N');

// 4. WORKFLOW DRAFT CREATION
console.log('\n4. Workflow Draft Creation');
const draft = createWorkflowDraft('Device', { version: 2 });
assert(draft.status === 'Draft', 'Draft workflow status is Draft');
assert(draft.version === 3, 'Draft version increments from 2 to 3');
assert(draft.stations.length >= 7, 'Draft captures stations list');
assert(draft.routingMatrix[1].passTarget === 2, 'Draft initializes default routing matrix');

// 5. DYNAMIC NEXT-STATION RESOLUTION
console.log('\n5. Dynamic Next-Station Resolution');
// Test PASS on Device Station 1 -> Station 2
const passRes = resolveDynamicNextStation({
    projectId: 'Device',
    currentStationId: 1,
    result: 'Pass',
    routingMatrix: DEFAULT_ROUTING_MATRICES.Device,
    workflowStations: validDeviceStations
});
assert(passRes.nextStationId === 2, 'Resolves Station 1 Pass to Station 2');
assert(passRes.isHold === false, 'Pass resolution is not Hold');

// Test FAIL on Device Station 2 -> Station 3 (Debug)
const failRes = resolveDynamicNextStation({
    projectId: 'Device',
    currentStationId: 2,
    result: 'Fail',
    routingMatrix: DEFAULT_ROUTING_MATRICES.Device,
    workflowStations: validDeviceStations
});
assert(failRes.nextStationId === 3, 'Resolves Station 2 Fail to Station 3 (Debug)');

// Test HOLD on any station
const holdRes = resolveDynamicNextStation({
    projectId: 'Device',
    currentStationId: 2,
    result: 'Hold',
    routingMatrix: DEFAULT_ROUTING_MATRICES.Device,
    workflowStations: validDeviceStations
});
assert(holdRes.isHold === true, 'Resolves Hold as isHold: true');
assert(holdRes.nextStationId === null, 'Hold blocks station advancement (nextStationId is null)');

// Test Allowed Alternative Stations on Device Station 2 Pass (Inspection -> Final QC, Debug, Rework)
assert(passRes.availableStations.length >= 1, 'Provides available destination stations');

// 6. RBAC PERMISSIONS FOR WORKFLOW STUDIO
console.log('\n6. RBAC Permissions Verification');
assert(PERMISSIONS.WORKFLOW_VIEW === 'workflow.view', 'WORKFLOW_VIEW permission key defined');
assert(PERMISSIONS.WORKFLOW_EDIT === 'workflow.edit', 'WORKFLOW_EDIT permission key defined');
assert(PERMISSIONS.WORKFLOW_PUBLISH === 'workflow.publish', 'WORKFLOW_PUBLISH permission key defined');

const superAdmin = { role: 'Super Admin' };
const admin = { role: 'Admin' };
const operator = { role: 'Operator' };

assert(hasPermission(superAdmin, PERMISSIONS.WORKFLOW_PUBLISH) === true, 'Super Admin has WORKFLOW_PUBLISH');
assert(hasPermission(admin, PERMISSIONS.WORKFLOW_EDIT) === true, 'Admin has WORKFLOW_EDIT');
assert(hasPermission(operator, PERMISSIONS.WORKFLOW_EDIT) === false, 'Operator lacks WORKFLOW_EDIT permission');
assert(hasPermission(operator, PERMISSIONS.WORKFLOW_PUBLISH) === false, 'Operator lacks WORKFLOW_PUBLISH permission');

console.log('\n========================================================');
console.log(`PHASE 6 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
console.log('========================================================\n');

if (failed > 0) {
    process.exit(1);
}
