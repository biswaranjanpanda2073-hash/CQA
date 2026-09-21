import React, { useState, useEffect, useMemo } from 'react';
import {
    Network,
    GitFork,
    ArrowRight,
    ArrowDown,
    Plus,
    Trash2,
    Edit3,
    Save,
    CheckCircle2,
    AlertTriangle,
    RotateCcw,
    Upload,
    Download,
    Play,
    ShieldAlert,
    Layers,
    Cpu,
    ChevronUp,
    ChevronDown,
    RefreshCw,
    Sliders,
    Eye,
    Check,
    X,
    FastForward,
    Clock,
    FileText,
    History
} from 'lucide-react';
import { useCQA } from '../../hooks/useCQA.jsx';
import { db, doc, getDoc, setDoc, collection, getDocs, onSnapshot } from '../../firebase.js';
import { 
    DEFAULT_ROUTING_MATRICES,
    validateWorkflowGraph,
    moveStationSequence,
    resequenceWorkflowStations,
    createWorkflowDraft,
    resolveDynamicNextStation
} from '../../utils/workflowEngine.js';
import { PROJECT_WORKFLOWS } from '../../utils/movementEngine.js';
import { INITIAL_STATIONS } from '../../utils/configBootstrap.js';
import { logAdminAction, AUDIT_ACTIONS } from '../../utils/auditLogger.js';
import { hasPermission, PERMISSIONS } from '../../utils/rbacEngine.js';

export const WorkflowStudio = ({ user, initialProject = 'Device' }) => {
    const { getDisplayName } = useCQA();

    // Permissions
    const canView = hasPermission(user, PERMISSIONS.WORKFLOW_VIEW);
    const canEdit = hasPermission(user, PERMISSIONS.WORKFLOW_EDIT);
    const canPublish = hasPermission(user, PERMISSIONS.WORKFLOW_PUBLISH);
    const isSuperAdmin = user?.role === 'Super Admin';

    // Active Project Selection
    const [selectedProjectId, setSelectedProjectId] = useState(initialProject);
    const [projectsList, setProjectsList] = useState([
        { id: 'Device', name: 'Device' },
        { id: 'Calculator', name: 'Calculator Refurbishment' },
        { id: 'Peripherals', name: 'Peripherals' },
        { id: 'Inward QC', name: 'Inward QC' }
    ]);

    // Live Published Workflows & Draft State
    const [publishedWorkflow, setPublishedWorkflow] = useState(null);
    const [draftWorkflow, setDraftWorkflow] = useState(null);
    const [isEditingDraft, setIsEditingDraft] = useState(false);
    const [loading, setLoading] = useState(true);

    // Selected Station for Routing Configuration Modal / Drawer
    const [selectedStationId, setSelectedStationId] = useState(null);
    const [showRoutingModal, setShowRoutingModal] = useState(false);

    // Add Station Modal
    const [showAddStationModal, setShowAddStationModal] = useState(false);
    const [catalogStations, setCatalogStations] = useState([]);

    // Simulator State
    const [simStationId, setSimStationId] = useState(null);
    const [simResult, setSimResult] = useState('Pass');
    const [simOutput, setSimOutput] = useState(null);

    // Version History Modal
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [workflowVersions, setWorkflowVersions] = useState([]);

    // Feedback
    const [actionFeedback, setActionFeedback] = useState(null);
    const [isPublishing, setIsPublishing] = useState(false);

    // ─── LOAD PROJECTS LIST & STATION CATALOG ───
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                // Fetch dynamic projects if available
                const projSnap = await getDocs(collection(db, 'projects'));
                if (!projSnap.empty) {
                    const loaded = [];
                    projSnap.forEach(d => {
                        const data = d.data();
                        if (data.status !== 'Archived') {
                            loaded.push({ id: d.id, name: data.name || d.id });
                        }
                    });
                    if (loaded.length > 0) setProjectsList(loaded);
                }

                // Fetch Station Catalog
                const stSnap = await getDocs(collection(db, 'stations_master'));
                if (!stSnap.empty) {
                    const stList = [];
                    stSnap.forEach(d => stList.push({ id: d.id, ...d.data() }));
                    setCatalogStations(stList);
                } else {
                    setCatalogStations(INITIAL_STATIONS);
                }
            } catch (e) {
                console.warn('Initial data load fallback:', e);
                setCatalogStations(INITIAL_STATIONS);
            }
        };

        loadInitialData();
    }, []);

    // ─── LISTEN TO PUBLISHED WORKFLOW FOR SELECTED PROJECT ───
    useEffect(() => {
        setLoading(true);
        const wfRef = doc(db, 'project_workflows', selectedProjectId);

        const unsub = onSnapshot(wfRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setPublishedWorkflow(data);
                // If not in draft editing, update active view
                if (!isEditingDraft) {
                    setDraftWorkflow(createWorkflowDraft(selectedProjectId, data));
                }
            } else {
                // Fallback to default hardcoded workflow
                const fallbackStations = PROJECT_WORKFLOWS[selectedProjectId] || PROJECT_WORKFLOWS['Device'];
                const fallbackMatrix = DEFAULT_ROUTING_MATRICES[selectedProjectId] || DEFAULT_ROUTING_MATRICES['Device'];
                const fallbackWf = {
                    projectId: selectedProjectId,
                    version: 1,
                    status: 'Active (Fallback)',
                    stations: fallbackStations.map((s, idx) => ({
                        stationId: Number(s.id),
                        name: s.name,
                        sequence: idx + 1,
                        type: s.type || 'WIP'
                    })),
                    routingMatrix: fallbackMatrix
                };
                setPublishedWorkflow(fallbackWf);
                if (!isEditingDraft) {
                    setDraftWorkflow(createWorkflowDraft(selectedProjectId, fallbackWf));
                }
            }
            setLoading(false);
        }, (err) => {
            console.warn('Error reading project workflow:', err);
            setLoading(false);
        });

        return () => unsub();
    }, [selectedProjectId, isEditingDraft]);

    // Active workflow to render (draft if editing, otherwise published)
    const activeWorkflow = isEditingDraft ? draftWorkflow : (publishedWorkflow || draftWorkflow);

    // Graph Validation Status
    const validationResult = useMemo(() => {
        if (!activeWorkflow?.stations) return { isValid: true, errors: [], warnings: [] };
        return validateWorkflowGraph(activeWorkflow.stations, activeWorkflow.routingMatrix || {});
    }, [activeWorkflow]);

    // ─── DRAFT ACTIONS ───
    const handleStartDraft = () => {
        const initialDraft = createWorkflowDraft(selectedProjectId, publishedWorkflow);
        setDraftWorkflow(initialDraft);
        setIsEditingDraft(true);
        setActionFeedback({ type: 'info', message: 'Entered Workflow Draft mode. Changes are local until published.' });
    };

    const handleDiscardDraft = () => {
        setDraftWorkflow(createWorkflowDraft(selectedProjectId, publishedWorkflow));
        setIsEditingDraft(false);
        setActionFeedback({ type: 'info', message: 'Draft changes discarded. Restored published workflow.' });
    };

    const handleMoveStation = (fromIdx, toIdx) => {
        if (!isEditingDraft) return;
        const newStations = moveStationSequence(draftWorkflow.stations, fromIdx, toIdx);
        setDraftWorkflow(prev => ({
            ...prev,
            stations: newStations
        }));
    };

    const handleRemoveStation = (stationId) => {
        if (!isEditingDraft) return;
        const targetId = Number(stationId);
        const filtered = draftWorkflow.stations.filter(s => Number(s.stationId || s.id) !== targetId);
        const resequenced = resequenceWorkflowStations(filtered);

        // Remove from matrix
        const updatedMatrix = { ...(draftWorkflow.routingMatrix || {}) };
        delete updatedMatrix[targetId];

        setDraftWorkflow(prev => ({
            ...prev,
            stations: resequenced,
            routingMatrix: updatedMatrix
        }));

        setActionFeedback({ type: 'info', message: `Station removed from workflow draft.` });
    };

    const handleAddStationToDraft = (station) => {
        if (!isEditingDraft) return;
        const existingIds = new Set(draftWorkflow.stations.map(s => Number(s.stationId || s.id)));
        const newStId = Number(station.stationId || station.id);

        if (existingIds.has(newStId)) {
            alert(`Station "${station.name}" (ID ${newStId}) already exists in this workflow.`);
            return;
        }

        const newEntry = {
            stationId: newStId,
            name: station.name,
            code: station.code || `ST_${newStId}`,
            terminalType: station.terminalType || 'INSPECTION',
            sequence: draftWorkflow.stations.length + 1,
            type: station.type || 'WIP'
        };

        const updatedStations = [...draftWorkflow.stations, newEntry];

        // Default routing rule
        const prevStation = draftWorkflow.stations[draftWorkflow.stations.length - 1];
        const updatedMatrix = { ...(draftWorkflow.routingMatrix || {}) };
        if (prevStation && !updatedMatrix[prevStation.stationId]?.isTerminalFG) {
            updatedMatrix[prevStation.stationId] = {
                ...(updatedMatrix[prevStation.stationId] || {}),
                passTarget: newStId,
                allowedPass: Array.from(new Set([...(updatedMatrix[prevStation.stationId]?.allowedPass || []), newStId]))
            };
        }

        setDraftWorkflow(prev => ({
            ...prev,
            stations: updatedStations,
            routingMatrix: updatedMatrix
        }));

        setShowAddStationModal(false);
        setActionFeedback({ type: 'success', message: `Added "${station.name}" to workflow draft.` });
    };

    // ─── SAVE ROUTING RULE FOR A STATION ───
    const handleSaveStationRouting = (stId, updatedRule) => {
        if (!isEditingDraft) return;
        setDraftWorkflow(prev => ({
            ...prev,
            routingMatrix: {
                ...(prev.routingMatrix || {}),
                [stId]: updatedRule
            }
        }));
        setShowRoutingModal(false);
        setActionFeedback({ type: 'success', message: `Routing configuration updated for Station ID ${stId}.` });
    };

    // ─── PUBLISH WORKFLOW TO PRODUCTION ───
    const handlePublishWorkflow = async () => {
        if (!canPublish) {
            alert('Unauthorized: You do not have permission to publish workflows.');
            return;
        }

        if (!validationResult.isValid) {
            alert(`Cannot publish workflow with topological errors:\n\n${validationResult.errors.join('\n')}`);
            return;
        }

        setIsPublishing(true);
        setActionFeedback(null);

        const timestamp = new Date().toISOString();
        const newVersion = (publishedWorkflow?.version || 0) + 1;

        const payload = {
            projectId: selectedProjectId,
            version: newVersion,
            status: 'Active',
            publishedAt: timestamp,
            publishedBy: user?.name || user?.id || 'Administrator',
            publishedByRole: user?.role || 'Admin',
            stations: draftWorkflow.stations,
            routingMatrix: draftWorkflow.routingMatrix || {}
        };

        try {
            // 1. Archive previous version if exists
            if (publishedWorkflow && publishedWorkflow.version) {
                const verRef = doc(db, 'project_workflows_versions', `${selectedProjectId}_v${publishedWorkflow.version}`);
                await setDoc(verRef, {
                    ...publishedWorkflow,
                    archivedAt: timestamp
                });
            }

            // 2. Publish active workflow
            const wfRef = doc(db, 'project_workflows', selectedProjectId);
            await setDoc(wfRef, payload);

            // 3. Log to immutable audit_logs
            await logAdminAction({
                actor: user,
                action: AUDIT_ACTIONS.WORKFLOW_PUBLISHED || 'WORKFLOW_PUBLISHED',
                entity: 'workflow',
                entityId: selectedProjectId,
                project: selectedProjectId,
                reason: `Published version ${newVersion} with ${payload.stations.length} stations.`,
                previousValue: publishedWorkflow ? { version: publishedWorkflow.version, stationsCount: publishedWorkflow.stations?.length } : null,
                newValue: { version: newVersion, stationsCount: payload.stations.length }
            });

            setPublishedWorkflow(payload);
            setIsEditingDraft(false);
            setActionFeedback({
                type: 'success',
                message: `Workflow v${newVersion} for "${selectedProjectId}" published to production successfully.`
            });
        } catch (err) {
            console.error('Publish error:', err);
            setActionFeedback({ type: 'error', message: `Failed to publish workflow: ${err.message}` });
        } finally {
            setIsPublishing(false);
        }
    };

    // ─── RUN LIVE SIMULATOR ───
    const handleRunSimulation = () => {
        if (!simStationId) return;
        const result = resolveDynamicNextStation({
            projectId: selectedProjectId,
            currentStationId: Number(simStationId),
            result: simResult,
            routingMatrix: activeWorkflow.routingMatrix,
            workflowStations: activeWorkflow.stations
        });
        setSimOutput(result);
    };

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '2.5rem' }}>
            {/* Header Strip & Studio Controls */}
            <div className="card mb-4" style={{ padding: '1.25rem 1.5rem', background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <span className="status-pill info" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Dynamic MES Engine
                            </span>
                            <span className={`status-pill ${isEditingDraft ? 'warning' : 'success'}`} style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                                {isEditingDraft ? 'Draft Editing (Unpublished)' : `Live Published (v${publishedWorkflow?.version || 1})`}
                            </span>
                        </div>
                        <h2 className="font-extrabold text-xl" style={{ margin: 0, letterSpacing: '-0.01em' }}>
                            Visual Workflow & Routing Matrix Studio
                        </h2>
                        <p className="text-muted text-xs" style={{ margin: '0.2rem 0 0 0' }}>
                            Design sequence pipelines, configure Pass/Fail/Hold branch matrices, and enforce topological integrity without writing code
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Project Selector */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span className="text-xs text-muted uppercase font-bold">Project:</span>
                            <select
                                className="form-control text-xs font-bold"
                                value={selectedProjectId}
                                onChange={(e) => {
                                    if (isEditingDraft) {
                                        if (window.confirm('You have unsaved draft changes. Discard and switch project?')) {
                                            setIsEditingDraft(false);
                                            setSelectedProjectId(e.target.value);
                                        }
                                    } else {
                                        setSelectedProjectId(e.target.value);
                                    }
                                }}
                                style={{ padding: '0.35rem 0.75rem', width: 'auto' }}
                            >
                                {projectsList.map(p => (
                                    <option key={p.id} value={p.id}>{p.name || p.id}</option>
                                ))}
                            </select>
                        </div>

                        {/* Mode Controls */}
                        {!isEditingDraft ? (
                            canEdit && (
                                <button
                                    type="button"
                                    className="btn btn-primary text-xs"
                                    onClick={handleStartDraft}
                                >
                                    <Edit3 size={13} />
                                    Edit Workflow Draft
                                </button>
                            )
                        ) : (
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary text-xs"
                                    onClick={handleDiscardDraft}
                                >
                                    <RotateCcw size={13} />
                                    Discard Draft
                                </button>

                                {canPublish && (
                                    <button
                                        type="button"
                                        className="btn btn-success text-xs"
                                        onClick={handlePublishWorkflow}
                                        disabled={isPublishing || !validationResult.isValid}
                                        style={{ background: '#10b981', borderColor: '#10b981', color: '#fff' }}
                                    >
                                        <Save size={13} />
                                        {isPublishing ? 'Publishing...' : 'Publish Workflow'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Status & Feedback Alert */}
                {actionFeedback && (
                    <div className={`alert alert-${actionFeedback.type === 'error' ? 'danger' : actionFeedback.type === 'success' ? 'success' : 'info'} mt-3`} style={{ fontSize: '12px', padding: '0.5rem 0.75rem' }}>
                        {actionFeedback.message}
                    </div>
                )}
            </div>

            {/* Topological Validation Banner */}
            <div className="mb-4">
                {validationResult.isValid ? (
                    <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontSize: '12px', fontWeight: 600 }}>
                            <CheckCircle2 size={16} />
                            <span>Topological Graph Integrity: Sound (0 Routing Errors, {activeWorkflow?.stations?.length || 0} Stations Mapped)</span>
                        </div>
                        {validationResult.warnings.length > 0 && (
                            <span className="text-muted text-xs">
                                {validationResult.warnings.length} advisory warning(s)
                            </span>
                        )}
                    </div>
                ) : (
                    <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444', fontSize: '13px', fontWeight: 700, marginBottom: '0.4rem' }}>
                            <AlertTriangle size={16} />
                            <span>Graph Topological Errors ({validationResult.errors.length}):</span>
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '12px', color: '#ef4444' }}>
                            {validationResult.errors.map((err, idx) => (
                                <li key={idx}>{err}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                VISUAL WORKFLOW PIPELINE CANVAS
               ═══════════════════════════════════════════════════════════════ */}
            <div className="card mb-4" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                        <h3 className="font-bold text-base" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Network size={18} color="var(--primary)" />
                            Sequential Pipeline & Branch Routing
                        </h3>
                        <p className="text-muted text-xs" style={{ margin: '0.2rem 0 0 0' }}>
                            {isEditingDraft ? 'Drag or reorder sequence arrows, assign Pass/Fail target destinations, or add stations' : 'Currently deployed production workflow'}
                        </p>
                    </div>

                    {isEditingDraft && (
                        <button
                            type="button"
                            className="btn btn-secondary text-xs"
                            onClick={() => setShowAddStationModal(true)}
                        >
                            <Plus size={13} />
                            Add Station to Workflow
                        </button>
                    )}
                </div>

                {/* Pipeline Cards Grid / Strip */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {(activeWorkflow?.stations || []).map((station, idx) => {
                        const stId = Number(station.stationId || station.id);
                        const rule = (activeWorkflow.routingMatrix || {})[stId] || {};
                        const isTerminalFG = station.type === 'TERMINAL_FG' || rule.isTerminalFG;
                        const isTerminalScrap = station.type === 'TERMINAL_SCRAP' || rule.isTerminalScrap;
                        const isIntake = station.sequence === 1 || rule.isIntake;

                        // Target station names
                        const passTargetObj = (activeWorkflow.stations || []).find(s => Number(s.stationId || s.id) === Number(rule.passTarget));
                        const failTargetObj = (activeWorkflow.stations || []).find(s => Number(s.stationId || s.id) === Number(rule.failTarget));

                        return (
                            <div
                                key={stId}
                                style={{
                                    display: 'flex',
                                    alignItems: 'stretch',
                                    borderRadius: '10px',
                                    background: 'rgba(255, 255, 255, 0.02)',
                                    border: `1px solid ${isIntake ? 'rgba(59, 130, 246, 0.3)' : isTerminalFG ? 'rgba(16, 185, 129, 0.3)' : isTerminalScrap ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.06)'}`,
                                    overflow: 'hidden'
                                }}
                            >
                                {/* Left Color Strip / Sequence Tag */}
                                <div
                                    style={{
                                        width: '45px',
                                        background: isIntake ? '#3b82f6' : isTerminalFG ? '#10b981' : isTerminalScrap ? '#ef4444' : 'var(--border)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#fff',
                                        fontWeight: 800,
                                        fontSize: '14px'
                                    }}
                                >
                                    #{station.sequence}
                                </div>

                                {/* Main Station Information */}
                                <div style={{ flex: 1, padding: '1rem 1.25rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                                                <strong style={{ fontSize: '15px' }}>{station.name}</strong>
                                                <span className="status-pill secondary" style={{ fontSize: '10px', fontFamily: 'monospace' }}>
                                                    ID: {stId}
                                                </span>
                                                <span className={`status-pill ${isIntake ? 'info' : isTerminalFG ? 'success' : isTerminalScrap ? 'danger' : 'primary'}`} style={{ fontSize: '10px' }}>
                                                    {isIntake ? 'INTAKE (START)' : isTerminalFG ? 'TERMINAL (FG)' : isTerminalScrap ? 'TERMINAL (SCRAP)' : (station.terminalType || 'WIP')}
                                                </span>
                                            </div>

                                            {/* Branch Routing Summary */}
                                            {!isTerminalFG && !isTerminalScrap ? (
                                                <div style={{ display: 'flex', gap: '1.25rem', fontSize: '12px', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                        <span className="status-pill success" style={{ fontSize: '9px', padding: '0.15rem 0.4rem' }}>PASS</span>
                                                        <ArrowRight size={12} color="#10b981" />
                                                        <strong>{passTargetObj ? passTargetObj.name : `Station ${rule.passTarget || 'Not Configured'}`}</strong>
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                        <span className="status-pill danger" style={{ fontSize: '9px', padding: '0.15rem 0.4rem' }}>FAIL</span>
                                                        <ArrowRight size={12} color="#ef4444" />
                                                        <strong>{failTargetObj ? failTargetObj.name : `Station ${rule.failTarget || 'Not Configured'}`}</strong>
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                        <span className="status-pill warning" style={{ fontSize: '9px', padding: '0.15rem 0.4rem' }}>HOLD</span>
                                                        <ArrowRight size={12} color="#f59e0b" />
                                                        <span className="text-muted">Quarantine Block</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-muted text-xs" style={{ marginTop: '0.4rem' }}>
                                                    Terminal station — marks final disposition and completes lifecycle traveler.
                                                </div>
                                            )}
                                        </div>

                                        {/* Action Buttons for Station */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            {isEditingDraft ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary text-xs"
                                                        onClick={() => {
                                                            setSelectedStationId(stId);
                                                            setShowRoutingModal(true);
                                                        }}
                                                        title="Configure Pass/Fail Routing Rules"
                                                    >
                                                        <Sliders size={13} />
                                                        Routing Matrix
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost text-xs"
                                                        onClick={() => handleMoveStation(idx, idx - 1)}
                                                        disabled={idx === 0}
                                                        title="Move Up"
                                                        style={{ padding: '0.3rem 0.5rem' }}
                                                    >
                                                        <ChevronUp size={14} />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost text-xs"
                                                        onClick={() => handleMoveStation(idx, idx + 1)}
                                                        disabled={idx === activeWorkflow.stations.length - 1}
                                                        title="Move Down"
                                                        style={{ padding: '0.3rem 0.5rem' }}
                                                    >
                                                        <ChevronDown size={14} />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost text-xs text-danger"
                                                        onClick={() => {
                                                            if (window.confirm(`Remove "${station.name}" from workflow?`)) {
                                                                handleRemoveStation(stId);
                                                            }
                                                        }}
                                                        title="Remove Station"
                                                        style={{ padding: '0.3rem 0.5rem' }}
                                                    >
                                                        <Trash2 size={14} color="#ef4444" />
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary text-xs"
                                                    onClick={() => {
                                                        setSelectedStationId(stId);
                                                        setShowRoutingModal(true);
                                                    }}
                                                >
                                                    <Eye size={13} />
                                                    View Rules
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                LIVE ROUTING SIMULATOR (TEST BED)
               ═══════════════════════════════════════════════════════════════ */}
            <div className="card" style={{ padding: '1.5rem' }}>
                <h3 className="font-bold text-base mb-2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Play size={18} color="#10b981" />
                    Interactive Workflow Routing Simulator
                </h3>
                <p className="text-muted text-xs mb-4">
                    Verify dynamic branch behavior and allowed operator destinations in real time before deployment.
                </p>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span className="text-xs font-semibold uppercase text-muted">From Station:</span>
                        <select
                            className="form-control text-xs"
                            value={simStationId || ''}
                            onChange={(e) => setSimStationId(e.target.value)}
                            style={{ width: 'auto' }}
                        >
                            <option value="">Select origin station...</option>
                            {(activeWorkflow?.stations || []).map(s => (
                                <option key={s.stationId || s.id} value={s.stationId || s.id}>
                                    #{s.sequence} {s.name} (ID: {s.stationId || s.id})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span className="text-xs font-semibold uppercase text-muted">Scan Result:</span>
                        <select
                            className="form-control text-xs font-bold"
                            value={simResult}
                            onChange={(e) => setSimResult(e.target.value)}
                            style={{ width: 'auto' }}
                        >
                            <option value="Pass">Pass</option>
                            <option value="Fail">Fail</option>
                            <option value="Hold">Hold</option>
                        </select>
                    </div>

                    <button
                        type="button"
                        className="btn btn-primary text-xs"
                        onClick={handleRunSimulation}
                        disabled={!simStationId}
                    >
                        <Play size={12} />
                        Simulate Route
                    </button>
                </div>

                {simOutput && (
                    <div className="p-3 rounded" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', fontSize: '13px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                            <strong style={{ color: simOutput.isHold ? '#f59e0b' : '#10b981' }}>
                                {simOutput.isHold ? 'Movement Blocked (HOLD)' : `Next Destination Station: ${simOutput.nextStationName} (ID: ${simOutput.nextStationId})`}
                            </strong>
                        </div>
                        <div className="text-muted text-xs mb-2">{simOutput.reason}</div>

                        {simOutput.availableStations?.length > 1 && (
                            <div style={{ fontSize: '12px' }}>
                                <span className="font-semibold text-muted uppercase">Allowed Alternative Stations: </span>
                                {simOutput.availableStations.map(s => s.name).join(', ')}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                MODAL: CONFIGURE STATION ROUTING MATRIX
               ═══════════════════════════════════════════════════════════════ */}
            {showRoutingModal && selectedStationId && (
                <RoutingMatrixModal
                    stationId={selectedStationId}
                    allStations={activeWorkflow.stations || []}
                    currentRule={(activeWorkflow.routingMatrix || {})[selectedStationId] || {}}
                    isEditing={isEditingDraft}
                    onSave={(updated) => handleSaveStationRouting(selectedStationId, updated)}
                    onClose={() => setShowRoutingModal(false)}
                />
            )}

            {/* ═══════════════════════════════════════════════════════════════
                MODAL: ADD STATION TO WORKFLOW
               ═══════════════════════════════════════════════════════════════ */}
            {showAddStationModal && (
                <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                    <div className="card" style={{ maxWidth: 540, width: '100%', padding: '1.75rem', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 className="font-extrabold text-base" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Plus size={16} />
                                Add Station from Catalog
                            </h3>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setShowAddStationModal(false)}
                                style={{ padding: '0.25rem 0.5rem' }}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {catalogStations.map(st => {
                                    const inWorkflow = (activeWorkflow?.stations || []).some(s => Number(s.stationId || s.id) === Number(st.stationId || st.id));
                                    return (
                                        <div
                                            key={st.id}
                                            style={{
                                                padding: '0.75rem',
                                                borderRadius: '8px',
                                                background: 'rgba(255, 255, 255, 0.02)',
                                                border: '1px solid rgba(255, 255, 255, 0.06)',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '13px' }}>{st.name}</div>
                                                <div className="text-muted text-xs">Type: {st.terminalType || st.type || 'INSPECTION'} | Code: {st.code || 'N/A'}</div>
                                            </div>

                                            <button
                                                type="button"
                                                className={`btn text-xs ${inWorkflow ? 'btn-ghost' : 'btn-primary'}`}
                                                disabled={inWorkflow}
                                                onClick={() => handleAddStationToDraft(st)}
                                            >
                                                {inWorkflow ? 'Added' : 'Select'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * Sub-component Modal for configuring Station Routing Matrix
 */
const RoutingMatrixModal = ({ stationId, allStations, currentRule, isEditing, onSave, onClose }) => {
    const station = allStations.find(s => Number(s.stationId || s.id) === Number(stationId));

    const [passTarget, setPassTarget] = useState(currentRule.passTarget || '');
    const [failTarget, setFailTarget] = useState(currentRule.failTarget || '');
    const [allowedPass, setAllowedPass] = useState(currentRule.allowedPass || []);
    const [allowedFail, setAllowedFail] = useState(currentRule.allowedFail || []);
    const [isTerminalFG, setIsTerminalFG] = useState(!!currentRule.isTerminalFG || station?.type === 'TERMINAL_FG');
    const [isTerminalScrap, setIsTerminalScrap] = useState(!!currentRule.isTerminalScrap || station?.type === 'TERMINAL_SCRAP');

    const otherStations = allStations.filter(s => Number(s.stationId || s.id) !== Number(stationId));

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            passTarget: isTerminalFG || isTerminalScrap ? null : (Number(passTarget) || null),
            failTarget: isTerminalFG || isTerminalScrap ? null : (Number(failTarget) || null),
            allowedPass: isTerminalFG || isTerminalScrap ? [] : Array.from(new Set([Number(passTarget), ...allowedPass].filter(Boolean))),
            allowedFail: isTerminalFG || isTerminalScrap ? [] : Array.from(new Set([Number(failTarget), ...allowedFail].filter(Boolean))),
            isTerminalFG,
            isTerminalScrap
        });
    };

    return (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div className="card" style={{ maxWidth: 520, width: '100%', padding: '1.75rem', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 className="font-extrabold text-base" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Sliders size={16} />
                        Routing Matrix: {station?.name} (ID: {stationId})
                    </h3>
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={onClose}
                        style={{ padding: '0.25rem 0.5rem' }}
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Terminal Flags */}
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '12px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={isTerminalFG}
                                disabled={!isEditing}
                                onChange={(e) => {
                                    setIsTerminalFG(e.target.checked);
                                    if (e.target.checked) setIsTerminalScrap(false);
                                }}
                            />
                            Finished Goods Terminal (FG)
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '12px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={isTerminalScrap}
                                disabled={!isEditing}
                                onChange={(e) => {
                                    setIsTerminalScrap(e.target.checked);
                                    if (e.target.checked) setIsTerminalFG(false);
                                }}
                            />
                            Scrap / Rejection Terminal
                        </label>
                    </div>

                    {!isTerminalFG && !isTerminalScrap && (
                        <>
                            {/* Pass Target */}
                            <div className="form-group mb-3">
                                <label className="form-label text-xs font-semibold uppercase" style={{ color: '#10b981' }}>
                                    Default Next Station on PASS:
                                </label>
                                <select
                                    className="form-control text-xs"
                                    value={passTarget}
                                    disabled={!isEditing}
                                    onChange={(e) => setPassTarget(e.target.value)}
                                    required
                                >
                                    <option value="">Select target station...</option>
                                    {otherStations.map(s => (
                                        <option key={s.stationId || s.id} value={s.stationId || s.id}>
                                            #{s.sequence} {s.name} (ID: {s.stationId || s.id})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Fail Target */}
                            <div className="form-group mb-3">
                                <label className="form-label text-xs font-semibold uppercase" style={{ color: '#ef4444' }}>
                                    Default Rework / Debug Station on FAIL:
                                </label>
                                <select
                                    className="form-control text-xs"
                                    value={failTarget}
                                    disabled={!isEditing}
                                    onChange={(e) => setFailTarget(e.target.value)}
                                    required
                                >
                                    <option value="">Select target station...</option>
                                    {otherStations.map(s => (
                                        <option key={s.stationId || s.id} value={s.stationId || s.id}>
                                            #{s.sequence} {s.name} (ID: {s.stationId || s.id})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Hold Behavior Note */}
                            <div className="p-2 mb-3 rounded" style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', fontSize: '11px', color: '#f59e0b' }}>
                                <strong>HOLD Result:</strong> Always blocks station advancement and places unit under active quarantine hold.
                            </div>
                        </>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                        <button
                            type="button"
                            className="btn btn-secondary text-xs"
                            onClick={onClose}
                        >
                            Close
                        </button>

                        {isEditing && (
                            <button
                                type="submit"
                                className="btn btn-primary text-xs"
                            >
                                Apply Rule to Draft
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
};

export default WorkflowStudio;
