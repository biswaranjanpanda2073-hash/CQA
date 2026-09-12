/**
 * Verification Test Suite for Calculator Refurbishment Engine
 * Validates business logic, sequence-independent routing, checkpoints,
 * repeat detection, and scrap targeting.
 */

import {
    CALCULATOR_STATIONS,
    CALC_CHECKPOINTS,
    CALC_DETERMINISTIC_ROUTES,
    CALC_DYNAMIC_FAIL_TARGETS,
    CALC_LOOPER_ELIGIBLE_STATIONS,
    CALC_SCRAP_ELIGIBLE_FROM,
    getCalcStationById,
    calculateCalcResult,
    resolveCalcNextStation,
    validateCalcRouting,
    isRepeatSerial,
    validateCalcStationData,
    generateCalcMovementId,
    generateScrapInboundId
} from './src/utils/calculatorEngine.js';

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

console.log("=== CALCULATOR REFURBISHMENT ENGINE TEST SUITE ===");

// 1. Station Definitions
console.log("\n[Test 1] Station Definitions");
assert(CALCULATOR_STATIONS.length === 10, "10 Stations defined in Calculator workflow");
assert(CALCULATOR_STATIONS.find(s => s.id === 9)?.name === 'SCRAP ANALYSIS', "Station 9 is SCRAP ANALYSIS");
assert(CALCULATOR_STATIONS.find(s => s.id === 10)?.name === 'MOVE TO FG', "Station 10 is MOVE TO FG");

// 2. Checkpoint Definitions
console.log("\n[Test 2] Checkpoint Counts");
assert(CALC_CHECKPOINTS[4].filter(c => c.type === 'PFH').length === 10, "HW QC has exactly 10 P/F/H checkpoints");
assert(CALC_CHECKPOINTS[4].some(c => c.key === 'vbat' && c.type === 'DATA'), "HW QC contains VBAT data field");
assert(CALC_CHECKPOINTS[4].some(c => c.key === 'ichg' && c.type === 'DATA'), "HW QC contains ICHG data field");
assert(CALC_CHECKPOINTS[4].some(c => c.key === 'debug_note' && c.type === 'TEXT'), "HW QC contains Debug Note field");

assert(CALC_CHECKPOINTS[7].filter(c => c.type === 'PFH').length === 13, "Firmware QC has exactly 13 P/F/H checkpoints");
assert(CALC_CHECKPOINTS[7].some(c => c.key === 'updated_os_version' && c.type === 'DATA'), "Firmware QC contains Updated OS Version field");

// 3. 3-State Result Calculation (Priority: Fail > Hold > Pass)
console.log("\n[Test 3] 3-State Result Calculation");
const allPass = {
    maxim_ic: 'Pass', charging_usb: 'Pass', charging_ic: 'Pass', buck_3v3: 'Pass',
    buck_boost_3v8: 'Pass', boost_5v_usb: 'Pass', u6_usb_pd_ic: 'Pass', tvs_diode: 'Pass',
    on_off_ic: 'Pass', pcba_soldering: 'Pass'
};
assert(calculateCalcResult(4, allPass).result === 'Pass', "All Pass checkpoints produce Pass result");

const oneFail = { ...allPass, buck_3v3: 'Fail' };
assert(calculateCalcResult(4, oneFail).result === 'Fail', "One Fail checkpoint produces Fail result");

const oneHold = { ...allPass, buck_3v3: 'Hold' };
assert(calculateCalcResult(4, oneHold).result === 'Hold', "One Hold checkpoint (no Fail) produces Hold result");

const failAndHold = { ...allPass, buck_3v3: 'Hold', charging_ic: 'Fail' };
assert(calculateCalcResult(4, failAndHold).result === 'Fail', "Fail takes priority over Hold");

// 4. Deterministic Sequence-Independent Routing
console.log("\n[Test 4] Deterministic Routing Paths");
// Receiving first-time -> Initial QC (2)
const r1 = resolveCalcNextStation(1, 'Pass', { history: [] });
assert(r1.nextStationId === 2, "Receiving first-time routes to Initial QC (ID 2)");

// Initial QC Pass -> HW QC (4)
const r2Pass = resolveCalcNextStation(2, 'Pass', {});
assert(r2Pass.nextStationId === 4, "Initial QC Pass routes to Hardware QC (ID 4)");

// Initial QC Fail -> HW QC (4)
const r2Fail = resolveCalcNextStation(2, 'Fail', {});
assert(r2Fail.nextStationId === 4, "Initial QC Fail routes to Hardware QC (ID 4)");

// HW QC Pass -> Assembly (6), NOT Firmware QC
const r4Pass = resolveCalcNextStation(4, 'Pass', {});
assert(r4Pass.nextStationId === 6, "HW QC Pass routes to Assembly (ID 6, NOT sequence+1)");

// HW QC Fail -> Hardware Rework (5)
const r4Fail = resolveCalcNextStation(4, 'Fail', {});
assert(r4Fail.nextStationId === 5, "HW QC Fail routes to Hardware Rework (ID 5)");

// Hardware Rework -> Assembly (6)
const r5 = resolveCalcNextStation(5, 'Pass', {});
assert(r5.nextStationId === 6, "Hardware Rework routes to Assembly (ID 6)");

// Assembly -> Firmware QC (7)
const r6 = resolveCalcNextStation(6, 'Pass', {});
assert(r6.nextStationId === 7, "Assembly routes to Firmware QC (ID 7)");

// Firmware QC Pass -> Packing (8)
const r7Pass = resolveCalcNextStation(7, 'Pass', {});
assert(r7Pass.nextStationId === 8, "Firmware QC Pass routes to Packing (ID 8)");

// Packing Pass -> Move to FG (10)
const r8Pass = resolveCalcNextStation(8, 'Pass', {});
assert(r8Pass.nextStationId === 10, "Packing Pass routes to MOVE TO FG (ID 10)");

// 5. Dynamic Routing on Fail
console.log("\n[Test 5] Dynamic Routing on Fail");
const r7FailNoTarget = resolveCalcNextStation(7, 'Fail', {}, null);
assert(r7FailNoTarget.needsSelection === true, "Firmware QC Fail requires dynamic next station selection");

const r7FailValid = resolveCalcNextStation(7, 'Fail', {}, 4);
assert(r7FailValid.valid === true && r7FailValid.nextStationId === 4, "Firmware QC Fail can route to HW QC (ID 4)");

const r7FailScrap = resolveCalcNextStation(7, 'Fail', {}, 9);
assert(r7FailScrap.valid === true && r7FailScrap.nextStationId === 9, "Firmware QC Fail can route to Scrap Analysis (ID 9)");

const r7FailInvalid = resolveCalcNextStation(7, 'Fail', {}, 8);
assert(r7FailInvalid.valid === false, "Firmware QC Fail CANNOT route forward to Packing (ID 8)");

// 6. Hold Behavior
console.log("\n[Test 6] Hold Behavior");
const rHold = resolveCalcNextStation(4, 'Hold', {});
assert(rHold.isHold === true && rHold.nextStationId === null, "Hold blocks movement (nextStationId is null)");

// 7. Repeat Serial Detection
console.log("\n[Test 7] Repeat Serial Detection & Looper Routing");
const newUnit = { id: 'NEW001', history: [] };
assert(isRepeatSerial(newUnit) === false, "New unit is not repeat");

const repeatUnitCompleted = { id: 'REP001', status: 'Completed', history: [{ project: 'Calculator', stationId: 1 }] };
assert(isRepeatSerial(repeatUnitCompleted) === true, "Completed unit is recognized as repeat");

const repeatUnitScrapped = { id: 'REP002', status: 'SCRAPPED', history: [{ project: 'Calculator', stationId: 1 }] };
assert(isRepeatSerial(repeatUnitScrapped) === true, "SCRAPPED unit is recognized as repeat");

const repeatUnitMulti = { id: 'REP003', status: 'Processing', history: [{ project: 'Calculator', stationId: 1 }, { project: 'Calculator', stationId: 2 }] };
assert(isRepeatSerial(repeatUnitMulti) === true, "Unit with prior Calculator history is recognized as repeat");

const r1Repeat = resolveCalcNextStation(1, 'Pass', repeatUnitCompleted);
assert(r1Repeat.nextStationId === 3, "Receiving repeat serial routes to Looper Analysis (ID 3, NOT Initial QC)");

// 8. Looper Analysis Routing
console.log("\n[Test 8] Looper Analysis Dynamic Routing");
const rLooperValid = resolveCalcNextStation(3, 'Pass', {}, 6);
assert(rLooperValid.valid === true && rLooperValid.nextStationId === 6, "Looper Analysis can route to Assembly (ID 6)");

const rLooperScrap = resolveCalcNextStation(3, 'Pass', {}, 9);
assert(rLooperScrap.valid === true && rLooperScrap.nextStationId === 9, "Looper Analysis can route to Scrap Analysis (ID 9)");

// 9. Scrap Eligible Stations
console.log("\n[Test 9] Scrap Eligible Stations");
assert(CALC_SCRAP_ELIGIBLE_FROM.includes(2), "Initial QC is scrap eligible");
assert(CALC_SCRAP_ELIGIBLE_FROM.includes(4), "HW QC is scrap eligible");
assert(CALC_SCRAP_ELIGIBLE_FROM.includes(5), "Hardware Rework is scrap eligible");
assert(CALC_SCRAP_ELIGIBLE_FROM.includes(6), "Assembly is scrap eligible");
assert(CALC_SCRAP_ELIGIBLE_FROM.includes(7), "Firmware QC is scrap eligible");
assert(CALC_SCRAP_ELIGIBLE_FROM.includes(8), "Packing is scrap eligible");
assert(!CALC_SCRAP_ELIGIBLE_FROM.includes(1), "Receiving is NOT scrap eligible");

// 10. Inbound Movement ID Generation
console.log("\n[Test 10] Movement & Scrap ID Generation");
const movId = generateCalcMovementId('CALC');
assert(movId.startsWith('CALC-'), "Movement ID has CALC prefix");
const scrapId = generateScrapInboundId();
assert(scrapId.startsWith('SCRAPIN-'), "Scrap inbound ID has SCRAPIN prefix");

// 11. Validation Helper
console.log("\n[Test 11] Data & Reason Validation");
const v1 = validateCalcStationData(4, allPass, {}, { debug_note: 'Tested' });
assert(v1.valid === false && v1.errors.some(e => e.includes('VBAT')), "Missing VBAT is caught by validator");

const v2 = validateCalcStationData(4, oneFail, { vbat: '3.7', ichg: '500' }, { debug_note: 'Short circuit' });
assert(v2.valid === false && v2.errors.some(e => e.includes('Failure reason')), "Missing Failure Reason on Fail is caught");

const v3 = validateCalcStationData(4, oneHold, { vbat: '3.7', ichg: '500' }, { debug_note: 'Component suspicious' });
assert(v3.valid === false && v3.errors.some(e => e.includes('Hold reason')), "Missing Hold Reason on Hold is caught");

const v4 = validateCalcStationData(4, allPass, { vbat: '3.7', ichg: '500' }, { debug_note: 'All voltages normal' });
assert(v4.valid === true, "Valid data passes with 0 errors");

console.log(`\n========================================`);
console.log(`RESULTS: ${passed} Passed, ${failed} Failed`);
console.log(`========================================`);

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
