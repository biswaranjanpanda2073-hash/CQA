import React, { useState, useEffect, useMemo } from 'react';
import {
    Cpu,
    Plus,
    Search,
    Edit3,
    Archive,
    Check,
    X,
    RefreshCw,
    ArrowUp,
    ArrowDown,
    CheckSquare,
    Eye,
    Save,
    Trash2
} from 'lucide-react';
import { db, collection, doc, setDoc, onSnapshot, getDoc } from '../../firebase.js';
import { hasPermission, PERMISSIONS } from '../../utils/rbacEngine.js';
import { logAdminAction, AUDIT_ACTIONS } from '../../utils/auditLogger.js';
import { INITIAL_STATIONS } from '../../utils/configBootstrap.js';
import { getSafeCheckpoints } from '../../utils/configReader.js';

export const StationStudio = ({ user, initialProject = null, initialStationId = null }) => {
    const isSuperAdmin = user?.role === 'Super Admin';
    const canCreateStation = isSuperAdmin || hasPermission(user, PERMISSIONS.STATION_CREATE);
    const canEditStation = isSuperAdmin || hasPermission(user, PERMISSIONS.STATION_EDIT);
    const canArchiveStation = isSuperAdmin || hasPermission(user, PERMISSIONS.STATION_ARCHIVE);

    const canEditCheckpoints = isSuperAdmin || hasPermission(user, PERMISSIONS.CHECKPOINT_EDIT);

    // Active sub-tab: 'directory' or 'checkpoints'
    const [subTab, setSubTab] = useState('directory');

    // Station Directory State
    const [stations, setStations] = useState([]);
    const [loadingStations, setLoadingStations] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [projectFilter, setProjectFilter] = useState(initialProject || 'ALL');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');

    // Modals
    const [editingStation, setEditingStation] = useState(null); // null, 'new', or station object
    const [cloningStation, setCloningStation] = useState(null);
    const [archivingStation, setArchivingStation] = useState(null);
    const [archiveReason, setArchiveReason] = useState('');

    // Station Form Data
    const [stationFormData, setStationFormData] = useState({
        id: '',
        name: '',
        code: '',
        projectId: 'Device',
        terminalType: 'INSPECTION',
        sequence: 1,
        status: 'Active',
        description: ''
    });

    // Checkpoint Studio State
    const [selectedProject, setSelectedProject] = useState(initialProject || 'Device');
    const [selectedStationId, setSelectedStationId] = useState(initialStationId || 2);
    const [checkpointsList, setCheckpointsList] = useState([]);
    const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);
    const [hasUnsavedCheckpoints, setHasUnsavedCheckpoints] = useState(false);

    // Checkpoint Editing Modal
    const [editingCheckpoint, setEditingCheckpoint] = useState(null); // null, 'new', or { index, item }
    const [checkpointFormData, setCheckpointFormData] = useState({
        key: '',
        label: '',
        type: 'PFH',
        dataLabel: '',
        required: true,
        defectCategory: ''
    });

    // Live Checklist Tester State
    const [testChecklistValues, setTestChecklistValues] = useState({});

    // 1. Sync stations from Firestore
    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'stations_master'), (snap) => {
            if (!snap.empty) {
                const list = [];
                snap.forEach(d => list.push({ ...d.data(), id: d.id }));
                list.sort((a, b) => {
                    if (a.projectId !== b.projectId) return a.projectId.localeCompare(b.projectId);
                    return (a.sequence || 0) - (b.sequence || 0);
                });
                setStations(list);
            } else {
                setStations(INITIAL_STATIONS);
            }
            setLoadingStations(false);
        }, (err) => {
            console.warn('[StationStudio] Stations fallback to INITIAL_STATIONS:', err);
            setStations(INITIAL_STATIONS);
            setLoadingStations(false);
        });

        return () => unsub();
    }, []);

    // 2. Sync active checkpoints when selected project/station changes
    useEffect(() => {
        if (!selectedProject || !selectedStationId) return;

        setLoadingCheckpoints(true);
        const docId = `${selectedProject}_${selectedStationId}`;

        const unsub = onSnapshot(doc(db, 'station_checkpoints', docId), (snap) => {
            if (snap.exists() && Array.isArray(snap.data()?.checkpoints)) {
                setCheckpointsList(snap.data().checkpoints);
            } else {
                // Fallback to configReader fallback
                const fallback = getSafeCheckpoints(selectedProject, selectedStationId);
                setCheckpointsList(fallback || []);
            }
            setLoadingCheckpoints(false);
            setHasUnsavedCheckpoints(false);
            setTestChecklistValues({});
        }, (err) => {
            console.warn('[StationStudio] Checkpoints fallback:', err);
            const fallback = getSafeCheckpoints(selectedProject, selectedStationId);
            setCheckpointsList(fallback || []);
            setLoadingCheckpoints(false);
            setHasUnsavedCheckpoints(false);
        });

        return () => unsub();
    }, [selectedProject, selectedStationId]);

    // Available projects
    const availableProjects = useMemo(() => {
        return ['Device', 'Calculator', 'Peripherals', 'Inward QC'];
    }, []);

    // Filtered stations in directory
    const filteredStations = useMemo(() => {
        return stations.filter(s => {
            const matchesSearch = !searchTerm ||
                s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.description?.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesProject = projectFilter === 'ALL' || s.projectId === projectFilter;
            const matchesType = typeFilter === 'ALL' || s.terminalType === typeFilter;
            const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;

            return matchesSearch && matchesProject && matchesType && matchesStatus;
        });
    }, [stations, searchTerm, projectFilter, typeFilter, statusFilter]);

    // Stations available for the chosen project in Checkpoint Studio
    const stationsForCurrentProject = useMemo(() => {
        const list = stations.filter(s => s.projectId === selectedProject);
        if (list.length === 0) {
            return INITIAL_STATIONS.filter(s => s.projectId === selectedProject);
        }
        return list;
    }, [stations, selectedProject]);

    // Open Station Create Modal
    const handleOpenCreateStation = () => {
        setStationFormData({
            id: '',
            name: '',
            code: '',
            projectId: projectFilter !== 'ALL' ? projectFilter : 'Device',
            terminalType: 'INSPECTION',
            sequence: 1,
            status: 'Active',
            description: ''
        });
        setEditingStation('new');
    };

    // Open Station Edit Modal
    const handleOpenEditStation = (st) => {
        setStationFormData({
            id: st.id,
            name: st.name || '',
            code: st.code || '',
            projectId: st.projectId || 'Device',
            terminalType: st.terminalType || 'INSPECTION',
            sequence: st.sequence || 1,
            status: st.status || 'Active',
            description: st.description || ''
        });
        setEditingStation(st);
    };

    // Save Station (Create or Update)
    const handleSaveStation = async (e) => {
        e.preventDefault();
        const isNew = editingStation === 'new';

        let targetId = stationFormData.id.trim();
        if (isNew) {
            if (!targetId) {
                targetId = `${stationFormData.projectId}_${stationFormData.code || stationFormData.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
            }
            if (stations.some(s => s.id.toLowerCase() === targetId.toLowerCase())) {
                alert(`A station with ID "${targetId}" already exists.`);
                return;
            }
        }

        const payload = {
            id: targetId,
            name: stationFormData.name.trim().toUpperCase(),
            code: stationFormData.code.trim().toUpperCase(),
            projectId: stationFormData.projectId,
            terminalType: stationFormData.terminalType,
            sequence: Number(stationFormData.sequence) || 1,
            status: stationFormData.status,
            description: stationFormData.description.trim(),
            updatedAt: new Date().toISOString(),
            updatedBy: user?.name || user?.id || 'Admin'
        };

        if (isNew) {
            payload.createdAt = new Date().toISOString();
            payload.createdBy = user?.name || user?.id || 'Admin';
        }

        try {
            await setDoc(doc(db, 'stations_master', targetId), payload, { merge: true });

            await logAdminAction({
                actor: user,
                action: isNew ? AUDIT_ACTIONS.STATION_CREATED : AUDIT_ACTIONS.STATION_UPDATED,
                entity: 'station',
                entityId: targetId,
                project: stationFormData.projectId,
                previousValue: isNew ? null : editingStation,
                newValue: payload,
                reason: isNew ? 'Created station master entry' : 'Updated station configuration'
            });

            setEditingStation(null);
        } catch (err) {
            console.error('Failed to save station:', err);
            alert(`Error saving station: ${err.message}`);
        }
    };

    // Open Archive Station Modal
    const handleOpenArchiveStation = (st) => {
        setArchivingStation(st);
        setArchiveReason('');
    };

    const handleExecuteArchiveStation = async () => {
        if (!archivingStation) return;
        if (!archiveReason.trim()) {
            alert('Please provide an operational reason for archiving this station.');
            return;
        }

        try {
            const stRef = doc(db, 'stations_master', archivingStation.id);
            const updatePayload = {
                status: 'Archived',
                archivedAt: new Date().toISOString(),
                archivedBy: user?.name || user?.id || 'Admin',
                archiveReason: archiveReason.trim()
            };

            await setDoc(stRef, updatePayload, { merge: true });

            await logAdminAction({
                actor: user,
                action: AUDIT_ACTIONS.STATION_ARCHIVED,
                entity: 'station',
                entityId: archivingStation.id,
                project: archivingStation.projectId,
                previousValue: { status: archivingStation.status },
                newValue: updatePayload,
                reason: archiveReason.trim()
            });

            setArchivingStation(null);
        } catch (err) {
            console.error('Failed to archive station:', err);
            alert(`Error archiving station: ${err.message}`);
        }
    };

    // Open Checkpoint Add/Edit Modal
    const handleOpenAddCheckpoint = () => {
        setCheckpointFormData({
            key: '',
            label: '',
            type: 'PFH',
            dataLabel: '',
            required: true,
            defectCategory: ''
        });
        setEditingCheckpoint('new');
    };

    const handleOpenEditCheckpoint = (cp, idx) => {
        setCheckpointFormData({
            key: cp.key || '',
            label: cp.label || '',
            type: cp.type || 'PFH',
            dataLabel: cp.dataLabel || '',
            required: cp.required !== false,
            defectCategory: cp.defectCategory || ''
        });
        setEditingCheckpoint({ index: idx, item: cp });
    };

    // Save Checkpoint item to local state list
    const handleSaveCheckpointItem = (e) => {
        e.preventDefault();
        let targetKey = checkpointFormData.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (!targetKey) {
            targetKey = checkpointFormData.label.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        }

        const newCp = {
            key: targetKey,
            label: checkpointFormData.label.trim(),
            type: checkpointFormData.type,
            required: checkpointFormData.required,
            ...(checkpointFormData.type === 'DATA' ? { dataLabel: checkpointFormData.dataLabel.trim() || 'Value' } : {}),
            ...(checkpointFormData.defectCategory ? { defectCategory: checkpointFormData.defectCategory.trim() } : {})
        };

        if (editingCheckpoint === 'new') {
            if (checkpointsList.some(c => c.key === targetKey)) {
                alert(`A checkpoint with key "${targetKey}" already exists.`);
                return;
            }
            setCheckpointsList(prev => [...prev, newCp]);
        } else {
            const idx = editingCheckpoint.index;
            setCheckpointsList(prev => {
                const next = [...prev];
                next[idx] = newCp;
                return next;
            });
        }

        setHasUnsavedCheckpoints(true);
        setEditingCheckpoint(null);
    };

    // Checkpoint reordering
    const handleMoveCheckpoint = (idx, direction) => {
        if (direction === 'up' && idx === 0) return;
        if (direction === 'down' && idx === checkpointsList.length - 1) return;

        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        setCheckpointsList(prev => {
            const next = [...prev];
            const temp = next[idx];
            next[idx] = next[targetIdx];
            next[targetIdx] = temp;
            return next;
        });
        setHasUnsavedCheckpoints(true);
    };

    // Delete checkpoint
    const handleDeleteCheckpoint = (idx) => {
        if (!window.confirm(`Remove checkpoint "${checkpointsList[idx].label}"?`)) return;
        setCheckpointsList(prev => prev.filter((_, i) => i !== idx));
        setHasUnsavedCheckpoints(true);
    };

    // Save Entire Checkpoint List to Firestore
    const handlePublishCheckpoints = async () => {
        const docId = `${selectedProject}_${selectedStationId}`;
        try {
            const cpRef = doc(db, 'station_checkpoints', docId);
            const prevSnap = await getDoc(cpRef);
            const prevList = prevSnap.exists() ? prevSnap.data()?.checkpoints : [];

            const payload = {
                id: docId,
                projectId: selectedProject,
                stationId: Number(selectedStationId),
                version: (prevSnap.data()?.version || 1) + 1,
                status: 'Active',
                publishedAt: new Date().toISOString(),
                publishedBy: user?.name || user?.id || 'Admin',
                checkpoints: checkpointsList.map((c, i) => ({
                    ...c,
                    order: i + 1
                }))
            };

            await setDoc(cpRef, payload, { merge: true });

            await logAdminAction({
                actor: user,
                action: AUDIT_ACTIONS.CHECKPOINT_PUBLISHED,
                entity: 'checkpoint',
                entityId: docId,
                project: selectedProject,
                previousValue: { checkpoints: prevList },
                newValue: payload,
                reason: `Published updated checklist for ${selectedProject} station ${selectedStationId}`
            });

            setHasUnsavedCheckpoints(false);
            alert(`Checklist published successfully for ${selectedProject} station ${selectedStationId}!`);
        } catch (err) {
            console.error('Failed to publish checkpoints:', err);
            alert(`Error publishing checkpoints: ${err.message}`);
        }
    };

    // Navigate to Checkpoint Studio from a station card
    const handleManageStationCheckpoints = (st) => {
        setSelectedProject(st.projectId);
        setSelectedStationId(st.stationId || Number(st.id.split('_')[1]) || 1);
        setSubTab('checkpoints');
    };

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '2.5rem' }}>
            {/* Top Sub-Tab Navigation Bar */}
            <div className="card mb-4" style={{ padding: '0.75rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="flex-center" style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'rgba(8, 145, 178, 0.12)', color: '#0891b2' }}>
                            <Cpu size={20} />
                        </div>
                        <div>
                            <h2 className="font-extrabold text-lg" style={{ margin: 0 }}>
                                Station Master & Quality Checkpoint Studio
                            </h2>
                            <p className="text-muted text-xs" style={{ margin: 0 }}>
                                Configure plant station definitions, terminal roles, and live dynamic quality inspection criteria
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem', background: 'var(--bg-main)', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
                        <button
                            className={`btn-ghost ${subTab === 'directory' ? 'font-bold' : ''}`}
                            onClick={() => setSubTab('directory')}
                            style={{
                                padding: '0.45rem 0.85rem',
                                fontSize: '0.8125rem',
                                borderRadius: 'var(--radius-sm)',
                                background: subTab === 'directory' ? 'var(--bg-card)' : 'transparent',
                                color: subTab === 'directory' ? 'var(--primary)' : 'var(--text-muted)',
                                boxShadow: subTab === 'directory' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                            }}
                        >
                            <Cpu size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
                            Station Directory ({stations.length})
                        </button>

                        <button
                            className={`btn-ghost ${subTab === 'checkpoints' ? 'font-bold' : ''}`}
                            onClick={() => setSubTab('checkpoints')}
                            style={{
                                padding: '0.45rem 0.85rem',
                                fontSize: '0.8125rem',
                                borderRadius: 'var(--radius-sm)',
                                background: subTab === 'checkpoints' ? 'var(--bg-card)' : 'transparent',
                                color: subTab === 'checkpoints' ? 'var(--primary)' : 'var(--text-muted)',
                                boxShadow: subTab === 'checkpoints' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                            }}
                        >
                            <CheckSquare size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
                            Checkpoint Studio
                        </button>
                    </div>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════ */}
            {/* SUB-TAB 1: STATION MASTER DIRECTORY                           */}
            {/* ═════════════════════════════════════════════════════════════ */}
            {subTab === 'directory' && (
                <div>
                    {/* Controls & Filter Bar */}
                    <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                            <div style={{ flex: 1, minWidth: 260, position: 'relative' }}>
                                <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Search stations by name, code, or description..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{ paddingLeft: '2.2rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                {/* Project filter */}
                                <select
                                    className="form-control"
                                    value={projectFilter}
                                    onChange={(e) => setProjectFilter(e.target.value)}
                                    style={{ padding: '0.4rem 0.65rem', fontSize: '0.75rem', width: 'auto' }}
                                >
                                    <option value="ALL">All Projects</option>
                                    {availableProjects.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>

                                {/* Terminal Type filter */}
                                <select
                                    className="form-control"
                                    value={typeFilter}
                                    onChange={(e) => setTypeFilter(e.target.value)}
                                    style={{ padding: '0.4rem 0.65rem', fontSize: '0.75rem', width: 'auto' }}
                                >
                                    <option value="ALL">All Terminal Types</option>
                                    <option value="INSPECTION">INSPECTION</option>
                                    <option value="REPAIR_DEBUG">REPAIR / DEBUG</option>
                                    <option value="PACKAGING">PACKAGING</option>
                                    <option value="RECEIVING">RECEIVING</option>
                                    <option value="SCRAP_REVIEW">SCRAP REVIEW</option>
                                    <option value="GENERIC_QC">GENERIC QC</option>
                                </select>

                                {canCreateStation && (
                                    <button className="btn btn-primary" onClick={handleOpenCreateStation} style={{ fontSize: '0.8125rem' }}>
                                        <Plus size={15} />
                                        <span>Create Station</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Stations Grid */}
                    {loadingStations ? (
                        <div className="card p-8 text-center">
                            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
                            <p className="text-muted text-sm">Loading station masters...</p>
                        </div>
                    ) : filteredStations.length === 0 ? (
                        <div className="card p-8 text-center">
                            <Cpu size={36} style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }} />
                            <h3 className="font-bold text-base mb-1">No Stations Match Filters</h3>
                            <p className="text-muted text-xs">Try selecting a different project or clearing the search</p>
                        </div>
                    ) : (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '18px',
                            width: '100%'
                        }}>
                            {filteredStations.map(st => {
                                const isArchived = st.status === 'Archived';

                                return (
                                    <div
                                        key={st.id}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            opacity: isArchived ? 0.75 : 1,
                                            border: '1px solid var(--border)',
                                            borderRadius: 'var(--radius-lg)',
                                            background: 'var(--bg-card)',
                                            boxShadow: 'var(--shadow-sm)',
                                            width: '100%',
                                            overflow: 'hidden',
                                            transition: 'box-shadow 0.2s ease, border-color 0.2s ease'
                                        }}
                                    >
                                        {/* Row 1: All info inline — Tags + Name + Role + Status */}
                                        <div style={{
                                            padding: '0.85rem 1.25rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.65rem',
                                            flexWrap: 'wrap',
                                            borderBottom: '1px solid var(--border-light)'
                                        }}>
                                            <span style={{
                                                background: 'var(--bg-main)',
                                                border: '1px solid var(--border)',
                                                borderRadius: 'var(--radius-sm)',
                                                padding: '2px 6px',
                                                fontSize: '11px',
                                                fontFamily: 'monospace',
                                                fontWeight: 700,
                                                color: '#0891b2',
                                                flexShrink: 0
                                            }}>
                                                {st.code || 'STN'}
                                            </span>
                                            <span className="status-pill" style={{ fontSize: '10px', background: 'rgba(8, 145, 178, 0.12)', color: '#0891b2', flexShrink: 0 }}>
                                                {st.projectId}
                                            </span>
                                            <span className="status-pill default" style={{ fontSize: '10px', flexShrink: 0 }}>
                                                SEQ: {st.sequence || 1}
                                            </span>
                                            <span className="font-extrabold text-base" style={{ flex: 1, minWidth: 100 }}>
                                                {st.name}
                                            </span>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '0.35rem',
                                                background: 'var(--bg-main)', border: '1px solid var(--border-light)',
                                                borderRadius: 'var(--radius-sm)', padding: '3px 10px',
                                                fontSize: '0.7rem', flexShrink: 0
                                            }}>
                                                <span className="text-muted font-bold">Role:</span>
                                                <span className="font-bold font-mono" style={{ color: 'var(--text-main)' }}>
                                                    {st.terminalType || 'INSPECTION'}
                                                </span>
                                            </div>
                                            <span className={`status-pill ${isArchived ? 'default' : 'success'}`} style={{ fontSize: '10px', flexShrink: 0 }}>
                                                {st.status || 'Active'}
                                            </span>
                                        </div>


                                        {/* Row 2: Description + Actions */}
                                        <div style={{
                                            padding: '0.55rem 1.25rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '1rem',
                                            background: 'var(--bg-main)'
                                        }}>
                                            <p className="text-muted text-xs" style={{ margin: 0, lineHeight: 1.5, flex: 1 }}>
                                                {st.description || 'No description provided.'}
                                            </p>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.1rem', flexShrink: 0 }}>
                                                {canEditStation && (
                                                    <button className="btn-ghost" title="Edit Station Definition" onClick={() => handleOpenEditStation(st)} style={{ padding: '0.3rem', borderRadius: 'var(--radius-sm)' }}>
                                                        <Edit3 size={13} />
                                                    </button>
                                                )}
                                                {canArchiveStation && !isArchived && (
                                                    <button className="btn-ghost" title="Archive Station" onClick={() => handleOpenArchiveStation(st)} style={{ padding: '0.3rem', borderRadius: 'var(--radius-sm)', color: 'var(--error)' }}>
                                                        <Archive size={13} />
                                                    </button>
                                                )}
                                                <div style={{ width: '1px', height: '14px', background: 'var(--border)', margin: '0 0.2rem' }} />
                                                <button className="btn-ghost text-xs font-bold" onClick={() => handleManageStationCheckpoints(st)} style={{ color: '#0891b2', padding: '0.25rem 0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <CheckSquare size={12} />
                                                    Checkpoints →
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════ */}
            {/* SUB-TAB 2: CHECKPOINT & QUALITY CRITERIA STUDIO               */}
            {/* ═════════════════════════════════════════════════════════════ */}
            {subTab === 'checkpoints' && (
                <div>
                    {/* Project & Station Selector Header */}
                    <div className="card mb-4" style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div>
                                    <label className="form-label text-xs font-bold">Project</label>
                                    <select
                                        className="form-control"
                                        value={selectedProject}
                                        onChange={(e) => setSelectedProject(e.target.value)}
                                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.8125rem' }}
                                    >
                                        {availableProjects.map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="form-label text-xs font-bold">Station</label>
                                    <select
                                        className="form-control"
                                        value={selectedStationId}
                                        onChange={(e) => setSelectedStationId(Number(e.target.value))}
                                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.8125rem', minWidth: 240 }}
                                    >
                                        {stationsForCurrentProject.map(s => {
                                            const stNum = s.stationId || Number(s.id.split('_')[1]) || s.sequence || 1;
                                            return (
                                                <option key={s.id} value={stNum}>
                                                    Station {stNum}: {s.name}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                {canEditCheckpoints && (
                                    <>
                                        <button className="btn btn-secondary" onClick={handleOpenAddCheckpoint} style={{ fontSize: '0.8125rem' }}>
                                            <Plus size={15} />
                                            <span>Add Checkpoint</span>
                                        </button>
                                        <button
                                            className="btn btn-primary"
                                            onClick={handlePublishCheckpoints}
                                            style={{
                                                fontSize: '0.8125rem',
                                                boxShadow: hasUnsavedCheckpoints ? '0 0 10px rgba(22, 101, 52, 0.4)' : 'none'
                                            }}
                                        >
                                            <Save size={15} />
                                            <span>Publish Checklist {hasUnsavedCheckpoints && '(Unsaved)'}</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Checkpoints Main Panel: Studio List (Left) + Interactive Live Preview (Right) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem' }}>
                        {/* LEFT: Checkpoint Configuration List */}
                        <div className="card" style={{ padding: '1.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <div>
                                    <h3 className="font-extrabold text-base" style={{ margin: 0 }}>
                                        Quality Criteria List ({checkpointsList.length})
                                    </h3>
                                    <span className="text-muted text-xs">
                                        Drag or use arrow controls to reorder execution sequence
                                    </span>
                                </div>
                            </div>

                            {loadingCheckpoints ? (
                                <div className="p-8 text-center">
                                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
                                    <p className="text-muted text-sm">Loading checkpoints...</p>
                                </div>
                            ) : checkpointsList.length === 0 ? (
                                <div className="p-8 text-center" style={{ background: 'var(--bg-main)', borderRadius: 'var(--radius-md)' }}>
                                    <CheckSquare size={32} style={{ margin: '0 auto 0.75rem', color: 'var(--text-muted)' }} />
                                    <p className="font-bold text-sm mb-1">No Checkpoints Configured</p>
                                    <p className="text-muted text-xs mb-3">Units at this station pass through without mandatory checklists</p>
                                    {canEditCheckpoints && (
                                        <button className="btn btn-primary" onClick={handleOpenAddCheckpoint} style={{ fontSize: '0.75rem' }}>
                                            <Plus size={14} /> Add First Checkpoint
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                    {checkpointsList.map((cp, idx) => {
                                        return (
                                            <div
                                                key={cp.key || idx}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '0.75rem 0.85rem',
                                                    background: 'var(--bg-main)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: 'var(--radius-md)',
                                                    gap: '0.75rem'
                                                }}
                                            >
                                                {/* Reorder Buttons */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <button
                                                        className="btn-ghost"
                                                        disabled={idx === 0}
                                                        onClick={() => handleMoveCheckpoint(idx, 'up')}
                                                        style={{ padding: '2px', opacity: idx === 0 ? 0.3 : 1 }}
                                                    >
                                                        <ArrowUp size={13} />
                                                    </button>
                                                    <button
                                                        className="btn-ghost"
                                                        disabled={idx === checkpointsList.length - 1}
                                                        onClick={() => handleMoveCheckpoint(idx, 'down')}
                                                        style={{ padding: '2px', opacity: idx === checkpointsList.length - 1 ? 0.3 : 1 }}
                                                    >
                                                        <ArrowDown size={13} />
                                                    </button>
                                                </div>

                                                {/* Checkpoint Info */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                                                        <span style={{
                                                            fontSize: '10px',
                                                            fontFamily: 'monospace',
                                                            fontWeight: 700,
                                                            color: 'var(--text-muted)'
                                                        }}>
                                                            #{idx + 1}
                                                        </span>
                                                        <span className="status-pill" style={{
                                                            fontSize: '9px',
                                                            background: cp.type === 'PFH' ? 'rgba(22, 101, 52, 0.12)' : cp.type === 'DATA' ? 'rgba(124, 58, 237, 0.12)' : 'rgba(2, 132, 199, 0.12)',
                                                            color: cp.type === 'PFH' ? 'var(--primary)' : cp.type === 'DATA' ? '#7c3aed' : '#0284c7'
                                                        }}>
                                                            {cp.type}
                                                        </span>
                                                        {cp.required && (
                                                            <span className="status-pill warning" style={{ fontSize: '9px' }}>
                                                                Required
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="font-bold text-sm truncate">{cp.label}</div>
                                                    <div className="text-muted text-xs font-mono">key: {cp.key}</div>
                                                </div>

                                                {/* Actions */}
                                                {canEditCheckpoints && (
                                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                        <button
                                                            className="btn-ghost"
                                                            title="Edit Checkpoint"
                                                            onClick={() => handleOpenEditCheckpoint(cp, idx)}
                                                            style={{ padding: '0.35rem' }}
                                                        >
                                                            <Edit3 size={14} />
                                                        </button>
                                                        <button
                                                            className="btn-ghost"
                                                            title="Delete Checkpoint"
                                                            onClick={() => handleDeleteCheckpoint(idx)}
                                                            style={{ padding: '0.35rem', color: 'var(--error)' }}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* RIGHT: Live Interactive Terminal Checklist Preview */}
                        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Eye size={18} color="var(--primary)" />
                                    <h3 className="font-extrabold text-base" style={{ margin: 0 }}>
                                        Interactive Terminal Preview
                                    </h3>
                                </div>
                                <span className="status-pill primary" style={{ fontSize: '10px' }}>
                                    Live Rendering
                                </span>
                            </div>

                            <p className="text-muted text-xs mb-3">
                                Test how shop-floor line operators will interact with this checkpoint criteria in their execution terminal.
                            </p>

                            <div style={{
                                flex: 1,
                                background: 'var(--bg-main)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)',
                                padding: '1rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.75rem',
                                maxHeight: '550px',
                                overflowY: 'auto'
                            }}>
                                {checkpointsList.length === 0 ? (
                                    <div className="text-center text-muted text-xs p-6">
                                        No checkpoints to preview
                                    </div>
                                ) : (
                                    checkpointsList.map((cp) => {
                                        const currentVal = testChecklistValues[cp.key];

                                        return (
                                            <div
                                                key={cp.key}
                                                style={{
                                                    background: 'var(--bg-card)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: 'var(--radius-sm)',
                                                    padding: '0.65rem 0.85rem'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                                    <span className="font-bold text-xs">
                                                        {cp.label} {cp.required && <span style={{ color: 'var(--error)' }}>*</span>}
                                                    </span>
                                                    <span className="text-muted font-mono" style={{ fontSize: '10px' }}>
                                                        {cp.type}
                                                    </span>
                                                </div>

                                                {/* PFH (Pass / Fail / Hold) 3-state radio */}
                                                {cp.type === 'PFH' && (
                                                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                                                        {['PASS', 'FAIL', 'HOLD'].map(val => {
                                                            const isSelected = currentVal === val;
                                                            return (
                                                                <button
                                                                    key={val}
                                                                    type="button"
                                                                    onClick={() => setTestChecklistValues(p => ({ ...p, [cp.key]: val }))}
                                                                    style={{
                                                                        flex: 1,
                                                                        padding: '0.35rem 0.5rem',
                                                                        fontSize: '11px',
                                                                        fontWeight: 700,
                                                                        borderRadius: 'var(--radius-sm)',
                                                                        border: '1px solid',
                                                                        borderColor: isSelected
                                                                            ? val === 'PASS' ? 'var(--success)' : val === 'FAIL' ? 'var(--error)' : 'var(--warning)'
                                                                            : 'var(--border)',
                                                                        background: isSelected
                                                                            ? val === 'PASS' ? 'rgba(22, 101, 52, 0.15)' : val === 'FAIL' ? 'rgba(153, 27, 27, 0.15)' : 'rgba(202, 138, 4, 0.15)'
                                                                            : 'var(--bg-main)',
                                                                        color: isSelected
                                                                            ? val === 'PASS' ? 'var(--success)' : val === 'FAIL' ? 'var(--error)' : 'var(--warning)'
                                                                            : 'var(--text-muted)',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    {val}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* DATA (Numeric value) */}
                                                {cp.type === 'DATA' && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <input
                                                            type="text"
                                                            className="form-control"
                                                            placeholder={cp.dataLabel || 'Enter value...'}
                                                            value={currentVal || ''}
                                                            onChange={(e) => setTestChecklistValues(p => ({ ...p, [cp.key]: e.target.value }))}
                                                            style={{ fontSize: '11px', padding: '0.35rem 0.55rem' }}
                                                        />
                                                    </div>
                                                )}

                                                {/* TEXT note */}
                                                {cp.type === 'TEXT' && (
                                                    <input
                                                        type="text"
                                                        className="form-control"
                                                        placeholder="Enter mandatory note..."
                                                        value={currentVal || ''}
                                                        onChange={(e) => setTestChecklistValues(p => ({ ...p, [cp.key]: e.target.value }))}
                                                        style={{ fontSize: '11px', padding: '0.35rem 0.55rem' }}
                                                    />
                                                )}

                                                {/* BOOL toggle */}
                                                {cp.type === 'BOOL' && (
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '11px', cursor: 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={!!currentVal}
                                                            onChange={(e) => setTestChecklistValues(p => ({ ...p, [cp.key]: e.target.checked }))}
                                                        />
                                                        <span>Checked / Verified</span>
                                                    </label>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── MODAL: CREATE / EDIT STATION ─── */}
            {editingStation && (
                <div className="modal-overlay" onClick={() => setEditingStation(null)}>
                    <div className="card modal-box animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Cpu size={20} color="#0891b2" />
                                <h3 className="font-extrabold text-lg" style={{ margin: 0 }}>
                                    {editingStation === 'new' ? 'Create Station Master' : 'Edit Station Configuration'}
                                </h3>
                            </div>
                            <button className="btn-ghost" onClick={() => setEditingStation(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveStation}>
                            <div className="form-row">
                                <div>
                                    <label className="form-label text-xs font-bold">Station Name *</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        required
                                        placeholder="e.g. HARDWARE QC"
                                        value={stationFormData.name}
                                        onChange={(e) => setStationFormData(p => ({ ...p, name: e.target.value.toUpperCase() }))}
                                    />
                                </div>
                                <div>
                                    <label className="form-label text-xs font-bold">Station Code *</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        required
                                        maxLength={8}
                                        placeholder="e.g. HWQC"
                                        value={stationFormData.code}
                                        onChange={(e) => setStationFormData(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div>
                                    <label className="form-label text-xs font-bold">Project Association *</label>
                                    <select
                                        className="form-control"
                                        value={stationFormData.projectId}
                                        onChange={(e) => setStationFormData(p => ({ ...p, projectId: e.target.value }))}
                                    >
                                        {availableProjects.map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="form-label text-xs font-bold">Terminal Role Type *</label>
                                    <select
                                        className="form-control"
                                        value={stationFormData.terminalType}
                                        onChange={(e) => setStationFormData(p => ({ ...p, terminalType: e.target.value }))}
                                    >
                                        <option value="INSPECTION">INSPECTION</option>
                                        <option value="REPAIR_DEBUG">REPAIR / DEBUG</option>
                                        <option value="PACKAGING">PACKAGING</option>
                                        <option value="RECEIVING">RECEIVING</option>
                                        <option value="SCRAP_REVIEW">SCRAP REVIEW</option>
                                        <option value="GENERIC_QC">GENERIC QC</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-row">
                                <div>
                                    <label className="form-label text-xs font-bold">Sequence Order *</label>
                                    <input
                                        type="number"
                                        className="form-control"
                                        required
                                        min={1}
                                        max={99}
                                        value={stationFormData.sequence}
                                        onChange={(e) => setStationFormData(p => ({ ...p, sequence: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="form-label text-xs font-bold">Status *</label>
                                    <select
                                        className="form-control"
                                        value={stationFormData.status}
                                        onChange={(e) => setStationFormData(p => ({ ...p, status: e.target.value }))}
                                    >
                                        <option value="Active">Active</option>
                                        <option value="Draft">Draft</option>
                                        <option value="Archived">Archived</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginBottom: 0 }}>
                                <label className="form-label text-xs font-bold">Description</label>
                                <textarea
                                    className="form-control"
                                    rows={2}
                                    placeholder="Operational function and criteria..."
                                    value={stationFormData.description}
                                    onChange={(e) => setStationFormData(p => ({ ...p, description: e.target.value }))}
                                />
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setEditingStation(null)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingStation === 'new' ? 'Create Station' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── MODAL: ARCHIVE STATION ─── */}
            {archivingStation && (
                <div className="modal-overlay" onClick={() => setArchivingStation(null)}>
                    <div className="card modal-box animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', color: 'var(--error)' }}>
                            <Archive size={24} />
                            <h3 className="font-extrabold text-lg" style={{ margin: 0 }}>
                                Archive Station Definition
                            </h3>
                        </div>

                        <p className="text-muted text-xs mb-3" style={{ lineHeight: 1.6 }}>
                            Are you sure you want to archive <strong>{archivingStation.name}</strong>?
                            Archiving removes this station from new workflow routes while preserving all historical movement records.
                        </p>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <label className="form-label text-xs font-bold">Operational Reason *</label>
                            <textarea
                                className="form-control"
                                rows={3}
                                required
                                placeholder="State reason for audit log..."
                                value={archiveReason}
                                onChange={(e) => setArchiveReason(e.target.value)}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setArchivingStation(null)}>
                                Cancel
                            </button>
                            <button type="button" className="btn btn-error" onClick={handleExecuteArchiveStation}>
                                Confirm Archive
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── MODAL: ADD / EDIT CHECKPOINT ─── */}
            {editingCheckpoint && (
                <div className="modal-overlay" onClick={() => setEditingCheckpoint(null)}>
                    <div className="card modal-box animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <CheckSquare size={20} color="var(--primary)" />
                                <h3 className="font-extrabold text-lg" style={{ margin: 0 }}>
                                    {editingCheckpoint === 'new' ? 'Add Checkpoint Criteria' : 'Edit Checkpoint'}
                                </h3>
                            </div>
                            <button className="btn-ghost" onClick={() => setEditingCheckpoint(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveCheckpointItem}>
                            <div style={{ marginBottom: '0.75rem' }}>
                                <label className="form-label text-xs font-bold">Checkpoint Label *</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    required
                                    placeholder="e.g. Display Segment Check"
                                    value={checkpointFormData.label}
                                    onChange={(e) => setCheckpointFormData(p => ({ ...p, label: e.target.value }))}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                <div>
                                    <label className="form-label text-xs font-bold">Input Type *</label>
                                    <select
                                        className="form-control"
                                        value={checkpointFormData.type}
                                        onChange={(e) => setCheckpointFormData(p => ({ ...p, type: e.target.value }))}
                                    >
                                        <option value="PFH">PFH (Pass / Fail / Hold)</option>
                                        <option value="DATA">DATA (Numeric measurement)</option>
                                        <option value="BOOL">BOOL (Yes / No toggle)</option>
                                        <option value="TEXT">TEXT (Mandatory note)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="form-label text-xs font-bold">Unique Key</label>
                                    <input
                                        type="text"
                                        className="form-control font-mono"
                                        placeholder="Auto from label"
                                        value={checkpointFormData.key}
                                        onChange={(e) => setCheckpointFormData(p => ({ ...p, key: e.target.value }))}
                                    />
                                </div>
                            </div>

                            {checkpointFormData.type === 'DATA' && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <label className="form-label text-xs font-bold">Data Field Label *</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="e.g. VBAT Value (V) or Multiplexer Reading"
                                        value={checkpointFormData.dataLabel}
                                        onChange={(e) => setCheckpointFormData(p => ({ ...p, dataLabel: e.target.value }))}
                                    />
                                </div>
                            )}

                            <div style={{ marginBottom: '1.25rem' }}>
                                <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={checkpointFormData.required}
                                        onChange={(e) => setCheckpointFormData(p => ({ ...p, required: e.target.checked }))}
                                    />
                                    <span>Mandatory Check (Operator cannot submit station without completing this)</span>
                                </label>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setEditingCheckpoint(null)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingCheckpoint === 'new' ? 'Add to Checklist' : 'Update Checkpoint'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StationStudio;
