/**
 * CQA MES — Serial & Production Governance Engine
 * Pure business logic for Serial Inspection, Hold/Unhold Taxonomy,
 * Looper Risk Analysis, and Disposition Workflows.
 */

export const HOLD_TAXONOMY = {
    'Quality': {
        label: 'Quality Hold',
        color: '#f59e0b',
        reasons: [
            'Critical Defect Spike — Multiple units exhibiting identical failure mode',
            'Cosmetic Anomaly — Visual/aesthetic flaw requiring QA Lead review',
            'Component Defect — Suspect internal part or vendor failure',
            'QA Lead Hold — Pending formal quality review or test re-evaluation',
            'False Failure Suspect — Station jig calibration suspect'
        ]
    },
    'Engineering': {
        label: 'Engineering Hold',
        color: '#3b82f6',
        reasons: [
            'Engineering Evaluation — Unit pulled for engineering/reliability study',
            'Firmware / Diagnostic Analysis — Deep-dive boot or log analysis needed',
            'Hardware Debug — Trace, probe, or component-level inspection needed',
            'ECO / Revision Check — Engineering Change Order compliance check'
        ]
    },
    'Material': {
        label: 'Material / Lot Quarantine',
        color: '#8b5cf6',
        reasons: [
            'Suspect Lot Code — Raw material lot flagged for upstream containment',
            'BAAN Inventory Discrepancy — Physical component differs from BAAN lot',
            'Missing Subassembly — Awaiting replenishment of critical module',
            'Supplier Quality Alert — Component alert issued by vendor'
        ]
    },
    'Process': {
        label: 'Process / Line Hold',
        color: '#ec4899',
        reasons: [
            'Wrong Station Scan — Unit scanned out-of-order or by operator mistake',
            'Equipment Calibration Halt — Test jig flagged for scheduled calibration',
            'SOP Deviation — Operator procedure variance under supervisor investigation',
            'ESD / Handling Alert — Potential ESD or drop event during handling'
        ]
    },
    'Other': {
        label: 'Administrative Hold',
        color: '#6b7280',
        reasons: [
            'Management Hold — Operational hold for batch alignment or customer halt',
            'Line Rebalancing — Temporary hold during line changeover',
            'Other Administrative Reason'
        ]
    }
};

export const DISPOSITION_ACTIONS = {
    SCRAP_REVIEW: {
        id: 'SCRAP_REVIEW',
        name: 'Route to Scrap Review',
        description: 'Terminate WIP and permanently route unit to Scrap Review / Terminal Scrap.',
        targetType: 'TERMINAL_SCRAP',
        requiresConfirmation: true,
        riskLevel: 'HIGH'
    },
    MRB_ESCALATION: {
        id: 'MRB_ESCALATION',
        name: 'Escalate to MRB / Senior Quality',
        description: 'Flag unit for Material Review Board inspection without modifying physical station.',
        targetType: 'FLAG_MRB',
        requiresConfirmation: false,
        riskLevel: 'MEDIUM'
    },
    RESET_LOOPER: {
        id: 'RESET_LOOPER',
        name: 'Reset Looper Counter',
        description: 'Reset unit iteration counter back to 1 following validated engineering rework.',
        targetType: 'RESET_COUNTER',
        requiresConfirmation: true,
        riskLevel: 'MEDIUM'
    },
    RESTART_LINE: {
        id: 'RESTART_LINE',
        name: 'Restart Line (Return to Station 1)',
        description: 'Reset unit back to RECEIVING for full re-manufacturing cycle.',
        targetType: 'RESTART',
        requiresConfirmation: true,
        riskLevel: 'HIGH'
    }
};

/**
 * Assesses risk level and urgency based on unit looper count
 */
export const evaluateLooperRisk = (looperCount = 1, threshold = 3) => {
    const count = Number(looperCount) || 1;
    const thresh = Number(threshold) || 3;

    if (count >= thresh + 1) {
        return {
            level: 'CRITICAL',
            badgeClass: 'danger',
            color: '#ef4444',
            message: `Critical Looper: Unit has looped ${count} times (Exceeds threshold of ${thresh}). Immediate MRB or Scrap review required.`,
            recommendedAction: 'SCRAP_REVIEW'
        };
    }
    if (count >= thresh) {
        return {
            level: 'HIGH',
            badgeClass: 'warning',
            color: '#f97316',
            message: `High Looper: Unit reached loop limit (${count} loops). Senior engineering disposition recommended.`,
            recommendedAction: 'MRB_ESCALATION'
        };
    }
    if (count >= 2) {
        return {
            level: 'MEDIUM',
            badgeClass: 'info',
            color: '#3b82f6',
            message: `Multi-cycle Rework: Unit has looped ${count} times. Monitor station pass rate.`,
            recommendedAction: 'MONITOR'
        };
    }
    return {
        level: 'NORMAL',
        badgeClass: 'success',
        color: '#10b981',
        message: 'Normal single-cycle unit.',
        recommendedAction: 'NONE'
    };
};

/**
 * Validates a request to place unit(s) on administrative or quality hold
 */
export const validateHoldRequest = ({ serials = [], category, reason, remarks, user }) => {
    if (!user || (!user.role)) {
        return { isValid: false, message: 'Authentication required to apply Hold.' };
    }

    if (!Array.isArray(serials) || serials.length === 0) {
        return { isValid: false, message: 'At least one serial number must be specified.' };
    }

    if (!category || !HOLD_TAXONOMY[category]) {
        return { isValid: false, message: 'A valid Hold Category must be selected from the taxonomy.' };
    }

    if (!reason || String(reason).trim().length < 3) {
        return { isValid: false, message: 'A mandatory Hold Reason must be specified (minimum 3 characters).' };
    }

    return {
        isValid: true,
        sanitized: {
            serials: serials.map(s => String(s).trim().toUpperCase().replace(/\//g, '-')).filter(Boolean),
            category,
            reason: String(reason).trim(),
            remarks: String(remarks || '').trim()
        }
    };
};

/**
 * Validates a request to release unit(s) from hold
 */
export const validateReleaseRequest = ({ serials = [], resolutionReason, resolutionNotes, user }) => {
    if (!user || (!user.role)) {
        return { isValid: false, message: 'Authentication required to release Hold.' };
    }

    if (!Array.isArray(serials) || serials.length === 0) {
        return { isValid: false, message: 'At least one serial number must be specified for release.' };
    }

    if (!resolutionReason || String(resolutionReason).trim().length < 3) {
        return { isValid: false, message: 'A mandatory Release Justification must be provided (minimum 3 characters).' };
    }

    return {
        isValid: true,
        sanitized: {
            serials: serials.map(s => String(s).trim().toUpperCase().replace(/\//g, '-')).filter(Boolean),
            resolutionReason: String(resolutionReason).trim(),
            resolutionNotes: String(resolutionNotes || '').trim()
        }
    };
};

/**
 * Validates a disposition action request
 */
export const validateDispositionRequest = ({ actionId, unit, reason, user }) => {
    if (!user || (!user.role)) {
        return { isValid: false, message: 'User authentication required.' };
    }

    const action = DISPOSITION_ACTIONS[actionId];
    if (!action) {
        return { isValid: false, message: `Unknown disposition action: ${actionId}` };
    }

    if (!unit || !unit.id) {
        return { isValid: false, message: 'Target unit is missing or invalid.' };
    }

    if (action.requiresConfirmation && (!reason || String(reason).trim().length < 5)) {
        return { isValid: false, message: `Disposition "${action.name}" requires a detailed justification (min 5 chars).` };
    }

    // Closed / Locked units require Super Admin to dispose
    if (unit.status === 'Completed' || unit.status === 'Scrap' || unit.status === 'Reject' || unit.status === 'SCRAPPED') {
        if (user.role !== 'Super Admin') {
            return { isValid: false, message: `Unit is already ${unit.status}. Re-disposition requires Super Admin privilege.` };
        }
    }

    return {
        isValid: true,
        action,
        sanitizedReason: String(reason || '').trim()
    };
};

/**
 * Normalizes history entries for timeline visualization
 */
export const formatHistoryEvent = (entry, index) => {
    if (!entry) return null;

    const result = String(entry.result || entry.status || 'UNKNOWN').toUpperCase();
    const stationName = entry.station || entry.toStationName || entry.stationName || `Station ${entry.stationId || '?'}`;
    const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'N/A';
    const operator = entry.operator || entry.operatorName || entry.operatorId || 'MES System';

    let eventType = 'STEP';
    let iconType = 'info';
    let badgeClass = 'secondary';

    if (result.includes('PASS') || result === 'COMPLETED' || result === 'OK') {
        eventType = 'PASS';
        iconType = 'check';
        badgeClass = 'success';
    } else if (result.includes('FAIL') || result.includes('REJECT') || result === 'DEFECT') {
        eventType = 'FAIL';
        iconType = 'x';
        badgeClass = 'danger';
    } else if (result.includes('UNHOLD') || result === 'ADMIN_UNHOLD') {
        eventType = 'UNHOLD';
        iconType = 'unlock';
        badgeClass = 'info';
    } else if (result.includes('HOLD') || result === 'ADMIN_HOLD') {
        eventType = 'HOLD';
        iconType = 'alert';
        badgeClass = 'warning';
    } else if (result.includes('ADMIN') || result.includes('OVERRIDE')) {
        eventType = 'OVERRIDE';
        iconType = 'fast-forward';
        badgeClass = 'primary';
    } else if (result.includes('REVERSAL')) {
        eventType = 'REVERSAL';
        iconType = 'rotate-ccw';
        badgeClass = 'secondary';
    }

    return {
        index,
        stationName,
        result,
        timestamp,
        operator,
        eventType,
        iconType,
        badgeClass,
        details: entry.details || null,
        reason: entry.reason || null,
        remarks: entry.remarks || null,
        looper: entry.looper || 1,
        movementId: entry.movementId || null
    };
};
