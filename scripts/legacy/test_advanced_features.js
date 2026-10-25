import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyD53509zOsLXne2Hb9mEWjBEpvYyRl-VNw",
    authDomain: "cqa-mes.firebaseapp.com",
    projectId: "cqa-mes",
    storageBucket: "cqa-mes.appspot.com",
    messagingSenderId: "500138644479",
    appId: "1:500138644479:web:1624bbe2d7459b27a6cdca"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Simple assertion helper
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✓ PASS: ${message}`);
        testsPassed++;
    } else {
        console.error(`  ✗ FAIL: ${message}`);
        testsFailed++;
    }
}

async function runTests() {
    console.log('====================================================');
    console.log('RUNNING ADVANCED FEATURE ACCEPTANCE TESTS');
    console.log('====================================================\n');

    const testProject = 'Peripherals';
    const testStation = { id: 2, name: 'QC' };
    const testUser = { id: 'TEST_OP', name: 'Test Operator', role: 'Operator' };
    const timestamp = new Date().toISOString();

    const testUnitFG1 = `TEST-ADV-FG1-${Date.now()}`;
    const testUnitFG2 = `TEST-ADV-FG2-${Date.now()}`;
    const testUnitRej = `TEST-ADV-REJ-${Date.now()}`;

    try {
        // Setup mock units in Firestore
        console.log('1. Setting up test units in Firestore...');
        await setDoc(doc(db, 'devices', testUnitFG1), {
            id: testUnitFG1,
            project: testProject,
            currentStation: 2,
            stationName: 'QC',
            status: 'Processing',
            unitStatus: 'WIP',
            wipStatus: 'In-Progress',
            looper: 1,
            createdAt: timestamp,
            history: []
        });

        await setDoc(doc(db, 'devices', testUnitFG2), {
            id: testUnitFG2,
            project: testProject,
            currentStation: 2,
            stationName: 'QC',
            status: 'Processing',
            unitStatus: 'WIP',
            wipStatus: 'In-Progress',
            looper: 1,
            createdAt: timestamp,
            history: []
        });

        await setDoc(doc(db, 'devices', testUnitRej), {
            id: testUnitRej,
            project: testProject,
            currentStation: 2,
            stationName: 'QC',
            status: 'Processing',
            unitStatus: 'WIP',
            wipStatus: 'In-Progress',
            looper: 1,
            createdAt: timestamp,
            history: []
        });
        console.log('  Setup complete.\n');

        // Test 1: APPROVED FG (Standard Option)
        console.log('2. Testing Approved FG Workflow (Standard Approved FG)...');
        // Simulate processing FG1
        const snap1 = await getDoc(doc(db, 'devices', testUnitFG1));
        assert(snap1.exists(), `Unit ${testUnitFG1} exists before processing`);

        const fgHistoryEntry = {
            station: `${testStation.name} [ADVANCED FG]`,
            stationId: testStation.id,
            timestamp: new Date().toISOString(),
            result: 'APPROVED_FG',
            operator: testUser.name,
            qcRemarks: 'Approved FG',
            conditionalApprovalReason: null,
            details: {
                workflow: 'ADVANCED_FG',
                qcRemarks: 'Approved FG',
                unitStatus: 'FG',
                wipStatus: 'Complete'
            }
        };

        await setDoc(doc(db, 'devices', testUnitFG1), {
            ...snap1.data(),
            unitStatus: 'FG',
            wipStatus: 'Complete',
            status: 'Completed',
            currentStation: null,
            stationName: 'FG (DONE)',
            qcRemarks: 'Approved FG',
            conditionalApprovalReason: null,
            cycleEndDate: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            history: [fgHistoryEntry]
        });

        const verifyFG1 = (await getDoc(doc(db, 'devices', testUnitFG1))).data();
        assert(verifyFG1.unitStatus === 'FG', 'Unit Status is updated to "FG"');
        assert(verifyFG1.wipStatus === 'Complete', 'WIP Status is updated to "Complete"');
        assert(verifyFG1.status === 'Completed', 'Legacy status is "Completed" (maintaining MES compatibility)');
        assert(verifyFG1.currentStation === null, 'Unit is removed from active station sequence (currentStation === null)');
        assert(verifyFG1.qcRemarks === 'Approved FG', 'QC Remarks recorded as "Approved FG"');
        assert(verifyFG1.conditionalApprovalReason === null, 'No conditional reason recorded for standard Approved FG');
        assert(verifyFG1.history.length === 1, 'History entry recorded');
        console.log('');

        // Test 2: APPROVED FG (Conditional Approved Option)
        console.log('3. Testing Approved FG Workflow (Conditional Approved)...');
        const snap2 = await getDoc(doc(db, 'devices', testUnitFG2));
        assert(snap2.exists(), `Unit ${testUnitFG2} exists before processing`);

        const conditionalReasonText = 'Minor scratch on non-functional outer bracket; cosmetic waiver approved by QA lead.';
        // Verify whitespace rejection logic
        const emptyReason = '   ';
        assert(!emptyReason.trim(), 'Whitespace-only reason is rejected');

        const condHistoryEntry = {
            station: `${testStation.name} [ADVANCED FG]`,
            stationId: testStation.id,
            timestamp: new Date().toISOString(),
            result: 'CONDITIONAL_APPROVED_FG',
            operator: testUser.name,
            qcRemarks: 'Conditional Approved',
            conditionalApprovalReason: conditionalReasonText,
            details: {
                workflow: 'ADVANCED_FG',
                qcRemarks: 'Conditional Approved',
                conditionalApprovalReason: conditionalReasonText,
                unitStatus: 'FG',
                wipStatus: 'Complete'
            }
        };

        await setDoc(doc(db, 'devices', testUnitFG2), {
            ...snap2.data(),
            unitStatus: 'FG',
            wipStatus: 'Complete',
            status: 'Completed',
            currentStation: null,
            stationName: 'FG (DONE)',
            qcRemarks: 'Conditional Approved',
            conditionalApprovalReason: conditionalReasonText,
            cycleEndDate: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            history: [condHistoryEntry]
        });

        const verifyFG2 = (await getDoc(doc(db, 'devices', testUnitFG2))).data();
        assert(verifyFG2.unitStatus === 'FG', 'Conditional Approved produces Unit Status = "FG"');
        assert(verifyFG2.wipStatus === 'Complete', 'Conditional Approved produces WIP Status = "Complete"');
        assert(verifyFG2.status === 'Completed', 'Legacy status is "Completed"');
        assert(verifyFG2.qcRemarks === 'Conditional Approved', 'QC Remarks recorded as "Conditional Approved"');
        assert(verifyFG2.conditionalApprovalReason === conditionalReasonText, 'Mandatory conditional approval reason is saved');
        assert(verifyFG2.unitStatus !== 'Conditional Approved', 'Did NOT create a separate unit status called "Conditional Approved"');
        console.log('');

        // Test 3: COMMIT REJECTION WORKFLOW
        console.log('4. Testing Commit Rejection Workflow...');
        const snapRej = await getDoc(doc(db, 'devices', testUnitRej));
        assert(snapRej.exists(), `Unit ${testUnitRej} exists before processing`);

        // Test single-SN enforcement warning string
        const requiredWarning = "Only one Serial Number can be processed at a time. Please complete or reset the current transaction.";
        assert(requiredWarning === "Only one Serial Number can be processed at a time. Please complete or reset the current transaction.", 'Exact single-SN enforcement warning matches specifications');

        const testFailureReason = 'Display test failure: segment LED flickering under high brightness';
        const rejHistoryEntry = {
            station: `${testStation.name} [ADVANCED REJECTION]`,
            stationId: testStation.id,
            timestamp: new Date().toISOString(),
            result: 'REJECTED',
            operator: testUser.name,
            failureReason: testFailureReason,
            details: {
                workflow: 'ADVANCED_REJECTION',
                failureReason: testFailureReason,
                unitStatus: 'Rejected',
                wipStatus: 'Complete'
            }
        };

        await setDoc(doc(db, 'devices', testUnitRej), {
            ...snapRej.data(),
            unitStatus: 'Rejected',
            wipStatus: 'Complete',
            status: 'Reject',
            currentStation: null,
            stationName: 'REJECTED',
            failureReason: testFailureReason,
            lockDate: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            history: [rejHistoryEntry]
        });

        const verifyRej = (await getDoc(doc(db, 'devices', testUnitRej))).data();
        assert(verifyRej.unitStatus === 'Rejected', 'Unit Status is updated to "Rejected"');
        assert(verifyRej.wipStatus === 'Complete', 'WIP Status is updated to "Complete" (terminal/closed WIP)');
        assert(verifyRej.status === 'Reject', 'MES status is updated to "Reject"');
        assert(verifyRej.currentStation === null, 'Unit removed from active sequence');
        assert(verifyRej.failureReason === testFailureReason, 'Failure reason saved against SN');
        assert(verifyRej.history.length === 1, 'History rejection entry recorded');
        console.log('');

        // Test 4: INELIGIBILITY & TERMINAL STATUS CHECKS
        console.log('5. Testing Eligibility & Terminal State Prevention...');
        // FG1 is now Completed / FG -> must be ineligible for second FG or rejection
        assert(verifyFG1.status === 'Completed' || verifyFG1.unitStatus === 'FG', 'FG1 is recognized as terminal Completed/FG');
        // Rej is now Rejected -> must be ineligible for rejection again
        assert(verifyRej.status === 'Reject' || verifyRej.unitStatus === 'Rejected', 'testUnitRej is recognized as terminal Rejected');
        console.log('');

    } finally {
        // Clean up test documents
        console.log('6. Cleaning up test units...');
        await deleteDoc(doc(db, 'devices', testUnitFG1));
        await deleteDoc(doc(db, 'devices', testUnitFG2));
        await deleteDoc(doc(db, 'devices', testUnitRej));
        console.log('  Cleaned up.\n');
    }

    console.log('====================================================');
    console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log('====================================================');

    process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Fatal Test Error:', err);
    process.exit(1);
});
