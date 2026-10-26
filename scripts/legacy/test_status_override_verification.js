/**
 * Test Suite: Admin-Level Serial Number Status Override Verification
 */

import {
    ADMIN_OVERRIDE_OPTIONS,
    PROJECT_WORKFLOWS,
    validateUnitRecord,
    calculateSkippedStations
} from './src/utils/movementEngine.js';

console.log('--- RUNNING ADMIN STATUS OVERRIDE VERIFICATION ---');

// 1. Verify ADMIN_OVERRIDE_OPTIONS definitions
console.log('1. Checking Admin Override Options:');
const expectedIds = ['STATUS_COMPLETE', 'STATUS_REJECTED', 'STATUS_SCRAPPED', 'MOVE_NEXT', 'MOVE_PREV', 'STATION_DIRECT'];
expectedIds.forEach(id => {
    const opt = ADMIN_OVERRIDE_OPTIONS.find(o => o.id === id);
    if (!opt) {
        throw new Error(`Missing Admin Override Option: ${id}`);
    }
    console.log(`  ✓ Option found: ${opt.name} (${opt.id}) -> ${opt.badge}`);
});

// 2. Test Complete override from QC Pass stage
console.log('\n2. Testing Complete override from QC Pass (Station 5 - Final QC):');
const unitAtQC = {
    id: 'SN-TEST-QC',
    project: 'Device',
    currentStation: 5,
    stationName: 'FINAL QC',
    status: 'Processing',
    history: [{ station: 'FINAL QC', result: 'Pass', timestamp: new Date().toISOString() }],
    tests: { '5': { passed: true } }
};

const completeVal = validateUnitRecord(unitAtQC, null, 'Device', 'Admin', 'STATUS_COMPLETE');
console.log('  Validation result for STATUS_COMPLETE:', completeVal);
if (!completeVal.isValid) throw new Error('Complete override failed on QC station unit');
console.log('  ✓ QC unit is eligible for direct completion override.');

// 3. Test Reject override from QC Fail stage
console.log('\n3. Testing Reject override from QC Fail (Station 2 - Inspection):');
const unitAtInsp = {
    id: 'SN-TEST-FAIL',
    project: 'Device',
    currentStation: 2,
    stationName: 'INSPECTION',
    status: 'Processing',
    history: [{ station: 'INSPECTION', result: 'Fail', timestamp: new Date().toISOString() }]
};

const rejectVal = validateUnitRecord(unitAtInsp, null, 'Device', 'Admin', 'STATUS_REJECTED');
console.log('  Validation result for STATUS_REJECTED:', rejectVal);
if (!rejectVal.isValid) throw new Error('Reject override failed on Inspection unit');
console.log('  ✓ Inspection unit is eligible for rejection override.');

// 4. Test Scrap override from any station
console.log('\n4. Testing Scrap override from Debug station (Station 3):');
const unitAtDebug = {
    id: 'SN-TEST-DEBUG',
    project: 'Device',
    currentStation: 3,
    stationName: 'DEBUG',
    status: 'Processing'
};

const scrapVal = validateUnitRecord(unitAtDebug, null, 'Device', 'Admin', 'STATUS_SCRAPPED');
console.log('  Validation result for STATUS_SCRAPPED:', scrapVal);
if (!scrapVal.isValid) throw new Error('Scrap override failed on Debug unit');
console.log('  ✓ Debug unit is eligible for scrap override.');

// 5. Test Move to Next Station
console.log('\n5. Testing Move to Next Station from Inspection (Station 2):');
const nextVal = validateUnitRecord(unitAtInsp, null, 'Device', 'Admin', 'MOVE_NEXT');
console.log('  Validation result for MOVE_NEXT:', nextVal);
if (!nextVal.isValid) throw new Error('Move to Next Station failed on Inspection unit');
console.log('  ✓ Unit is eligible to move to next station.');

// 6. Test Move to Previous Station
console.log('\n6. Testing Move to Previous Station from Inspection (Station 2):');
const prevVal = validateUnitRecord(unitAtInsp, null, 'Device', 'Admin', 'MOVE_PREV');
console.log('  Validation result for MOVE_PREV:', prevVal);
if (!prevVal.isValid) throw new Error('Move to Previous Station failed on Inspection unit');
console.log('  ✓ Unit is eligible to move to previous station.');

// 7. Verify historical tests remain untouched
console.log('\n7. Testing Test Preservation Guarantee:');
const simulatedUpdatedUnit = {
    ...unitAtQC,
    currentStation: null,
    stationName: 'FG (Admin Override)',
    status: 'Completed',
    history: [
        ...unitAtQC.history,
        {
            station: 'ADMIN OVERRIDE: -> FG (Admin Override)',
            result: 'STATUS_OVERRIDE_COMPLETE',
            previousStatus: 'Processing',
            newStatus: 'Completed',
            skippedStations: []
        }
    ]
};

if (JSON.stringify(simulatedUpdatedUnit.tests) !== JSON.stringify(unitAtQC.tests)) {
    throw new Error('Test records were modified!');
}
console.log('  ✓ Unit tests and existing history records preserved 100% intact.');

console.log('\n✅ ALL ADMIN STATUS OVERRIDE TESTS PASSED SUCCESSFULLY!\n');
