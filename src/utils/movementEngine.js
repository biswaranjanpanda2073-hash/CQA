/**
 * CQA MES — Unit/Serial Configuration & Movement Engine
 * Pure business logic for unit movement, station workflow validation,
 * skipped station calculation, risk assessment, and data normalization.
 */

export const PROJECT_WORKFLOWS = {
    'Device': [
        { id: 1, name: 'RECEIVING', sequence: 1, type: 'WIP' },
        { id: 2, name: 'INSPECTION', sequence: 2, type: 'WIP' },
        { id: 3, name: 'DEBUG', sequence: 3, type: 'WIP' },
        { id: 4, name: 'REWORK', sequence: 4, type: 'WIP' },
        { id: 5, name: 'FINAL QC', sequence: 5, type: 'WIP' },
        { id: 6, name: 'PACKING', sequence: 6, type: 'WIP' },
        { id: 7, name: 'MOVE TO FG', sequence: 7, type: 'TERMINAL_FG' },
        { id: 8, name: 'SCRAP REVIEW', sequence: 8, type: 'TERMINAL_SCRAP' }
    ],
    'Peripherals': [
        { id: 1, name: 'RECEIVING', sequence: 1, type: 'WIP' },
        { id: 2, name: 'QC', sequence: 2, type: 'WIP' },
        { id: 3, name: 'MOVE TO FG', sequence: 3, type: 'TERMINAL_FG' },
        { id: 4, name: 'REJECTION REVIEW', sequence: 4, type: 'TERMINAL_SCRAP' }
    ],
    'Inward QC': [
        { id: 1, name: 'RECEIVING', sequence: 1, type: 'WIP' },
        { id: 2, name: 'IQC', sequence: 2, type: 'WIP' },
        { id: 3, name: 'MOVE TO FG', sequence: 3, type: 'TERMINAL_FG' },
        { id: 4, name: 'REJECTION', sequence: 4, type: 'TERMINAL_SCRAP' }
    ]
};

export const REASON_CATEGORIES = {
    'Engineering': [
        'Engineering Fast-Track',
        'Sample / Validation Testing'
    ],
    'Quality': [
        'False Failure / Defect Re-evaluation',
        'Rework Exemption',
        'Additional Debug Required'
    ],
    'Operations': [
        'Line Rebalancing',
        'Urgent Dispatch'
    ],
    'Data / Process Correction': [
        'Wrong Station Scan',
        'Incorrect MES Data'
    ],
    'Other': [
        'Other'
    ]
};

/**
 * Normalizes raw input (string, array, csv/xlsx rows) into unique, clean Serial Numbers
 */
export const normalizeSerialNumbers = (rawInput) => {
    let rawList = [];

    if (Array.isArray(rawInput)) {
        rawList = rawInput;
    } else if (typeof rawInput === 'string') {
        // Split by newlines, commas, semicolons, tabs, and spaces
        rawList = rawInput.split(/[\r\n,;\t\s]+/);
    }

    const totalEntered = rawList.length;
    const seen = new Set();
    const duplicates = [];
    const normalized = [];

    for (const raw of rawList) {
        if (!raw) continue;
        const clean = String(raw).trim().toUpperCase().replace(/\//g, '-');
        if (!clean) continue;

        if (seen.has(clean)) {
            duplicates.push(clean);
        } else {
            seen.add(clean);
            normalized.push(clean);
        }
    }

    return {
        totalEntered,
        uniqueCount: normalized.length,
        duplicatesCount: duplicates.length,
        duplicates,
        serialNumbers: normalized
    };
};

/**
 * Resolves the station object from a project workflow
 */
export const getStationObj = (project, stationIdOrName) => {
    const workflow = PROJECT_WORKFLOWS[project] || PROJECT_WORKFLOWS['Device'];
    if (typeof stationIdOrName === 'number') {
        return workflow.find(s => s.id === stationIdOrName) || null;
    }
    const cleanName = String(stationIdOrName || '').toUpperCase().trim();
    return workflow.find(s => s.name.toUpperCase() === cleanName || s.name.toUpperCase().includes(cleanName)) || null;
};

/**
 * Calculates skipped stations between fromStation and toStation in a forward move
 */
export const calculateSkippedStations = (fromStationId, toStationId, project) => {
    const workflow = PROJECT_WORKFLOWS[project] || PROJECT_WORKFLOWS['Device'];
    const fromStation = workflow.find(s => s.id === fromStationId);
    const toStation = workflow.find(s => s.id === toStationId);

    if (!fromStation || !toStation) return [];
    if (toStation.sequence <= fromStation.sequence) return [];

    // All stations strictly between fromStation.sequence and toStation.sequence
    return workflow
        .filter(s => s.sequence > fromStation.sequence && s.sequence < toStation.sequence && s.type === 'WIP')
        .map(s => ({
            stationId: s.id,
            stationName: s.name
        }));
};

/**
 * Classifies movement type:
 * - FORWARD_REROUTE
 * - BACKWARD_RETURN
 * - TERMINAL_MOVEMENT
 * - ADMIN_REOPEN
 */
export const calculateMovementClassification = (fromStationId, toStationId, project, currentStatus) => {
    const workflow = PROJECT_WORKFLOWS[project] || PROJECT_WORKFLOWS['Device'];
    const toStation = workflow.find(s => s.id === toStationId);
    const fromStation = workflow.find(s => s.id === fromStationId);

    if (currentStatus === 'Completed' || currentStatus === 'Scrap' || currentStatus === 'Reject') {
        return 'ADMIN_REOPEN';
    }

    if (toStation?.type === 'TERMINAL_FG' || toStation?.type === 'TERMINAL_SCRAP') {
        return 'TERMINAL_MOVEMENT';
    }

    if (!fromStation || !toStation) {
        return 'FORWARD_REROUTE';
    }

    if (toStation.sequence < fromStation.sequence) {
        return 'BACKWARD_RETURN';
    }

    return 'FORWARD_REROUTE';
};

/**
 * Evaluates Risk Level:
 * - Low: standard single-step WIP progress
 * - Medium: forward move skipping stations or backward return
 * - High: terminal move (FG / Scrap / Reject) or reopening closed/locked unit
 */
export const calculateRiskLevel = (fromStationId, toStationId, project, currentStatus, skippedStations = []) => {
    if (currentStatus === 'Completed' || currentStatus === 'Scrap' || currentStatus === 'Reject') {
        return 'HIGH';
    }

    const workflow = PROJECT_WORKFLOWS[project] || PROJECT_WORKFLOWS['Device'];
    const toStation = workflow.find(s => s.id === toStationId);

    if (toStation?.type === 'TERMINAL_FG' || toStation?.type === 'TERMINAL_SCRAP') {
        return 'HIGH';
    }

    if (skippedStations.length >= 2) {
        return 'MEDIUM';
    }

    const fromStation = workflow.find(s => s.id === fromStationId);
    if (fromStation && toStation && toStation.sequence < fromStation.sequence) {
        return 'MEDIUM';
    }

    return skippedStations.length > 0 ? 'MEDIUM' : 'LOW';
};

/**
 * Validates a single unit state against movement requirements
 */
export const validateUnitRecord = (unit, targetStationId, targetProject, userRole) => {
    if (!unit) {
        return {
            isValid: false,
            statusKey: 'NOT_FOUND',
            message: 'Unit serial number not found in database.'
        };
    }

    const project = unit.project || 'Device';
    const workflow = PROJECT_WORKFLOWS[project];

    if (!workflow) {
        return {
            isValid: false,
            statusKey: 'INVALID_PROJECT',
            message: `Unknown or unconfigured project: ${project}`
        };
    }

    // Locked check: Scrap or Reject
    if (unit.status === 'Scrap' || unit.status === 'Reject') {
        if (userRole !== 'Super Admin') {
            return {
                isValid: false,
                statusKey: 'LOCKED',
                message: `Unit is ${unit.status.toUpperCase()} (Locked). Reopening requires Super Admin privilege.`
            };
        }
    }

    // Completed check
    if (unit.status === 'Completed') {
        if (userRole !== 'Super Admin' && userRole !== 'Admin') {
            return {
                isValid: false,
                statusKey: 'COMPLETED_RESTRICTED',
                message: 'Unit is already Completed (FG). Movement requires Admin or Super Admin authorization.'
            };
        }
    }

    // If target station is selected, validate target
    if (targetStationId !== undefined && targetStationId !== null) {
        const targetStation = workflow.find(s => s.id === Number(targetStationId));
        if (!targetStation) {
            return {
                isValid: false,
                statusKey: 'INVALID_TARGET',
                message: `Station ID ${targetStationId} does not belong to ${project} workflow.`
            };
        }

        // Already at destination check
        if (unit.currentStation === Number(targetStationId) && unit.status === 'Processing') {
            return {
                isValid: false,
                statusKey: 'ALREADY_AT_DESTINATION',
                message: `Unit is already at destination (${unit.stationName || targetStation.name}).`
            };
        }
    }

    return {
        isValid: true,
        statusKey: 'READY_TO_MOVE',
        message: 'Unit is valid and eligible for movement.'
    };
};
