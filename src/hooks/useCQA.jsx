import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { 
    db, storage, devicesCol, doc, setDoc, getDoc, getDocs, onSnapshot, deleteDoc, writeBatch, collection, addDoc, query, where,
    ref, uploadBytes, getDownloadURL, uploadString 
} from '../firebase';

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
        projects: { 'Device': 'Device', 'Peripherals': 'Peripherals', 'Inward QC': 'Inward QC' },
        stations: {}
    });

    // ===== SYSTEM CONFIG LISTENER =====
    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'settings', 'system_names'), (snapshot) => {
            if (snapshot.exists()) {
                setSystemNames(snapshot.data());
            }
        });
        return () => unsubscribe();
    }, []);

    // ===== MAINTENANCE MODE LISTENER =====
    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
            if (snapshot.exists()) {
                setStore(prev => ({ ...prev, settings: snapshot.data() }));
            }
        });
        return () => unsubscribe();
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

    // ===== SYSTEM CONFIG LISTENER (Lightweight) =====
    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'settings', 'system_names'), (snapshot) => {
            if (snapshot.exists()) setSystemNames(snapshot.data());
            // Signal system ready once core config is loaded
            setLoading(false);
        }, (error) => {
            console.error("System config error:", error);
            setLoading(false); // Proceed even with defaults if possible
        });
        return () => unsubscribe();
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
        
        if (unit.status === 'Scrap' || unit.status === 'Reject') {
             return { success: false, message: `Unit is ${unit.status.toUpperCase()} (Locked).` };
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
        // Try exact match first (useful for emails)
        let userRef = doc(db, 'users', uid);
        let snap = await getDoc(userRef);

        // If not found, try uppercase (standard for MES operator IDs)
        if (!snap.exists()) {
            userRef = doc(db, 'users', uid.toUpperCase());
            snap = await getDoc(userRef);
        }

        if (snap.exists() && snap.data().password === pwd) {
            return { success: true, user: { id: snap.id, ...snap.data() } };
        }
        return { success: false, message: 'Invalid credentials' };
    };

    // ─── Media Attachment Logic (Universal) ───
    const uploadProofImage = useCallback(async (base64Img, path) => {
        try {
            // Re-introduced Firebase Storage for images to prevent Firestore Document Bloat.
            // Using robust byte conversion to prevent WebView hang bugs.
            const byteString = atob(base64Img.split(',')[1]);
            const mimeString = base64Img.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
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
        const batch = writeBatch(db);
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

                const projectCategory = getProjectCategory(project);
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
                    data[doc.id] = doc.data();
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

    const contextValue = {
        store, loading, 
        getUnit: getUnitById, 
        validateScan: validateScanStatus, 
        processUnit, bulkProcessUnits, fetchStationMetrics, uploadProofImage,
        systemNames, getDisplayName, getProjectCategory, resolveActiveProject, authenticateUser,
        createUser: async (u) => setDoc(doc(db, 'users', u.id), u),
        updateUser: async (oldId, userData) => {
            if (oldId !== userData.id) {
                // ID changed: Create new and delete old
                await setDoc(doc(db, 'users', userData.id), userData);
                await deleteDoc(doc(db, 'users', oldId));
            } else {
                await setDoc(doc(db, 'users', userData.id), userData);
            }
            return { success: true };
        },
        deleteUser: async (id) => deleteDoc(doc(db, 'users', id)),
        updateSystemNames: async (newNames) => {
            await setDoc(doc(db, 'settings', 'system_names'), newNames);
            return { success: true };
        },
        purgeData: async (filters) => {
            console.log("Purging data with filters:", filters);
            try {
                const querySnapshot = await getDocs(collection(db, 'devices'));
                const batch = writeBatch(db);
                let count = 0;

                querySnapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    let shouldDelete = false;

                    // Handle legacy purge targets (strings)
                    if (typeof filters === 'string') {
                        if (filters === 'all') shouldDelete = true;
                        else if (filters === 'completed' && data.status === 'Completed') shouldDelete = true;
                        else if (filters === 'scrap' && (data.status === 'Scrap' || data.status === 'Reject')) shouldDelete = true;
                    }
                    // Handle specific filters (object)
                    else {
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
                        batch.delete(doc(db, 'devices', docSnap.id));
                        count++;
                    }
                });

                if (count > 0) {
                    await batch.commit();
                    return { success: true, count };
                }
                return { success: true, count: 0 };
            } catch (error) {
                console.error("Purge failed:", error);
                throw error;
            }
        },
        toggleMaintenanceMode: async (val) => setDoc(doc(db, 'settings', 'global'), { maintenanceMode: val }),
        requestPasswordReset: async (id) => setDoc(doc(db, 'tickets', id), { userId: id, status: 'Pending', requestedAt: new Date().toISOString() }),
        updateTicketStatus: async (id, status) => setDoc(doc(db, 'tickets', id), { status }, { merge: true }),
        resetUserPassword: async (id, pwd) => setDoc(doc(db, 'users', id), { password: pwd }, { merge: true }),
        getAuditLogs: (id) => store.devices ? [] : [], // Placeholder

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
                    const cleanLoc = (data.location || '').replace(/[^a-zA-Z0-9]/g, '');
                    const inwardId = `INW-BLK-${Date.now()}-${currentRow}-${uniqueSuffix}`;
                    
                    let batchId;
                    if (data.batchNumber && data.batchNumber.trim()) {
                        batchId = `BAT-${data.batchNumber.trim()}-${cleanLoc}-${Date.now()}-${currentRow}-${uniqueSuffix}`;
                    } else {
                        batchId = `BAT-BLK-${cleanLoc}-${Date.now()}-${currentRow}-${uniqueSuffix}`;
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
                        batchNumber: data.batchNumber || batchId,
                        uploadedBy: uploader,
                        uploadedAt: timestamp,
                        timestamp,
                        movementType: 'INWARD'
                    });

                    batch.set(doc(db, 'baan_inward_logs', inwardId), {
                        id: inwardId,
                        partNumber: data.partNo,
                        partName: data.partName,
                        location: data.location,
                        batchId: batchId,
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
                        partNumber: data.partNo,
                        partName: data.partName,
                        location: data.location,
                        inwardDate: timestamp,
                        quantityTotal: Number(data.qty),
                        quantityAvailable: Number(data.qty),
                        perUnitCost: Number(data.cost),
                        uom: data.uom,
                        minimumStockLevel: Number(data.minStock),
                        reference: data.invoice,
                        mpn: data.mpn || '',
                        batchNumber: data.batchNumber || ''
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
            const batchId = data.batchId || `BAT-${Date.now()}`;

            // Validation: One location stores only one type of part
            const otherPartInSameLoc = Object.values(store.baan.batches).find(
                b => b.location === data.location && b.partNumber !== data.partNumber && b.quantityAvailable > 0
            );
            if (otherPartInSameLoc) {
                return { success: false, message: `Location "${data.location}" is already occupied by Part "${otherPartInSameLoc.partNumber}".` };
            }

            // 1. Create Inward Log
            await setDoc(doc(db, 'baan_inward_logs', inwardId), { ...data, id: inwardId, inwardBy: (user?.name || user?.id || 'System'), timestamp });

            // 2. Create/Update Batch
            const batchRef = doc(db, 'baan_batches', batchId);
            const batchSnap = await getDoc(batchRef);
            if (batchSnap.exists()) {
                const existing = batchSnap.data();
                await setDoc(batchRef, {
                    ...existing,
                    quantityTotal: Number(existing.quantityTotal) + Number(data.quantity),
                    quantityAvailable: Number(existing.quantityAvailable) + Number(data.quantity),
                    perUnitCost: Number(data.perUnitCost || existing.perUnitCost || 0),
                    uom: data.uom || existing.uom || '',
                    minimumStockLevel: Number(data.minimumStockLevel || existing.minimumStockLevel || 0),
                    reference: data.invoiceOrDcNumber || data.reference || existing.reference || '',
                    mpn: data.mpn || existing.mpn || ''
                }, { merge: true });
            } else {
                await setDoc(batchRef, {
                    id: batchId,
                    partNumber: data.partNumber,
                    partName: data.partName,
                    location: data.location,
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
            // Rule: Internal Part Number must be unique names. 
            // We use partNumber as ID, so it's naturally unique in this collection.
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
                partNo: data.partNumber, // Support both for backward compatibility
                batchId,
                quantity: data.quantity,
                qtyAdded: Number(data.quantity),
                perUnitCost: Number(data.perUnitCost || 0),
                invoiceOrDcNumber: data.invoiceOrDcNumber || data.reference || '',
                user: (user?.name || user?.id || 'System'),
                uploadedBy: (user?.name || user?.id || 'System'),
                timestamp
            });

            return { success: true };
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
        syncBaanData
    };

    return <CQAContext.Provider value={contextValue}>{children}</CQAContext.Provider>;
};

export const useCQA = () => useContext(CQAContext);

