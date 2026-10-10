/**
 * CQA MES — Unit/Serial Configuration & Movement Engine
 * Pure business logic for unit movement, station workflow validation,
 * skipped station calculation, risk assessment, and data normalization.
 */

import { 
    CALCULATOR_STATIONS, 
    CALC_DYNAMIC_FAIL_TARGETS, 
    CALC_LOOPER_ELIGIBLE_STATIONS, 
    CALC_STATION_ALLOWED_TARGETS,
    resolveCalcNextStation,
    getCalcStationById
} from './calculatorEngine.js';

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
    ],
    'Calculator': CALCULATOR_STATIONS
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

export const ADMIN_OVERRIDE_OPTIONS = [
    {
        id: 'STATUS_COMPLETE',
        name: 'Complete',
        badge: 'Finished Goods',
        color: '#10b981',
        badgeClass: 'success',
        icon: 'CheckCircle2',
        description: 'Mark the SN as completed without requiring it to pass through the remaining stations. Removes it from active shop floor WIP.',
        targetStatus: 'Completed',
        category: 'STATUS',
        requiresConfirmationPhrase: null
    },
    {
        id: 'STATUS_REJECTED',
        name: 'Rejected',
        badge: 'Lot Reject',
        color: '#f43f5e',
        badgeClass: 'danger',
        icon: 'XCircle',
        description: 'Mark the SN as rejected from any station. Immediately prevents further normal production movement.',
        targetStatus: 'Reject',
        category: 'STATUS',
        requiresConfirmationPhrase: 'REJECT'
    },
    {
        id: 'STATUS_SCRAPPED',
        name: 'Scrapped',
        badge: 'Condemned',
        color: '#ef4444',
        badgeClass: 'danger',
        icon: 'AlertTriangle',
        description: 'Mark the SN as scrapped from any station due to critical defect or damage. Permanently locks unit.',
        targetStatus: 'Scrap',
        category: 'STATUS',
        requiresConfirmationPhrase: 'SCRAP'
    },
    {
        id: 'MOVE_NEXT',
        name: 'Move to Next Station',
        badge: 'Sequence +1',
        color: 'var(--primary, #6366f1)',
        badgeClass: 'primary',
        icon: 'ArrowRight',
        description: 'Move the SN to the next station in its active workflow sequence.',
        category: 'MOVEMENT',
        requiresConfirmationPhrase: null
    },
    {
        id: 'MOVE_PREV',
        name: 'Move to Previous Station',
        badge: 'Sequence -1',
        color: '#f59e0b',
        badgeClass: 'warning',
        icon: 'CornerDownLeft',
        description: 'Move the SN to the previous station in its workflow sequence for re-work or inspection.',
        category: 'MOVEMENT',
        requiresConfirmationPhrase: null
    },
    {
        id: 'STATION_DIRECT',
        name: 'Specific Destination Station',
        badge: 'Custom Station',
        color: '#8b5cf6',
        badgeClass: 'info',
        icon: 'Layers',
        description: 'Manually select any target destination station from the workflow grid.',
        category: 'STATION_PICK',
        requiresConfirmationPhrase: null
    }
];

export const STATUS_OVERRIDE_OPTIONS = [
    {
        id: 'Processing',
        label: 'Active WIP (Processing)',
        description: 'Reopen unit to active shop floor processing. Re-activates routing and station scanning.',
        badgeClass: 'primary',
        color: 'var(--primary)',
        requiresStation: true,
        requiresSuperAdminIfLocked: true
    },
    {
        id: 'Completed',
        label: 'Finished Goods (Completed)',
        description: 'Directly mark unit as Completed (FG). Finalizes unit lifecycle.',
        badgeClass: 'success',
        color: '#10b981',
        requiresStation: false
    },
    {
        id: 'Scrap',
        label: 'Terminal Scrap (Locked)',
        description: 'Condemn and permanently lock unit as Scrap due to critical defect or damage.',
        badgeClass: 'danger',
        color: '#ef4444',
        requiresStation: false,
        requiresConfirmationPhrase: 'SCRAP'
    },
    {
        id: 'Reject',
        label: 'Terminal Rejection (Locked)',
        description: 'Condemn and permanently lock unit as Reject for lot rejections.',
        badgeClass: 'danger',
        color: '#f43f5e',
        requiresStation: false,
        requiresConfirmationPhrase: 'REJECT'
    },
    {
        id: 'HOLD',
        label: 'Quarantine Hold',
        description: 'Freeze unit progression at current station pending quality or engineering disposition.',
        badgeClass: 'warning',
        color: '#f59e0b',
        requiresStation: false
    },
    {
        id: 'RELEASE_HOLD',
        label: 'Release from Quarantine Hold',
        description: 'Clear quarantine hold flag and resume standard processing at current station.',
        badgeClass: 'info',
        color: '#06b6d4',
        requiresStation: false
    }
];

export const STATUS_OVERRIDE_REASON_CATEGORIES = {
    'Quality & Testing': [
        'False Failure / Defect Re-evaluation',
        'QA Lead Re-inspection Signoff',
        'Rework Exemption Approved',
        'MRB Disposition Approved',
        'Lot Quarantine Reversal'
    ],
    'Engineering': [
        'Engineering Prototype / Validation Test',
        'Firmware Diagnostics & Reflash Completed',
        'Hardware Debug Exemption',
        'ECO / Design Verification Waiver',
        'Engineering Scrap Condemnation'
    ],
    'Operations & Inventory': [
        'Line Rebalancing & Rework Return',
        'Accidental Scan / Station Premature Completion',
        'Urgent Dispatch Expedite',
        'BAAN Inventory Stock Alignment',
        'Batch Quarantine'
    ],
    'Data / System Correction': [
        'Incorrect MES Status Entry',
        'Operator Station Mismatch Correction',
        'Testing Terminal Glitch Recovery',
        'Terminal Scrap Status Reversal'
    ],
    'Other': [
        'Management Directive',
        'Other'
    ]
};

export const validateStatusOverrideRecord = (unit, targetStatus, userRole) => {
    if (!unit) {
        return {
            isValid: false,
            statusKey: 'NOT_FOUND',
            message: 'Unit serial number not found in database.'
        };
    }

    const currentStatus = unit.status || 'Unknown';
    const isLocked = ['Scrap', 'SCRAPPED', 'Reject', 'Rejected'].includes(currentStatus);
    const isCompleted = ['Completed', 'Complete'].includes(currentStatus);
    const isOnHold = unit.holdStatus === 'HOLD';

    if (targetStatus === 'HOLD') {
        if (isOnHold) {
            return {
                isValid: false,
                statusKey: 'ALREADY_ON_HOLD',
                message: 'Unit is already on Quarantine Hold.'
            };
        }
    } else if (targetStatus === 'RELEASE_HOLD') {
        if (!isOnHold) {
            return {
                isValid: false,
                statusKey: 'NOT_ON_HOLD',
                message: 'Unit is not currently on Hold.'
            };
        }
    } else if (currentStatus.toUpperCase() === targetStatus.toUpperCase()) {
        return {
            isValid: false,
            statusKey: 'ALREADY_IN_STATUS',
            message: `Unit is already in "${currentStatus}" status.`
        };
    }

    if (isLocked && (targetStatus === 'Processing' || targetStatus === 'Completed')) {
        if (userRole !== 'Super Admin') {
            return {
                isValid: false,
                statusKey: 'LOCKED_REQUIRES_SUPER_ADMIN',
                message: `Unit is ${currentStatus} (Locked). Reopening requires Super Admin privilege.`
            };
        }
    }

    if (isCompleted && (targetStatus === 'Scrap' || targetStatus === 'Reject')) {
        if (userRole !== 'Super Admin') {
            return {
                isValid: false,
                statusKey: 'COMPLETED_REQUIRES_SUPER_ADMIN',
                message: 'Condemning a Completed (FG) unit to Scrap/Reject requires Super Admin privilege.'
            };
        }
    }

    return {
        isValid: true,
        statusKey: 'READY_TO_OVERRIDE',
        message: 'Unit is eligible for status override.'
    };
};

export const calculateStatusOverrideRisk = (currentStatus, targetStatus) => {
    if (['Scrap', 'SCRAPPED', 'Reject', 'Rejected'].includes(currentStatus) && targetStatus === 'Processing') {
        return 'HIGH';
    }
    if (['Completed', 'Complete'].includes(currentStatus) && (targetStatus === 'Scrap' || targetStatus === 'Reject')) {
        return 'HIGH';
    }
    if (targetStatus === 'Scrap' || targetStatus === 'Reject') {
        return 'HIGH';
    }
    if (targetStatus === 'Completed') {
        return 'MEDIUM';
    }
    if (targetStatus === 'HOLD' || targetStatus === 'RELEASE_HOLD') {
        return 'LOW';
    }
    return 'LOW';
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

    if (currentStatus === 'Completed' || currentStatus === 'Complete' || currentStatus === 'Scrap' || currentStatus === 'Scrapped' || currentStatus === 'Reject' || currentStatus === 'Rejected' || currentStatus === 'SCRAPPED') {
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
    if (currentStatus === 'Completed' || currentStatus === 'Complete' || currentStatus === 'Scrap' || currentStatus === 'Scrapped' || currentStatus === 'Reject' || currentStatus === 'Rejected' || currentStatus === 'SCRAPPED') {
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
export const validateUnitRecord = (unit, targetStationId, targetProject, userRole, actionType = 'STATION_DIRECT') => {
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

    // Status Override actions (Complete, Rejected, Scrapped) can be performed from ANY station
    if (actionType === 'STATUS_COMPLETE') {
        if (unit.status === 'Completed' || unit.status === 'Complete') {
            return {
                isValid: false,
                statusKey: 'ALREADY_COMPLETED',
                message: 'Unit is already marked as Completed (FG).'
            };
        }
        return {
            isValid: true,
            statusKey: 'READY_TO_MOVE',
            message: 'Unit is eligible for direct completion override.'
        };
    }

    if (actionType === 'STATUS_REJECTED') {
        if (['Reject', 'Rejected'].includes(unit.status)) {
            return {
                isValid: false,
                statusKey: 'ALREADY_REJECTED',
                message: 'Unit is already in Rejected status.'
            };
        }
        return {
            isValid: true,
            statusKey: 'READY_TO_MOVE',
            message: 'Unit is eligible for rejection override.'
        };
    }

    if (actionType === 'STATUS_SCRAPPED') {
        if (['Scrap', 'Scrapped', 'SCRAPPED'].includes(unit.status)) {
            return {
                isValid: false,
                statusKey: 'ALREADY_SCRAPPED',
                message: 'Unit is already in Scrapped status.'
            };
        }
        return {
            isValid: true,
            statusKey: 'READY_TO_MOVE',
            message: 'Unit is eligible for scrap override.'
        };
    }

    // Movement validation: Next station
    if (actionType === 'MOVE_NEXT') {
        const curStId = unit.currentStation || 1;
        const curIdx = workflow.findIndex(s => s.id === curStId);
        if (curIdx === -1 || curIdx >= workflow.length - 1) {
            return {
                isValid: false,
                statusKey: 'AT_FINAL_STATION',
                message: 'Unit is already at final workflow station. Use Complete status override instead.'
            };
        }
        return {
            isValid: true,
            statusKey: 'READY_TO_MOVE',
            message: `Eligible to move forward to next station (${workflow[curIdx + 1]?.name}).`
        };
    }

    // Movement validation: Previous station
    if (actionType === 'MOVE_PREV') {
        const curStId = unit.currentStation || 1;
        const curIdx = workflow.findIndex(s => s.id === curStId);
        if (curIdx <= 0) {
            return {
                isValid: false,
                statusKey: 'AT_FIRST_STATION',
                message: 'Unit is already at the first workflow station (Receiving).'
            };
        }
        return {
            isValid: true,
            statusKey: 'READY_TO_MOVE',
            message: `Eligible to move backward to previous station (${workflow[curIdx - 1]?.name}).`
        };
    }

    // Locked check: Scrap or Reject for station movement
    if (unit.status === 'Scrap' || unit.status === 'Reject' || unit.status === 'SCRAPPED') {
        if (userRole !== 'Super Admin') {
            return {
                isValid: false,
                statusKey: 'LOCKED',
                message: `Unit is ${unit.status.toUpperCase()} (Locked). Reopening requires Super Admin privilege.`
            };
        }
    }

    // Completed check for station movement
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

/**
 * Resolves the default destination station and all permitted alternative destinations
 * according to the project workflow and Pass/Fail/Hold results.
 */
export const getValidDestinationStations = (currentStationId, project = 'Device', result = 'Pass', decision = null, currentUnit = null) => {
    const workflow = PROJECT_WORKFLOWS[project] || PROJECT_WORKFLOWS['Device'];
    const currentStation = workflow.find(s => s.id === Number(currentStationId));

    if (!currentStation) {
        return { defaultStation: null, availableStations: [], isHold: false };
    }

    // ── HOLD: Blocks all forward/backward movement ──
    if (result === 'Hold') {
        return {
            defaultStation: null,
            availableStations: [],
            isHold: true,
            reason: 'HOLD — Movement blocked. Unit remains at current station.'
        };
    }

    // ── CALCULATOR REFURBISHMENT ──
    if (project === 'Calculator') {
        const calcRes = resolveCalcNextStation(Number(currentStationId), result, currentUnit, null);
        let defaultStId = calcRes?.nextStationId;
        
        if (!defaultStId && calcRes?.needsSelection) {
            // Dynamic default based on station
            if (Number(currentStationId) === 3) defaultStId = 6; // Looper -> Assembly
            else if (Number(currentStationId) === 7) defaultStId = 5; // Firmware QC Fail -> Hardware Rework
            else if (Number(currentStationId) === 8) defaultStId = 7; // Packing Fail -> Firmware QC
        }

        const defaultStationObj = defaultStId ? getCalcStationById(defaultStId) : null;
        const allowedTargets = CALC_STATION_ALLOWED_TARGETS[Number(currentStationId)]?.[result] || (defaultStId ? [defaultStId] : []);
        const uniqueIds = Array.from(new Set([defaultStId, ...allowedTargets].filter(Boolean)));
        
        const availableStations = uniqueIds
            .map(id => getCalcStationById(id))
            .filter(Boolean)
            .map(s => ({
                id: s.id,
                name: s.name,
                type: s.type || 'WIP',
                isDefault: s.id === defaultStId,
                sequence: s.sequence
            }))
            .sort((a, b) => {
                if (a.isDefault) return -1;
                if (b.isDefault) return 1;
                return (a.sequence || 0) - (b.sequence || 0);
            });

        return {
            defaultStation: defaultStationObj ? { id: defaultStationObj.id, name: defaultStationObj.name, type: defaultStationObj.type } : availableStations[0] || null,
            availableStations,
            isHold: false,
            reason: calcRes?.reason || 'Calculated from Calculator workflow'
        };
    }

    // ── NON-CALCULATOR WORKFLOWS (Device, Refurbishment, Peripherals, Inward QC) ──
    let defaultNextId = null;
    let allowedIds = [];

    if (project === 'Device' || project === 'Refurbishment') {
        switch (Number(currentStationId)) {
            case 1: // RECEIVING
                defaultNextId = 2; // INSPECTION
                allowedIds = [2];
                break;
            case 2: // INSPECTION
                if (result === 'Pass') {
                    defaultNextId = 5; // FINAL QC
                    allowedIds = [5, 3, 4]; // Final QC, Debug, Rework
                } else {
                    defaultNextId = decision === 'scrap_review' ? 8 : 3;
                    allowedIds = [3, 4, 8];
                }
                break;
            case 3: // DEBUG
                if (result === 'Pass') {
                    defaultNextId = 4; // REWORK
                    allowedIds = [4, 5];
                } else {
                    defaultNextId = 8; // SCRAP REVIEW
                    allowedIds = [8, 4];
                }
                break;
            case 4: // REWORK
                if (result === 'Pass') {
                    defaultNextId = 5; // FINAL QC
                    allowedIds = [5, 3];
                } else {
                    defaultNextId = 3; // DEBUG
                    allowedIds = [3, 8];
                }
                break;
            case 5: // FINAL QC
                if (result === 'Pass') {
                    defaultNextId = 6; // PACKING
                    allowedIds = [6];
                } else {
                    defaultNextId = 3; // DEBUG
                    allowedIds = [3, 4, 8];
                }
                break;
            case 6: // PACKING
                if (result === 'Pass') {
                    defaultNextId = 7; // MOVE TO FG
                    allowedIds = [7];
                } else {
                    defaultNextId = 5; // Return to Final QC
                    allowedIds = [5, 4];
                }
                break;
            case 7: // MOVE TO FG
            case 8: // SCRAP REVIEW
            default:
                defaultNextId = null;
                allowedIds = [];
        }
    } else {
        // Peripherals & Inward QC
        switch (Number(currentStationId)) {
            case 1:
                defaultNextId = 2;
                allowedIds = [2];
                break;
            case 2:
                if (result === 'Pass') {
                    defaultNextId = 3; // MOVE TO FG
                    allowedIds = [3];
                } else {
                    defaultNextId = 4; // REJECTION
                    allowedIds = [4];
                }
                break;
            case 3:
            case 4:
            default:
                defaultNextId = null;
                allowedIds = [];
        }
    }

    const defaultStationObj = defaultNextId ? workflow.find(s => s.id === defaultNextId) : null;
    const uniqueIds = Array.from(new Set([defaultNextId, ...allowedIds].filter(Boolean)));
    const availableStations = uniqueIds
        .map(id => workflow.find(s => s.id === id))
        .filter(Boolean)
        .map(s => ({
            id: s.id,
            name: s.name,
            type: s.type || 'WIP',
            isDefault: s.id === defaultNextId,
            sequence: s.sequence
        }))
        .sort((a, b) => {
            if (a.isDefault) return -1;
            if (b.isDefault) return 1;
            return (a.sequence || 0) - (b.sequence || 0);
        });

    return {
        defaultStation: defaultStationObj ? { id: defaultStationObj.id, name: defaultStationObj.name, type: defaultStationObj.type } : availableStations[0] || null,
        availableStations,
        isHold: false,
        reason: `Standard workflow route for ${project}`
    };
};
