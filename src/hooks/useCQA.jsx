import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import {
    db, storage, auth, functions, devicesCol, doc, setDoc, updateDoc, getDoc, getDocs, onSnapshot, deleteDoc, writeBatch, collection, addDoc, query, where, orderBy,
    ref, uploadBytes, getDownloadURL,
    signInWithCustomToken, httpsCallable
} from '../firebase';
import {
    normalizeSerialNumbers,
    PROJECT_WORKFLOWS,
    calculateSkippedStations,
    calculateMovementClassification,
    calculateRiskLevel,
    validateUnitRecord
} from '../utils/movementEngine';
import {
    CALCULATOR_STATIONS,
    CALC_SCRAP_ELIGIBLE_FROM,
    getCalcStationById,
    calculateCalcResult,
    resolveCalcNextStation,
    isRepeatSerial
} from '../utils/calculatorEngine';
import { hasPermission, PERMISSIONS } from '../utils/rbacEngine';
import { logAdminAction, AUDIT_ACTIONS } from '../utils/auditLogger';
import {
    subscribeConfigGovernance,
    isDynamicConfigActive,
    getSafeWorkflow,
    getSafeCheckpoints,
    getSafeProjectList
} from '../utils/configReader';

const INITIAL_STORE = {
    devices: {},
    users: {}, // For Admin governance
    tickets: {}, // For Password resets
    settings: { maintenanceMode: false },
    baan: {
        locations: {},
        parts: {},
        batches: {},
        inwardLogs: {},
        partRequests: {},
        partIssuance: {},
        inventoryMovements: {}
    },
    wipDevices: {} // Centralized live-sync for active WIP units only
};

const CQAContext = createContext();

export const CQAProvider = ({ children }) => {
    const [store, setStore] = useState(INITIAL_STORE);
    const [loading, setLoading] = useState(true);
    const [systemNames, setSystemNames] = useState({
        projects: { 'Device': 'Device', 'Peripherals': 'Peripherals', 'Inward QC': 'Inward QC', 'Calculator': 'Calculator Refurbishment' },
        stations: {}
    });

    const [authUser, setAuthUser] = useState(() => auth.currentUser);
    const [authReady, setAuthReady] = useState(false);

    useEffect(() => {
        const unsub = auth.onAuthStateChanged((user) => {
            setAuthUser(user);
            setAuthReady(true);
            if (!user) {
                setLoading(false);
            }
        });
        return () => unsub();
    }, []);

    // ===== SYSTEM CONFIG LISTENER =====
    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'settings', 'system_names'), (snapshot) => {
            if (snapshot.exists()) {
                setSystemNames(snapshot.data());
            }
            setLoading(false);
        }, (error) => {
            console.error("System config error:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // ===== MAINTENANCE MODE LISTENER =====
    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
            if (snapshot.exists()) {
                setStore(prev => ({ ...prev, settings: snapshot.data() }));
            }
        }, (error) => {
            console.error("Global settings error:", error);
        });
        return () => unsubscribe();
    }, []);

    // ===== CONFIG GOVERNANCE & RBAC LISTENERS =====
    const [customRoles, setCustomRoles] = useState({});
    const [configGov, setConfigGov] = useState({ isBootstrapped: false, dynamicConfigEnabled: false });

    useEffect(() => {
        const unsubGov = subscribeConfigGovernance((gov) => {
            setConfigGov(gov);
        });
        return () => unsubGov();
    }, []);

    useEffect(() => {
        const unsubRoles = onSnapshot(collection(db, 'roles'), (snapshot) => {
            const rolesMap = {};
            snapshot.forEach(docSnap => {
                rolesMap[docSnap.id] = docSnap.data();
            });
            setCustomRoles(rolesMap);
        }, (err) => {
            console.warn('[useCQA] Roles listener fallback to defaults:', err);
        });
        return () => unsubRoles();
    }, []);

    const getDisplayName = useCallback((type, id) => {
        if (!id) return id;
        return systemNames[type]?.[id] || id;
    }, [systemNames]);

    const getProjectCategory = useCallback((project) => {
        if (!project) return 'Device';
        if (project === 'Device' || systemNames.projects?.['Device'] === project) return 'Device';
        if (project === 'Peripherals' || systemNames.projects?.['Peripherals'] === project) return 'Peripherals';
        if (project === 'Inward QC' || systemNames.projects?.['Inward QC'] === project) return 'Inward QC';
        if (project === 'Calculator' || systemNames.projects?.['Calculator'] === project) return 'Calculator';
        return project;
    }, [systemNames]);

    // ═══════════════════════════════════════════════════════════════
    // ACTIVE LOOPER RESOLVER (System-Level)
    // 
    // This is the SINGLE SOURCE OF TRUTH for determining a unit's
    // current project. It uses this priority order:
    //   1. Station Name (definitive — unique per project workflow)
    //   2. Latest history event with 'project' field
    //   3. Top-level unit.project (last resort)
    //
    // RULE: "SN must always resolve to its latest looper everywhere"
    // ═══════════════════════════════════════════════════════════════
    const resolveActiveProject = useCallback((unit) => {
        if (!unit) return 'Device';
        const stName = (unit.stationName || '').toUpperCase().trim();

        // 1. DEFINITIVE STATION MAPPING
        // These stations ONLY exist in specific project workflows.
        // Station names are evaluated as the ultimate source of truth.
        if (['INSPECTION', 'DEBUG', 'REWORK', 'FINAL QC', 'PACKING', 'SCRAP REVIEW'].some(s => stName === s)) return 'Device';
        if (stName === 'IQC' || stName === 'INWARD QC') return 'Inward QC';
        if (stName === 'QC' || stName === 'PERIPHERALS QC') return 'Peripherals';
        if (stName === 'REJECTION REVIEW') return 'Peripherals';
        if (stName === 'REJECTION') return 'Inward QC';
        if (['INITIAL QC', 'LOOPER ANALYSIS', 'HARDWARE QC / DEBUG', 'HARDWARE QC', 'HARDWARE REWORK', 'ASSEMBLY', 'FIRMWARE QC', 'PACKING & CLEANING', 'SCRAP ANALYSIS'].some(s => stName === s)) return 'Calculator';

        // 2. RECENT HISTORY SEARCH (Newest First)
        if (!unit) return 'Other';
        if (unit.project) return unit.project;
        const h = unit.history;
        if (!h || h.length === 0) return 'Device';
        // Efficient reverse scan for the latest project association
        for (let i = h.length - 1; i >= 0; i--) {
            if (h[i].project) return h[i].project;
        }
        return 'Device';
    }, []);

    // ===== OPTIMIZED REAL-TIME DEVICES LISTENER =====
    // We only globally sync devices that are currently "Processing". 
    // This reduces the initial load from 3500+ documents down to just the active ~1500, 
    // making the Operation panel completely instantaneous.
    useEffect(() => {
        const validStatuses = ['Processing', 'In Progress', 'WIP', 'In-Progress', 'Processing...'];
        const wipQuery = query(devicesCol, where('status', 'in', validStatuses));

        const unsubscribeWip = onSnapshot(wipQuery, (snapshot) => {
            const newWip = {};
            snapshot.docs.forEach(d => { newWip[d.id] = d.data(); });
            setStore(prev => ({ ...prev, wipDevices: newWip }));
        }, (error) => {
            console.error("WIP Sync Error:", error);
        });

        return () => unsubscribeWip();
    }, []);
    // ===== USERS & TICKETS LISTENER (ADMIN) =====
    // Removed: Users and tickets are now lazy-loaded within the Settings/Admin modules
    // to prevent unnecessary document reads for standard operators.

    // ===== OPTIMIZED BAAN REAL-TIME LISTENERS =====
    // Removed: BAAN collections are no longer loaded globally at startup to prevent memory bloat.
    // They should be fetched on-demand by the BAAN module using dedicated fetch hooks.

    // Note: LocalStorage backup removed to prevent massive main-thread blocking on large datasets.
    // Real-time Firestore sync is sufficient for state persistence.

    const getUnitById = useCallback(async (id) => {
        if (!id) return null;
        const cleanId = id.trim().toUpperCase().replace(/\//g, '-');

        // Only use session cache if it has populated history.
        // Dashboard's onSnapshot may have cached the device with history:[]
        // if its sub-fetch silently failed.
        const cached = store.devices[cleanId];
        if (cached && Array.isArray(cached.history) && cached.history.length > 0) {
            return cached;
        }

        // Always do a fresh fetch from Firestore for accurate history
        try {
            const docRef = doc(db, 'devices', cleanId);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const u = snap.data();
                const resolvedProject = resolveActiveProject(u);
                const unitData = { ...u, id: snap.id, _resolvedProject: resolvedProject, project: resolvedProject };

                // Fallback to legacy array since subcollection write throws PERMISSION_DENIED
                unitData.history = Array.isArray(u.history) ? u.history : [];
                unitData.history.sort((a, b) => {
                    if (!a.timestamp) return -1;
                    if (!b.timestamp) return 1;
                    return new Date(a.timestamp) - new Date(b.timestamp);
                });

                // Update session cache with fully-loaded record
                setStore(prev => ({
                    ...prev,
                    devices: { ...prev.devices, [cleanId]: unitData }
                }));
                return unitData;
            }
        } catch (e) {
            console.warn(`Safe-Fetch failure for ${cleanId}:`, e);
        }
        return null;
    }, [store.devices, resolveActiveProject]);

    const validateScanStatus = async (id, targetStation, targetProject) => {

        const cleanId = id.trim().toUpperCase().replace(/\//g, '-');
        const unit = await getUnitById(cleanId);

        const projName = getDisplayName('projects', targetProject);
        const isRefurbishment = targetProject === 'Refurbishment' || projName === 'Refurbishment';

        // Receiving Station (ID: 1)
        if (targetStation.id === 1) {
            if (!unit) return { success: true }; // New Unit Allowed

            if (unit.status === 'Processing') {
                return { success: false, message: `ID "${cleanId}" is locked in ${unit.stationName}.` };
            }

            const promptMsg = isRefurbishment
                ? `Refurbishing Unit "${cleanId}" (Previously ${unit.status}). Proceed?`
                : `Unit "${cleanId}" was ${unit.status}. Re-Receive into ${projName}?`;

            return { success: true, prompt: promptMsg };
        }

        // Other Stations require previous registration
        if (!unit) return { success: false, message: `Unit ID "${cleanId}" not found. Process RECEIVING first.` };

        const unitCat = getProjectCategory(unit._resolvedProject || unit.project);
        const targetCat = getProjectCategory(targetProject);

        if (unitCat !== targetCat && unit.currentStation !== targetStation.id) {
            return { success: false, message: `Category Mismatch: Unit belongs to ${unitCat}.` };
        }

        if (unit.status === 'Scrap' || unit.status === 'Reject' || unit.status === 'SCRAPPED') {
            return { success: false, message: `Unit is ${unit.status.toUpperCase()} (Locked).` };
        }

        if (unit.holdStatus === 'HOLD') {
            return { success: false, message: `Unit is ON HOLD at ${unit.holdStation || 'current station'}. Station unhold is required.` };
        }

        const unitStationName = (unit.stationName || '').toUpperCase();
        const targetStationName = (targetStation.name || '').toUpperCase();

        if (unit.currentStation !== targetStation.id || (unitStationName !== targetStationName && !unitStationName.includes(targetStationName))) {
            return { success: false, message: `Sequence Mismatch: Unit is currently at ${unit.stationName || 'Unknown'}.` };
        }

        return { success: true };
    };

    const processUnit = async (id, data) => {
        const cleanId = id.trim().toUpperCase().replace(/\//g, '-');
        const { station, project, result, decision, details, operator } = data;
        const existingUnit = await getUnitById(cleanId);

        let updatedUnit = existingUnit ? { ...existingUnit } : {
            id: cleanId,
            project,
            looper: 1,
            history: [],
            status: 'Processing',
            createdAt: new Date().toISOString()
        };

        const timestamp = new Date().toISOString();
        const looperIndex = updatedUnit.looper;
        const historyEntry = {
            station: station.name,
            stationId: station.id,
            timestamp,
            result: result || decision || 'COMPLETED',
            operator: operator || 'SYSTEM_ADMIN',
            looper: looperIndex,
            project: project // Track project per history entry for robustness
        };

        const projectCategory = getProjectCategory(project);

        // ─── CALCULATOR REFURBISHMENT: TRUSTED CLOUD FUNCTION WITH LOCAL FALLBACK ───
        if (projectCategory === 'Calculator') {
            try {
                const processCalcFn = httpsCallable(functions, 'processCalculatorStation');
                const callRes = await processCalcFn({
                    serialNumber: cleanId,
                    stationId: station.id,
                    result: result || decision,
                    details: details || {},
                    checkpointResults: details?.checkpointResults || {},
                    dataValues: details?.dataValues || {},
                    textValues: details?.textValues || {},
                    selectedNextStationId: data?.targetStationId || details?.selectedNextStationId || null,
                    routeToScrap: details?.routeToScrap || false
                });

                setStore(prev => {
                    const nextDevices = { ...prev.devices };
                    delete nextDevices[cleanId];
                    return { ...prev, devices: nextDevices };
                });

                return callRes.data?.success || true;
            } catch (err) {
                console.warn("Cloud Function processCalculatorStation unavailable, falling back to local calculation engine:", err.message);
                try {
                    const deviceRef = doc(db, 'devices', cleanId);
                    const snap = await getDoc(deviceRef);
                    const freshUnit = snap.exists() ? snap.data() : null;
                    const timestamp = new Date().toISOString();

                    let unit = freshUnit ? { ...freshUnit } : {
                        id: cleanId,
                        project: 'Calculator',
                        looper: 1,
                        history: [],
                        status: 'Processing',
                        createdAt: timestamp
                    };

                    const stationId = station.id;
                    const stationName = station.name;

                    // Station 1: RECEIVING
                    if (stationId === 1) {
                        if (freshUnit) {
                            if (freshUnit.status === 'Processing') {
                                alert(`Unit "${cleanId}" is locked at ${freshUnit.stationName || 'current station'}.`);
                                return false;
                            }
                            if (['Completed', 'SCRAPPED', 'Scrap', 'Reject'].includes(freshUnit.status)) {
                                unit.looper = (unit.looper || 1) + 1;
                            }
                        }

                        unit.project = 'Calculator';
                        unit.status = 'Processing';
                        unit.details = { ...(details || {}) };
                        unit.updatedAt = timestamp;
                        unit.holdStatus = null;

                        const nextStationId = isRepeatSerial(freshUnit) ? 3 : 2;
                        const nextStationObj = getCalcStationById(nextStationId);
                        unit.currentStation = nextStationId;
                        unit.stationName = nextStationObj?.name || 'INITIAL QC';

                        unit.history = Array.isArray(unit.history) ? [...unit.history] : [];
                        unit.history.push({
                            station: 'RECEIVING',
                            stationId: 1,
                            timestamp,
                            result: 'Pass',
                            operator: operator || 'OPERATOR',
                            looper: unit.looper,
                            project: 'Calculator',
                            details: { ...(details || {}) }
                        });

                        await setDoc(deviceRef, unit);
                        setStore(prev => {
                            const nextDevices = { ...prev.devices };
                            delete nextDevices[cleanId];
                            return { ...prev, devices: nextDevices };
                        });
                        return true;
                    }

                    // Stations 2-8, 10
                    const checkpointResults = details?.checkpointResults || {};
                    const calcRes = calculateCalcResult(stationId, checkpointResults);
                    const outcome = result || calcRes.result || 'Pass';
                    const targetStationId = data?.targetStationId || details?.selectedNextStationId || null;

                    const routing = resolveCalcNextStation(stationId, outcome, unit, targetStationId);

                    unit.updatedAt = timestamp;
                    unit.history = Array.isArray(unit.history) ? [...unit.history] : [];
                    unit.history.push({
                        station: stationName,
                        stationId,
                        timestamp,
                        result: outcome,
                        operator: operator || 'OPERATOR',
                        looper: unit.looper || 1,
                        project: 'Calculator',
                        details: {
                            ...(details || {}),
                            checkpointResults,
                            calculatedResult: calcRes
                        }
                    });

                    if (routing.isHold) {
                        unit.holdStatus = 'HOLD';
                        unit.holdReason = details?.textValues?.holdReason || 'Checkpoint on hold';
                        unit.holdStation = stationName;
                    } else if (routing.nextStationId === 10) {
                        unit.status = 'Completed';
                        unit.currentStation = 10;
                        unit.stationName = 'MOVE TO FG';
                    } else if (routing.nextStationId) {
                        unit.status = 'Processing';
                        unit.currentStation = routing.nextStationId;
                        const nextSt = getCalcStationById(routing.nextStationId);
                        unit.stationName = nextSt?.name || '';
                        unit.holdStatus = null;
                    }

                    await setDoc(deviceRef, unit);
                    setStore(prev => {
                        const nextDevices = { ...prev.devices };
                        delete nextDevices[cleanId];
                        return { ...prev, devices: nextDevices };
                    });
                    return true;
                } catch (localErr) {
                    console.error("Local calculator processor error:", localErr);
                    alert(`Calculator Station Error: ${localErr.message || "Processing failed"}`);
                    return false;
                }
            }
        }

        let nextStation = null;
        let nextStationName = '';

        if (station.id === 1) {
            // RECEIVING: Single Source of Truth Logic
            updatedUnit.project = project; // Fully switch context
            if (existingUnit && (existingUnit.status === 'Completed' || existingUnit.status === 'Scrap' || existingUnit.status === 'Reject')) {
                updatedUnit.looper += 1;
                historyEntry.looper = updatedUnit.looper; // Update looper in history entry
            }
            updatedUnit.status = 'Processing';
            updatedUnit.details = { ...details }; // Only use latest looper details
            nextStationName = projectCategory === 'Device' ? 'INSPECTION' : (projectCategory === 'Peripherals' ? 'QC' : 'IQC');
            nextStation = 2;
        } else {
            // Processing Stations: Adopt Project context if mismatch (Correction Logic)
            if (updatedUnit.project !== project) {
                updatedUnit.project = project;
            }

            if (projectCategory === 'Device') {
                switch (station.id) {
                    case 2: if (result === 'Pass') { nextStation = 5; nextStationName = 'FINAL QC'; } else { if (decision === 'scrap_review') { nextStation = 8; nextStationName = 'SCRAP REVIEW'; } else { nextStation = 3; nextStationName = 'DEBUG'; } } break;
                    case 3: if (result === 'Pass') { nextStation = 4; nextStationName = 'REWORK'; } else { nextStation = 8; nextStationName = 'SCRAP REVIEW'; } break;
                    case 4: if (result === 'Pass') { nextStation = 5; nextStationName = 'FINAL QC'; } else { nextStation = 3; nextStationName = 'DEBUG'; } break;
                    case 5: if (result === 'Pass') { nextStation = 6; nextStationName = 'PACKING'; } else { nextStation = 3; nextStationName = 'DEBUG'; } break;
                    case 6: if (result === 'Pass') { nextStation = 7; nextStationName = 'MOVE TO FG'; } else { if (decision === 'audit') { nextStation = 5; nextStationName = 'FINAL QC'; } else { nextStation = 4; nextStationName = 'REWORK'; } } break;
                    case 7: updatedUnit.status = 'Completed'; nextStation = null; nextStationName = 'FG (DONE)'; updatedUnit.cycleEndDate = timestamp; break;
                    case 8: if (decision === 'scrap') { updatedUnit.status = 'Scrap'; nextStation = null; nextStationName = 'SCRAP (LOCKED)'; updatedUnit.lockDate = timestamp; } else { nextStation = 4; nextStationName = 'REWORK'; } break;
                }
            } else if (projectCategory === 'Peripherals') {
                switch (station.id) {
                    case 2: if (result === 'Pass') { nextStation = 3; nextStationName = 'MOVE TO FG'; } else { nextStation = 4; nextStationName = 'REJECTION REVIEW'; } break;
                    case 3: updatedUnit.status = 'Completed'; nextStation = null; nextStationName = 'FG (DONE)'; updatedUnit.cycleEndDate = timestamp; break;
                    case 4: if (result === 'Pass') { updatedUnit.status = 'Reject'; nextStation = null; nextStationName = 'REJECTED'; updatedUnit.lockDate = timestamp; } else { nextStation = 3; nextStationName = 'MOVE TO FG'; } break;
                }
            } else if (projectCategory === 'Inward QC') {
                switch (station.id) {
                    case 2: if (result === 'Pass') { nextStation = 3; nextStationName = 'MOVE TO FG'; } else { nextStation = 4; nextStationName = 'REJECTION'; } break;
                    case 3: updatedUnit.status = 'Completed'; nextStation = null; nextStationName = 'FG (DONE)'; updatedUnit.cycleEndDate = timestamp; break;
                    case 4: if (result === 'Pass') { updatedUnit.status = 'Reject'; nextStation = null; nextStationName = 'REJECTED'; updatedUnit.lockDate = timestamp; } else { nextStation = 3; nextStationName = 'MOVE TO FG'; } break;
                }
            }
        }

        // ── Apply validated Target Station Override if provided ──
        if (data?.targetStationId) {
            const workflow = PROJECT_WORKFLOWS[project] || PROJECT_WORKFLOWS['Device'];
            const chosen = workflow.find(s => s.id === Number(data.targetStationId));
            if (chosen && chosen.id !== station.id) {
                nextStation = chosen.id;
                nextStationName = chosen.name;
                historyEntry.isDestinationOverridden = true;
                historyEntry.targetStationId = chosen.id;
                historyEntry.targetStationName = chosen.name;

                if (chosen.type === 'TERMINAL_FG') {
                    updatedUnit.status = 'Completed';
                    nextStation = null;
                    updatedUnit.cycleEndDate = timestamp;
                } else if (chosen.type === 'TERMINAL_SCRAP') {
                    updatedUnit.status = 'Scrap';
                    nextStation = null;
                    updatedUnit.lockDate = timestamp;
                }
            }
        }

        updatedUnit.currentStation = nextStation;
        updatedUnit.stationName = nextStationName;
        updatedUnit.updatedAt = timestamp;

        // Append history to array
        const oldHistory = Array.isArray(existingUnit?.history) ? existingUnit.history : [];
        updatedUnit.history = [...oldHistory, { ...historyEntry, details: { ...details } }];

        try {
            const deviceRef = doc(db, 'devices', cleanId);
            const safeData = JSON.parse(JSON.stringify(updatedUnit)); // Safely strip any undefined properties

            await setDoc(deviceRef, safeData);
            return true;
        } catch (e) {
            console.error("ProcessUnit Error:", e);
            return false;
        }
    };

    const fetchStationMetrics = useCallback(async (project) => {
        try {
            const projectDisp = getDisplayName('projects', project);

            // Filter entirely from the synchronized local WIP cache (0 network requests)
            const wipUnits = Object.values(store.wipDevices || {}).filter(u => {
                const activeP = resolveActiveProject(u);
                const isRefurb = project === 'Device' || project === 'Refurbishment' || projectDisp === 'Refurbishment';
                if (isRefurb && (activeP === 'Device' || activeP === 'Refurbishment')) return true;
                return activeP === project || activeP === projectDisp;
            });

            const wipCountPerStation = wipUnits.reduce((acc, u) => {
                if (u.stationName) {
                    const sKey = u.stationName.toUpperCase().trim();
                    acc[sKey] = (acc[sKey] || 0) + 1;
                }
                return acc;
            }, {});

            return { wipBreakdown: wipCountPerStation };
        } catch (error) {
            console.error("fetchStationMetrics error:", error);
            return { wipBreakdown: {} };
        }
    }, [store.wipDevices, getDisplayName, resolveActiveProject]);

    const authenticateUser = async (uid, pwd) => {
        const cleanId = (uid || '').trim();
        if (!cleanId || !pwd) {
            return { success: false, message: 'Invalid credentials' };
        }

        // 1. Try Cloud Function first if available (Path 2 backend)
        try {
            const loginFn = httpsCallable(functions, 'loginAndGetToken');
            const tokRes = await loginFn({ userId: cleanId, password: pwd });
            if (tokRes.data?.success && tokRes.data?.token) {
                const authUserCred = await signInWithCustomToken(auth, tokRes.data.token);
                if (authUserCred && authUserCred.user) {
                    const returnedUser = tokRes.data.user || {};
                    const cleanUser = {
                        id: returnedUser.id || authUserCred.user.uid,
                        name: returnedUser.name || authUserCred.user.uid,
                        role: returnedUser.role || 'Operator',
                        stations: Array.isArray(returnedUser.stations) ? returnedUser.stations : [],
                        projects: Array.isArray(returnedUser.projects) ? returnedUser.projects : [],
                        isSystemAdmin: returnedUser.isSystemAdmin === true,
                        mustChangePassword: returnedUser.mustChangePassword === true
                    };
                    localStorage.setItem('cqa_user', JSON.stringify(cleanUser));
                    return { success: true, user: cleanUser };
                }
            }
        } catch (authErr) {
            console.warn('[Auth] Cloud Function login unavailable or failed, evaluating Path 1 direct Firestore authentication:', authErr?.message || authErr);
        }

        // 2. Path 1: Instant Self-Contained Firestore Authentication (Zero Billing Spark Tier)
        try {
            // Check exact ID (e.g. harish.m@tohands.in, Op.1)
            let userDoc = await getDoc(doc(db, 'users', cleanId));

            // Case fallbacks (e.g. lowercase or uppercase)
            if (!userDoc.exists()) {
                userDoc = await getDoc(doc(db, 'users', cleanId.toLowerCase()));
            }
            if (!userDoc.exists()) {
                userDoc = await getDoc(doc(db, 'users', cleanId.toUpperCase()));
            }

            if (userDoc.exists()) {
                const docData = userDoc.data();
                if (docData.inactive) {
                    return { success: false, message: 'This user account is inactive. Please contact an Administrator.' };
                }
                if (docData.password === pwd) {
                    const cleanUser = {
                        id: userDoc.id,
                        name: docData.name || userDoc.id,
                        role: docData.role || 'Operator',
                        stations: Array.isArray(docData.stations) ? docData.stations : [],
                        projects: Array.isArray(docData.projects) ? docData.projects : [],
                        isSystemAdmin: docData.isSystemAdmin === true,
                        mustChangePassword: docData.mustChangePassword === true
                    };
                    localStorage.setItem('cqa_user', JSON.stringify(cleanUser));
                    return { success: true, user: cleanUser };
                }
            }
            return { success: false, message: 'Invalid employee ID or password' };
        } catch (dbErr) {
            console.error('[Auth] Direct Firestore authentication error:', dbErr);
            return { success: false, message: dbErr?.message || 'Authentication failed' };
        }
    };

    // ─── Media Attachment Logic (Universal) ───
    const uploadProofImage = useCallback(async (base64Img, path) => {
        try {
            if (!base64Img || typeof base64Img !== 'string' || !base64Img.includes(',')) {
                return { url: null, error: 'Invalid image data.' };
            }

            const [headerPart, dataPart] = base64Img.split(',');
            const mimeMatch = headerPart.match(/:(.*?);/);
            const mimeString = (mimeMatch ? mimeMatch[1] : '').toLowerCase();

            // 1. Whitelist image types (reject SVG and others)
            const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
            if (!allowedMimes.includes(mimeString)) {
                return { url: null, error: `Invalid image type '${mimeString}'. Only JPEG, PNG, and WebP are allowed.` };
            }

            const byteString = atob(dataPart);
            // 2. Reject if decoded size > 5 MB
            const MAX_SIZE = 5 * 1024 * 1024;
            if (byteString.length > MAX_SIZE) {
                return { url: null, error: 'Image exceeds maximum allowed size of 5 MB.' };
            }

            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);

            // 3. Confirm magic bytes
            let isValidMagic = false;
            if (mimeString === 'image/jpeg') {
                isValidMagic = ia.length >= 3 && ia[0] === 0xFF && ia[1] === 0xD8 && ia[2] === 0xFF;
            } else if (mimeString === 'image/png') {
                isValidMagic = ia.length >= 8 && ia[0] === 0x89 && ia[1] === 0x50 && ia[2] === 0x4E && ia[3] === 0x47;
            } else if (mimeString === 'image/webp') {
                // RIFF....WEBP: RIFF at 0..3 and WEBP at 8..11
                isValidMagic = ia.length >= 12 &&
                    ia[0] === 0x52 && ia[1] === 0x49 && ia[2] === 0x46 && ia[3] === 0x46 &&
                    ia[8] === 0x57 && ia[9] === 0x45 && ia[10] === 0x42 && ia[11] === 0x50;
            }

            if (!isValidMagic) {
                return { url: null, error: `Corrupted or invalid image header for ${mimeString}.` };
            }

            const blob = new Blob([ab], { type: mimeString });
            const storageRef = ref(storage, path);
            const uploadTask = uploadBytes(storageRef, blob);

            // 15 second timeout to prevent infinite hanging
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Upload timeout after 15s')), 15000));
            await Promise.race([uploadTask, timeout]);

            const downloadURL = await getDownloadURL(storageRef);
            return { url: downloadURL, error: null };
        } catch (error) {
            console.error("Image upload failed:", error);
            return { url: null, error: error.message || "Unknown Firebase Storage error." };
        }
    }, []);

    // ─── Bulk Operations (FOR RECEIVING MODULE) ───
    const bulkProcessUnits = useCallback(async (unitConfigs) => {
        const timestamp = new Date().toISOString();
        const results = { success: 0, fail: 0, errors: [] };

        // Process in chunks of 450 (Firestore limit is 500)
        for (let i = 0; i < unitConfigs.length; i += 450) {
            const chunk = unitConfigs.slice(i, i + 450);
            const currentBatch = writeBatch(db);

            // Fetch existing units for this chunk securely to avoid overwriting
            const chunkIds = chunk.map(u => u.id.trim().toUpperCase().replace(/\//g, '-'));
            const existingUnits = {};
            await Promise.all(chunkIds.map(async cid => {
                const docSnap = await getDoc(doc(db, 'devices', cid));
                if (docSnap.exists()) existingUnits[cid] = docSnap.data();
            }));

            for (const { id, data } of chunk) {
                const cleanId = id.trim().toUpperCase().replace(/\//g, '-');
                const { station, project, details, operator } = data;
                const projectCategory = getProjectCategory(project);

                if (projectCategory === 'Calculator') {
                    try {
                        const processCalcFn = httpsCallable(functions, 'processCalculatorStation');
                        await processCalcFn({
                            serialNumber: cleanId,
                            stationId: station?.id || 1,
                            result: 'Pass',
                            details: details || {}
                        });
                        results.success++;
                    } catch (e) {
                        console.warn("Calc bulk Cloud Function notice, processing unit directly:", e?.message);
                        try {
                            const deviceRef = doc(db, 'devices', cleanId);
                            const snap = await getDoc(deviceRef);
                            const freshUnit = snap.exists() ? snap.data() : null;
                            const timestamp = new Date().toISOString();
                            let unit = freshUnit ? { ...freshUnit } : {
                                id: cleanId,
                                project: 'Calculator',
                                looper: 1,
                                history: [],
                                status: 'Processing',
                                createdAt: timestamp
                            };
                            const nextStationId = isRepeatSerial(freshUnit) ? 3 : 2;
                            const nextStationObj = getCalcStationById(nextStationId);
                            unit.currentStation = nextStationId;
                            unit.stationName = nextStationObj?.name || 'INITIAL QC';
                            unit.history = Array.isArray(unit.history) ? [...unit.history] : [];
                            unit.history.push({
                                station: station?.name || 'RECEIVING',
                                stationId: station?.id || 1,
                                timestamp,
                                result: 'Pass',
                                operator: operator || 'OPERATOR',
                                looper: unit.looper,
                                project: 'Calculator',
                                details: { ...(details || {}) }
                            });
                            await setDoc(deviceRef, unit);
                            results.success++;
                        } catch (bulkErr) {
                            results.fail++;
                            results.errors.push(bulkErr.message);
                        }
                    }
                    continue;
                }

                const existingUnit = existingUnits[cleanId];

                let updatedUnit = existingUnit ? { ...existingUnit } : {
                    id: cleanId,
                    project,
                    looper: 1,
                    history: [],
                    status: 'Processing',
                    createdAt: timestamp
                };

                const looperIndex = updatedUnit.looper;
                const historyEntry = {
                    station: station.name,
                    stationId: station.id,
                    timestamp,
                    result: 'COMPLETED',
                    operator: operator || 'SYSTEM_ADMIN',
                    looper: looperIndex,
                    project: project,
                    details: { ...details }
                };
                let nextStation = 2; // Receiving always goes to station 2
                let nextStationName = projectCategory === 'Device' ? 'INSPECTION' : (projectCategory === 'Peripherals' ? 'QC' : 'IQC');

                if (existingUnit && (existingUnit.status === 'Completed' || existingUnit.status === 'Scrap' || existingUnit.status === 'Reject')) {
                    updatedUnit.looper += 1;
                    historyEntry.looper = updatedUnit.looper;
                }

                updatedUnit.project = project;
                updatedUnit.status = 'Processing';
                updatedUnit.details = { ...details };
                updatedUnit.currentStation = nextStation;
                updatedUnit.stationName = nextStationName;
                updatedUnit.updatedAt = timestamp;

                // Append history to array
                const oldHistory = Array.isArray(existingUnit?.history) ? existingUnit.history : [];
                updatedUnit.history = [...oldHistory, historyEntry];

                const deviceRef = doc(db, 'devices', cleanId);
                const safeData = JSON.parse(JSON.stringify(updatedUnit)); // Safely strip any undefined properties

                currentBatch.set(deviceRef, safeData);

                results.success++;
            }

            try {
                await currentBatch.commit();
            } catch (e) {
                console.error("Bulk Process Error:", e);
                results.fail += chunk.length;
                results.errors.push(e.message);
            }
        }
        return results;
    }, [store.devices, getProjectCategory]);

    const syncBaanData = useCallback(() => {
        const collections = [
            { name: 'baan_locations', key: 'locations' },
            { name: 'baan_parts', key: 'parts' },
            { name: 'baan_batches', key: 'batches' },
            { name: 'baan_inward_logs', key: 'inwardLogs' },
            { name: 'baan_part_requests', key: 'partRequests' },
            { name: 'baan_part_issuance', key: 'partIssuance' },
            { name: 'baan_inventory_movements', key: 'inventoryMovements' }
        ];

        const unsubscribes = collections.map(({ name, key }) => {
            return onSnapshot(collection(db, name), (snapshot) => {
                const data = {};
                snapshot.forEach(doc => {
                    data[doc.id] = { id: doc.id, ...doc.data() };
                });
                setStore(prev => ({
                    ...prev,
                    baan: {
                        ...prev.baan,
                        [key]: data
                    }
                }));
            }, (error) => {
                console.error(`Error syncing BAAN ${name}:`, error);
            });
        });

        return () => {
            unsubscribes.forEach(unsub => unsub());
        };
    }, []);

    // ─── UNIT / SERIAL CONFIGURATION & MOVEMENT ENGINE ───
    const validateMovementUnits = useCallback(async (rawSerialNumbers, targetStationId = null, user = null) => {
        const norm = normalizeSerialNumbers(rawSerialNumbers);
        const userRole = user?.role || 'Admin';
        const validatedList = [];
        const counts = {
            total: norm.totalEntered,
            unique: norm.uniqueCount,
            duplicates: norm.duplicatesCount,
            ready: 0,
            alreadyAtDestination: 0,
            locked: 0,
            completed: 0,
            notFound: 0,
            invalid: 0
        };

        const snList = norm.serialNumbers;
        const fetchResults = {};
        for (let i = 0; i < snList.length; i += 50) {
            const chunk = snList.slice(i, i + 50);
            await Promise.all(chunk.map(async (sn) => {
                try {
                    const snap = await getDoc(doc(db, 'devices', sn));
                    if (snap.exists()) {
                        const u = snap.data();
                        const activeP = resolveActiveProject(u);
                        fetchResults[sn] = { ...u, id: snap.id, _resolvedProject: activeP, project: activeP };
                    } else {
                        fetchResults[sn] = null;
                    }
                } catch (err) {
                    console.error(`Error fetching unit ${sn}:`, err);
                    fetchResults[sn] = null;
                }
            }));
        }

        for (const sn of snList) {
            const unit = fetchResults[sn];
            const validation = validateUnitRecord(unit, targetStationId, unit?.project, userRole);

            let skipped = [];
            let classification = null;
            let risk = 'LOW';

            if (unit && targetStationId !== null && targetStationId !== undefined) {
                const fromStationId = unit.currentStation || 1;
                skipped = calculateSkippedStations(fromStationId, Number(targetStationId), unit.project || 'Device');
                classification = calculateMovementClassification(fromStationId, Number(targetStationId), unit.project || 'Device', unit.status);
                risk = calculateRiskLevel(fromStationId, Number(targetStationId), unit.project || 'Device', unit.status, skipped);
            }

            if (validation.statusKey === 'READY_TO_MOVE') counts.ready++;
            else if (validation.statusKey === 'ALREADY_AT_DESTINATION') counts.alreadyAtDestination++;
            else if (validation.statusKey === 'LOCKED') counts.locked++;
            else if (validation.statusKey === 'COMPLETED_RESTRICTED') counts.completed++;
            else if (validation.statusKey === 'NOT_FOUND') counts.notFound++;
            else counts.invalid++;

            validatedList.push({
                id: sn,
                serialNumber: sn,
                exists: !!unit,
                unitData: unit,
                project: unit?.project || 'Unknown',
                currentStation: unit?.currentStation || null,
                stationName: unit?.stationName || 'Unknown',
                status: unit?.status || 'Unknown',
                updatedAt: unit?.updatedAt || null,
                validationStatus: validation.statusKey,
                isValid: validation.isValid,
                message: validation.message,
                skippedStations: skipped,
                classification,
                risk
            });
        }

        return {
            normalized: norm,
            counts,
            validatedUnits: validatedList,
            groupedByProject: validatedList.reduce((acc, u) => {
                const p = u.project || 'Unknown';
                if (!acc[p]) acc[p] = [];
                acc[p].push(u);
                return acc;
            }, {})
        };
    }, [resolveActiveProject]);

    const executeAdminMovement = useCallback(async ({
        units,
        actionType = 'STATION_DIRECT',
        targetStationId = null,
        targetStationName = null,
        reasonCategory,
        reason,
        remarks,
        user,
        onProgress
    }) => {
        if (!user || (user.role !== 'Admin' && user.role !== 'Super Admin')) {
            throw new Error('Unauthorized: Admin or Super Admin privilege required.');
        }

        const isStatusOverride = actionType === 'STATUS_COMPLETE' || actionType === 'STATUS_REJECTED' || actionType === 'STATUS_SCRAPPED';
        const isRelativeMove = actionType === 'MOVE_NEXT' || actionType === 'MOVE_PREV';

        if (!isStatusOverride && !isRelativeMove && (!targetStationId || !targetStationName)) {
            throw new Error('Target destination station is required.');
        }

        if (!reasonCategory || !reason) {
            throw new Error('Reason category and reason are mandatory.');
        }

        const timestamp = new Date().toISOString();
        const dateStr = timestamp.slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
        const movementId = `MOVE-${dateStr}-${randomSuffix}`;

        const targetStId = targetStationId ? Number(targetStationId) : null;
        const eligibleUnits = units.filter(u => u.isValid || u.validationStatus === 'READY_TO_MOVE');
        if (eligibleUnits.length === 0) {
            throw new Error('No eligible units selected for movement.');
        }

        // 1 & 2. Pre-create Movement Audit Record with status 'PROCESSING'
        const movementDocRef = doc(db, 'admin_movements', movementId);
        const resolvedType = isStatusOverride
            ? `ADMIN_${actionType}`
            : isRelativeMove
            ? `ADMIN_${actionType}`
            : calculateMovementClassification(1, targetStId || 1, 'Device', 'Processing');

        const initialMovementDoc = {
            movementId,
            type: resolvedType,
            actionType: actionType || 'STATION_DIRECT',
            status: 'PROCESSING',
            createdAt: timestamp,
            startedAt: timestamp,
            createdBy: {
                userId: user.id || user.uid || 'ADMIN',
                name: user.name || user.id || 'Admin',
                role: user.role || 'Admin'
            },
            targetStationId: targetStId,
            targetStationName: targetStationName || (actionType === 'STATUS_COMPLETE' ? 'Completed (FG)' : actionType === 'STATUS_REJECTED' ? 'Rejected' : actionType === 'STATUS_SCRAPPED' ? 'Scrapped' : actionType),
            reasonCategory,
            reason,
            remarks: remarks || '',
            requestedCount: eligibleUnits.length,
            validatedCount: units.length,
            eligibleCount: eligibleUnits.length,
            successCount: 0,
            failedCount: 0,
            unitIds: [],
            serialNumbers: eligibleUnits.map(u => u.id),
            failedUnits: []
        };

        try {
            await setDoc(movementDocRef, initialMovementDoc);
        } catch (e) {
            console.error('Failed to initialize admin_movements audit record:', e);
            throw new Error(`Failed to create movement audit record: ${e.message}`);
        }

        const results = {
            success: 0,
            failed: 0,
            successUnits: [],
            failedUnits: [],
            movementId
        };

        // 3. Execute device batches
        const CHUNK_SIZE = 350;
        const totalChunks = Math.ceil(eligibleUnits.length / CHUNK_SIZE);

        for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
            const chunk = eligibleUnits.slice(chunkIdx * CHUNK_SIZE, (chunkIdx + 1) * CHUNK_SIZE);
            const batch = writeBatch(db);
            const chunkSuccessList = [];
            const chunkFailList = [];

            // Concurrency Stale-Check: Fetch latest docs for this chunk right before committing
            const chunkIds = chunk.map(u => u.id);
            const freshDocs = {};
            await Promise.all(chunkIds.map(async cid => {
                try {
                    const snap = await getDoc(doc(db, 'devices', cid));
                    if (snap.exists()) freshDocs[cid] = snap.data();
                } catch (e) {
                    console.warn(`Pre-commit fetch error for ${cid}:`, e);
                }
            }));

            for (const unitItem of chunk) {
                const cid = unitItem.id;
                const fresh = freshDocs[cid];

                if (!fresh) {
                    chunkFailList.push({ serialNumber: cid, error: 'Document disappeared before write commit.' });
                    continue;
                }

                // Stale-state prevention
                const expectedStation = unitItem.currentStation;
                if (!isStatusOverride && expectedStation !== undefined && expectedStation !== null && fresh.currentStation !== expectedStation) {
                    chunkFailList.push({
                        serialNumber: cid,
                        error: `Stale State: Unit station changed to ${fresh.stationName || fresh.currentStation} during operation.`
                    });
                    continue;
                }

                const fromStationId = fresh.currentStation || 1;
                const fromStationName = fresh.stationName || 'RECEIVING';
                const fromStatus = fresh.status || 'Processing';
                const unitProject = fresh.project || unitItem.project || 'Device';
                const workflow = PROJECT_WORKFLOWS[unitProject] || PROJECT_WORKFLOWS['Device'];

                let skipped = [];
                let classification = 'ADMIN_REROUTE';
                let newStatus = 'Processing';
                let cycleEndDate = null;
                let lockDate = null;
                let nextStationId = targetStId;
                let nextStationName = targetStationName;
                let movementResult = 'ADMIN_REROUTE';

                if (actionType === 'STATUS_COMPLETE') {
                    // Mark completed without requiring remaining stations; preserve tests untouched
                    newStatus = 'Completed';
                    cycleEndDate = timestamp;
                    nextStationId = null;
                    nextStationName = 'FG (Admin Override)';
                    movementResult = 'STATUS_OVERRIDE_COMPLETE';
                    classification = 'ADMIN_STATUS_COMPLETE';
                } else if (actionType === 'STATUS_REJECTED') {
                    // Mark rejected directly from any station; halt normal production
                    newStatus = (unitProject === 'Device' || unitProject === 'Peripherals' || unitProject === 'Inward QC') ? 'Reject' : 'Rejected';
                    lockDate = timestamp;
                    nextStationId = null;
                    nextStationName = 'REJECTED (Admin Override)';
                    movementResult = 'STATUS_OVERRIDE_REJECTED';
                    classification = 'ADMIN_STATUS_REJECTED';
                } else if (actionType === 'STATUS_SCRAPPED') {
                    // Mark scrapped directly from any station; halt normal production
                    newStatus = (unitProject === 'Calculator') ? 'SCRAPPED' : 'Scrap';
                    lockDate = timestamp;
                    nextStationId = null;
                    nextStationName = 'SCRAP (Admin Override)';
                    movementResult = 'STATUS_OVERRIDE_SCRAPPED';
                    classification = 'ADMIN_STATUS_SCRAPPED';
                } else if (actionType === 'MOVE_NEXT') {
                    const curIdx = workflow.findIndex(s => s.id === fromStationId);
                    if (curIdx === -1 || curIdx >= workflow.length - 1) {
                        chunkFailList.push({ serialNumber: cid, error: 'Unit is already at final workflow station. Use Complete status override instead.' });
                        continue;
                    }
                    const nextSt = workflow[curIdx + 1];
                    nextStationId = nextSt.id;
                    nextStationName = nextSt.name;
                    classification = 'FORWARD_REROUTE';
                    movementResult = 'ADMIN_MOVE_NEXT';

                    if (nextSt.type === 'TERMINAL_FG') {
                        newStatus = 'Completed';
                        cycleEndDate = timestamp;
                        nextStationId = null;
                    } else if (nextSt.type === 'TERMINAL_SCRAP') {
                        newStatus = (unitProject === 'Device') ? 'Scrap' : 'Reject';
                        lockDate = timestamp;
                        nextStationId = null;
                    } else {
                        newStatus = 'Processing';
                    }
                } else if (actionType === 'MOVE_PREV') {
                    const curIdx = workflow.findIndex(s => s.id === fromStationId);
                    if (curIdx <= 0) {
                        chunkFailList.push({ serialNumber: cid, error: 'Unit is already at Receiving (first station).' });
                        continue;
                    }
                    const prevSt = workflow[curIdx - 1];
                    nextStationId = prevSt.id;
                    nextStationName = prevSt.name;
                    classification = 'BACKWARD_RETURN';
                    movementResult = 'ADMIN_MOVE_PREV';
                    newStatus = 'Processing';
                } else {
                    // Standard direct target station
                    skipped = calculateSkippedStations(fromStationId, targetStId, unitProject);
                    classification = calculateMovementClassification(fromStationId, targetStId, unitProject, fresh.status);
                    const targetStObj = workflow.find(s => s.id === targetStId);

                    if (targetStObj?.type === 'TERMINAL_FG') {
                        newStatus = 'Completed';
                        cycleEndDate = timestamp;
                        nextStationId = null;
                        nextStationName = 'FG (DONE)';
                    } else if (targetStObj?.type === 'TERMINAL_SCRAP') {
                        newStatus = (unitProject === 'Device') ? 'Scrap' : (unitProject === 'Calculator' ? 'SCRAPPED' : 'Reject');
                        lockDate = timestamp;
                        nextStationId = null;
                        nextStationName = (unitProject === 'Device') ? 'SCRAP (LOCKED)' : (unitProject === 'Calculator' ? 'SCRAPPED' : 'REJECTED');
                    } else {
                        newStatus = 'Processing';
                    }

                    if (classification === 'BACKWARD_RETURN') movementResult = 'ADMIN_RETURN';
                    else if (classification === 'TERMINAL_MOVEMENT') movementResult = 'ADMIN_TERMINAL_MOVEMENT';
                    else if (classification === 'ADMIN_REOPEN') movementResult = 'ADMIN_REOPEN';
                }

                const historyEntry = {
                    station: `ADMIN OVERRIDE: -> ${nextStationName}`,
                    stationId: nextStationId,
                    result: movementResult,
                    timestamp,
                    movementId,
                    fromStationId,
                    fromStationName,
                    toStationId: nextStationId,
                    toStationName: nextStationName,
                    previousStatus: fromStatus,
                    newStatus,
                    skippedStations: skipped,
                    reasonCategory,
                    reason,
                    remarks: remarks || '',
                    operatorId: user.id || user.uid || 'ADMIN',
                    operator: user.name || user.id || 'Admin',
                    operatorRole: user.role || 'Admin',
                    looper: fresh.looper || 1,
                    project: unitProject,
                    details: {
                        movementType: classification,
                        actionType: actionType || 'STATION_DIRECT',
                        previousStatus: fromStatus,
                        newStatus,
                        previousStation: fromStationName,
                        targetStation: nextStationName,
                        skippedStations: skipped.map(s => s.stationName),
                        reasonCategory,
                        reason,
                        remarks: remarks || ''
                    }
                };

                const updatedDevice = {
                    ...fresh,
                    currentStation: nextStationId,
                    stationName: nextStationName,
                    status: newStatus,
                    updatedAt: timestamp,
                    // Preserve all historical test records and movement history
                    history: [...(Array.isArray(fresh.history) ? fresh.history : []), historyEntry]
                };

                if (cycleEndDate) updatedDevice.cycleEndDate = cycleEndDate;
                if (lockDate) updatedDevice.lockDate = lockDate;

                const devRef = doc(db, 'devices', cid);
                batch.set(devRef, JSON.parse(JSON.stringify(updatedDevice)));
                chunkSuccessList.push({
                    id: cid,
                    serialNumber: cid,
                    project: unitProject,
                    fromStation: fromStationName,
                    fromStationId,
                    toStation: nextStationName,
                    toStationId: nextStationId,
                    fromStatus,
                    toStatus: newStatus
                });
            }

            try {
                await batch.commit();
                results.success += chunkSuccessList.length;
                results.successUnits.push(...chunkSuccessList);
                results.failed += chunkFailList.length;
                results.failedUnits.push(...chunkFailList);

                // Write immutable audit log record for every overridden unit
                await Promise.all(chunkSuccessList.map(item =>
                    logAdminAction({
                        actor: user,
                        action: isStatusOverride ? AUDIT_ACTIONS.SERIAL_STATUS_OVERRIDE : AUDIT_ACTIONS.SERIAL_MOVEMENT_OVERRIDE,
                        entity: 'device',
                        entityId: item.serialNumber,
                        project: item.project || 'Device',
                        previousValue: { status: item.fromStatus, station: item.fromStation, stationId: item.fromStationId },
                        newValue: { status: item.toStatus, station: item.toStation, stationId: item.toStationId },
                        reason: `${reasonCategory} — ${reason}`,
                        remarks: remarks || '',
                        status: 'SUCCESS'
                    }).catch(auditErr => console.warn(`Audit log write error for ${item.serialNumber}:`, auditErr))
                ));
            } catch (commitErr) {
                console.error(`Batch commit error in chunk ${chunkIdx + 1}:`, commitErr);
                results.failed += chunk.length;
                results.failedUnits.push(...chunk.map(u => ({ serialNumber: u.id, error: commitErr.message })));
            }

            if (onProgress) {
                onProgress({
                    currentBatch: chunkIdx + 1,
                    totalBatches: totalChunks,
                    processedCount: results.success + results.failed,
                    totalCount: eligibleUnits.length,
                    percentage: Math.round(((results.success + results.failed) / eligibleUnits.length) * 100)
                });
            }
        }

        // 4. Update Movement Record with final completion status
        const finalStatus = (results.failed === 0 && results.success > 0)
            ? 'COMPLETED'
            : results.success > 0
                ? 'PARTIALLY_COMPLETED'
                : 'FAILED';

        const completedTimestamp = new Date().toISOString();
        const finalUpdates = {
            status: finalStatus,
            completedAt: completedTimestamp,
            successCount: results.success,
            failedCount: results.failed,
            unitIds: results.successUnits.map(u => u.serialNumber),
            serialNumbers: results.successUnits.map(u => u.serialNumber),
            failedUnits: results.failedUnits
        };

        try {
            await updateDoc(movementDocRef, finalUpdates);
        } catch (e) {
            console.error('Failed to update admin_movements completion status:', e);
            try {
                await setDoc(movementDocRef, finalUpdates, { merge: true });
            } catch (mergeErr) {
                console.error('Fallback setDoc merge also failed:', mergeErr);
            }
        }

        const finalMovementDoc = {
            ...initialMovementDoc,
            ...finalUpdates
        };

        return {
            ...results,
            status: finalStatus,
            movementDoc: finalMovementDoc
        };
    }, []);

    const reverseAdminMovement = useCallback(async (movementId, user) => {
        if (!user || (user.role !== 'Admin' && user.role !== 'Super Admin')) {
            throw new Error('Unauthorized: Admin or Super Admin privilege required.');
        }

        const movDocRef = doc(db, 'admin_movements', movementId);
        const movSnap = await getDoc(movDocRef);
        if (!movSnap.exists()) throw new Error(`Movement transaction "${movementId}" was not found.`);

        const movData = movSnap.data();
        if (movData.reversedAt) throw new Error(`Movement ${movementId} was already reversed on ${new Date(movData.reversedAt).toLocaleString()}.`);

        const timestamp = new Date().toISOString();
        const dateStr = timestamp.slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
        const reversalMovementId = `REV-${dateStr}-${randomSuffix}`;

        const batch = writeBatch(db);
        const successList = [];
        const failedList = [];

        for (const sn of (movData.unitIds || [])) {
            const dSnap = await getDoc(doc(db, 'devices', sn));
            if (!dSnap.exists()) {
                failedList.push({ serialNumber: sn, error: 'Unit record missing.' });
                continue;
            }
            const unit = dSnap.data();
            const historyArr = Array.isArray(unit.history) ? unit.history : [];
            const originalMoveEntry = historyArr.find(h => h.movementId === movementId);

            const returnStationId = originalMoveEntry?.fromStationId || 1;
            const returnStationName = originalMoveEntry?.fromStationName || 'RECEIVING';

            const historyEntry = {
                station: `ADMIN REVERSAL: -> ${returnStationName}`,
                stationId: returnStationId,
                result: 'ADMIN_MOVEMENT_REVERSAL',
                timestamp,
                movementId: reversalMovementId,
                reversesMovementId: movementId,
                fromStationId: unit.currentStation,
                fromStationName: unit.stationName,
                toStationId: returnStationId,
                toStationName: returnStationName,
                reasonCategory: 'Data / Process Correction',
                reason: 'Administrative Movement Reversal',
                remarks: `Reversal of movement ${movementId}`,
                operatorId: user.id || user.uid,
                operator: user.name || user.id || 'Admin',
                operatorRole: user.role || 'Admin',
                looper: unit.looper || 1,
                project: unit.project || 'Device',
                details: {
                    movementType: 'ADMIN_MOVEMENT_REVERSAL',
                    reversesMovementId: movementId,
                    previousStation: unit.stationName,
                    targetStation: returnStationName
                }
            };

            const updated = {
                ...unit,
                currentStation: returnStationId,
                stationName: returnStationName,
                status: 'Processing',
                updatedAt: timestamp,
                history: [...historyArr, historyEntry]
            };

            batch.set(doc(db, 'devices', sn), JSON.parse(JSON.stringify(updated)));
            successList.push(sn);
        }

        const reversalDoc = {
            movementId: reversalMovementId,
            reversesMovementId: movementId,
            type: 'ADMIN_MOVEMENT_REVERSAL',
            status: 'COMPLETED',
            createdAt: timestamp,
            createdBy: {
                userId: user.id || user.uid,
                name: user.name || user.id || 'Admin',
                role: user.role || 'Admin'
            },
            reasonCategory: 'Data / Process Correction',
            reason: 'Administrative Movement Reversal',
            remarks: `Reversed ${movementId}`,
            requestedCount: movData.unitIds?.length || 0,
            successCount: successList.length,
            failedCount: failedList.length,
            unitIds: successList,
            serialNumbers: successList,
            failedUnits: failedList
        };

        batch.set(doc(db, 'admin_movements', reversalMovementId), reversalDoc);
        batch.update(movDocRef, {
            reversedAt: timestamp,
            reversedBy: user.name || user.id || 'Admin',
            reversalMovementId
        });

        await batch.commit();

        return {
            success: true,
            reversalMovementId,
            successCount: successList.length,
            failedCount: failedList.length,
            failedUnits: failedList
        };
    }, []);

    const fetchAdminMovements = useCallback(async () => {
        try {
            const q = query(collection(db, 'admin_movements'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            return list;
        } catch (e) {
            console.error('Error fetching admin movements:', e);
            return [];
        }
    }, []);

    const unholdCalculatorSerial = useCallback(async (serialNumber) => {
        const cleanId = (serialNumber || '').trim().toUpperCase().replace(/\//g, '-');
        try {
            const unholdFn = httpsCallable(functions, 'unholdCalculatorSerial');
            const res = await unholdFn({ serialNumber });
            setStore(prev => {
                const nextDevices = { ...prev.devices };
                delete nextDevices[cleanId];
                return { ...prev, devices: nextDevices };
            });
            return { success: true, ...res.data };
        } catch (err) {
            console.warn("Cloud Function unhold fallback to direct Firestore:", err);
            try {
                const deviceRef = doc(db, 'devices', cleanId);
                const snap = await getDoc(deviceRef);
                if (!snap.exists()) {
                    return { success: false, message: 'Device not found.' };
                }
                const deviceData = snap.data();
                const history = Array.isArray(deviceData.history) ? [...deviceData.history] : [];
                history.push({
                    station: deviceData.stationName || 'UNHOLD',
                    stationId: deviceData.currentStation || null,
                    timestamp: new Date().toISOString(),
                    result: 'UNHOLD',
                    operator: 'SUPERVISOR',
                    looper: deviceData.looper || 1,
                    project: 'Calculator'
                });
                await updateDoc(deviceRef, {
                    holdStatus: null,
                    holdReason: null,
                    holdStation: null,
                    history,
                    updatedAt: new Date().toISOString()
                });
                setStore(prev => {
                    const nextDevices = { ...prev.devices };
                    delete nextDevices[cleanId];
                    return { ...prev, devices: nextDevices };
                });
                return { success: true };
            } catch (localErr) {
                return { success: false, message: localErr.message || "Failed to unhold unit." };
            }
        }
    }, []);

    const processScrapAnalysis = useCallback(async (data) => {
        try {
            const scrapFn = httpsCallable(functions, 'processScrapAnalysis');
            const res = await scrapFn(data);
            if (data.serialNumber) {
                const cleanId = data.serialNumber.trim().toUpperCase().replace(/\//g, '-');
                setStore(prev => {
                    const nextDevices = { ...prev.devices };
                    delete nextDevices[cleanId];
                    return { ...prev, devices: nextDevices };
                });
            }
            return { success: true, ...res.data };
        } catch (err) {
            console.warn("Cloud Function scrap analysis fallback to direct Firestore:", err);
            try {
                const cleanId = (data.serialNumber || '').trim().toUpperCase().replace(/\//g, '-');
                const deviceRef = doc(db, 'devices', cleanId);
                const snap = await getDoc(deviceRef);
                if (!snap.exists()) return { success: false, message: 'Unit not found' };
                const unit = snap.data();
                const timestamp = new Date().toISOString();
                const history = Array.isArray(unit.history) ? [...unit.history] : [];

                if (data.decision === 'scrap') {
                    history.push({
                        station: 'SCRAP ANALYSIS',
                        stationId: 9,
                        timestamp,
                        result: 'SCRAPPED',
                        operator: data.operator || 'ADMIN',
                        looper: unit.looper || 1,
                        project: 'Calculator',
                        details: { scrapReason: data.scrapReason }
                    });
                    await updateDoc(deviceRef, {
                        status: 'SCRAPPED',
                        history,
                        updatedAt: timestamp,
                        scrapReason: data.scrapReason
                    });
                } else {
                    history.push({
                        station: 'SCRAP ANALYSIS',
                        stationId: 9,
                        timestamp,
                        result: 'RETURN_TO_STATION',
                        operator: data.operator || 'ADMIN',
                        looper: unit.looper || 1,
                        project: 'Calculator',
                        details: { returnToStationId: data.returnToStationId }
                    });
                    const targetStation = getCalcStationById(data.returnToStationId);
                    await updateDoc(deviceRef, {
                        status: 'Processing',
                        currentStation: data.returnToStationId,
                        stationName: targetStation?.name || 'INITIAL QC',
                        history,
                        updatedAt: timestamp
                    });
                }
                setStore(prev => {
                    const nextDevices = { ...prev.devices };
                    delete nextDevices[cleanId];
                    return { ...prev, devices: nextDevices };
                });
                return { success: true };
            } catch (localErr) {
                return { success: false, message: localErr.message || "Failed to process scrap analysis." };
            }
        }
    }, []);

        // ===== STATION ADVANCED WORKFLOWS: APPROVED FG & COMMIT REJECTION =====
    const validateAdvancedUnit = useCallback(async (id, currentProject, workflowType) => {
        if (!id || !id.trim()) {
            return { isValid: false, statusKey: 'EMPTY_SERIAL', message: 'Serial number is required.' };
        }
        const targetCat = getProjectCategory(currentProject);
        if (targetCat !== 'Peripherals' && targetCat !== 'Inward QC') {
            return {
                isValid: false,
                statusKey: 'PROJECT_UNSUPPORTED',
                message: `Advanced features are only available for Peripherals and Inward QC projects.`
            };
        }

        const cleanId = id.trim().toUpperCase().replace(/\//g, '-');
        const unit = await getUnitById(cleanId);
        if (!unit) {
            return { isValid: false, statusKey: 'NOT_FOUND', message: `Unit ID "${cleanId}" not found in database.` };
        }

        // Project / Category validation
        const unitCat = getProjectCategory(unit._resolvedProject || unit.project);
        if (unitCat !== targetCat && unit.project !== currentProject) {
            return {
                isValid: false,
                statusKey: 'PROJECT_MISMATCH',
                message: `Project mismatch: Unit belongs to "${unit.project || unitCat}", not "${currentProject}".`,
                unit
            };
        }

        const currentStatus = unit.status || 'Unknown';
        const isLocked = ['Scrap', 'SCRAPPED', 'Reject', 'Rejected'].includes(currentStatus) || ['Rejected', 'Scrapped'].includes(unit.unitStatus);
        const isCompleted = ['Completed', 'Complete'].includes(currentStatus) || unit.unitStatus === 'FG';
        const isOnHold = unit.holdStatus === 'HOLD';

        if (isOnHold) {
            return {
                isValid: false,
                statusKey: 'ON_HOLD',
                message: `Unit "${cleanId}" is ON HOLD at ${unit.holdStation || 'current station'}. Station unhold required.`,
                unit
            };
        }

        if (workflowType === 'APPROVED_FG') {
            if (isCompleted) {
                return {
                    isValid: false,
                    statusKey: 'ALREADY_COMPLETED',
                    message: `Unit "${cleanId}" is already marked as Finished Goods (FG).`,
                    unit
                };
            }
            if (isLocked) {
                return {
                    isValid: false,
                    statusKey: 'LOCKED',
                    message: `Unit "${cleanId}" is in terminal status "${currentStatus}" (Locked).`,
                    unit
                };
            }
            return {
                isValid: true,
                statusKey: 'ELIGIBLE_FOR_FG',
                message: 'Unit is eligible for Finished Goods approval.',
                unit
            };
        }

        if (workflowType === 'COMMIT_REJECTION') {
            if (['Reject', 'Rejected'].includes(currentStatus) || unit.unitStatus === 'Rejected') {
                return {
                    isValid: false,
                    statusKey: 'ALREADY_REJECTED',
                    message: `Unit "${cleanId}" is already marked as Rejected.`,
                    unit
                };
            }
            if (['Scrap', 'SCRAPPED'].includes(currentStatus) || unit.unitStatus === 'Scrapped') {
                return {
                    isValid: false,
                    statusKey: 'ALREADY_SCRAPPED',
                    message: `Unit "${cleanId}" is already in Scrapped status (Locked).`,
                    unit
                };
            }
            if (isCompleted) {
                return {
                    isValid: false,
                    statusKey: 'ALREADY_COMPLETED',
                    message: `Unit "${cleanId}" is already Completed (FG). Cannot commit rejection.`,
                    unit
                };
            }
            return {
                isValid: true,
                statusKey: 'ELIGIBLE_FOR_REJECTION',
                message: 'Unit is eligible for rejection.',
                unit
            };
        }

        return { isValid: true, statusKey: 'VALID', message: 'Unit is valid.', unit };
    }, [getUnitById, getProjectCategory]);

    const executeAdvancedFGApproval = useCallback(async ({
        serialNumbers,
        qcRemarks,
        conditionalApprovalReason = '',
        station,
        project,
        user
    }) => {
        const projCat = getProjectCategory(project);
        if (projCat !== 'Peripherals' && projCat !== 'Inward QC') {
            throw new Error('Advanced FG Approval is only enabled for Peripherals and Inward QC projects.');
        }
        if (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0) {
            throw new Error('At least one serial number is required.');
        }
        if (!qcRemarks || !['Approved FG', 'Conditional Approved'].includes(qcRemarks)) {
            throw new Error('QC Remarks is mandatory and must be "Approved FG" or "Conditional Approved".');
        }
        const isConditional = qcRemarks === 'Conditional Approved';
        if (isConditional && (!conditionalApprovalReason || !conditionalApprovalReason.trim())) {
            throw new Error('Reason for Conditional Approval is mandatory.');
        }

        const timestamp = new Date().toISOString();
        const cleanReason = isConditional ? conditionalApprovalReason.trim() : null;
        const operatorName = user?.name || user?.id || JSON.parse(localStorage.getItem('cqa_user') || '{}')?.name || 'SYSTEM_OPERATOR';

        const results = {
            success: 0,
            failed: 0,
            successUnits: [],
            failedUnits: []
        };

        const batch = writeBatch(db);
        const toCommitDocs = [];

        for (const rawId of serialNumbers) {
            const cleanId = rawId.trim().toUpperCase().replace(/\//g, '-');
            try {
                const devRef = doc(db, 'devices', cleanId);
                const snap = await getDoc(devRef);
                if (!snap.exists()) {
                    results.failed++;
                    results.failedUnits.push({ serialNumber: cleanId, error: 'Serial number not found in database.' });
                    continue;
                }
                const fresh = snap.data();

                if (fresh.status === 'Completed' || fresh.status === 'Complete' || fresh.unitStatus === 'FG') {
                    results.failed++;
                    results.failedUnits.push({ serialNumber: cleanId, error: 'Unit is already marked as Finished Goods (Completed).' });
                    continue;
                }
                if (['Scrap', 'SCRAPPED', 'Reject', 'Rejected'].includes(fresh.status) || ['Rejected', 'Scrapped'].includes(fresh.unitStatus)) {
                    results.failed++;
                    results.failedUnits.push({ serialNumber: cleanId, error: `Unit is locked in ${fresh.status} status.` });
                    continue;
                }
                if (fresh.holdStatus === 'HOLD') {
                    results.failed++;
                    results.failedUnits.push({ serialNumber: cleanId, error: `Unit is ON HOLD at ${fresh.holdStation || 'current station'}.` });
                    continue;
                }

                const historyEntry = {
                    station: `${station?.name || 'QC'} [ADVANCED FG]`,
                    stationId: station?.id || 2,
                    timestamp,
                    result: isConditional ? 'CONDITIONAL_APPROVED_FG' : 'APPROVED_FG',
                    operator: operatorName,
                    qcRemarks,
                    conditionalApprovalReason: cleanReason,
                    project: fresh.project || project,
                    details: {
                        workflow: 'ADVANCED_FG',
                        qcRemarks,
                        conditionalApprovalReason: cleanReason,
                        unitStatus: 'FG',
                        wipStatus: 'Complete',
                        previousStation: fresh.stationName || station?.name || 'QC',
                        stationId: station?.id || 2,
                        stationName: station?.name || 'QC'
                    }
                };

                const updatedDevice = {
                    ...fresh,
                    unitStatus: 'FG',
                    wipStatus: 'Complete',
                    status: 'Completed',
                    currentStation: null,
                    stationName: 'FG (DONE)',
                    qcRemarks,
                    conditionalApprovalReason: cleanReason,
                    cycleEndDate: timestamp,
                    updatedAt: timestamp,
                    history: [...(Array.isArray(fresh.history) ? fresh.history : []), historyEntry]
                };

                batch.set(devRef, JSON.parse(JSON.stringify(updatedDevice)));
                toCommitDocs.push({
                    serialNumber: cleanId,
                    previousStatus: fresh.status || 'Processing',
                    project: fresh.project || project,
                    updatedDevice
                });
            } catch (unitErr) {
                results.failed++;
                results.failedUnits.push({ serialNumber: cleanId, error: unitErr.message });
            }
        }

        if (toCommitDocs.length > 0) {
            await batch.commit();

            for (const item of toCommitDocs) {
                results.success++;
                results.successUnits.push({
                    serialNumber: item.serialNumber,
                    unitStatus: 'FG',
                    wipStatus: 'Complete',
                    qcRemarks,
                    conditionalApprovalReason: cleanReason
                });

                setStore(prev => {
                    const nextDevices = { ...prev.devices, [item.serialNumber]: item.updatedDevice };
                    const nextWip = { ...prev.wipDevices };
                    delete nextWip[item.serialNumber];
                    return { ...prev, devices: nextDevices, wipDevices: nextWip };
                });

                await logAdminAction({
                    actor: user || { id: 'OPERATOR', name: operatorName, role: 'Operator' },
                    action: AUDIT_ACTIONS.SERIAL_STATUS_OVERRIDE,
                    entity: 'device',
                    entityId: item.serialNumber,
                    project: item.project || project,
                    previousValue: { status: item.previousStatus },
                    newValue: { unitStatus: 'FG', wipStatus: 'Complete', status: 'Completed', qcRemarks },
                    reason: isConditional ? `Conditional Approved: ${cleanReason}` : 'Approved FG',
                    remarks: isConditional ? cleanReason : `Approved FG from station ${station?.name || 'QC'}`,
                    status: 'SUCCESS'
                }).catch(e => console.warn('Audit log error:', e));
            }
        }

        return results;
    }, [getProjectCategory]);

    const executeAdvancedRejection = useCallback(async ({
        serialNumber,
        failureReason,
        station,
        project,
        user
    }) => {
        const projCat = getProjectCategory(project);
        if (projCat !== 'Peripherals' && projCat !== 'Inward QC') {
            throw new Error('Advanced Commit Rejection is only enabled for Peripherals and Inward QC projects.');
        }
        if (!serialNumber || !serialNumber.trim()) {
            throw new Error('Defective serial number is required.');
        }
        if (!failureReason || !failureReason.trim()) {
            throw new Error('Failure Reason is mandatory.');
        }

        const cleanId = serialNumber.trim().toUpperCase().replace(/\//g, '-');
        const cleanReason = failureReason.trim();
        const timestamp = new Date().toISOString();
        const operatorName = user?.name || user?.id || JSON.parse(localStorage.getItem('cqa_user') || '{}')?.name || 'SYSTEM_OPERATOR';

        const devRef = doc(db, 'devices', cleanId);
        const snap = await getDoc(devRef);
        if (!snap.exists()) {
            throw new Error(`Serial number "${cleanId}" not found in database.`);
        }
        const fresh = snap.data();

        if (['Reject', 'Rejected'].includes(fresh.status) || fresh.unitStatus === 'Rejected') {
            throw new Error(`Unit "${cleanId}" is already marked as Rejected.`);
        }
        if (['Scrap', 'SCRAPPED'].includes(fresh.status) || fresh.unitStatus === 'Scrapped') {
            throw new Error(`Unit "${cleanId}" is already marked as Scrapped (Locked).`);
        }
        if (fresh.status === 'Completed' || fresh.unitStatus === 'FG') {
            throw new Error(`Unit "${cleanId}" is already Completed (FG). Cannot commit rejection.`);
        }
        if (fresh.holdStatus === 'HOLD') {
            throw new Error(`Unit "${cleanId}" is ON HOLD at ${fresh.holdStation || 'current station'}. Unhold before rejection.`);
        }

        const historyEntry = {
            station: `${station?.name || 'QC'} [ADVANCED REJECTION]`,
            stationId: station?.id || 2,
            timestamp,
            result: 'REJECTED',
            operator: operatorName,
            failureReason: cleanReason,
            project: fresh.project || project,
            details: {
                workflow: 'ADVANCED_REJECTION',
                failureReason: cleanReason,
                unitStatus: 'Rejected',
                wipStatus: 'Complete',
                previousStation: fresh.stationName || station?.name || 'QC',
                stationId: station?.id || 2,
                stationName: station?.name || 'QC'
            }
        };

        const updatedDevice = {
            ...fresh,
            unitStatus: 'Rejected',
            wipStatus: 'Complete',
            status: 'Reject',
            currentStation: null,
            stationName: 'REJECTED',
            failureReason: cleanReason,
            lockDate: timestamp,
            updatedAt: timestamp,
            history: [...(Array.isArray(fresh.history) ? fresh.history : []), historyEntry]
        };

        await setDoc(devRef, JSON.parse(JSON.stringify(updatedDevice)));

        setStore(prev => {
            const nextDevices = { ...prev.devices, [cleanId]: updatedDevice };
            const nextWip = { ...prev.wipDevices };
            delete nextWip[cleanId];
            return { ...prev, devices: nextDevices, wipDevices: nextWip };
        });

        await logAdminAction({
            actor: user || { id: 'OPERATOR', name: operatorName, role: 'Operator' },
            action: AUDIT_ACTIONS.SERIAL_STATUS_OVERRIDE,
            entity: 'device',
            entityId: cleanId,
            project: fresh.project || project,
            previousValue: { status: fresh.status || 'Processing' },
            newValue: { unitStatus: 'Rejected', wipStatus: 'Complete', status: 'Reject', failureReason: cleanReason },
            reason: cleanReason,
            remarks: `Defect recorded at station ${station?.name || 'QC'}`,
            status: 'SUCCESS'
        }).catch(e => console.warn('Audit log error:', e));

        return {
            success: true,
            serialNumber: cleanId,
            failureReason: cleanReason,
            unit: updatedDevice
        };
    }, [getProjectCategory]);

    const contextValue = {
        store, loading,
        getUnit: getUnitById,
        validateScan: validateScanStatus,
        validateAdvancedUnit,
        executeAdvancedFGApproval,
        executeAdvancedRejection,
        processUnit, bulkProcessUnits, fetchStationMetrics, uploadProofImage,
        validateMovementUnits, executeAdminMovement, reverseAdminMovement, fetchAdminMovements,
        unholdCalculatorSerial, processScrapAnalysis,
        systemNames, getDisplayName, getProjectCategory, resolveActiveProject, authenticateUser,
        createUser: async (u) => {
            try {
                const fn = httpsCallable(functions, 'adminUpsertUser');
                const res = await fn({ id: u.id, name: u.name, role: u.role, stations: u.stations, password: u.password });
                return res.data;
            } catch (err) {
                console.warn('[createUser] Cloud Function fallback to direct Firestore:', err);
                await setDoc(doc(db, 'users', u.id), u);
                return { success: true };
            }
        },
        updateUser: async (oldId, userData) => {
            try {
                const fn = httpsCallable(functions, 'adminUpsertUser');
                const res = await fn({
                    id: userData.id,
                    oldId: oldId !== userData.id ? oldId : undefined,
                    name: userData.name,
                    role: userData.role,
                    stations: userData.stations,
                    password: userData.password ? userData.password : undefined
                });
                return res.data;
            } catch (err) {
                console.warn('[updateUser] Cloud Function fallback to direct Firestore:', err);
                if (oldId !== userData.id) {
                    await setDoc(doc(db, 'users', userData.id), userData);
                    await deleteDoc(doc(db, 'users', oldId));
                } else {
                    await setDoc(doc(db, 'users', userData.id), userData);
                }
                return { success: true };
            }
        },
        deleteUser: async (id) => {
            try {
                const fn = httpsCallable(functions, 'adminDeleteUser');
                const res = await fn({ id });
                return res.data;
            } catch (err) {
                console.warn('[deleteUser] Cloud Function fallback to direct Firestore:', err);
                await deleteDoc(doc(db, 'users', id));
                return { success: true };
            }
        },
        updateSystemNames: async (newNames) => {
            await setDoc(doc(db, 'settings', 'system_names'), newNames);
            return { success: true };
        },
        purgeData: async (filters) => {
            try {
                const fn = httpsCallable(functions, 'purgeDevices');
                const res = await fn({ filters });
                return res.data;
            } catch (err) {
                console.warn('[purgeData] Cloud Function fallback to client batch purge:', err);
                const querySnapshot = await getDocs(collection(db, 'devices'));
                const batch = writeBatch(db);
                let count = 0;
                querySnapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    const matchProj = !filters.project || data.project === filters.project;
                    const matchStatus = !filters.status || data.status === filters.status;
                    if (matchProj && matchStatus) {
                        batch.delete(docSnap.ref);
                        count++;
                    }
                });
                if (count > 0) await batch.commit();
                return { success: true, count };
            }
        },
        toggleMaintenanceMode: async (val) => setDoc(doc(db, 'settings', 'global'), { maintenanceMode: val }),
        requestPasswordReset: async (id) => setDoc(doc(db, 'tickets', id), { userId: id, status: 'Pending', requestedAt: new Date().toISOString() }),
        updateTicketStatus: async (id, status) => setDoc(doc(db, 'tickets', id), { status }, { merge: true }),
        resetUserPassword: async (id, pwd) => {
            try {
                const fn = httpsCallable(functions, 'adminResetPassword');
                const res = await fn({ id, newPassword: pwd });
                return res.data;
            } catch (err) {
                console.warn('[resetUserPassword] Cloud Function fallback to direct Firestore:', err);
                await updateDoc(doc(db, 'users', id), { password: pwd, mustChangePassword: true });
                return { success: true };
            }
        },
        changeOwnPassword: async (currentPassword, newPassword) => {
            try {
                const fn = httpsCallable(functions, 'changeOwnPassword');
                const res = await fn({ currentPassword, newPassword });
                return res.data;
            } catch (err) {
                console.warn('[changeOwnPassword] Cloud Function fallback to direct Firestore:', err);
                const saved = localStorage.getItem('cqa_user');
                const u = saved ? JSON.parse(saved) : null;
                if (!u || !u.id) throw new Error('Not authenticated');
                const snap = await getDoc(doc(db, 'users', u.id));
                if (!snap.exists()) throw new Error('User not found');
                if (snap.data().password !== currentPassword) throw new Error('Current password incorrect');
                await updateDoc(doc(db, 'users', u.id), { password: newPassword, mustChangePassword: false });
                const updated = { ...u, mustChangePassword: false };
                localStorage.setItem('cqa_user', JSON.stringify(updated));
                return { success: true };
            }
        },
        getAuditLogs: () => store.devices ? [] : [], // Placeholder

        // ─── BAAN MODULE OPERATIONS ───
        createBaanLocation: async (loc, user) => {
            const locId = loc.id || loc.name.toUpperCase().replace(/\s+/g, '_');
            await setDoc(doc(db, 'baan_locations', locId), {
                ...loc,
                id: locId,
                status: loc.status || 'Active',
                createdBy: user?.name || user?.id || 'System',
                createdAt: new Date().toISOString()
            });
            return { success: true };
        },
        updateBaanLocation: async (id, data, user) => {
            await setDoc(doc(db, 'baan_locations', id), {
                ...data,
                updatedBy: user?.name || user?.id || 'System',
                updatedAt: new Date().toISOString()
            }, { merge: true });
            return { success: true };
        },
        archiveBaanLocation: async (id, status, user) => {
            await setDoc(doc(db, 'baan_locations', id), {
                status: status || 'Archived',
                updatedBy: user?.name || user?.id || 'System',
                updatedAt: new Date().toISOString()
            }, { merge: true });
            return { success: true };
        },
        deleteBaanLocation: async (id, locData) => {
            const targetId = id;
            const targetName = locData?.name;
            const targetCode = locData?.code;

            const matchesLoc = (val) => {
                if (!val) return false;
                const s = String(val).trim().toUpperCase();
                return (targetId && s === String(targetId).trim().toUpperCase()) ||
                    (targetName && s === String(targetName).trim().toUpperCase()) ||
                    (targetCode && s === String(targetCode).trim().toUpperCase());
            };

            // 1. Current Stock Check
            let currentStock = 0;
            Object.values(store.baan?.batches || {}).forEach(b => {
                if (matchesLoc(b.location)) {
                    currentStock += Number(b.quantityAvailable || 0);
                }
            });

            if (currentStock > 0) {
                return {
                    success: false,
                    message: `Deletion Blocked: Location has ${currentStock} active stock units. Stock must be zero before deletion.`
                };
            }

            // 2. Historical References Check across all BAAN collections
            let refCount = 0;
            Object.values(store.baan?.batches || {}).forEach(b => {
                if (matchesLoc(b.location)) refCount++;
            });
            Object.values(store.baan?.inwardLogs || {}).forEach(l => {
                if (matchesLoc(l.location)) refCount++;
            });
            Object.values(store.baan?.inventoryMovements || {}).forEach(m => {
                if (matchesLoc(m.location) || matchesLoc(m.fromLocation) || matchesLoc(m.toLocation)) refCount++;
            });
            Object.values(store.baan?.partIssuance || {}).forEach(i => {
                if (matchesLoc(i.location)) refCount++;
            });
            Object.values(store.baan?.partRequests || {}).forEach(r => {
                if (matchesLoc(r.location)) refCount++;
            });

            if (refCount > 0) {
                return {
                    success: false,
                    message: `Deletion Blocked: ${refCount} historical transaction records depend on this location. You can archive it instead to preserve traceability.`
                };
            }

            // 3. Delete document
            await deleteDoc(doc(db, 'baan_locations', id));
            return { success: true };
        },
        bulkInwardBaanParts: async (rows, user) => {
            const timestamp = new Date().toISOString();
            const uploadId = `BULK-${Date.now()}`;
            const uploader = user?.name || user?.id || 'System';
            const batch = writeBatch(db);

            let successfulRows = 0;
            let existingPartsUpdated = 0;
            let newPartsCreated = 0;
            let rowNumber = 1;

            try {
                for (const data of rows) {
                    const currentRow = rowNumber++;
                    const uniqueSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
                    const cleanPart = (data.partNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

                    const locName = (data.locationName || '').trim();
                    const locCode = (data.locationCode || '').trim();
                    let resolvedLocation = (data.location || '').trim();
                    if (locName && locCode) {
                        resolvedLocation = `${locName} — ${locCode}`;
                    } else if (locName) {
                        resolvedLocation = locName;
                    }

                    const cleanLoc = (resolvedLocation || '').replace(/[^a-zA-Z0-9]/g, '');
                    const inwardId = `INW-BLK-${Date.now()}-${currentRow}-${uniqueSuffix}`;

                    const userBatch = (data.batchNumber || '').trim();
                    let batchId;
                    if (userBatch) {
                        batchId = `BAT-${cleanPart}-${userBatch.replace(/[^a-zA-Z0-9_-]/g, '')}-${Date.now()}-${currentRow}-${uniqueSuffix}`;
                    } else {
                        batchId = `BAT-${cleanPart}-${cleanLoc || 'GEN'}-${Date.now()}-${currentRow}-${uniqueSuffix}`;
                    }

                    // Auto-register location in baan_locations if not exists
                    if (locName) {
                        const locDocId = (locName + (locCode ? `_${locCode}` : '')).toUpperCase().replace(/[^A-Z0-9]/g, '_');
                        batch.set(doc(db, 'baan_locations', locDocId), {
                            id: locDocId,
                            name: locName,
                            code: locCode || 'Default',
                            fullName: resolvedLocation,
                            status: 'Active',
                            createdBy: uploader,
                            createdAt: timestamp
                        }, { merge: true });
                    }

                    // 1. Create Inward Log / Movement Log
                    batch.set(doc(collection(db, 'baan_inventory_movements')), {
                        id: inwardId,
                        partNo: data.partNo,
                        partNumber: data.partNo,
                        qtyAdded: data.qty,
                        quantity: data.qty,
                        perUnitCost: data.cost,
                        invoiceOrDcNumber: data.invoice,
                        batchId: batchId,
                        batchNumber: userBatch || batchId,
                        location: resolvedLocation,
                        locationName: locName,
                        locationCode: locCode,
                        uploadedBy: uploader,
                        uploadedAt: timestamp,
                        timestamp,
                        movementType: 'INWARD'
                    });

                    batch.set(doc(db, 'baan_inward_logs', inwardId), {
                        id: inwardId,
                        partNumber: data.partNo,
                        partName: data.partName,
                        location: resolvedLocation,
                        locationName: locName,
                        locationCode: locCode,
                        batchId: batchId,
                        batchNumber: userBatch || batchId,
                        quantity: data.qty,
                        reference: data.invoice,
                        remarks: data.remarks || 'Bulk Upload',
                        inwardBy: uploader,
                        timestamp
                    });

                    // 2. Create/Update Batch
                    const batchRef = doc(db, 'baan_batches', batchId);
                    batch.set(batchRef, {
                        id: batchId,
                        batchNumber: userBatch || batchId,
                        partNumber: data.partNo,
                        partName: data.partName,
                        location: resolvedLocation,
                        locationName: locName,
                        locationCode: locCode,
                        inwardDate: timestamp,
                        quantityTotal: Number(data.qty),
                        quantityAvailable: Number(data.qty),
                        perUnitCost: Number(data.cost),
                        uom: data.uom,
                        minimumStockLevel: Number(data.minStock),
                        reference: data.invoice,
                        mpn: data.mpn || ''
                    }, { merge: true });

                    // 3. Update Part Master
                    const partRef = doc(db, 'baan_parts', data.partNo);
                    batch.set(partRef, {
                        id: data.partNo,
                        name: data.partName,
                        uom: data.uom,
                        minimumStockLevel: Number(data.minStock),
                        lastUpdated: timestamp
                    }, { merge: true });

                    if (store.baan.parts && store.baan.parts[data.partNo]) {
                        existingPartsUpdated++;
                    } else {
                        newPartsCreated++;
                    }
                    successfulRows++;
                }

                // Create audit log
                batch.set(doc(db, 'baan_bulk_uploads', uploadId), {
                    uploadId,
                    totalRows: rows.length,
                    successfulRows,
                    failedRows: rows.length - successfulRows,
                    uploadedBy: uploader,
                    uploadedAt: timestamp
                });

                await batch.commit();
                return { success: true, successfulRows, existingPartsUpdated, newPartsCreated };
            } catch (err) {
                console.error("Bulk Upload Error:", err);
                return { success: false, message: 'Transaction failed. No records were updated.' };
            }
        },
        inwardBaanParts: async (data, user) => {
            const timestamp = new Date().toISOString();
            const inwardId = `INW-${Date.now()}`;

            const locationName = (data.locationName || '').trim();
            const locationCode = (data.locationCode || '').trim();
            let resolvedLocation = (data.location || '').trim();
            if (locationName && locationCode) {
                resolvedLocation = `${locationName} — ${locationCode}`;
            } else if (locationName) {
                resolvedLocation = locationName;
            }

            const normalizeLoc = (loc) => (loc || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
            const targetNormLoc = normalizeLoc(resolvedLocation);

            // Validation: One specific location bin stores only one type of part
            // Allows same Rack if Location Code is different (e.g. Rack 1 Code A vs Rack 1 Code B)
            if (targetNormLoc) {
                const otherPartInSameLoc = Object.values(store.baan?.batches || {}).find(
                    b => normalizeLoc(b.location) === targetNormLoc && b.partNumber !== data.partNumber && Number(b.quantityAvailable) > 0
                );
                if (otherPartInSameLoc) {
                    return {
                        success: false,
                        message: `Storage Location "${resolvedLocation}" is already occupied by Part "${otherPartInSameLoc.partNumber}" (${otherPartInSameLoc.quantityAvailable} units active). Please use a different Location Code or Rack.`
                    };
                }
            }

            // Auto-register location in baan_locations if not exists
            if (locationName) {
                const locDocId = (locationName + (locationCode ? `_${locationCode}` : '')).toUpperCase().replace(/[^A-Z0-9]/g, '_');
                await setDoc(doc(db, 'baan_locations', locDocId), {
                    id: locDocId,
                    name: locationName,
                    code: locationCode || 'Default',
                    fullName: resolvedLocation,
                    status: 'Active',
                    createdBy: (user?.name || user?.id || 'System'),
                    createdAt: timestamp
                }, { merge: true });
            }

            // Scoped Batch ID Generation - guaranteed never to collide across different parts
            const userBatch = (data.batchNumber || data.batchId || '').trim();
            const cleanPart = (data.partNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const cleanLoc = targetNormLoc || 'GEN';

            let batchId;
            if (data.batchId && data.batchId.startsWith('BAT-') && data.batchId.includes(cleanPart)) {
                batchId = data.batchId;
            } else if (userBatch) {
                const cleanUserBatch = userBatch.replace(/[^a-zA-Z0-9_-]/g, '');
                batchId = `BAT-${cleanPart}-${cleanUserBatch}-${Date.now()}`;
            } else {
                batchId = `BAT-${cleanPart}-${cleanLoc}-${Date.now()}`;
            }

            // 1. Create Inward Log
            await setDoc(doc(db, 'baan_inward_logs', inwardId), {
                ...data,
                id: inwardId,
                location: resolvedLocation,
                locationName: locationName || '',
                locationCode: locationCode || '',
                batchId,
                batchNumber: userBatch || batchId,
                inwardBy: (user?.name || user?.id || 'System'),
                timestamp
            });

            // 2. Create/Update Batch
            const batchRef = doc(db, 'baan_batches', batchId);
            const batchSnap = await getDoc(batchRef);
            if (batchSnap.exists()) {
                const existing = batchSnap.data();
                if (existing.partNumber && existing.partNumber !== data.partNumber) {
                    return {
                        success: false,
                        message: `Batch ID "${userBatch || batchId}" already belongs to Part "${existing.partNumber}". Different parts cannot share the same batch.`
                    };
                }
                await setDoc(batchRef, {
                    ...existing,
                    partNumber: data.partNumber,
                    partName: data.partName,
                    location: resolvedLocation,
                    locationName: locationName || existing.locationName || '',
                    locationCode: locationCode || existing.locationCode || '',
                    quantityTotal: Number(existing.quantityTotal) + Number(data.quantity),
                    quantityAvailable: Number(existing.quantityAvailable) + Number(data.quantity),
                    perUnitCost: Number(data.perUnitCost || existing.perUnitCost || 0),
                    uom: data.uom || existing.uom || '',
                    minimumStockLevel: Number(data.minimumStockLevel || existing.minimumStockLevel || 0),
                    reference: data.invoiceOrDcNumber || data.reference || existing.reference || '',
                    mpn: data.mpn || existing.mpn || '',
                    batchNumber: userBatch || existing.batchNumber || batchId
                }, { merge: true });
            } else {
                await setDoc(batchRef, {
                    id: batchId,
                    batchNumber: userBatch || batchId,
                    partNumber: data.partNumber,
                    partName: data.partName,
                    location: resolvedLocation,
                    locationName: locationName || '',
                    locationCode: locationCode || '',
                    inwardDate: data.inwardDate || timestamp,
                    quantityTotal: Number(data.quantity),
                    quantityAvailable: Number(data.quantity),
                    perUnitCost: Number(data.perUnitCost || 0),
                    uom: data.uom || '',
                    minimumStockLevel: Number(data.minimumStockLevel || 0),
                    reference: data.invoiceOrDcNumber || data.reference || '',
                    mpn: data.mpn || ''
                });
            }

            // 3. Update Part Master (ensure part exists)
            await setDoc(doc(db, 'baan_parts', data.partNumber), {
                id: data.partNumber,
                name: data.partName,
                uom: data.uom || '',
                minimumStockLevel: Number(data.minimumStockLevel || 0),
                lastInward: timestamp
            }, { merge: true });

            // 4. Movement Log
            await addDoc(collection(db, 'baan_inventory_movements'), {
                movementType: 'INWARD',
                partNumber: data.partNumber,
                partNo: data.partNumber,
                batchId,
                batchNumber: userBatch || batchId,
                location: resolvedLocation,
                locationName: locationName || '',
                locationCode: locationCode || '',
                quantity: data.quantity,
                qtyAdded: Number(data.quantity),
                perUnitCost: Number(data.perUnitCost || 0),
                invoiceOrDcNumber: data.invoiceOrDcNumber || data.reference || '',
                user: (user?.name || user?.id || 'System'),
                uploadedBy: (user?.name || user?.id || 'System'),
                timestamp
            });

            return { success: true, batchId };
        },
        requestBaanPart: async (request, user) => {
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
            const requestId = `REQ-${dateStr}-${randomStr}`;

            await setDoc(doc(db, 'baan_part_requests', requestId), {
                id: requestId,
                partNo: request.partNo,
                partName: request.partName,
                requestedQty: request.requestedQty,
                consumedQty: 0,
                remainingQty: request.requestedQty,
                status: 'Requested',
                requestedBy: (user?.name || user?.id || 'System'),
                requestedAt: new Date().toISOString()
            });
            return { success: true, requestId };
        },
        issueBaanParts: async (requestId, user) => {
            const timestamp = new Date().toISOString();
            const batch = writeBatch(db);
            const request = store.baan.partRequests[requestId];

            if (!request) return { success: false, message: 'Request not found' };
            if (request.status !== 'Requested') return { success: false, message: 'Request is not in Requested status' };

            let remainingToFulfill = Number(request.requestedQty);
            const availableBatches = Object.values(store.baan.batches)
                .filter(b => b.partNumber === request.partNo && b.quantityAvailable > 0)
                .sort((a, b) => new Date(a.inwardDate) - new Date(b.inwardDate));

            let totalAvailable = availableBatches.reduce((acc, b) => acc + Number(b.quantityAvailable), 0);

            if (remainingToFulfill > totalAvailable) {
                return { success: false, message: 'Insufficient stock available' };
            }

            for (const b of availableBatches) {
                if (remainingToFulfill <= 0) break;

                const take = Math.min(b.quantityAvailable, remainingToFulfill);
                const batchRef = doc(db, 'baan_batches', b.id);

                batch.update(batchRef, {
                    quantityAvailable: Number(b.quantityAvailable) - take
                });

                // Record Issuance Log
                const issuanceId = `ISS-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
                batch.set(doc(db, 'baan_part_issuance', issuanceId), {
                    id: issuanceId,
                    requestId,
                    partNumber: request.partNo || request.partNumber,
                    partName: request.partName || store.baan?.parts?.[request.partNo || request.partNumber]?.name || '',
                    requestedBy: request.requestedBy || '',
                    requestedAt: request.requestedAt || '',
                    deviceSn: request.deviceSn || '',
                    batchId: b.id,
                    batchNumber: b.batchNumber || b.id,
                    quantity: take,
                    issuedBy: (user?.name || user?.id || 'System'),
                    issuedAt: timestamp,
                    location: b.location || ''
                });

                // Record Inventory Movement
                batch.set(doc(collection(db, 'baan_inventory_movements')), {
                    movementType: 'ISSUANCE',
                    requestId,
                    partNumber: request.partNo || request.partNumber,
                    partNo: request.partNo || request.partNumber,
                    batchId: b.id,
                    quantity: take,
                    deviceSn: request.deviceSn || '',
                    user: (user?.name || user?.id || 'System'),
                    timestamp
                });

                remainingToFulfill -= take;
            }

            batch.update(doc(db, 'baan_part_requests', requestId), {
                status: 'Issued',
                issuedAt: timestamp,
                issuedBy: (user?.name || user?.id || 'System')
            });

            await batch.commit();
            return { success: true };
        },
        consumeBaanParts: async (requestId, consumeQty, deviceSn, reason, user) => {
            const timestamp = new Date().toISOString();
            const batch = writeBatch(db);
            const request = store.baan.partRequests[requestId];

            if (!request) return { success: false, message: 'Request not found' };

            const newConsumedQty = Number(request.consumedQty) + Number(consumeQty);
            const newRemainingQty = Number(request.requestedQty) - newConsumedQty;

            if (newRemainingQty < 0) {
                return { success: false, message: 'Consumption exceeds requested quantity' };
            }

            const isCompleted = newRemainingQty === 0;

            batch.update(doc(db, 'baan_part_requests', requestId), {
                consumedQty: newConsumedQty,
                remainingQty: newRemainingQty,
                status: isCompleted ? 'Consumption Completed' : 'Issued',
                lastConsumedAt: timestamp,
                lastConsumedBy: (user?.name || user?.id || 'System')
            });

            // Log movement
            batch.set(doc(collection(db, 'baan_inventory_movements')), {
                type: 'CONSUME',
                partNumber: request.partNo,
                quantity: consumeQty,
                requestId,
                deviceSn,
                reason,
                user: (user?.name || user?.id || 'System'),
                timestamp
            });

            await batch.commit();
            return { success: true, isCompleted };
        },
        manualCloseBaanRequest: async (requestId, user) => {
            const timestamp = new Date().toISOString();
            const batch = writeBatch(db);
            batch.update(doc(db, 'baan_part_requests', requestId), {
                status: 'Consumption Completed',
                closedManuallyAt: timestamp,
                closedManuallyBy: (user?.name || user?.id || 'System')
            });
            await batch.commit();
            return { success: true };
        },
        returnBaanParts: async (requestId, returnQty, finalConsumedQty, returnReason, user) => {
            const timestamp = new Date().toISOString();
            const batch = writeBatch(db);
            const request = store.baan.partRequests[requestId];

            if (!request) return { success: false, message: 'Request not found' };

            const reqQty = Number(request.requestedQty);
            const prevConsumedQty = Number(request.consumedQty || 0);
            const prevReturnedQty = Number(request.returnedQty || 0);

            // Audit log for manual adjustments
            if (finalConsumedQty !== prevConsumedQty) {
                batch.set(doc(collection(db, 'baan_inventory_movements')), {
                    movementType: 'ADJUSTMENT',
                    requestId,
                    partNumber: request.partNo,
                    partNo: request.partNo,
                    previousConsumedQty: prevConsumedQty,
                    newConsumedQty: finalConsumedQty,
                    reason: 'Manual adjustment during return',
                    user: (user?.name || user?.id || 'System'),
                    timestamp
                });
            }

            const newReturnedQty = prevReturnedQty + Number(returnQty);
            const newPendingQty = reqQty - finalConsumedQty - newReturnedQty;

            if (newPendingQty < 0) {
                return { success: false, message: 'Invalid return calculation. Pending quantity cannot be negative.' };
            }

            const isCompleted = newPendingQty === 0;

            // Update request
            batch.update(doc(db, 'baan_part_requests', requestId), {
                consumedQty: finalConsumedQty,
                returnedQty: newReturnedQty,
                remainingQty: newPendingQty,
                status: isCompleted ? 'Consumption Completed' : 'Issued',
                lastReturnedAt: timestamp,
                lastReturnedBy: (user?.name || user?.id || 'System')
            });

            // Restock to batches (FIFO but we just add to the most recently inwarded or a generic pool)
            const partBatches = Object.values(store.baan.batches)
                .filter(b => b.partNumber === request.partNo)
                .sort((a, b) => new Date(b.inwardDate) - new Date(a.inwardDate));

            if (partBatches.length > 0 && returnQty > 0) {
                const targetBatch = partBatches[0]; // Restock to newest batch
                batch.update(doc(db, 'baan_batches', targetBatch.id), {
                    quantityAvailable: Number(targetBatch.quantityAvailable) + Number(returnQty)
                });
            } else if (returnQty > 0) {
                const fallbackBatchId = `BAT-RET-${Date.now()}`;
                batch.set(doc(db, 'baan_batches', fallbackBatchId), {
                    id: fallbackBatchId,
                    partNumber: request.partNo,
                    partName: request.partName,
                    location: 'Return Area',
                    inwardDate: timestamp,
                    quantityTotal: Number(returnQty),
                    quantityAvailable: Number(returnQty),
                    perUnitCost: 0,
                    reference: 'Return'
                });
            }

            if (returnQty > 0) {
                // Log return movement
                batch.set(doc(collection(db, 'baan_inventory_movements')), {
                    movementType: 'RETURN',
                    partNumber: request.partNo,
                    partNo: request.partNo,
                    requestId,
                    qtyReturned: Number(returnQty),
                    returnReason,
                    returnedBy: (user?.name || user?.id || 'System'),
                    returnedAt: timestamp,
                    user: (user?.name || user?.id || 'System'),
                    timestamp
                });
            }

            await batch.commit();
            return { success: true, isCompleted };
        },
        getBaanRecommendations: async (issueCategory) => {
            if (!issueCategory) return [];

            // Logic: Analyze historical repair data
            // We'll look at all assigned part requests with this issue category
            const historicalRequests = Object.values(store.baan.partRequests)
                .filter(r => r.issueCategory === issueCategory && r.status === 'Assigned');

            const partCounts = {};
            historicalRequests.forEach(r => {
                partCounts[r.partNumber] = (partCounts[r.partNumber] || 0) + 1;
            });

            // Fallback: Also look at device history where remarks match category
            // We fetch this ON DEMAND rather than loading 100% of devices globally.
            const devSnap = await getDocs(devicesCol);
            devSnap.docs.forEach(docSnap => {
                const device = docSnap.data();
                if (!device.history) return;

                device.history.forEach((h, i) => {
                    const remarks = (h.details?.remarks || '').toLowerCase();
                    if (remarks.includes(issueCategory.toLowerCase())) {
                        // Look for a REWORK entry for this device around the same time or after
                        const reworkEntry = device.history.slice(i).find(entry => entry.stationId === 4 && entry.details?.partNo);
                        if (reworkEntry) {
                            const pn = reworkEntry.details.partNo;
                            partCounts[pn] = (partCounts[pn] || 0) + 1;
                        }
                    }
                });
            });

            const recommendations = Object.entries(partCounts)
                .map(([partNumber, count]) => ({
                    partNumber,
                    count,
                    partName: store.baan.parts[partNumber]?.name || 'Unknown Part'
                }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);

            return recommendations;
        },
        syncBaanData,
        // Phase 1 Governance & Safe Dynamic Configuration
        customRoles,
        configGov,
        hasUserPermission: (userObj, permKey) => hasPermission(userObj, permKey, customRoles),
        logAuditAction: logAdminAction,
        getSafeWorkflow: (projectId, customWorkflows) => getSafeWorkflow(projectId, customWorkflows),
        getSafeCheckpoints: (projectId, stationId, customCheckpoints) => getSafeCheckpoints(projectId, stationId, customCheckpoints),
        getSafeProjectList: (customProjects) => getSafeProjectList(customProjects),
        isDynamicConfigActive: () => isDynamicConfigActive()
    };

    return <CQAContext.Provider value={contextValue}>{children}</CQAContext.Provider>;
};

export const useCQA = () => useContext(CQAContext);

