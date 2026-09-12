/**
 * CQA MES — Calculator Refurbishment Engine
 * 
 * All Calculator-specific business logic: stations, checkpoints, routing rules,
 * result calculation, and validation. Routing is SEQUENCE-INDEPENDENT — uses
 * explicit routing maps, NOT station sequence numbers.
 */

// ═══════════════════════════════════════════════════════════════
// STATION DEFINITIONS
// ═══════════════════════════════════════════════════════════════

export const CALCULATOR_STATIONS = [
    { id: 1,  name: 'RECEIVING',           sequence: 1,  type: 'WIP' },
    { id: 2,  name: 'INITIAL QC',          sequence: 2,  type: 'WIP' },
    { id: 3,  name: 'LOOPER ANALYSIS',     sequence: 3,  type: 'WIP' },
    { id: 4,  name: 'HARDWARE QC / DEBUG', sequence: 4,  type: 'WIP' },
    { id: 5,  name: 'HARDWARE REWORK',     sequence: 5,  type: 'WIP' },
    { id: 6,  name: 'ASSEMBLY',            sequence: 6,  type: 'WIP' },
    { id: 7,  name: 'FIRMWARE QC',         sequence: 7,  type: 'WIP' },
    { id: 8,  name: 'PACKING & CLEANING',  sequence: 8,  type: 'WIP' },
    { id: 9,  name: 'SCRAP ANALYSIS',      sequence: 9,  type: 'WIP_DECISION' },
    { id: 10, name: 'MOVE TO FG',          sequence: 10, type: 'TERMINAL_FG' },
];

// UI station list for the station selection page (excludes FG terminal)
export const CALCULATOR_UI_STATIONS = [
    { id: 1,  name: 'RECEIVING',           admin: false },
    { id: 2,  name: 'INITIAL QC',          admin: false },
    { id: 3,  name: 'LOOPER ANALYSIS',     admin: false },
    { id: 4,  name: 'HARDWARE QC / DEBUG', admin: false },
    { id: 5,  name: 'HARDWARE REWORK',     admin: false },
    { id: 6,  name: 'ASSEMBLY',            admin: false },
    { id: 7,  name: 'FIRMWARE QC',         admin: false },
    { id: 8,  name: 'PACKING & CLEANING',  admin: false },
    { id: 9,  name: 'SCRAP ANALYSIS',      admin: true },
    { id: 10, name: 'MOVE TO FG',          admin: false },
];

export const getCalcStationById = (id) => CALCULATOR_STATIONS.find(s => s.id === id) || null;
export const getCalcStationByName = (name) => {
    const clean = (name || '').toUpperCase().trim();
    return CALCULATOR_STATIONS.find(s => s.name === clean) || null;
};

// ═══════════════════════════════════════════════════════════════
// CHECKPOINT DEFINITIONS (per station)
// ═══════════════════════════════════════════════════════════════
// Types:
//   'PFH'  = Pass / Fail / Hold (3-state, affects result)
//   'DATA' = Data entry field (does not affect pass/fail/hold result)
//   'TEXT' = Mandatory text entry (does not affect pass/fail/hold result)

export const CALC_CHECKPOINTS = {
    // ─── Initial QC (Station 2) ───
    2: [
        { key: 'power_on',       label: 'Power ON Test',                     type: 'PFH' },
        { key: 'charging_test',  label: 'Charging Test (1 < Multiplexer)',   type: 'DATA', dataLabel: 'Multiplexer Value', required: true },
        { key: 'display_check',  label: 'Display Segment Check',            type: 'PFH' },
    ],

    // ─── Hardware QC / Debug (Station 4) — 10 P/F/H + 2 Data + 1 Text ───
    4: [
        { key: 'maxim_ic',           label: 'Maxim IC Presence',          type: 'PFH' },
        { key: 'vbat',               label: 'VBAT',                       type: 'DATA', dataLabel: 'VBAT Value (V)',  required: true },
        { key: 'ichg',               label: 'ICHG',                       type: 'DATA', dataLabel: 'ICHG Value (mA)', required: true },
        { key: 'charging_usb',       label: 'Charging USB Port',          type: 'PFH' },
        { key: 'charging_ic',        label: 'Charging IC',                type: 'PFH' },
        { key: 'buck_3v3',           label: '3.3V Buck',                  type: 'PFH' },
        { key: 'buck_boost_3v8',     label: '3.8V Buck-Boost',            type: 'PFH' },
        { key: 'boost_5v_usb',       label: '5V USB Boost',               type: 'PFH' },
        { key: 'u6_usb_pd_ic',      label: 'U6 USB PD IC',               type: 'PFH' },
        { key: 'tvs_diode',          label: 'TVS Diode',                  type: 'PFH' },
        { key: 'on_off_ic',          label: 'ON/OFF IC',                  type: 'PFH' },
        { key: 'pcba_soldering',     label: 'PCBA Soldering Quality',     type: 'PFH' },
        { key: 'debug_note',         label: 'Debug Note',                 type: 'TEXT', required: true },
    ],

    // ─── Firmware QC (Station 7) — 13 P/F/H + 1 Data ───
    7: [
        { key: 'os_update',              label: 'OS Update',                       type: 'PFH' },
        { key: 'updated_os_version',     label: 'Updated OS Version',              type: 'DATA', dataLabel: 'OS Version', required: true },
        { key: 'display_validation',     label: 'Display Validation',              type: 'PFH' },
        { key: 'wifi',                   label: 'WiFi',                            type: 'PFH' },
        { key: 'gsm',                    label: 'GSM',                             type: 'PFH' },
        { key: 'login',                  label: 'Login',                           type: 'PFH' },
        { key: 'transaction_sync',       label: 'Transaction Sync',                type: 'PFH' },
        { key: 'billing_sync',           label: 'Billing Sync',                    type: 'PFH' },
        { key: 'charging_led_ui',        label: 'Charging LED and UI',             type: 'PFH' },
        { key: 'brightness_volume',      label: 'Brightness & Volume',             type: 'PFH' },
        { key: 'left_usb_port',          label: 'Left USB Port (Power Output)',     type: 'PFH' },
        { key: 'peripheral_usb',         label: 'Peripheral Connectivity (USB)',    type: 'PFH' },
        { key: 'peripheral_ble',         label: 'Peripheral Connectivity (BLE)',    type: 'PFH' },
        { key: 'factory_reset',          label: 'Factory Reset',                   type: 'PFH' },
    ],

    // ─── Packing & Cleaning (Station 8) — 3 P/F/H ───
    8: [
        { key: 'physical_cosmetic',     label: 'Physical Cosmetic',              type: 'PFH' },
        { key: 'all_accessories',       label: 'All Accessories Added',          type: 'PFH' },
        { key: 'outer_box_label',       label: 'Outer Box Label Match',          type: 'PFH' },
    ],
};

// ═══════════════════════════════════════════════════════════════
// ROUTING RULES (SEQUENCE-INDEPENDENT)
// ═══════════════════════════════════════════════════════════════
// All routing is determined by explicit maps, NOT sequence numbers.

/**
 * Deterministic routes: station → result → next station ID
 * 'DYNAMIC' = user must select from CALC_DYNAMIC_FAIL_TARGETS
 * null      = movement blocked (Hold)
 */
export const CALC_DETERMINISTIC_ROUTES = {
    // Receiving (1): routing depends on first-time vs repeat
    1: { firstTime: 2, repeat: 3 },

    // Initial QC (2): Both Pass and Fail go to Hardware QC / Debug
    2: { Pass: 4, Fail: 4, Hold: null },

    // Hardware QC / Debug (4): Pass→Assembly, Fail→Hardware Rework
    4: { Pass: 6, Fail: 5, Hold: null },

    // Hardware Rework (5): Always → Assembly
    5: { default: 6 },

    // Assembly (6): Always → Firmware QC
    6: { default: 7 },

    // Firmware QC (7): Pass→Packing, Fail→DYNAMIC (user picks)
    7: { Pass: 8, Fail: 'DYNAMIC', Hold: null },

    // Packing & Cleaning (8): Pass→MOVE TO FG, Fail→DYNAMIC (user picks)
    8: { Pass: 10, Fail: 'DYNAMIC', Hold: null },

    // Looper Analysis (3): Always DYNAMIC (user picks next station)
    3: { default: 'DYNAMIC' },

    // Scrap Analysis (9): handled by Cloud Function, not deterministic routes
    // MOVE TO FG (10): terminal, no further routing
};

/**
 * When a station's fail route is 'DYNAMIC', these are the valid target station IDs.
 * Scrap Analysis (9) is always included as an option.
 */
export const CALC_DYNAMIC_FAIL_TARGETS = {
    7: [2, 4, 5, 6, 9],        // Firmware QC Fail options
    8: [2, 4, 5, 6, 7, 9],     // Packing Fail options
};

/**
 * Looper Analysis (3): eligible next stations
 */
export const CALC_LOOPER_ELIGIBLE_STATIONS = [2, 4, 5, 6, 7, 8, 9];

/**
 * Stations that can route TO Scrap Analysis (ID: 9).
 * Scrap routing is an explicit action at these stations.
 */
export const CALC_SCRAP_ELIGIBLE_FROM = [2, 3, 4, 5, 6, 7, 8];

/**
 * Per-station scrap route trigger definition.
 * Describes HOW each station offers the "Route to Scrap" action.
 */
export const CALC_SCRAP_ROUTE_TRIGGERS = {
    2: { trigger: 'FAIL_DISPOSITION', label: 'Route to Scrap Analysis' },
    3: { trigger: 'NEXT_STATION_OPTION', label: 'Scrap Analysis' },
    4: { trigger: 'FAIL_DISPOSITION', label: 'Route to Scrap Analysis' },
    5: { trigger: 'FAIL_DISPOSITION', label: 'Route to Scrap Analysis' },
    6: { trigger: 'FAIL_DISPOSITION', label: 'Route to Scrap Analysis' },
    7: { trigger: 'DYNAMIC_OPTION', label: 'Scrap Analysis' },
    8: { trigger: 'DYNAMIC_OPTION', label: 'Scrap Analysis' },
};

// ═══════════════════════════════════════════════════════════════
// RESULT CALCULATION (3-state)
// ═══════════════════════════════════════════════════════════════

/**
 * Calculates the final station result from checkpoint results.
 * Only 'PFH' type checkpoints affect the result.
 * 
 * Priority: Fail > Hold > Pass
 *   - Any Fail → Final = 'Fail'
 *   - No Fail but any Hold → Final = 'Hold'
 *   - All Pass → Final = 'Pass'
 *   - Incomplete → null
 * 
 * @param {number} stationId
 * @param {Object} checkpointResults - { [checkpointKey]: 'Pass' | 'Fail' | 'Hold' }
 * @returns {{ result: string|null, complete: boolean, failCount: number, holdCount: number, passCount: number, total: number }}
 */
export const calculateCalcResult = (stationId, checkpointResults) => {
    const checkpoints = CALC_CHECKPOINTS[stationId];
    if (!checkpoints) return { result: null, complete: true, failCount: 0, holdCount: 0, passCount: 0, total: 0 };

    const pfhCheckpoints = checkpoints.filter(c => c.type === 'PFH');
    const total = pfhCheckpoints.length;
    if (total === 0) return { result: 'Pass', complete: true, failCount: 0, holdCount: 0, passCount: 0, total: 0 };

    let passCount = 0, failCount = 0, holdCount = 0;
    for (const cp of pfhCheckpoints) {
        const val = checkpointResults[cp.key];
        if (val === 'Pass') passCount++;
        else if (val === 'Fail') failCount++;
        else if (val === 'Hold') holdCount++;
    }

    const answered = passCount + failCount + holdCount;
    const complete = answered === total;

    let result = null;
    if (failCount > 0) result = 'Fail';
    else if (holdCount > 0) result = 'Hold';
    else if (complete) result = 'Pass';

    return { result, complete, allAnswered: complete, failCount, holdCount, passCount, total };
};

// ═══════════════════════════════════════════════════════════════
// ROUTING VALIDATION (SEQUENCE-INDEPENDENT)
// ═══════════════════════════════════════════════════════════════

/**
 * Resolves the next station for a Calculator unit.
 * 
 * @param {number} fromStationId - Current station being processed
 * @param {string} result - 'Pass' | 'Fail' | 'Hold'
 * @param {Object} unit - Device document
 * @param {number|null} selectedNextStationId - User-selected station (for DYNAMIC routes)
 * @returns {{ valid: boolean, nextStationId: number|null, nextStationName: string, reason: string }}
 */
export const CALC_STATION_ALLOWED_TARGETS = {
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

export const resolveCalcNextStation = (fromStationId, result, unit, selectedNextStationId = null) => {
    const routes = CALC_DETERMINISTIC_ROUTES[fromStationId];
    if (!routes) {
        return { valid: false, nextStationId: null, nextStationName: '', reason: `No routing rules defined for station ${fromStationId}` };
    }

    // Hold: block movement
    if (result === 'Hold') {
        return { valid: true, nextStationId: null, nextStationName: '', reason: 'HOLD — unit does not advance', isHold: true };
    }

    // Receiving: first-time vs repeat
    if (fromStationId === 1) {
        const isRepeat = isRepeatSerial(unit);
        const target = isRepeat ? routes.repeat : routes.firstTime;
        const station = getCalcStationById(target);
        return { valid: true, nextStationId: target, nextStationName: station?.name || '', reason: isRepeat ? 'Repeat serial → Looper Analysis' : 'First-time serial → Initial QC' };
    }

    // Stations with 'default' route (no result-based branching)
    if (routes.default !== undefined) {
        if (routes.default === 'DYNAMIC') {
            // Looper Analysis — user must select
            return validateDynamicSelection(fromStationId, selectedNextStationId, 'Looper Analysis');
        }
        const station = getCalcStationById(routes.default);
        return { valid: true, nextStationId: routes.default, nextStationName: station?.name || '', reason: `Default route → ${station?.name}` };
    }

    // Result-based routing
    const target = routes[result];
    if (target === undefined || target === null) {
        return { valid: false, nextStationId: null, nextStationName: '', reason: `No route defined for result "${result}" at station ${fromStationId}` };
    }

    if (target === 'DYNAMIC') {
        return validateDynamicSelection(fromStationId, selectedNextStationId, `${result} at station ${fromStationId}`);
    }

    // Allow operator selected destination if valid within allowed targets
    if (selectedNextStationId) {
        const allowed = CALC_STATION_ALLOWED_TARGETS[fromStationId]?.[result] || [target];
        const selectedId = Number(selectedNextStationId);
        if (allowed.includes(selectedId)) {
            const overrideStation = getCalcStationById(selectedId);
            return { 
                valid: true, 
                nextStationId: overrideStation.id, 
                nextStationName: overrideStation.name, 
                reason: `${result} → ${overrideStation.name} (Operator Selected)`,
                isOverride: true
            };
        } else {
            return {
                valid: false,
                nextStationId: null,
                nextStationName: '',
                reason: `Station ${selectedId} is not a valid destination from station ${fromStationId} on ${result}`,
                error: true
            };
        }
    }

    // Deterministic route
    const station = getCalcStationById(target);
    return { valid: true, nextStationId: target, nextStationName: station?.name || '', reason: `${result} → ${station?.name}` };
};

/**
 * Validates a user-selected dynamic next station.
 */
const validateDynamicSelection = (fromStationId, selectedNextStationId, context) => {
    if (!selectedNextStationId && selectedNextStationId !== 0) {
        return { valid: false, nextStationId: null, nextStationName: '', reason: `Dynamic routing: next station selection required (${context})`, needsSelection: true, error: true };
    }

    const selectedId = Number(selectedNextStationId);

    // Looper Analysis
    if (fromStationId === 3) {
        if (!CALC_LOOPER_ELIGIBLE_STATIONS.includes(selectedId)) {
            return { valid: false, nextStationId: null, nextStationName: '', reason: `Station ${selectedId} is not a valid target from Looper Analysis`, error: true };
        }
    } else {
        // Fail dynamic targets
        const allowed = CALC_DYNAMIC_FAIL_TARGETS[fromStationId];
        if (!allowed || !allowed.includes(selectedId)) {
            return { valid: false, nextStationId: null, nextStationName: '', reason: `Station ${selectedId} is not a valid fail target from station ${fromStationId}`, error: true };
        }
    }

    const station = getCalcStationById(selectedId);
    return { valid: true, nextStationId: selectedId, nextStationName: station?.name || '', reason: `User selected → ${station?.name}` };
};

/**
 * Validates a proposed Calculator movement against the routing rules.
 * Server-side equivalent available in Cloud Function.
 */
export const validateCalcRouting = (fromStationId, toStationId, result, unit) => {
    const resolution = resolveCalcNextStation(fromStationId, result, unit, toStationId);
    if (!resolution.valid) {
        return { valid: false, reason: resolution.reason };
    }
    if (resolution.nextStationId !== toStationId && !resolution.isHold) {
        return { valid: false, reason: `Routing mismatch: expected station ${resolution.nextStationId}, got ${toStationId}` };
    }
    return { valid: true, reason: resolution.reason };
};

// ═══════════════════════════════════════════════════════════════
// REPEAT SERIAL DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Determines if a serial number is a repeat (has been processed in Calculator before).
 * A repeat serial routes to Looper Analysis instead of Initial QC.
 */
export const isRepeatSerial = (unit) => {
    if (!unit) return false;

    // If status is terminal (Completed, SCRAPPED, Scrap, Reject) it's being re-received → repeat
    if (['Completed', 'SCRAPPED', 'Scrap', 'Reject'].includes(unit.status)) return true;

    // If it has Calculator history entries beyond just Receiving, it's been processed before
    if (Array.isArray(unit.history) && unit.history.length > 0) {
        const calcHistory = unit.history.filter(h => h.project === 'Calculator');
        // Has history beyond receiving = repeat
        const hasNonReceiving = calcHistory.some(h => h.stationId !== 1);
        if (hasNonReceiving) return true;
        // Multiple receiving entries = was re-received before
        const receivingCount = calcHistory.filter(h => h.stationId === 1).length;
        if (receivingCount >= 1) return true;
    }

    return false;
};

// ═══════════════════════════════════════════════════════════════
// MOVEMENT ID GENERATION
// ═══════════════════════════════════════════════════════════════

/**
 * Generates a unique movement ID for Calculator station processing.
 * Used for scrap inbound tracking and general audit trail.
 */
export const generateCalcMovementId = (prefix = 'CALC') => {
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `${prefix}-${ts}-${rand}`;
};

/**
 * Generates a unique inbound movement ID for Scrap Analysis entry.
 * This ID is stored on the device and used by Scrap Return to identify
 * the exact movement that entered Scrap Analysis.
 */
export const generateScrapInboundId = () => {
    return generateCalcMovementId('SCRAPIN');
};

// ═══════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Validates all required data fields for a station submission.
 * Returns { valid, errors[] }
 */
export const validateCalcStationData = (stationId, checkpointResults, dataValues, textValues) => {
    const errors = [];
    const checkpoints = CALC_CHECKPOINTS[stationId];
    if (!checkpoints) return { valid: true, errors };

    // Validate all PFH checkpoints are answered
    const pfhCheckpoints = checkpoints.filter(c => c.type === 'PFH');
    for (const cp of pfhCheckpoints) {
        if (!checkpointResults[cp.key]) {
            errors.push(`"${cp.label}" requires a result (Pass/Fail/Hold)`);
        }
    }

    // Validate required DATA fields
    const dataCheckpoints = checkpoints.filter(c => c.type === 'DATA' && c.required);
    for (const cp of dataCheckpoints) {
        if (!dataValues[cp.key] || !String(dataValues[cp.key]).trim()) {
            errors.push(`"${cp.dataLabel || cp.label}" is required`);
        }
    }

    // Validate required TEXT fields
    const textCheckpoints = checkpoints.filter(c => c.type === 'TEXT' && c.required);
    for (const cp of textCheckpoints) {
        if (!textValues[cp.key] || !String(textValues[cp.key]).trim()) {
            errors.push(`"${cp.label}" is required`);
        }
    }

    // Validate fail/hold reasons
    const calcResult = calculateCalcResult(stationId, checkpointResults);
    if (calcResult.result === 'Fail' && (!textValues.failureReason || !textValues.failureReason.trim())) {
        errors.push('Failure reason is required when any checkpoint fails');
    }
    if (calcResult.result === 'Hold' && (!textValues.holdReason || !textValues.holdReason.trim())) {
        errors.push('Hold reason is required when any checkpoint is held');
    }

    return { valid: errors.length === 0, errors };
};

/**
 * Returns the list of valid dynamic next stations for display in UI.
 * @param {number} stationId
 * @param {string} result
 * @returns {Array<{id: number, name: string}>}
 */
export const getCalcDynamicOptions = (stationId, result) => {
    // Looper Analysis always shows its list
    if (stationId === 3) {
        return CALC_LOOPER_ELIGIBLE_STATIONS.map(id => getCalcStationById(id)).filter(Boolean);
    }

    // Only Fail results at DYNAMIC stations show options
    if (result !== 'Fail') return [];

    const targets = CALC_DYNAMIC_FAIL_TARGETS[stationId];
    if (!targets) return [];

    return targets.map(id => getCalcStationById(id)).filter(Boolean);
};

/**
 * Checks if a station supports the "Route to Scrap Analysis" action.
 */
export const canRouteToScrap = (stationId) => {
    return CALC_SCRAP_ELIGIBLE_FROM.includes(stationId);
};

/**
 * Gets the scrap route trigger type for a station.
 */
export const getScrapRouteTrigger = (stationId) => {
    return CALC_SCRAP_ROUTE_TRIGGERS[stationId] || null;
};
