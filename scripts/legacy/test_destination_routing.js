import { getValidDestinationStations, PROJECT_WORKFLOWS } from './src/utils/movementEngine.js';
import { resolveCalcNextStation } from './src/utils/calculatorEngine.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✓ PASS: ${message}`);
        passed++;
    } else {
        console.error(`  ✗ FAIL: ${message}`);
        failed++;
    }
}

console.log("=== DESTINATION RESOLVER & CONTROLLED ROUTING TEST SUITE ===");

// 1. Calculator Workflow - Initial QC (ID 2)
console.log("\n[Test 1] Calculator Initial QC Pass/Fail");
const calcInitPass = getValidDestinationStations(2, 'Calculator', 'Pass');
assert(calcInitPass.defaultStation?.id === 4, "Initial QC Pass default is Hardware QC (ID 4)");
assert(calcInitPass.availableStations.some(s => s.id === 4), "Hardware QC is in available stations");
assert(calcInitPass.availableStations.some(s => s.id === 9), "Scrap Analysis is available where eligible");
assert(!calcInitPass.availableStations.some(s => s.id === 8), "Packing (ID 8) is NOT an arbitrary jump from Initial QC");

// 2. Calculator Workflow - Hardware QC (ID 4)
console.log("\n[Test 2] Calculator HW QC Pass vs Fail");
const calcHwPass = getValidDestinationStations(4, 'Calculator', 'Pass');
assert(calcHwPass.defaultStation?.id === 6, "HW QC Pass routes to Assembly (ID 6)");

const calcHwFail = getValidDestinationStations(4, 'Calculator', 'Fail');
assert(calcHwFail.defaultStation?.id === 5, "HW QC Fail routes to Hardware Rework (ID 5)");
assert(calcHwFail.availableStations.some(s => s.id === 5), "Hardware Rework is in available stations");

// 3. Calculator Workflow - Firmware QC (ID 7) Dynamic Routing & Return Loop
console.log("\n[Test 3] Calculator Firmware QC Dynamic Fail Targets");
const calcFwFail = getValidDestinationStations(7, 'Calculator', 'Fail');
assert(calcFwFail.availableStations.some(s => s.id === 4), "Firmware QC Fail allows return to HW QC (ID 4)");
assert(calcFwFail.availableStations.some(s => s.id === 9), "Firmware QC Fail allows return to Scrap Analysis (ID 9)");
assert(!calcFwFail.availableStations.some(s => s.id === 8), "Firmware QC Fail CANNOT route forward to Packing (ID 8)");

// 4. Hold Handling - Never advances
console.log("\n[Test 4] Hold Result Handling");
const calcHold = getValidDestinationStations(4, 'Calculator', 'Hold');
assert(calcHold.defaultStation === null, "Hold has no default station");
assert(calcHold.availableStations.length === 0, "Hold has no forward destination options");

// 5. Non-Calculator Workflows (e.g. Device / Refurbishment)
console.log("\n[Test 5] Refurbishment (Device) Workflow Routing");
const devInspPass = getValidDestinationStations(2, 'Refurbishment', 'Pass');
assert(devInspPass.defaultStation?.id === 5, "Inspection Pass default is Final QC (ID 5)");
assert(devInspPass.availableStations.some(s => s.id === 3), "Debug (Station 3) is a valid return/alternative option");
assert(devInspPass.availableStations.some(s => s.id === 4), "Rework (Station 4) is a valid return/alternative option");

const devInspFail = getValidDestinationStations(2, 'Refurbishment', 'Fail');
assert(devInspFail.defaultStation?.id === 3, "Inspection Fail default is Debug (ID 3)");
assert(devInspFail.availableStations.some(s => s.id === 4), "Rework is also selectable on Fail");

// 6. Operator Override Validation in resolveCalcNextStation
console.log("\n[Test 6] Operator Override Validation in resolveCalcNextStation");
// Test valid override
const validOverride = resolveCalcNextStation(7, 'Fail', {}, 4);
assert(validOverride.nextStationId === 4, "Firmware QC Fail accepts valid override HW QC (ID 4)");

// Test invalid override (trying to bypass to Packing ID 8 on Fail)
const invalidOverride = resolveCalcNextStation(7, 'Fail', {}, 8);
assert(invalidOverride.nextStationId === null && invalidOverride.error, "Firmware QC Fail rejects invalid bypass to Packing (ID 8)");

console.log("\n========================================");
console.log(`RESULTS: ${passed} Passed, ${failed} Failed`);
console.log("========================================");

if (failed > 0) process.exit(1);
