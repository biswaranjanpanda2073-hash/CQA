/**
 * CQA MES — Safe Dual-Read Configuration Reader Engine
 * 
 * Provides unified, safe access to project workflows, station definitions,
 * and checkpoint lists.
 * 
 * SAFETY ARCHITECTURE:
 * 1. Default Safe Mode: When dynamicConfigEnabled is false or undetermined,
 *    reads strictly from the tested, hardcoded configurations.
 * 2. Active Dynamic Mode: When dynamicConfigEnabled is true (Super Admin only),
 *    reads from Firestore master records.
 * 3. Fallback Guarantee: If any Firestore record is missing, malformed, or
 *    fails to load, automatically falls back to hardcoded configurations.
 *    Production workflows NEVER crash or stall due to missing config.
 */

import { db, doc, onSnapshot } from '../firebase.js';
import { PROJECT_WORKFLOWS } from './movementEngine.js';
import {
    CALCULATOR_STATIONS,
    CALC_CHECKPOINTS
} from './calculatorEngine.js';

// Hardcoded Fallback Checklists
const FALLBACK_CHECKLISTS = {
    'Device_2': [
        { key: 'front_panel', label: 'Front Panel Condition', type: 'BOOL', required: true },
        { key: 'bottom_panel', label: 'Bottom Panel Condition', type: 'BOOL', required: true },
        { key: 'agency_label', label: 'Agency Label Verification', type: 'PFH', required: true },
        { key: 'screw_verify', label: 'Screw Verification', type: 'PFH', required: true },
        { key: 'power_on', label: 'Power-On Test', type: 'PFH', required: true },
        { key: 'login_verify', label: 'Login Verification', type: 'PFH', required: true },
        { key: 'display_check', label: 'Display Segment Check', type: 'PFH', required: true },
        { key: 'charging_test', label: 'Charging Test', type: 'PFH', required: true },
        { key: 'printer_usb', label: 'Printer Connectivity – USB', type: 'PFH', required: true },
        { key: 'printer_ble', label: 'Printer Connectivity – Bluetooth', type: 'PFH', required: true },
        { key: 'key_test', label: 'Numerical & Calculation Key Test', type: 'PFH', required: true },
        { key: 'tax_trans_val', label: 'Tax, Expense & Transaction Validation', type: 'PFH', required: true },
        { key: 'wifi_conn', label: 'Wi-Fi Connectivity', type: 'PFH', required: true },
        { key: 'vol_bright', label: 'Volume & Brightness Check', type: 'PFH', required: true },
        { key: 'factory_reset', label: 'Factory Reset Verification', type: 'PFH', required: true },
        { key: 'power_off', label: 'Power-Off Test', type: 'PFH', required: true }
    ],
    'Device_6': [
        { key: 'device_id_match', label: 'Device ID Matching Verification', type: 'PFH', required: true },
        { key: 'pkg_foam', label: 'Check for Packaging Foam Availability', type: 'PFH', required: true },
        { key: 'white_sleeve', label: 'Device properly inserted in the white sleeve.', type: 'PFH', required: true },
        { key: 'accessories', label: 'Check For Accessories Availability (Charging Cable & User Manual)', type: 'PFH', required: true },
        { key: 'circular_seals', label: 'Box sealed with two circular seal tapes.', type: 'PFH', required: true },
        { key: 'pkg_sleeve', label: 'Box packed with green & white packaging sleeve.', type: 'PFH', required: true },
        { key: 'bis_label', label: 'BIS certification label properly affixed in the Outer Packaging Sleeve', type: 'PFH', required: true },
        { key: 'prot_wrap', label: 'Protective wrapping cover applied properly.', type: 'PFH', required: true }
    ],
    'Peripherals_2': [
        { key: 'pkg_box_cond', label: 'Check For The Packaging Box Condition.', type: 'PFH', required: true },
        { key: 'cosmetic_cond', label: 'Check for the Product outer Cosmetic Condition.', type: 'PFH', required: true },
        { key: 'power_on', label: 'Power On test', type: 'PFH', required: true },
        { key: 'func_test', label: 'Functionality Test (Connectivity, Key, Performance)', type: 'PFH', required: true },
        { key: 'charging_test', label: 'Charging test', type: 'PFH', required: true },
        { key: 'power_off', label: 'Power Off test', type: 'PFH', required: true }
    ],
    'Inward QC_2': [
        { key: 'pkg_cond', label: 'Packaging Condition', type: 'PFH', required: true },
        { key: 'cosmetic_cond', label: 'Cosmetic Inspection', type: 'PFH', required: true },
        { key: 'sample_test', label: 'Sample Component Test', type: 'PFH', required: true }
    ]
};

// Populate Calculator fallback checklists
for (const [stId, list] of Object.entries(CALC_CHECKPOINTS)) {
    FALLBACK_CHECKLISTS[`Calculator_${stId}`] = list;
}

// In-memory runtime cache
let runtimeGovernance = {
    isBootstrapped: false,
    dynamicConfigEnabled: false
};

/**
 * Subscribe to runtime configuration governance changes
 */
export const subscribeConfigGovernance = (onUpdate) => {
    try {
        const govRef = doc(db, 'settings', 'config_governance');
        return onSnapshot(govRef, (snap) => {
            if (snap.exists()) {
                runtimeGovernance = snap.data();
                if (onUpdate) onUpdate(runtimeGovernance);
            }
        }, (err) => {
            console.warn('[ConfigReader] Governance listener error (using safe fallback):', err);
        });
    } catch (e) {
        console.warn('[ConfigReader] Failed to initialize governance listener:', e);
        return () => {};
    }
};

/**
 * Checks whether dynamic Firestore configuration is currently active
 */
export const isDynamicConfigActive = () => {
    return !!runtimeGovernance.dynamicConfigEnabled;
};

/**
 * Get the active workflow for a project.
 * Guaranteed safe return with automatic fallback to hardcoded PROJECT_WORKFLOWS.
 * 
 * @param {string} projectId - e.g. 'Device', 'Peripherals', 'Inward QC', 'Calculator'
 * @param {Object} [customWorkflows] - Optional live Firestore cache from context
 * @returns {Array} List of stations in the workflow
 */
export const getSafeWorkflow = (projectId, customWorkflows = null) => {
    // 1. Calculator workflow hardcoded fallback
    if (projectId === 'Calculator') {
        if (runtimeGovernance.dynamicConfigEnabled && customWorkflows && customWorkflows['Calculator']?.stations) {
            return customWorkflows['Calculator'].stations;
        }
        return CALCULATOR_STATIONS;
    }

    // 2. If dynamic mode enabled and workflow exists in cache/context
    if (runtimeGovernance.dynamicConfigEnabled && customWorkflows && customWorkflows[projectId]?.stations) {
        return customWorkflows[projectId].stations;
    }

    // 3. Fall back to hardcoded PROJECT_WORKFLOWS
    if (PROJECT_WORKFLOWS[projectId]) {
        return PROJECT_WORKFLOWS[projectId];
    }

    // 4. Default fallback: Device workflow
    return PROJECT_WORKFLOWS['Device'] || [];
};

/**
 * Get the station checkpoints for a project station.
 * Guaranteed safe return with automatic fallback.
 * 
 * @param {string} projectId 
 * @param {number|string} stationId 
 * @param {Object} [customCheckpoints] - Optional live Firestore cache
 * @returns {Array} Checkpoints list
 */
export const getSafeCheckpoints = (projectId, stationId, customCheckpoints = null) => {
    const key = `${projectId}_${stationId}`;

    // 1. Dynamic Firestore read if enabled
    if (runtimeGovernance.dynamicConfigEnabled && customCheckpoints && customCheckpoints[key]?.checkpoints) {
        return customCheckpoints[key].checkpoints;
    }

    // 2. Hardcoded fallback
    if (FALLBACK_CHECKLISTS[key]) {
        return FALLBACK_CHECKLISTS[key];
    }

    return [];
};

/**
 * Helper to get safe list of all available projects
 */
export const getSafeProjectList = (customProjects = null) => {
    const hardcodedList = [
        { id: 'Device', name: 'Device', category: 'Device' },
        { id: 'Peripherals', name: 'Peripherals', category: 'Peripherals' },
        { id: 'Inward QC', name: 'Inward QC', category: 'Inward QC' },
        { id: 'Calculator', name: 'Calculator Refurbishment', category: 'Calculator' }
    ];

    if (runtimeGovernance.dynamicConfigEnabled && customProjects && Object.keys(customProjects).length > 0) {
        return Object.values(customProjects);
    }

    return hardcodedList;
};
