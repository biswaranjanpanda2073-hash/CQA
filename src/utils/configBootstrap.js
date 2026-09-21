/**
 * CQA MES — Configuration Seeder & Bootstrap Utility
 * Safely extracts existing hardcoded configurations (projects, stations,
 * workflows, checklists, roles) and seeds them into Firestore if not present.
 * 
 * ZERO DATA LOSS GUARANTEE:
 * - Does not touch or modify 'devices', 'history', or 'baan_*' collections.
 * - Idempotent: Skips documents that already exist unless explicit force flag is set.
 */

import { db, doc, getDoc, setDoc } from '../firebase.js';
import { PROJECT_WORKFLOWS } from './movementEngine.js';
import { 
    CALCULATOR_STATIONS, 
    CALC_CHECKPOINTS, 
    CALC_DETERMINISTIC_ROUTES, 
    CALC_DYNAMIC_FAIL_TARGETS,
    CALC_LOOPER_ELIGIBLE_STATIONS,
    CALC_SCRAP_ELIGIBLE_FROM 
} from './calculatorEngine.js';
import { DEFAULT_ROLES } from './rbacEngine.js';
import { logAdminAction, AUDIT_ACTIONS } from './auditLogger.js';

// ─── Hardcoded Checklists to be Seeded ───
const DEVICE_INSPECTION_CHECKLIST = [
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
];

const DEVICE_PACKAGING_CHECKLIST = [
    { key: 'device_id_match', label: 'Device ID Matching Verification', type: 'PFH', required: true },
    { key: 'pkg_foam', label: 'Check for Packaging Foam Availability', type: 'PFH', required: true },
    { key: 'white_sleeve', label: 'Device properly inserted in the white sleeve.', type: 'PFH', required: true },
    { key: 'accessories', label: 'Check For Accessories Availability (Charging Cable & User Manual)', type: 'PFH', required: true },
    { key: 'circular_seals', label: 'Box sealed with two circular seal tapes.', type: 'PFH', required: true },
    { key: 'pkg_sleeve', label: 'Box packed with green & white packaging sleeve.', type: 'PFH', required: true },
    { key: 'bis_label', label: 'BIS certification label properly affixed in the Outer Packaging Sleeve', type: 'PFH', required: true },
    { key: 'prot_wrap', label: 'Protective wrapping cover applied properly.', type: 'PFH', required: true }
];

const PERIPHERAL_QC_CHECKLIST = [
    { key: 'pkg_box_cond', label: 'Check For The Packaging Box Condition.', type: 'PFH', required: true },
    { key: 'cosmetic_cond', label: 'Check for the Product outer Cosmetic Condition.', type: 'PFH', required: true },
    { key: 'power_on', label: 'Power On test', type: 'PFH', required: true },
    { key: 'func_test', label: 'Functionality Test (Connectivity, Key, Performance)', type: 'PFH', required: true },
    { key: 'charging_test', label: 'Charging test', type: 'PFH', required: true },
    { key: 'power_off', label: 'Power Off test', type: 'PFH', required: true }
];

const INWARD_QC_CHECKLIST = [
    { key: 'pkg_cond', label: 'Packaging Condition', type: 'PFH', required: true },
    { key: 'cosmetic_cond', label: 'Cosmetic Inspection', type: 'PFH', required: true },
    { key: 'sample_test', label: 'Sample Component Test', type: 'PFH', required: true }
];

/**
 * Standard project master profiles
 */
export const INITIAL_PROJECTS = [
    {
        id: 'Device',
        code: 'DEV',
        name: 'Device',
        category: 'Device',
        status: 'Active',
        description: 'Smart POS & payment terminals with multi-stage inspection, debug diagnostics, and rework history.',
        version: 1,
        defaultSpecs: {
            productTypes: ['Reverse', 'RTO', 'Manufacturing Defects', 'Others'],
            models: ['Pax A920', 'Pax A910', 'Pax D200'],
            hwRevisions: ['V1.0', 'V2.0'],
            swRevisions: ['2.4.0', '2.5.1']
        },
        serialRules: {
            regex: '^[A-Z0-9-]{6,25}$',
            requirePcbScan: false,
            requireTopPanelScan: false,
            requireBottomPanelScan: false
        }
    },
    {
        id: 'Peripherals',
        code: 'PER',
        name: 'Peripherals',
        category: 'Peripherals',
        status: 'Active',
        description: 'Thermal printers, chargers, scanning accessories, quality control verification, and rejection logs.',
        version: 1,
        defaultSpecs: {
            categories: ['Printer', 'Charger', 'Cable', 'Scanner', 'Others'],
            productTypes: ['Fresh Lot', 'Reverse', 'RTO', 'Others']
        },
        serialRules: {
            regex: '^[A-Z0-9-]{6,25}$',
            requirePcbScan: false
        }
    },
    {
        id: 'Inward QC',
        code: 'IQC',
        name: 'Inward QC',
        category: 'Inward QC',
        status: 'Active',
        description: 'Incoming shipment inspection, component-level testing, lot verification, and raw material IQC.',
        version: 1,
        defaultSpecs: {
            productTypes: ['Fresh Lot', 'Reworked RTO', 'Others']
        },
        serialRules: {
            regex: '^[A-Z0-9-]{6,25}$'
        }
    },
    {
        id: 'Calculator',
        code: 'CALC',
        name: 'Calculator Refurbishment',
        category: 'Calculator',
        status: 'Active',
        description: 'Reverse device refurbishment, PCBA debugging, rework logging, firmware QC, and scrap analysis.',
        version: 1,
        defaultSpecs: {
            productTypes: ['Reverse', 'RTO', 'Manufacturing Defects', 'Customer Return', 'Others'],
            models: ['Standard Refurb Calculator', 'Advanced Terminal'],
            hwRevisions: ['V1.0', 'V2.0'],
            swRevisions: ['1.0.0', '1.2.0']
        },
        serialRules: {
            regex: '^[A-Z0-9-]{6,25}$',
            requirePcbScan: false
        }
    }
];

/**
 * Standard factory stations catalog (26 core stations)
 */
export const INITIAL_STATIONS = [
    // Device
    { id: 'Device_1', projectId: 'Device', stationId: 1, name: 'RECEIVING', code: 'DEV_REC', terminalType: 'RECEIVING', sequence: 1, status: 'Active', description: 'Initial device intake and serial scanning.' },
    { id: 'Device_2', projectId: 'Device', stationId: 2, name: 'INSPECTION', code: 'DEV_INSP', terminalType: 'INSPECTION', sequence: 2, status: 'Active', description: '16-point comprehensive visual & operational inspection.' },
    { id: 'Device_3', projectId: 'Device', stationId: 3, name: 'DEBUG', code: 'DEV_DBG', terminalType: 'REPAIR_DEBUG', sequence: 3, status: 'Active', description: 'Fault diagnosis, hardware troubleshooting, and parts requisition.' },
    { id: 'Device_4', projectId: 'Device', stationId: 4, name: 'REWORK', code: 'DEV_RWK', terminalType: 'REPAIR_DEBUG', sequence: 4, status: 'Active', description: 'Component replacement, BAAN part issuance consumption, and soldering rework.' },
    { id: 'Device_5', projectId: 'Device', stationId: 5, name: 'FINAL QC', code: 'DEV_FQC', terminalType: 'INSPECTION', sequence: 5, status: 'Active', description: 'Post-repair validation and quality sign-off.' },
    { id: 'Device_6', projectId: 'Device', stationId: 6, name: 'PACKING', code: 'DEV_PKG', terminalType: 'PACKAGING', sequence: 6, status: 'Active', description: 'Packaging verification, accessory validation, and boxed unit readiness.' },
    { id: 'Device_7', projectId: 'Device', stationId: 7, name: 'SCRAP REVIEW', code: 'DEV_SCRP', terminalType: 'SCRAP_REVIEW', sequence: 7, status: 'Active', description: 'Engineering scrap determination and salvage audit.' },

    // Peripherals
    { id: 'Peripherals_1', projectId: 'Peripherals', stationId: 1, name: 'RECEIVING', code: 'PER_REC', terminalType: 'RECEIVING', sequence: 1, status: 'Active', description: 'Peripheral unit inwarding.' },
    { id: 'Peripherals_2', projectId: 'Peripherals', stationId: 2, name: 'QC', code: 'PER_QC', terminalType: 'INSPECTION', sequence: 2, status: 'Active', description: '6-point functional & cosmetic peripheral check.' },
    { id: 'Peripherals_3', projectId: 'Peripherals', stationId: 3, name: 'REJECTION REVIEW', code: 'PER_REJ', terminalType: 'SCRAP_REVIEW', sequence: 3, status: 'Active', description: 'Peripheral disposition & scrap review.' },

    // Inward QC
    { id: 'Inward QC_1', projectId: 'Inward QC', stationId: 1, name: 'RECEIVING', code: 'IQC_REC', terminalType: 'RECEIVING', sequence: 1, status: 'Active', description: 'Shipment intake verification.' },
    { id: 'Inward QC_2', projectId: 'Inward QC', stationId: 2, name: 'IQC', code: 'IQC_QC', terminalType: 'INSPECTION', sequence: 2, status: 'Active', description: 'Incoming quality testing & cosmetic inspection.' },
    { id: 'Inward QC_3', projectId: 'Inward QC', stationId: 3, name: 'REJECTION', code: 'IQC_REJ', terminalType: 'SCRAP_REVIEW', sequence: 3, status: 'Active', description: 'Inward lot reject processing.' },

    // Calculator (10 stations)
    { id: 'Calculator_1', projectId: 'Calculator', stationId: 1, name: 'RECEIVING & INBOUND QC', code: 'CALC_REC', terminalType: 'RECEIVING', sequence: 1, status: 'Active', description: 'First-time intake or repeat looper detection.' },
    { id: 'Calculator_2', projectId: 'Calculator', stationId: 2, name: 'INITIAL QC', code: 'CALC_IQC', terminalType: 'INSPECTION', sequence: 2, status: 'Active', description: 'Power ON, charging multiplexer test, display segment test.' },
    { id: 'Calculator_3', projectId: 'Calculator', stationId: 3, name: 'LOOPER ANALYSIS', code: 'CALC_LOOP', terminalType: 'REPAIR_DEBUG', sequence: 3, status: 'Active', description: 'Root-cause triage for repeat refurbishment serials.' },
    { id: 'Calculator_4', projectId: 'Calculator', stationId: 4, name: 'HARDWARE QC / DEBUG', code: 'CALC_HWQC', terminalType: 'REPAIR_DEBUG', sequence: 4, status: 'Active', description: '10-point PFH, VBAT, ICHG, and debug note.' },
    { id: 'Calculator_5', projectId: 'Calculator', stationId: 5, name: 'HARDWARE REWORK', code: 'CALC_HWRWK', terminalType: 'REPAIR_DEBUG', sequence: 5, status: 'Active', description: 'Component rework and hardware restoration.' },
    { id: 'Calculator_6', projectId: 'Calculator', stationId: 6, name: 'ASSEMBLY', code: 'CALC_ASM', terminalType: 'GENERIC_QC', sequence: 6, status: 'Active', description: 'Physical reassembly and housing enclosure.' },
    { id: 'Calculator_7', projectId: 'Calculator', stationId: 7, name: 'FIRMWARE QC', code: 'CALC_FWQC', terminalType: 'INSPECTION', sequence: 7, status: 'Active', description: '13-point PFH and OS version recording.' },
    { id: 'Calculator_8', projectId: 'Calculator', stationId: 8, name: 'PACKING & CLEANING', code: 'CALC_PKG', terminalType: 'PACKAGING', sequence: 8, status: 'Active', description: 'Cosmetics, cleaning, and accessory packing.' },
    { id: 'Calculator_9', projectId: 'Calculator', stationId: 9, name: 'SCRAP ANALYSIS', code: 'CALC_SCRP', terminalType: 'SCRAP_REVIEW', sequence: 9, status: 'Active', description: 'Salvage engineering and scrap classification.' },
    { id: 'Calculator_10', projectId: 'Calculator', stationId: 10, name: 'MOVE TO FG', code: 'CALC_FG', terminalType: 'GENERIC_QC', sequence: 10, status: 'Active', description: 'Final goods warehouse handover.' }
];

/**
 * Checks if configuration governance is enabled
 */
export const checkConfigStatus = async () => {
    try {
        const snap = await getDoc(doc(db, 'settings', 'config_governance'));
        if (snap.exists()) {
            return snap.data();
        }
    } catch (e) {
        console.warn('Error reading config_governance:', e);
    }
    return { dynamicConfigEnabled: false, isBootstrapped: false };
};

/**
 * Executes safe, idempotent bootstrap
 */
export const bootstrapConfiguration = async (actorUser, { force = false } = {}) => {
    const summary = {
        rolesCreated: 0,
        projectsCreated: 0,
        workflowsCreated: 0,
        stationsCreated: 0,
        checkpointsCreated: 0,
        skippedExisting: 0,
        errors: []
    };

    const timestamp = new Date().toISOString();

    try {
        // 1. Bootstrap System Roles
        for (const [roleName, roleDef] of Object.entries(DEFAULT_ROLES)) {
            const roleRef = doc(db, 'roles', roleName);
            const roleSnap = await getDoc(roleRef);
            if (!roleSnap.exists() || force) {
                await setDoc(roleRef, {
                    ...roleDef,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                    updatedBy: actorUser?.name || actorUser?.id || 'Bootstrap'
                }, { merge: true });
                summary.rolesCreated++;
            } else {
                summary.skippedExisting++;
            }
        }

        // 2. Bootstrap Projects
        for (const proj of INITIAL_PROJECTS) {
            const projRef = doc(db, 'projects', proj.id);
            const projSnap = await getDoc(projRef);
            if (!projSnap.exists() || force) {
                await setDoc(projRef, {
                    ...proj,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                    updatedBy: actorUser?.name || actorUser?.id || 'Bootstrap'
                }, { merge: true });
                summary.projectsCreated++;
            } else {
                summary.skippedExisting++;
            }

            // 3. Bootstrap Workflow for this project
            const wfRef = doc(db, 'project_workflows', proj.id);
            const wfSnap = await getDoc(wfRef);
            if (!wfSnap.exists() || force) {
                const stations = PROJECT_WORKFLOWS[proj.id] || [];
                const wfData = {
                    projectId: proj.id,
                    version: 1,
                    status: 'Active',
                    publishedAt: timestamp,
                    publishedBy: actorUser?.name || actorUser?.id || 'Bootstrap',
                    stations: stations.map(s => ({
                        stationId: s.id,
                        name: s.name,
                        sequence: s.sequence,
                        type: s.type || 'WIP'
                    })),
                    // Specific routing metadata if Calculator
                    ...(proj.id === 'Calculator' ? {
                        deterministicRoutes: CALC_DETERMINISTIC_ROUTES,
                        dynamicFailTargets: CALC_DYNAMIC_FAIL_TARGETS,
                        looperEligibleStations: CALC_LOOPER_ELIGIBLE_STATIONS,
                        scrapEligibleFrom: CALC_SCRAP_ELIGIBLE_FROM
                    } : {})
                };
                await setDoc(wfRef, wfData, { merge: true });
                summary.workflowsCreated++;
            } else {
                summary.skippedExisting++;
            }
        }

        // 3b. Bootstrap Global Stations Master
        for (const st of INITIAL_STATIONS) {
            const stRef = doc(db, 'stations_master', st.id);
            const stSnap = await getDoc(stRef);
            if (!stSnap.exists() || force) {
                await setDoc(stRef, {
                    ...st,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                    updatedBy: actorUser?.name || actorUser?.id || 'Bootstrap'
                }, { merge: true });
                summary.stationsCreated++;
            } else {
                summary.skippedExisting++;
            }
        }

        // 4. Bootstrap Checkpoints
        const checklistMap = {
            'Device_2': { name: 'INSPECTION', list: DEVICE_INSPECTION_CHECKLIST },
            'Device_6': { name: 'PACKING', list: DEVICE_PACKAGING_CHECKLIST },
            'Peripherals_2': { name: 'QC', list: PERIPHERAL_QC_CHECKLIST },
            'Inward QC_2': { name: 'IQC', list: INWARD_QC_CHECKLIST }
        };

        // Add Calculator Checkpoints
        for (const [stId, cpList] of Object.entries(CALC_CHECKPOINTS)) {
            checklistMap[`Calculator_${stId}`] = {
                name: `STATION_${stId}`,
                list: cpList.map((cp, idx) => ({
                    key: cp.key,
                    label: cp.label,
                    type: cp.type,
                    dataLabel: cp.dataLabel || '',
                    required: !!cp.required,
                    order: idx + 1
                }))
            };
        }

        for (const [key, item] of Object.entries(checklistMap)) {
            const [projId, stId] = key.split('_');
            const cpDocId = `${projId}_${stId}`;
            const cpRef = doc(db, 'station_checkpoints', cpDocId);
            const cpSnap = await getDoc(cpRef);

            if (!cpSnap.exists() || force) {
                await setDoc(cpRef, {
                    id: cpDocId,
                    projectId: projId,
                    stationId: Number(stId),
                    version: 1,
                    status: 'Active',
                    publishedAt: timestamp,
                    publishedBy: actorUser?.name || actorUser?.id || 'Bootstrap',
                    checkpoints: item.list.map((c, i) => ({
                        ...c,
                        order: c.order || i + 1
                    }))
                }, { merge: true });
                summary.checkpointsCreated++;
            } else {
                summary.skippedExisting++;
            }
        }

        // 5. Initialize Config Governance document
        const govRef = doc(db, 'settings', 'config_governance');
        const govSnap = await getDoc(govRef);
        if (!govSnap.exists()) {
            await setDoc(govRef, {
                isBootstrapped: true,
                dynamicConfigEnabled: false, // Default to false until explicitly enabled by Super Admin
                bootstrappedAt: timestamp,
                bootstrappedBy: actorUser?.name || actorUser?.id || 'Bootstrap'
            });
        }

        // 6. Record Audit Log
        await logAdminAction({
            actor: actorUser,
            action: AUDIT_ACTIONS.CONFIG_MODE_TOGGLED,
            entity: 'system',
            entityId: 'config_governance',
            newValue: summary,
            reason: 'Configuration Seeder & Bootstrap Execution'
        });

        return { success: true, summary };
    } catch (err) {
        console.error('Bootstrap execution failed:', err);
        summary.errors.push(err.message);
        return { success: false, summary, error: err.message };
    }
};
