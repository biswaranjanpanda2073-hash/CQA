/**
 * CQA MES — Calculator Refurbishment Cloud Functions
 * 
 * Trusted server-side operations for Calculator project.
 * All authorization is based on Firebase Auth UID (context.auth.uid),
 * NEVER client-supplied userId.
 * 
 * Functions:
 *   1. loginAndGetToken — Validates credentials, returns Firebase Custom Token
 *   2. processCalculatorStation — All Calculator station processing
 *   3. processScrapAnalysis — Scrap approval / return to previous
 *   4. unholdCalculatorSerial — Unhold a held serial
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const app = initializeApp();
const db = getFirestore(app);
const auth = getAuth(app);

// ═══════════════════════════════════════════════════════════════
// SHARED CONSTANTS (mirrored from calculatorEngine.js)
// ═══════════════════════════════════════════════════════════════

const CALC_DETERMINISTIC_ROUTES = {
    1: { firstTime: 2, repeat: 3 },
    2: { Pass: 4, Fail: 4, Hold: null },
    4: { Pass: 6, Fail: 5, Hold: null },
    5: { default: 6 },
    6: { default: 7 },
    7: { Pass: 8, Fail: 'DYNAMIC', Hold: null },
    8: { Pass: 10, Fail: 'DYNAMIC', Hold: null },
    3: { default: 'DYNAMIC' },
};

const CALC_DYNAMIC_FAIL_TARGETS = {
    7: [2, 4, 5, 6, 9],
    8: [2, 4, 5, 6, 7, 9],
};

const CALC_LOOPER_ELIGIBLE_STATIONS = [2, 4, 5, 6, 7, 8, 9];

const CALC_STATION_ALLOWED_TARGETS = {
    1: { Pass: [2, 3] },
    2: { Pass: [4, 9], Fail: [4, 9] },
    3: { Pass: [4, 5, 6, 7, 9], Fail: [4, 5, 6, 7, 9] },
    4: { Pass: [6, 2], Fail: [5, 9] },
    5: { Pass: [6, 4, 9], Fail: [4, 9] },
    6: { Pass: [7, 5, 9], Fail: [5, 9] },
    7: { Pass: [8, 6], Fail: [4, 5, 6, 9] },
    8: { Pass: [10], Fail: [6, 7, 9] },
    9: { Pass: [], Fail: [] },
    10: { Pass: [], Fail: [] }
};

const CALC_SCRAP_ELIGIBLE_FROM = [2, 3, 4, 5, 6, 7, 8];

const CALCULATOR_STATIONS_MAP = {
    1: 'RECEIVING', 2: 'INITIAL QC', 3: 'LOOPER ANALYSIS',
    4: 'HARDWARE QC / DEBUG', 5: 'HARDWARE REWORK', 6: 'ASSEMBLY',
    7: 'FIRMWARE QC', 8: 'PACKING & CLEANING', 9: 'SCRAP ANALYSIS',
    10: 'MOVE TO FG'
};

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function generateMovementId(prefix = 'CALC') {
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `${prefix}-${ts}-${rand}`;
}

function hasStationAccess(user, stationName) {
    if (!user || !user.stations) return false;
    if (user.role === 'Admin' || user.role === 'Super Admin') return true;
    if (user.stations.includes('ALL — Unrestricted Access')) return true;
    return user.stations.includes(`Calculator > ${stationName}`);
}

function isRepeatSerial(unit) {
    if (!unit) return false;
    if (['Completed', 'SCRAPPED', 'Scrap', 'Reject'].includes(unit.status)) return true;
    if (Array.isArray(unit.history) && unit.history.length > 0) {
        const calcHistory = unit.history.filter(h => h.project === 'Calculator');
        const hasNonReceiving = calcHistory.some(h => h.stationId !== 1);
        if (hasNonReceiving) return true;
        if (calcHistory.filter(h => h.stationId === 1).length >= 1) return true;
    }
    return false;
}

function resolveNextStation(fromStationId, result, unit, selectedNextStationId) {
    const routes = CALC_DETERMINISTIC_ROUTES[fromStationId];
    if (!routes) return { valid: false, reason: `No routing rules for station ${fromStationId}` };

    if (result === 'Hold') {
        return { valid: true, nextStationId: null, nextStationName: '', isHold: true };
    }

    if (fromStationId === 1) {
        const isRepeat = isRepeatSerial(unit);
        const target = isRepeat ? routes.repeat : routes.firstTime;
        return { valid: true, nextStationId: target, nextStationName: CALCULATOR_STATIONS_MAP[target] || '' };
    }

    if (routes.default !== undefined) {
        if (routes.default === 'DYNAMIC') {
            return validateDynamicTarget(fromStationId, selectedNextStationId);
        }
        return { valid: true, nextStationId: routes.default, nextStationName: CALCULATOR_STATIONS_MAP[routes.default] || '' };
    }

    const target = routes[result];
    if (target === undefined || target === null) {
        return { valid: false, reason: `No route for result "${result}" at station ${fromStationId}` };
    }
    if (target === 'DYNAMIC') {
        return validateDynamicTarget(fromStationId, selectedNextStationId);
    }
    if (selectedNextStationId) {
        const allowed = CALC_STATION_ALLOWED_TARGETS[fromStationId]?.[result] || [target];
        const selectedId = Number(selectedNextStationId);
        if (allowed.includes(selectedId)) {
            return { valid: true, nextStationId: selectedId, nextStationName: CALCULATOR_STATIONS_MAP[selectedId] || '', isOverride: true };
        } else {
            return { valid: false, reason: `Station ${selectedId} is not a valid destination from station ${fromStationId} on ${result}`, error: true };
        }
    }
    return { valid: true, nextStationId: target, nextStationName: CALCULATOR_STATIONS_MAP[target] || '' };
}

function validateDynamicTarget(fromStationId, selectedNextStationId) {
    if (!selectedNextStationId && selectedNextStationId !== 0) {
        return { valid: false, reason: 'Next station selection required', needsSelection: true };
    }
    const selectedId = Number(selectedNextStationId);
    if (fromStationId === 3) {
        if (!CALC_LOOPER_ELIGIBLE_STATIONS.includes(selectedId)) {
            return { valid: false, reason: `Station ${selectedId} is not valid from Looper Analysis` };
        }
    } else {
        const allowed = CALC_DYNAMIC_FAIL_TARGETS[fromStationId];
        if (!allowed || !allowed.includes(selectedId)) {
            return { valid: false, reason: `Station ${selectedId} is not a valid fail target from station ${fromStationId}` };
        }
    }
    return { valid: true, nextStationId: selectedId, nextStationName: CALCULATOR_STATIONS_MAP[selectedId] || '' };
}

// ═══════════════════════════════════════════════════════════════
// 1. LOGIN AND GET TOKEN
// ═══════════════════════════════════════════════════════════════

exports.loginAndGetToken = onCall(async (request) => {
    const { userId, password } = request.data;
    if (!userId || !password) {
        throw new HttpsError("invalid-argument", "userId and password are required.");
    }

    // Check exact match first, then uppercase
    let userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
        userDoc = await db.collection("users").doc(userId.toUpperCase()).get();
    }

    if (!userDoc.exists || userDoc.data().password !== password) {
        throw new HttpsError("unauthenticated", "Invalid credentials.");
    }

    const userData = userDoc.data();
    const uid = userDoc.id;

    // Create or update Firebase Auth user for token generation
    try {
        await auth.getUser(uid);
    } catch (e) {
        // User doesn't exist in Firebase Auth — create it
        await auth.createUser({ uid, displayName: userData.name || uid });
    }

    // Generate custom token
    const token = await auth.createCustomToken(uid);

    return {
        success: true,
        token,
        user: { id: uid, name: userData.name, role: userData.role, stations: userData.stations || [] }
    };
});

// ═══════════════════════════════════════════════════════════════
// 2. PROCESS CALCULATOR STATION
// ═══════════════════════════════════════════════════════════════

exports.processCalculatorStation = onCall(async (request) => {
    // Auth check — Firebase Auth UID, NOT client-supplied
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError("unauthenticated", "Authentication required.");
    }
    const uid = request.auth.uid;

    // Get user record from Firestore
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
        throw new HttpsError("permission-denied", "User not found in system.");
    }
    const user = userDoc.data();

    const {
        serialNumber, stationId, result, details,
        checkpointResults, dataValues, textValues,
        selectedNextStationId, routeToScrap
    } = request.data;

    if (!serialNumber || stationId === undefined) {
        throw new HttpsError("invalid-argument", "serialNumber and stationId are required.");
    }

    const cleanId = serialNumber.trim().toUpperCase().replace(/\//g, '-');
    const stationName = CALCULATOR_STATIONS_MAP[stationId];

    if (!stationName) {
        throw new HttpsError("invalid-argument", `Invalid station ID: ${stationId}`);
    }

    // Authorize station access
    if (!hasStationAccess(user, stationName)) {
        throw new HttpsError("permission-denied", `ACCESS DENIED: You do not have access to Calculator > ${stationName}`);
    }

    const timestamp = new Date().toISOString();
    const movementId = generateMovementId('CALC');

    // Use Firestore transaction for concurrency protection
    const deviceRef = db.collection("devices").doc(cleanId);

    const txResult = await db.runTransaction(async (tx) => {
        const deviceDoc = await tx.get(deviceRef);
        let unit = deviceDoc.exists ? deviceDoc.data() : null;

        // ── RECEIVING (Station 1) ──
        if (stationId === 1) {
            if (!unit) {
                // New serial
                unit = {
                    id: cleanId,
                    project: 'Calculator',
                    looper: 1,
                    history: [],
                    status: 'Processing',
                    createdAt: timestamp
                };
            } else {
                // Re-receive
                if (unit.status === 'Processing') {
                    throw new HttpsError("failed-precondition", `Unit "${cleanId}" is locked at ${unit.stationName}.`);
                }
                if (['Completed', 'SCRAPPED', 'Scrap', 'Reject'].includes(unit.status)) {
                    unit.looper = (unit.looper || 1) + 1;
                }
            }

            unit.project = 'Calculator';
            unit.status = 'Processing';
            unit.details = details || {};
            unit.updatedAt = timestamp;
            // Clear any hold or scrap fields from previous lifecycle
            unit.holdStatus = null;
            unit.holdStation = null;
            unit.holdStationId = null;
            unit.holdReason = null;
            unit.holdRemarks = null;
            unit.holdTimestamp = null;
            unit.holdUserId = null;
            unit.scrapInboundMovementId = null;

            const routing = resolveNextStation(1, null, unit, null);
            unit.currentStation = routing.nextStationId;
            unit.stationName = routing.nextStationName;

            const historyEntry = {
                station: 'RECEIVING', stationId: 1, timestamp,
                result: 'COMPLETED', operator: user.name || uid,
                looper: unit.looper, project: 'Calculator',
                movementId, details: details || {}
            };
            unit.history = [...(Array.isArray(unit.history) ? unit.history : []), historyEntry];

            tx.set(deviceRef, JSON.parse(JSON.stringify(unit)));
            return { success: true, nextStation: routing.nextStationName, movementId };
        }

        // ── NON-RECEIVING STATIONS ──
        if (!unit) {
            throw new HttpsError("not-found", `Unit "${cleanId}" not found. Process RECEIVING first.`);
        }

        // Verify unit is at the correct station
        if (unit.currentStation !== stationId) {
            throw new HttpsError("failed-precondition", `Unit is at ${unit.stationName} (station ${unit.currentStation}), not ${stationName} (station ${stationId}).`);
        }

        // Check hold status
        if (unit.holdStatus === 'HOLD') {
            throw new HttpsError("failed-precondition", `Unit is HELD at ${unit.holdStation}. Unhold before processing.`);
        }

        // Check terminal status
        if (['SCRAPPED', 'Scrap', 'Reject'].includes(unit.status)) {
            throw new HttpsError("failed-precondition", `Unit is ${unit.status} (LOCKED).`);
        }

        // Check project match
        if (unit.project !== 'Calculator') {
            throw new HttpsError("failed-precondition", `Unit belongs to project "${unit.project}", not Calculator.`);
        }

        // ── ROUTE TO SCRAP (explicit action from eligible station) ──
        if (routeToScrap === true) {
            if (!CALC_SCRAP_ELIGIBLE_FROM.includes(stationId)) {
                throw new HttpsError("failed-precondition", `Station ${stationName} cannot route to Scrap Analysis.`);
            }
            const scrapInboundId = generateMovementId('SCRAPIN');
            const historyEntry = {
                station: stationName, stationId, timestamp,
                result: 'ROUTED_TO_SCRAP', operator: user.name || uid,
                looper: unit.looper, project: 'Calculator',
                movementId: scrapInboundId,
                fromStationId: stationId,
                fromStationName: stationName,
                details: {
                    ...(details || {}),
                    checkpointResults, dataValues, textValues,
                    routedToScrap: true,
                    scrapRouteReason: textValues?.scrapRouteReason || '',
                }
            };

            unit.currentStation = 9;
            unit.stationName = 'SCRAP ANALYSIS';
            unit.scrapInboundMovementId = scrapInboundId;
            unit.updatedAt = timestamp;
            unit.history = [...(Array.isArray(unit.history) ? unit.history : []), historyEntry];

            tx.set(deviceRef, JSON.parse(JSON.stringify(unit)));
            return { success: true, nextStation: 'SCRAP ANALYSIS', movementId: scrapInboundId, routedToScrap: true };
        }

        // ── STANDARD STATION PROCESSING ──
        const finalResult = result; // 'Pass', 'Fail', or 'Hold'
        if (!finalResult) {
            throw new HttpsError("invalid-argument", "Result (Pass/Fail/Hold) is required.");
        }

        // Resolve next station
        const routing = resolveNextStation(stationId, finalResult, unit, selectedNextStationId);
        if (!routing.valid) {
            throw new HttpsError("failed-precondition", routing.reason);
        }

        const historyEntry = {
            station: stationName, stationId, timestamp,
            result: finalResult, operator: user.name || uid,
            looper: unit.looper, project: 'Calculator',
            movementId,
            details: {
                ...(details || {}),
                checkpointResults: checkpointResults || {},
                dataValues: dataValues || {},
                textValues: textValues || {},
                ...(selectedNextStationId ? { selectedNextStationId, selectedNextStationName: CALCULATOR_STATIONS_MAP[selectedNextStationId] } : {}),
            }
        };

        // ── HOLD ──
        if (routing.isHold) {
            unit.holdStatus = 'HOLD';
            unit.holdStation = stationName;
            unit.holdStationId = stationId;
            unit.holdReason = textValues?.holdReason || '';
            unit.holdRemarks = textValues?.holdRemarks || '';
            unit.holdTimestamp = timestamp;
            unit.holdUserId = uid;
            unit.updatedAt = timestamp;
            unit.history = [...(Array.isArray(unit.history) ? unit.history : []), historyEntry];

            tx.set(deviceRef, JSON.parse(JSON.stringify(unit)));
            return { success: true, isHold: true, holdStation: stationName, movementId };
        }

        // ── MOVE TO FG (Completed) ──
        if (routing.nextStationId === 10) {
            unit.status = 'Completed';
            unit.currentStation = 10;
            unit.stationName = 'MOVE TO FG';
            unit.cycleEndDate = timestamp;
            unit.updatedAt = timestamp;
            unit.history = [...(Array.isArray(unit.history) ? unit.history : []), historyEntry];

            tx.set(deviceRef, JSON.parse(JSON.stringify(unit)));
            return { success: true, nextStation: 'MOVE TO FG', status: 'Completed', movementId };
        }

        // ── STANDARD ADVANCE ──
        unit.currentStation = routing.nextStationId;
        unit.stationName = routing.nextStationName;
        unit.updatedAt = timestamp;
        unit.history = [...(Array.isArray(unit.history) ? unit.history : []), historyEntry];

        tx.set(deviceRef, JSON.parse(JSON.stringify(unit)));
        return { success: true, nextStation: routing.nextStationName, movementId };
    });

    return txResult;
});

// ═══════════════════════════════════════════════════════════════
// 3. PROCESS SCRAP ANALYSIS
// ═══════════════════════════════════════════════════════════════

exports.processScrapAnalysis = onCall(async (request) => {
    // Auth: Firebase UID only — NO client-supplied userId
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError("unauthenticated", "Authentication required.");
    }
    const uid = request.auth.uid;

    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
        throw new HttpsError("permission-denied", "User not found.");
    }
    const user = userDoc.data();

    // Authorization: must have Calculator > SCRAP ANALYSIS access
    if (!hasStationAccess(user, 'SCRAP ANALYSIS')) {
        throw new HttpsError("permission-denied", "ACCESS DENIED: You are not authorized for Calculator > SCRAP ANALYSIS.");
    }

    const { serialNumber, action, scrapReason, scrapRemarks, returnReason, returnRemarks } = request.data;

    if (!serialNumber || !action) {
        throw new HttpsError("invalid-argument", "serialNumber and action are required.");
    }

    if (action !== 'APPROVE_SCRAP' && action !== 'RETURN_TO_PREVIOUS') {
        throw new HttpsError("invalid-argument", "action must be APPROVE_SCRAP or RETURN_TO_PREVIOUS.");
    }

    const cleanId = serialNumber.trim().toUpperCase().replace(/\//g, '-');
    const deviceRef = db.collection("devices").doc(cleanId);
    const timestamp = new Date().toISOString();
    const movementId = generateMovementId('SCRAP');

    const txResult = await db.runTransaction(async (tx) => {
        const deviceDoc = await tx.get(deviceRef);
        if (!deviceDoc.exists) {
            throw new HttpsError("not-found", `Unit "${cleanId}" not found.`);
        }
        const unit = deviceDoc.data();

        // Verify unit is at Scrap Analysis
        if (unit.currentStation !== 9 || unit.stationName !== 'SCRAP ANALYSIS') {
            throw new HttpsError("failed-precondition", `Unit is not at Scrap Analysis. Current: ${unit.stationName}`);
        }

        if (unit.project !== 'Calculator') {
            throw new HttpsError("failed-precondition", `Unit belongs to "${unit.project}", not Calculator.`);
        }

        // ── APPROVE SCRAP ──
        if (action === 'APPROVE_SCRAP') {
            if (!scrapReason || !scrapReason.trim()) {
                throw new HttpsError("invalid-argument", "Scrap reason is required for approval.");
            }
            if (!scrapRemarks || !scrapRemarks.trim()) {
                throw new HttpsError("invalid-argument", "Scrap remarks are required for approval.");
            }

            const historyEntry = {
                station: 'SCRAP ANALYSIS', stationId: 9, timestamp,
                result: 'SCRAPPED', operator: user.name || uid,
                looper: unit.looper, project: 'Calculator',
                movementId,
                details: {
                    action: 'APPROVE_SCRAP',
                    scrapReason: scrapReason.trim(),
                    scrapRemarks: scrapRemarks.trim(),
                    scrapApprovedBy: user.name || uid,
                    scrapApprovedAt: timestamp,
                }
            };

            unit.status = 'SCRAPPED';
            unit.lockDate = timestamp;
            unit.scrapApprovedBy = user.name || uid;
            unit.scrapApprovedAt = timestamp;
            unit.scrapReason = scrapReason.trim();
            unit.updatedAt = timestamp;
            unit.history = [...(Array.isArray(unit.history) ? unit.history : []), historyEntry];

            tx.set(deviceRef, JSON.parse(JSON.stringify(unit)));
            return { success: true, action: 'APPROVE_SCRAP', status: 'SCRAPPED', movementId };
        }

        // ── RETURN TO PREVIOUS STATION ──
        if (action === 'RETURN_TO_PREVIOUS') {
            if (!returnReason || !returnReason.trim()) {
                throw new HttpsError("invalid-argument", "Return reason is required.");
            }
            if (!returnRemarks || !returnRemarks.trim()) {
                throw new HttpsError("invalid-argument", "Return remarks are required.");
            }

            // Find the exact inbound movement that routed this serial INTO Scrap Analysis
            const inboundMovementId = unit.scrapInboundMovementId;
            if (!inboundMovementId) {
                throw new HttpsError("failed-precondition", "Cannot determine inbound movement. scrapInboundMovementId missing.");
            }

            const history = Array.isArray(unit.history) ? unit.history : [];
            const inboundEntry = history.find(h => h.movementId === inboundMovementId);
            if (!inboundEntry) {
                throw new HttpsError("failed-precondition", `Inbound movement "${inboundMovementId}" not found in history.`);
            }

            // The return destination is the exact station that routed to Scrap Analysis
            const returnStationId = inboundEntry.fromStationId || inboundEntry.stationId;
            const returnStationName = inboundEntry.fromStationName || inboundEntry.station;

            if (!returnStationId || !returnStationName) {
                throw new HttpsError("failed-precondition", "Cannot resolve return destination from inbound movement record.");
            }

            const historyEntry = {
                station: 'SCRAP ANALYSIS', stationId: 9, timestamp,
                result: 'RETURNED_TO_PREVIOUS', operator: user.name || uid,
                looper: unit.looper, project: 'Calculator',
                movementId,
                details: {
                    action: 'RETURN_TO_PREVIOUS',
                    returnReason: returnReason.trim(),
                    returnRemarks: returnRemarks.trim(),
                    returnedTo: returnStationName,
                    returnedToStationId: returnStationId,
                    inboundMovementId,
                    returnedBy: user.name || uid,
                    returnedAt: timestamp,
                }
            };

            unit.currentStation = returnStationId;
            unit.stationName = returnStationName;
            unit.status = 'Processing';
            unit.scrapInboundMovementId = null;
            unit.updatedAt = timestamp;
            unit.history = [...(Array.isArray(unit.history) ? unit.history : []), historyEntry];

            tx.set(deviceRef, JSON.parse(JSON.stringify(unit)));
            return {
                success: true,
                action: 'RETURN_TO_PREVIOUS',
                destination: returnStationName,
                destinationId: returnStationId,
                movementId
            };
        }
    });

    return txResult;
});

// ═══════════════════════════════════════════════════════════════
// 4. UNHOLD CALCULATOR SERIAL
// ═══════════════════════════════════════════════════════════════

exports.unholdCalculatorSerial = onCall(async (request) => {
    // Auth: Firebase UID only
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError("unauthenticated", "Authentication required.");
    }
    const uid = request.auth.uid;

    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
        throw new HttpsError("permission-denied", "User not found.");
    }
    const user = userDoc.data();

    const { serialNumber } = request.data;
    if (!serialNumber) {
        throw new HttpsError("invalid-argument", "serialNumber is required.");
    }

    const cleanId = serialNumber.trim().toUpperCase().replace(/\//g, '-');
    const deviceRef = db.collection("devices").doc(cleanId);
    const timestamp = new Date().toISOString();
    const movementId = generateMovementId('UNHOLD');

    const txResult = await db.runTransaction(async (tx) => {
        const deviceDoc = await tx.get(deviceRef);
        if (!deviceDoc.exists) {
            throw new HttpsError("not-found", `Unit "${cleanId}" not found.`);
        }
        const unit = deviceDoc.data();

        if (unit.holdStatus !== 'HOLD') {
            throw new HttpsError("failed-precondition", `Unit is not on hold.`);
        }

        if (unit.project !== 'Calculator') {
            throw new HttpsError("failed-precondition", `Unit belongs to "${unit.project}", not Calculator.`);
        }

        // Authorize: user must have access to the hold station
        const holdStationName = unit.holdStation;
        if (!hasStationAccess(user, holdStationName)) {
            throw new HttpsError("permission-denied", `ACCESS DENIED: You need Calculator > ${holdStationName} access to unhold.`);
        }

        const historyEntry = {
            station: holdStationName,
            stationId: unit.holdStationId || unit.currentStation,
            timestamp,
            result: 'UNHOLD',
            operator: user.name || uid,
            looper: unit.looper,
            project: 'Calculator',
            movementId,
            details: {
                unholdBy: user.name || uid,
                unholdAt: timestamp,
                previousHoldReason: unit.holdReason,
                previousHoldRemarks: unit.holdRemarks,
                previousHoldTimestamp: unit.holdTimestamp,
            }
        };

        // Clear hold fields, keep unit at the same station
        unit.holdStatus = null;
        unit.holdStation = null;
        unit.holdStationId = null;
        unit.holdReason = null;
        unit.holdRemarks = null;
        unit.holdTimestamp = null;
        unit.holdUserId = null;
        unit.updatedAt = timestamp;
        unit.history = [...(Array.isArray(unit.history) ? unit.history : []), historyEntry];

        tx.set(deviceRef, JSON.parse(JSON.stringify(unit)));
        return { success: true, station: holdStationName, movementId };
    });

    return txResult;
});
