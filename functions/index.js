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
const crypto = require("crypto");
const util = require("util");
const scryptAsync = util.promisify(crypto.scrypt);

const app = initializeApp();
const db = getFirestore(app);
const auth = getAuth(app);

// ═══════════════════════════════════════════════════════════════
// CRYPTO & AUTH HELPERS
// ═══════════════════════════════════════════════════════════════

const SCRYPT_CONFIG = {
    N: 16384,
    r: 8,
    p: 1,
    keylen: 64,
};

async function hashPassword(plainPassword) {
    const salt = crypto.randomBytes(16).toString("hex");
    const derivedKey = await scryptAsync(plainPassword, salt, SCRYPT_CONFIG.keylen, {
        N: SCRYPT_CONFIG.N,
        r: SCRYPT_CONFIG.r,
        p: SCRYPT_CONFIG.p,
    });
    return {
        hash: derivedKey.toString("hex"),
        salt,
        N: SCRYPT_CONFIG.N,
        r: SCRYPT_CONFIG.r,
        p: SCRYPT_CONFIG.p,
        keylen: SCRYPT_CONFIG.keylen,
        updatedAt: new Date().toISOString(),
    };
}

async function verifyPassword(plainPassword, secretDocData) {
    if (!secretDocData || !secretDocData.hash || !secretDocData.salt) return false;
    const keylen = secretDocData.keylen || SCRYPT_CONFIG.keylen;
    const N = secretDocData.N || SCRYPT_CONFIG.N;
    const r = secretDocData.r || SCRYPT_CONFIG.r;
    const p = secretDocData.p || SCRYPT_CONFIG.p;
    try {
        const derivedKey = await scryptAsync(plainPassword, secretDocData.salt, keylen, { N, r, p });
        const derivedHex = derivedKey.toString("hex");
        if (derivedHex.length !== secretDocData.hash.length) return false;
        return crypto.timingSafeEqual(Buffer.from(derivedHex, "utf8"), Buffer.from(secretDocData.hash, "utf8"));
    } catch (e) {
        return false;
    }
}

function verifyPlaintextTimingSafe(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function generateAuditId() {
    const d = new Date();
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = d.toISOString().slice(11, 19).replace(/:/g, '');
    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `AUD-${dateStr}-${timeStr}-${rand}`;
}

const SENSITIVE_AUDIT_KEYS = new Set(['password', 'hash', 'salt', 'secret', 'token']);

function sanitizeAuditData(val) {
    if (val === null || val === undefined) return val;
    if (typeof val !== 'object') return val;
    if (Array.isArray(val)) {
        return val.map(sanitizeAuditData);
    }
    const clean = {};
    for (const [k, v] of Object.entries(val)) {
        if (SENSITIVE_AUDIT_KEYS.has(k.toLowerCase())) {
            continue;
        }
        clean[k] = sanitizeAuditData(v);
    }
    return clean;
}

async function logAuditServer({
    actorId,
    actorName,
    actorRole,
    action,
    entity,
    entityId,
    project = null,
    previousValue = null,
    newValue = null,
    reason = '',
    remarks = '',
    status = 'SUCCESS'
}) {
    try {
        const auditId = generateAuditId();
        const timestamp = new Date().toISOString();
        const auditEntry = {
            id: auditId,
            timestamp,
            actorId: String(actorId || 'UNKNOWN'),
            actorName: String(actorName || actorId || 'System Administrator'),
            actorRole: String(actorRole || 'Admin'),
            action,
            entity,
            entityId: String(entityId || 'N/A'),
            project: project || null,
            previousValue: previousValue ? sanitizeAuditData(JSON.parse(JSON.stringify(previousValue))) : null,
            newValue: newValue ? sanitizeAuditData(JSON.parse(JSON.stringify(newValue))) : null,
            reason: reason || 'Administrative modification',
            remarks: remarks || '',
            status
        };
        await db.collection("audit_logs").doc(auditId).set(auditEntry);
        return { success: true, auditId };
    } catch (err) {
        console.error("Failed to record server audit log:", err);
        return { success: false, error: err.message };
    }
}

async function getCallerUser(request) {
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError("unauthenticated", "Authentication required.");
    }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists) {
        throw new HttpsError("permission-denied", "Caller user record not found.");
    }
    return { uid: request.auth.uid, data: callerDoc.data() };
}

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
    const { userId, password } = request.data || {};
    if (!userId || !password || typeof userId !== 'string' || typeof password !== 'string') {
        throw new HttpsError("unauthenticated", "Invalid credentials.");
    }

    // Check exact match first, then uppercase
    let userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
        userDoc = await db.collection("users").doc(userId.toUpperCase()).get();
    }

    if (!userDoc.exists) {
        throw new HttpsError("unauthenticated", "Invalid credentials.");
    }

    const userData = userDoc.data();
    const uid = userDoc.id;

    // Reject disabled/deactivated users if the user document has such a flag
    if (userData.disabled === true || userData.deactivated === true ||
        userData.status === 'Deactivated' || userData.status === 'Disabled') {
        throw new HttpsError("unauthenticated", "Invalid credentials.");
    }

    const secretRef = db.collection("user_secrets").doc(uid);
    const secretDoc = await secretRef.get();
    const secretData = secretDoc.exists ? secretDoc.data() : null;

    // Brute-force protection: lock for 15 min after 5 consecutive failures
    if (secretData?.lockedUntil) {
        const lockExpiry = new Date(secretData.lockedUntil).getTime();
        if (Date.now() < lockExpiry) {
            throw new HttpsError("unauthenticated", "Invalid credentials.");
        }
    }

    let isValid = false;
    let needsLazyMigration = false;

    if (secretDoc.exists && secretData?.hash && secretData?.salt) {
        isValid = await verifyPassword(password, secretData);
    } else if (userData.password) {
        // Lazy migration: if user_secrets/{uid} does not exist but users/{uid}.password exists (legacy plaintext)
        isValid = verifyPlaintextTimingSafe(password, userData.password);
        if (isValid) {
            needsLazyMigration = true;
        }
    }

    if (!isValid) {
        const failedAttempts = ((secretData?.failedAttempts) || 0) + 1;
        const updates = { failedAttempts };
        if (failedAttempts >= 5) {
            updates.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        }
        await secretRef.set(updates, { merge: true });
        throw new HttpsError("unauthenticated", "Invalid credentials.");
    }

    // Password is valid!
    if (needsLazyMigration) {
        const hashedSecret = await hashPassword(password);
        const batch = db.batch();
        batch.set(secretRef, {
            ...hashedSecret,
            failedAttempts: 0,
            lockedUntil: null
        }, { merge: true });
        batch.update(userDoc.ref, { password: FieldValue.delete(), mustChangePassword: true });
        await batch.commit();
    } else {
        // Reset brute-force counter if needed
        if (secretData?.failedAttempts > 0 || secretData?.lockedUntil) {
            await secretRef.set({ failedAttempts: 0, lockedUntil: null }, { merge: true });
        }
    }

    // Create or update Firebase Auth user for token generation
    try {
        await auth.getUser(uid);
    } catch (e) {
        // User doesn't exist in Firebase Auth — create it
        await auth.createUser({ uid, displayName: userData.name || uid });
    }

    // Generate custom token with role claim (never include password or stations list)
    const token = await auth.createCustomToken(uid, { role: userData.role });

    const mustChange = needsLazyMigration || userData.mustChangePassword === true;

    return {
        success: true,
        token,
        user: {
            id: uid,
            name: userData.name,
            role: userData.role,
            stations: userData.stations || [],
            mustChangePassword: Boolean(mustChange)
        }
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
    } = request.data || {};

    if (!serialNumber || stationId === undefined) {
        throw new HttpsError("invalid-argument", "serialNumber and stationId are required.");
    }

    // Hardening: reject non-string / over-long serialNumber (max 64 chars)
    if (typeof serialNumber !== 'string' || !serialNumber.trim() || serialNumber.trim().length > 64) {
        throw new HttpsError("invalid-argument", "serialNumber must be a non-empty string up to 64 characters.");
    }

    // Hardening: cap size of details/checkpointResults/dataValues/textValues (max 200 KB)
    const payloadSize = Buffer.byteLength(JSON.stringify({ details, checkpointResults, dataValues, textValues }), 'utf8');
    if (payloadSize > 200 * 1024) {
        throw new HttpsError("invalid-argument", "Payload size exceeds 200 KB limit.");
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

// ═══════════════════════════════════════════════════════════════
// 5. USER ADMINISTRATION & SECURITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

exports.adminUpsertUser = onCall(async (request) => {
    const caller = await getCallerUser(request);
    const callerRole = caller.data.role;
    if (callerRole !== 'Admin' && callerRole !== 'Super Admin') {
        throw new HttpsError("permission-denied", "Admin or Super Admin role required.");
    }

    const { id, oldId, name, role, stations, password } = request.data || {};
    if (!id || typeof id !== 'string' || !id.trim()) {
        throw new HttpsError("invalid-argument", "id is required.");
    }
    const targetId = id.trim();
    const targetRole = role || 'Operator';

    // Only Super Admin may create/modify users with role Admin or Super Admin
    if ((targetRole === 'Admin' || targetRole === 'Super Admin') && callerRole !== 'Super Admin') {
        throw new HttpsError("permission-denied", "Only Super Admin may assign Admin or Super Admin roles.");
    }

    // Check if target user already exists
    const targetDoc = await db.collection("users").doc(targetId).get();
    if (targetDoc.exists) {
        const existingRole = targetDoc.data().role;
        if ((existingRole === 'Admin' || existingRole === 'Super Admin') && callerRole !== 'Super Admin') {
            throw new HttpsError("permission-denied", "Only Super Admin may modify an Admin or Super Admin user.");
        }
    }

    const isRename = Boolean(oldId && oldId.trim() && oldId.trim() !== targetId);
    const cleanOldId = isRename ? oldId.trim() : null;

    let oldDoc = null;
    if (isRename) {
        // Refuse rename if target ID already exists (B2)
        if (targetDoc.exists) {
            throw new HttpsError("already-exists", `Cannot rename: user with ID "${targetId}" already exists.`);
        }

        oldDoc = await db.collection("users").doc(cleanOldId).get();
        if (!oldDoc.exists) {
            throw new HttpsError("not-found", `User to rename "${cleanOldId}" does not exist.`);
        }
        const oldRole = oldDoc.data().role;
        if ((oldRole === 'Admin' || oldRole === 'Super Admin') && callerRole !== 'Super Admin') {
            throw new HttpsError("permission-denied", "Only Super Admin may modify an Admin or Super Admin user.");
        }
    }

    // Prepare user doc payload (NEVER write password into users doc)
    const userPayload = {
        id: targetId,
        name: name ? name.trim() : targetId,
        role: targetRole,
        stations: Array.isArray(stations) ? stations : [],
        updatedAt: new Date().toISOString()
    };

    let newSecretPayload = null;
    if (password) {
        if (typeof password !== 'string' || password.length < 8) {
            throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
        }
        const secretPayload = await hashPassword(password);
        newSecretPayload = {
            ...secretPayload,
            failedAttempts: 0,
            lockedUntil: null
        };
    }

    // Atomic batch for user + secret write and old doc deletion (B2 & Item 5)
    const batch = db.batch();
    const finalUserPayload = isRename ? { ...(oldDoc?.data() || {}), ...userPayload } : userPayload;
    delete finalUserPayload.password;

    if (isRename) {
        const oldSecretDoc = await db.collection("user_secrets").doc(cleanOldId).get();

        // 1. Write new user document carrying over existing fields (mustChangePassword, createdAt, etc.)
        batch.set(db.collection("users").doc(targetId), finalUserPayload);

        // 2. Write new secret document
        if (newSecretPayload) {
            batch.set(db.collection("user_secrets").doc(targetId), newSecretPayload);
        } else if (oldSecretDoc.exists) {
            batch.set(db.collection("user_secrets").doc(targetId), oldSecretDoc.data());
        }

        // 3. Delete old user document and old secret document atomically
        batch.delete(db.collection("users").doc(cleanOldId));
        if (oldSecretDoc.exists) {
            batch.delete(db.collection("user_secrets").doc(cleanOldId));
        }
    } else {
        batch.set(db.collection("users").doc(targetId), userPayload, { merge: true });
        if (newSecretPayload) {
            batch.set(db.collection("user_secrets").doc(targetId), newSecretPayload, { merge: true });
        }
    }

    await batch.commit();

    if (isRename) {
        try { await auth.revokeRefreshTokens(cleanOldId); } catch (e) {}
        try { await auth.deleteUser(cleanOldId); } catch (e) {}
    }

    // Sync Auth user displayName
    try {
        await auth.getUser(targetId);
        await auth.updateUser(targetId, { displayName: userPayload.name });
    } catch (e) {
        await auth.createUser({ uid: targetId, displayName: userPayload.name });
    }

    // B1: Revoke sessions when role or station list changed or password was updated
    if (targetDoc.exists) {
        const existingData = targetDoc.data();
        const roleChanged = existingData.role !== targetRole;
        const stationsChanged = JSON.stringify(existingData.stations || []) !== JSON.stringify(userPayload.stations);
        if (roleChanged || stationsChanged || password) {
            try { await auth.revokeRefreshTokens(targetId); } catch (e) {}
        }
    }

    await logAuditServer({
        actorId: caller.uid,
        actorName: caller.data.name,
        actorRole: callerRole,
        action: targetDoc.exists ? 'USER_UPDATED' : 'USER_CREATED',
        entity: 'user',
        entityId: targetId,
        newValue: sanitizeAuditData(finalUserPayload),
        reason: isRename ? `Admin renamed user ${cleanOldId} to ${targetId}` : 'Admin user upsert'
    });

    return { success: true };
});

exports.adminDeleteUser = onCall(async (request) => {
    const caller = await getCallerUser(request);
    const callerRole = caller.data.role;
    if (callerRole !== 'Admin' && callerRole !== 'Super Admin') {
        throw new HttpsError("permission-denied", "Admin or Super Admin role required.");
    }

    const { id } = request.data || {};
    if (!id || typeof id !== 'string') {
        throw new HttpsError("invalid-argument", "id is required.");
    }
    const targetId = id.trim();

    if (targetId === caller.uid) {
        throw new HttpsError("failed-precondition", "Cannot delete your own account.");
    }

    const targetDoc = await db.collection("users").doc(targetId).get();
    if (targetDoc.exists) {
        const targetRole = targetDoc.data().role;
        if ((targetRole === 'Super Admin' || targetRole === 'Admin') && callerRole !== 'Super Admin') {
            throw new HttpsError("permission-denied", "Cannot delete an Admin or Super Admin user without Super Admin privileges.");
        }
    }

    await db.collection("users").doc(targetId).delete();
    await db.collection("user_secrets").doc(targetId).delete();

    // B1: Revoke refresh tokens before delete
    try { await auth.revokeRefreshTokens(targetId); } catch (e) {}
    try { await auth.deleteUser(targetId); } catch (e) {}

    const rawPrevious = targetDoc.exists ? targetDoc.data() : null;
    const sanitizedPrevious = rawPrevious ? sanitizeAuditData(rawPrevious) : null;

    await logAuditServer({
        actorId: caller.uid,
        actorName: caller.data.name,
        actorRole: callerRole,
        action: 'USER_DEACTIVATED',
        entity: 'user',
        entityId: targetId,
        previousValue: sanitizedPrevious,
        reason: 'Admin user deleted'
    });

    return { success: true };
});

function generateSecureRandomPassword(length = 14) {
    const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lowercase = "abcdefghijkmnopqrstuvwxyz";
    const numbers = "23456789";
    const symbols = "!@#$%^&*()-_=+";
    const all = uppercase + lowercase + numbers + symbols;

    const pwd = [
        uppercase[crypto.randomInt(0, uppercase.length)],
        lowercase[crypto.randomInt(0, lowercase.length)],
        numbers[crypto.randomInt(0, numbers.length)],
        symbols[crypto.randomInt(0, symbols.length)],
    ];

    for (let i = 4; i < length; i++) {
        pwd.push(all[crypto.randomInt(0, all.length)]);
    }

    for (let i = pwd.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
    }

    return pwd.join("");
}

exports.adminResetPassword = onCall(async (request) => {
    const caller = await getCallerUser(request);
    const callerRole = caller.data.role;
    if (callerRole !== 'Admin' && callerRole !== 'Super Admin') {
        throw new HttpsError("permission-denied", "Admin or Super Admin role required.");
    }

    const { id, newPassword } = request.data || {};
    if (!id || typeof id !== 'string') {
        throw new HttpsError("invalid-argument", "id is required.");
    }
    const targetId = id.trim();

    let finalPassword = '';
    if (newPassword && typeof newPassword === 'string' && newPassword.trim()) {
        const trimmed = newPassword.trim();
        if (trimmed.length < 8) {
            throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
        }
        finalPassword = trimmed;
    } else {
        finalPassword = generateSecureRandomPassword(14);
    }

    const targetDoc = await db.collection("users").doc(targetId).get();
    if (targetDoc.exists) {
        const targetRole = targetDoc.data().role;
        if ((targetRole === 'Super Admin' || targetRole === 'Admin') && callerRole !== 'Super Admin') {
            throw new HttpsError("permission-denied", "Only Super Admin can reset password of an Admin or Super Admin.");
        }
    }

    const secretPayload = await hashPassword(finalPassword);
    await db.collection("user_secrets").doc(targetId).set({
        ...secretPayload,
        failedAttempts: 0,
        lockedUntil: null
    }, { merge: true });

    // Set mustChangePassword: true and delete legacy password field on users doc
    const userUpdates = {
        mustChangePassword: true,
        updatedAt: new Date().toISOString()
    };
    if (targetDoc.exists && targetDoc.data().password) {
        userUpdates.password = FieldValue.delete();
    }
    await db.collection("users").doc(targetId).set(userUpdates, { merge: true });

    // Revoke sessions when credentials change (B1 requirement)
    try { await auth.revokeRefreshTokens(targetId); } catch (e) {}

    await logAuditServer({
        actorId: caller.uid,
        actorName: caller.data.name,
        actorRole: callerRole,
        action: 'USER_PASSWORD_RESET',
        entity: 'user',
        entityId: targetId,
        reason: 'Admin reset password'
    });

    return {
        success: true,
        temporaryPassword: finalPassword,
        password: finalPassword
    };
});

exports.changeOwnPassword = onCall(async (request) => {
    const caller = await getCallerUser(request);
    const uid = caller.uid;

    const { currentPassword, newPassword } = request.data || {};
    if (!currentPassword || typeof currentPassword !== 'string') {
        throw new HttpsError("invalid-argument", "Current password is required.");
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        throw new HttpsError("invalid-argument", "New password must be at least 8 characters.");
    }

    const secretRef = db.collection("user_secrets").doc(uid);
    const secretDoc = await secretRef.get();
    let isCurrentValid = false;

    if (secretDoc.exists && secretDoc.data()?.hash) {
        isCurrentValid = await verifyPassword(currentPassword, secretDoc.data());
    } else if (caller.data.password) {
        // Legacy plaintext check
        isCurrentValid = verifyPlaintextTimingSafe(currentPassword, caller.data.password);
    }

    if (!isCurrentValid) {
        throw new HttpsError("unauthenticated", "Current password is incorrect.");
    }

    const secretPayload = await hashPassword(newPassword);
    const batch = db.batch();
    batch.set(secretRef, {
        ...secretPayload,
        failedAttempts: 0,
        lockedUntil: null
    }, { merge: true });
    batch.update(db.collection("users").doc(uid), {
        password: FieldValue.delete(),
        mustChangePassword: FieldValue.delete()
    });
    await batch.commit();

    // B1: Revoke tokens upon password change
    try { await auth.revokeRefreshTokens(uid); } catch (e) {}

    await logAuditServer({
        actorId: uid,
        actorName: caller.data.name,
        actorRole: caller.data.role,
        action: 'USER_PASSWORD_RESET',
        entity: 'user',
        entityId: uid,
        reason: 'User self password change'
    });

    return { success: true };
});

// ═══════════════════════════════════════════════════════════════
// 6. PURGE DEVICES (SUPER ADMIN ONLY)
// ═══════════════════════════════════════════════════════════════

exports.purgeDevices = onCall({ timeoutSeconds: 300 }, async (request) => {
    const caller = await getCallerUser(request);
    if (caller.data.role !== 'Super Admin') {
        throw new HttpsError("permission-denied", "Super Admin privileges required to purge devices.");
    }

    const { filters } = request.data || {};
    if (!filters) {
        throw new HttpsError("invalid-argument", "Purge filters are required.");
    }

    if (typeof filters === 'string') {
        if (!['all', 'completed', 'scrap'].includes(filters)) {
            throw new HttpsError("invalid-argument", `Invalid purge target "${filters}". Must be all, completed, or scrap.`);
        }
    } else if (typeof filters === 'object') {
        if (!filters.project && !filters.station && !filters.serial) {
            throw new HttpsError("invalid-argument", "At least one filter property (project, station, or serial) is required.");
        }
    } else {
        throw new HttpsError("invalid-argument", "Filters must be a string or object.");
    }

    const querySnapshot = await db.collection("devices").get();
    let batch = db.batch();
    let batchCount = 0;
    let totalCount = 0;

    for (const docSnap of querySnapshot.docs) {
        const data = docSnap.data();
        let shouldDelete = false;

        if (typeof filters === 'string') {
            if (filters === 'all') shouldDelete = true;
            else if (filters === 'completed' && data.status === 'Completed') shouldDelete = true;
            else if (filters === 'scrap' && (data.status === 'Scrap' || data.status === 'Reject' || data.status === 'SCRAPPED')) shouldDelete = true;
        } else {
            const { project, station, serial } = filters;
            // Priority 1: Serial Number (Exact match)
            if (serial && data.id === serial.trim().toUpperCase().replace(/\//g, '-')) {
                shouldDelete = true;
            }
            // Priority 2: Project + Station match
            else if (project && station) {
                if (data.project === project && data.stationName === station) {
                    shouldDelete = true;
                }
            }
            // Priority 3: Project match only
            else if (project && !station && !serial) {
                if (data.project === project) shouldDelete = true;
            }
            // Priority 4: Station match only
            else if (station && !project && !serial) {
                if (data.stationName === station) shouldDelete = true;
            }
        }

        if (shouldDelete) {
            batch.delete(docSnap.ref);
            batchCount++;
            totalCount++;
            if (batchCount >= 450) {
                await batch.commit();
                batch = db.batch();
                batchCount = 0;
            }
        }
    }

    if (batchCount > 0) {
        await batch.commit();
    }

    await logAuditServer({
        actorId: caller.uid,
        actorName: caller.data.name,
        actorRole: caller.data.role,
        action: 'DATA_PURGED',
        entity: 'system',
        entityId: 'devices',
        reason: 'Administrative device purge',
        remarks: JSON.stringify({ filters, count: totalCount })
    });

    return { success: true, count: totalCount };
});

