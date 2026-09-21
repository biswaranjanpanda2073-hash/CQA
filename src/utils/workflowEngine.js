/**
 * CQA MES — Visual Workflow Studio & Routing Matrix Engine
 * Pure business logic for workflow sequencing, graph validation,
 * deterministic and dynamic routing resolution, and draft/publish lifecycle.
 */

import { PROJECT_WORKFLOWS } from './movementEngine.js';
import { 
    CALCULATOR_STATIONS, 
    CALC_DETERMINISTIC_ROUTES, 
    CALC_DYNAMIC_FAIL_TARGETS,
    CALC_LOOPER_ELIGIBLE_STATIONS,
    CALC_SCRAP_ELIGIBLE_FROM,
    resolveCalcNextStation
} from './calculatorEngine.js';

/**
 * Standard default routing matrices for built-in projects
 */
export const DEFAULT_ROUTING_MATRICES = {
    'Device': {
        1: { passTarget: 2, failTarget: 8, allowedPass: [2], allowedFail: [8], isIntake: true },
        2: { passTarget: 5, failTarget: 3, allowedPass: [5, 3, 4], allowedFail: [3, 4, 8] },
        3: { passTarget: 4, failTarget: 8, allowedPass: [4, 5], allowedFail: [8, 4] },
        4: { passTarget: 5, failTarget: 3, allowedPass: [5, 3], allowedFail: [3, 8] },
        5: { passTarget: 6, failTarget: 3, allowedPass: [6], allowedFail: [3, 4, 8] },
        6: { passTarget: 7, failTarget: 5, allowedPass: [7], allowedFail: [5, 4] },
        7: { isTerminalFG: true },
        8: { isTerminalScrap: true }
    },
    'Peripherals': {
        1: { passTarget: 2, failTarget: 4, allowedPass: [2], allowedFail: [4], isIntake: true },
        2: { passTarget: 3, failTarget: 4, allowedPass: [3], allowedFail: [4] },
        3: { isTerminalFG: true },
        4: { isTerminalScrap: true }
    },
    'Inward QC': {
        1: { passTarget: 2, failTarget: 4, allowedPass: [2], allowedFail: [4], isIntake: true },
        2: { passTarget: 3, failTarget: 4, allowedPass: [3], allowedFail: [4] },
        3: { isTerminalFG: true },
        4: { isTerminalScrap: true }
    },
    'Calculator': {
        1: { passTarget: 2, failTarget: 9, allowedPass: [2], allowedFail: [9], isIntake: true, looperTarget: 3 },
        2: { passTarget: 4, failTarget: 4, allowedPass: [4], allowedFail: [4, 9] },
        3: { passTarget: 6, failTarget: 9, allowedPass: [6], allowedFail: [9] },
        4: { passTarget: 6, failTarget: 5, allowedPass: [6], allowedFail: [5, 9] },
        5: { passTarget: 6, failTarget: 9, allowedPass: [6], allowedFail: [9] },
        6: { passTarget: 7, failTarget: 5, allowedPass: [7], allowedFail: [5, 9] },
        7: { passTarget: 8, failTarget: 5, allowedPass: [8], allowedFail: [4, 5, 9] },
        8: { passTarget: 10, failTarget: 7, allowedPass: [10], allowedFail: [7, 9] },
        9: { isTerminalScrap: true },
        10: { isTerminalFG: true }
    }
};

/**
 * Validates the full topological integrity of a workflow graph
 */
export const validateWorkflowGraph = (stations = [], routingMatrix = {}) => {
    const errors = [];
    const warnings = [];

    if (!Array.isArray(stations) || stations.length < 2) {
        errors.push('A workflow must contain at least 2 stations (Intake and Terminal).');
        return { isValid: false, errors, warnings };
    }

    const stationIds = new Set(stations.map(s => Number(s.stationId || s.id)));
    const stationMap = new Map();
    stations.forEach(s => stationMap.set(Number(s.stationId || s.id), s));

    // 1. Check for Duplicate Station IDs or Sequences
    const seenIds = new Set();
    const seenSeq = new Set();
    stations.forEach(s => {
        const id = Number(s.stationId || s.id);
        const seq = Number(s.sequence);
        if (seenIds.has(id)) errors.push(`Duplicate station ID detected: ${id} (${s.name}).`);
        seenIds.add(id);
        if (seenSeq.has(seq)) warnings.push(`Duplicate sequence number detected: Sequence ${seq}.`);
        seenSeq.add(seq);
    });

    // 2. Identify Intake Station
    const intakeStation = stations.find(s => s.sequence === 1 || s.type === 'RECEIVING' || (s.name || '').toUpperCase().includes('RECEIVING'));
    if (!intakeStation) {
        errors.push('Workflow is missing an Intake / Receiving station (Sequence 1).');
    }

    // 3. Identify Terminal Stations (FG and Scrap)
    const hasTerminalFG = stations.some(s => s.type === 'TERMINAL_FG' || (s.name || '').toUpperCase().includes('FG') || (s.name || '').toUpperCase().includes('COMPLETED'));
    const hasTerminalScrap = stations.some(s => s.type === 'TERMINAL_SCRAP' || (s.name || '').toUpperCase().includes('SCRAP') || (s.name || '').toUpperCase().includes('REJECT'));

    if (!hasTerminalFG) {
        warnings.push('Workflow has no designated Finished Goods (FG) terminal station.');
    }
    if (!hasTerminalScrap) {
        warnings.push('Workflow has no designated Scrap / Reject terminal station.');
    }

    // 4. Validate Routing Matrix References
    for (const [stIdStr, rules] of Object.entries(routingMatrix || {})) {
        const stId = Number(stIdStr);
        if (!stationIds.has(stId)) {
            warnings.push(`Routing rule references station ID ${stId} which is no longer in this workflow.`);
            continue;
        }

        const stObj = stationMap.get(stId);
        const isTerminal = stObj?.type === 'TERMINAL_FG' || stObj?.type === 'TERMINAL_SCRAP' || rules.isTerminalFG || rules.isTerminalScrap;

        if (!isTerminal) {
            // Check Pass Target
            if (rules.passTarget && !stationIds.has(Number(rules.passTarget))) {
                errors.push(`Station "${stObj?.name || stId}": Pass target station ID ${rules.passTarget} does not exist.`);
            }

            // Check Fail Target
            if (rules.failTarget && !stationIds.has(Number(rules.failTarget))) {
                errors.push(`Station "${stObj?.name || stId}": Fail target station ID ${rules.failTarget} does not exist.`);
            }

            // Check allowed pass targets
            if (Array.isArray(rules.allowedPass)) {
                rules.allowedPass.forEach(tgt => {
                    if (!stationIds.has(Number(tgt))) {
                        errors.push(`Station "${stObj?.name || stId}": Allowed Pass target ID ${tgt} does not exist.`);
                    }
                });
            }

            // Check allowed fail targets
            if (Array.isArray(rules.allowedFail)) {
                rules.allowedFail.forEach(tgt => {
                    if (!stationIds.has(Number(tgt))) {
                        errors.push(`Station "${stObj?.name || stId}": Allowed Fail target ID ${tgt} does not exist.`);
                    }
                });
            }
        }
    }

    // 5. Unreachable Stations (Reachability from Intake)
    if (intakeStation) {
        const visited = new Set();
        const queue = [Number(intakeStation.stationId || intakeStation.id)];

        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current)) continue;
            visited.add(current);

            const rules = routingMatrix[current] || {};
            const targets = [
                rules.passTarget,
                rules.failTarget,
                rules.looperTarget,
                ...(Array.isArray(rules.allowedPass) ? rules.allowedPass : []),
                ...(Array.isArray(rules.allowedFail) ? rules.allowedFail : [])
            ].filter(Boolean).map(Number);

            for (const t of targets) {
                if (stationIds.has(t) && !visited.has(t)) {
                    queue.push(t);
                }
            }
        }

        stations.forEach(s => {
            const id = Number(s.stationId || s.id);
            if (!visited.has(id)) {
                warnings.push(`Station "${s.name}" (ID ${id}) is not reachable from the intake station through configured routing.`);
            }
        });
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
};

/**
 * Re-sequences stations 1 through N after reordering or insertion
 */
export const resequenceWorkflowStations = (stations = []) => {
    return stations.map((s, idx) => ({
        ...s,
        sequence: idx + 1
    }));
};

/**
 * Moves a station up or down in sequence
 */
export const moveStationSequence = (stations = [], fromIndex, toIndex) => {
    if (fromIndex < 0 || fromIndex >= stations.length || toIndex < 0 || toIndex >= stations.length) {
        return stations;
    }
    const cloned = [...stations];
    const [movedItem] = cloned.splice(fromIndex, 1);
    cloned.splice(toIndex, 0, movedItem);
    return resequenceWorkflowStations(cloned);
};

/**
 * Generates an initial or clone draft workflow
 */
export const createWorkflowDraft = (projectId, existingWorkflow = null) => {
    const stations = existingWorkflow?.stations || PROJECT_WORKFLOWS[projectId] || PROJECT_WORKFLOWS['Device'] || [];
    const matrix = existingWorkflow?.routingMatrix || DEFAULT_ROUTING_MATRICES[projectId] || DEFAULT_ROUTING_MATRICES['Device'] || {};

    return {
        projectId,
        version: (existingWorkflow?.version || 0) + 1,
        status: 'Draft',
        updatedAt: new Date().toISOString(),
        stations: stations.map((s, idx) => ({
            stationId: Number(s.stationId || s.id),
            name: s.name,
            code: s.code || `ST_${idx + 1}`,
            terminalType: s.terminalType || s.type || 'INSPECTION',
            sequence: idx + 1,
            type: s.type || 'WIP'
        })),
        routingMatrix: JSON.parse(JSON.stringify(matrix))
    };
};

/**
 * Dynamically resolves the next destination station given a matrix and scan result
 */
export const resolveDynamicNextStation = ({
    projectId,
    currentStationId,
    result = 'Pass',
    routingMatrix = null,
    workflowStations = null,
    unit = null
}) => {
    // 1. Hold Result Always Blocks Movement
    if (result === 'Hold') {
        return {
            nextStationId: null,
            nextStationName: '',
            isHold: true,
            availableStations: [],
            reason: 'HOLD — Movement blocked. Unit remains at current station for quarantine triage.'
        };
    }

    const stId = Number(currentStationId);
    const matrix = routingMatrix || DEFAULT_ROUTING_MATRICES[projectId] || DEFAULT_ROUTING_MATRICES['Device'];
    const stations = workflowStations || PROJECT_WORKFLOWS[projectId] || PROJECT_WORKFLOWS['Device'];
    const stationMap = new Map();
    stations.forEach(s => stationMap.set(Number(s.stationId || s.id), s));

    // Calculator specialized fallback if no dynamic matrix rule present
    if (projectId === 'Calculator' && (!matrix || !matrix[stId])) {
        const calcRes = resolveCalcNextStation(stId, result, unit, null);
        return {
            nextStationId: calcRes?.nextStationId || null,
            nextStationName: calcRes?.nextStationName || '',
            isHold: !!calcRes?.isHold,
            availableStations: (calcRes?.allowedTargets || []).map(id => stationMap.get(id)).filter(Boolean),
            reason: calcRes?.reason || 'Standard Calculator Routing'
        };
    }

    const rule = matrix[stId];
    if (!rule) {
        // Fallback to next sequential station if defined
        const currSt = stationMap.get(stId);
        const nextSt = stations.find(s => s.sequence === (currSt?.sequence || 1) + 1);
        return {
            nextStationId: nextSt ? Number(nextSt.stationId || nextSt.id) : null,
            nextStationName: nextSt?.name || '',
            isHold: false,
            availableStations: nextSt ? [nextSt] : [],
            reason: 'Sequential fallback route'
        };
    }

    let defaultTargetId = null;
    let allowedTargetIds = [];

    if (result === 'Pass') {
        defaultTargetId = rule.passTarget;
        allowedTargetIds = Array.isArray(rule.allowedPass) && rule.allowedPass.length > 0 
            ? rule.allowedPass 
            : (defaultTargetId ? [defaultTargetId] : []);
    } else {
        // Fail
        defaultTargetId = rule.failTarget;
        allowedTargetIds = Array.isArray(rule.allowedFail) && rule.allowedFail.length > 0 
            ? rule.allowedFail 
            : (defaultTargetId ? [defaultTargetId] : []);
    }

    const defaultObj = defaultTargetId ? stationMap.get(Number(defaultTargetId)) : null;
    const availableStations = Array.from(new Set(allowedTargetIds.map(Number)))
        .map(id => stationMap.get(id))
        .filter(Boolean)
        .map(s => ({
            id: Number(s.stationId || s.id),
            name: s.name,
            type: s.type || s.terminalType || 'WIP',
            isDefault: Number(s.stationId || s.id) === Number(defaultTargetId)
        }));

    return {
        nextStationId: defaultObj ? Number(defaultObj.stationId || defaultObj.id) : (availableStations[0]?.id || null),
        nextStationName: defaultObj ? defaultObj.name : (availableStations[0]?.name || ''),
        isHold: false,
        availableStations,
        reason: `Routed via ${projectId} Workflow Matrix on ${result}`
    };
};
