import React, { useState, useMemo, useEffect } from 'react';
import {
    Search,
    History,
    ClipboardList,
    Package,
    ShieldCheck,
    Cpu,
    Calendar,
    User,
    ChevronRight,
    ArrowRight,
    Info,
    Activity,
    FileText,
    Loader2,
    Database,
    CheckCircle2,
    Clock,
    Scan,
    RefreshCw,
    Check,
    X,
    XCircle,
    AlertTriangle,
    ShieldAlert,
    Camera,
    Image as ImageIcon,
    FastForward,
    Layers,
    RotateCcw,
    Smartphone,
    Printer,
    Wrench,
    Factory,
    Zap
} from 'lucide-react';

import { useCQA } from '../hooks/useCQA';
import QRScanner from './QRScanner';

// ─── Stage Progression Tracker ───
const DEVICE_FLOW = ['Receiving', 'Inspection', 'Debug', 'Rework', 'Final QC', 'Packing', 'FG'];
const PERIPHERAL_FLOW = ['Receiving', 'QC', 'FG'];
const INWARD_FLOW = ['Receiving', 'IQC', 'FG'];
const CALCULATOR_FLOW = ['Receiving', 'Initial QC', 'Looper Analysis', 'Hardware QC', 'Hardware Rework', 'Assembly', 'Firmware QC', 'Packing', 'FG'];

const PROJECT_METADATA = [
    {
        id: 'Device',
        name: 'Device',
        tag: '7 Flow Stations',
        color: '#2563eb',
        bgAlpha: 'rgba(37, 99, 235, 0.08)',
        borderAlpha: 'rgba(37, 99, 235, 0.25)',
        icon: Smartphone,
        description: 'Smart POS & payment devices, multi-stage inspection, debug diagnostics, and rework history.'
    },
    {
        id: 'Peripherals',
        name: 'Peripherals',
        tag: '4 QC Stations',
        color: '#0891b2',
        bgAlpha: 'rgba(8, 145, 178, 0.08)',
        borderAlpha: 'rgba(8, 145, 178, 0.25)',
        icon: Printer,
        description: 'Thermal printers, chargers, scanning accessories, quality control verification, and rejection logs.'
    },
    {
        id: 'Inward QC',
        name: 'Inward QC',
        tag: '4 IQC Stations',
        color: '#7c3aed',
        bgAlpha: 'rgba(124, 58, 237, 0.08)',
        borderAlpha: 'rgba(124, 58, 237, 0.25)',
        icon: ShieldCheck,
        description: 'Incoming shipment inspection, component-level testing, lot verification, and raw material IQC.'
    },
    {
        id: 'Calculator',
        name: 'Calculator',
        tag: '10 Refurb Stations',
        color: '#16a34a',
        bgAlpha: 'rgba(22, 163, 74, 0.08)',
        borderAlpha: 'rgba(22, 163, 74, 0.25)',
        icon: Wrench,
        description: 'Reverse device refurbishment, PCBA debugging, rework logging, firmware QC, and scrap analysis.'
    }
];

const StageProgressionTracker = ({ history = [], project, getDisplayName, hideLabels = false }) => {
    const projCategory = (project || '').trim();
    const flow = projCategory === 'Peripherals' ? PERIPHERAL_FLOW :
        projCategory === 'Inward QC' ? INWARD_FLOW :
        projCategory === 'Calculator' ? CALCULATOR_FLOW : DEVICE_FLOW;

    const completedStages = new Set();
    const skippedStages = new Set();
    let currentStage = null;

    const latestLooper = Math.max(...(history || []).map(h => h.looper || 1), 1);
    const looperHistory = (history || []).filter(h => (h.looper || 1) === latestLooper);

    looperHistory.forEach(h => {
        const stationName = (h.station || '').toUpperCase();
        flow.forEach((f, i) => {
            if (stationName.includes(f.toUpperCase())) {
                completedStages.add(i);
                currentStage = i;
            }
        });

        const skippedList = h.skippedStations || h.details?.skippedStations || [];
        skippedList.forEach(s => {
            const sName = (typeof s === 'string' ? s : s.stationName || '').toUpperCase();
            flow.forEach((f, i) => {
                if (sName.includes(f.toUpperCase())) {
                    skippedStages.add(i);
                }
            });
        });
    });

    return (
        <div className="progression-track" style={{ gap: hideLabels ? '0.5rem' : '1rem' }}>
            {flow.map((stage, i) => {
                const isSkipped = skippedStages.has(i) && !completedStages.has(i);
                const isCompleted = completedStages.has(i);
                const isCurrent = i === currentStage;

                return (
                    <React.Fragment key={i}>
                        <div className="progression-step" style={{ minWidth: hideLabels ? 'auto' : '80px' }} title={isSkipped ? 'SKIPPED BY ADMIN OVERRIDE' : undefined}>
                            <div 
                                className={`progression-dot ${isSkipped ? 'skipped' : isCompleted ? (isCurrent ? 'current' : 'completed') : ''}`}
                                style={{
                                    width: hideLabels ? 24 : 28, height: hideLabels ? 24 : 28, fontSize: hideLabels ? '10px' : '11px',
                                    ...(isSkipped ? {
                                        background: 'var(--warning-bg)',
                                        color: 'var(--warning)',
                                        border: '2px dashed var(--warning)'
                                    } : {})
                                }}
                            >
                                {isSkipped ? (
                                    <FastForward size={hideLabels ? 10 : 12} />
                                ) : isCompleted && !isCurrent ? (
                                    <CheckCircle2 size={hideLabels ? 12 : 14} />
                                ) : (i + 1)}
                            </div>
                            {!hideLabels && (
                                <span className={`progression-label ${isCurrent ? 'current' : ''}`} style={isSkipped ? { color: 'var(--warning)', fontWeight: 700 } : {}}>
                                    {getDisplayName('stations', stage.toUpperCase()) || stage}
                                    {isSkipped && <span style={{ display: 'block', fontSize: '8px', opacity: 0.8 }}>(SKIPPED)</span>}
                                </span>
                            )}
                        </div>
                        {i < flow.length - 1 && (
                            <div 
                                className={`progression-connector ${isCompleted && !isCurrent ? 'completed' : isSkipped ? 'skipped' : ''}`}
                                style={{
                                    margin: hideLabels ? '0 -4px' : '0 4px',
                                    ...(isSkipped ? { borderTop: '2px dashed var(--warning)', background: 'transparent' } : {})
                                }}
                            />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

// ─── Detail Row ───
const DetailItem = ({ label, value, icon: Icon }) => (
    <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 0',
        borderBottom: '1px solid var(--border-light)',
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {Icon && <Icon size={13} color="var(--text-muted)" />}
            <span className="text-xs font-bold uppercase tracking-wide text-muted">{label}</span>
        </div>
        <span className="font-semibold text-sm" style={{ color: 'var(--text-main)' }}>{value || '—'}</span>
    </div>
);

// ─── InfoCentre Component ───
const InfoCentre = ({ user, onNavigateToConfig }) => {
    const { getUnit, store, getDisplayName, resolveActiveProject, getProjectCategory } = useCQA();

    const [selectedProject, setSelectedProject] = useState(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            return params.get('project') || '';
        } catch { return ''; }
    });

    const [searchTerm, setSearchTerm] = useState('');
    const [unit, setUnit] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [searchError, setSearchError] = useState(null);
    const [showScanner, setShowScanner] = useState(false);
    const [recentSearches, setRecentSearches] = useState([]);

    useEffect(() => {
        if (!selectedProject) {
            setRecentSearches([]);
            return;
        }
        const projCategory = getProjectCategory(selectedProject);
        try {
            const saved = localStorage.getItem(`cqa_recent_searches_${projCategory}`);
            setRecentSearches(saved ? JSON.parse(saved) : []);
        } catch {
            setRecentSearches([]);
        }
    }, [selectedProject, getProjectCategory]);

    const handleSelectProject = (projId) => {
        setSelectedProject(projId);
        setUnit(null);
        setSearchError(null);
        setSearchTerm('');
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('section', 'info');
            url.searchParams.set('project', projId);
            window.history.replaceState(null, '', url.toString());
        } catch {}
    };

    const handleSwitchProject = () => {
        setSelectedProject('');
        setUnit(null);
        setSearchError(null);
        setSearchTerm('');
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('section', 'info');
            url.searchParams.delete('project');
            window.history.replaceState(null, '', url.toString());
        } catch {}
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            
            // ISO 8601 format: YYYY-MM-DD HH:MM:SS
            const pad = (n) => n.toString().padStart(2, '0');
            const y = date.getFullYear();
            const m = pad(date.getMonth() + 1);
            const d = pad(date.getDate());
            const hh = pad(date.getHours());
            const mm = pad(date.getMinutes());
            const ss = pad(date.getSeconds());
            
            return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
        } catch { return dateStr; }
    };

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        const cleanId = searchTerm.trim().toUpperCase().replace(/\//g, '-');
        if (!cleanId) return;

        setLoading(true);
        setSearchError(null);
        setUnit(null);
        try {
            const found = await getUnit(cleanId);
            if (!found) {
                setSearchError({
                    type: 'NOT_FOUND',
                    title: 'Serial Number Not Found',
                    message: `Serial Number "${cleanId}" was not found in CQA MES database.`
                });
                return;
            }

            // Project verification
            const activeProj = resolveActiveProject(found);
            const unitProjectCategory = getProjectCategory(activeProj);
            const selectedCategory = getProjectCategory(selectedProject);

            if (unitProjectCategory !== selectedCategory) {
                setSearchError({
                    type: 'PROJECT_MISMATCH',
                    title: `No Results in ${getDisplayName('projects', selectedProject)}`,
                    message: `Serial Number "${cleanId}" does not belong to ${getDisplayName('projects', selectedProject)}.`,
                    hint: `This unit is currently processed under "${getDisplayName('projects', activeProj)}".`,
                    actualProject: activeProj,
                    searchedId: cleanId
                });
                return;
            }

            setUnit(found);
            setActiveTab('overview');
            const recentKey = `cqa_recent_searches_${selectedCategory}`;
            const updated = [cleanId, ...recentSearches.filter(s => s !== cleanId)].slice(0, 8);
            setRecentSearches(updated);
            try {
                localStorage.setItem(recentKey, JSON.stringify(updated));
            } catch {}
        } catch (err) {
            console.error("Search error:", err);
            setSearchError({
                type: 'ERROR',
                title: 'Search Error',
                message: err.message || 'An error occurred while fetching unit records.'
            });
        } finally {
            setLoading(false);
        }
    };

    const quickSearch = async (term) => {
        const cleanTerm = term.trim().toUpperCase().replace(/\//g, '-');
        setSearchTerm(cleanTerm);
        setLoading(true);
        setSearchError(null);
        setUnit(null);
        try {
            const found = await getUnit(cleanTerm);
            if (!found) {
                setSearchError({
                    type: 'NOT_FOUND',
                    title: 'Serial Number Not Found',
                    message: `Serial Number "${cleanTerm}" was not found in CQA MES database.`
                });
                return;
            }

            const activeProj = resolveActiveProject(found);
            const unitProjectCategory = getProjectCategory(activeProj);
            const selectedCategory = getProjectCategory(selectedProject);

            if (unitProjectCategory !== selectedCategory) {
                setSearchError({
                    type: 'PROJECT_MISMATCH',
                    title: `No Results in ${getDisplayName('projects', selectedProject)}`,
                    message: `Serial Number "${cleanTerm}" does not belong to ${getDisplayName('projects', selectedProject)}.`,
                    hint: `This unit is currently processed under "${getDisplayName('projects', activeProj)}".`,
                    actualProject: activeProj,
                    searchedId: cleanTerm
                });
                return;
            }

            setUnit(found);
            setActiveTab('overview');
        } catch (err) {
            setSearchError({
                type: 'ERROR',
                title: 'Search Error',
                message: err.message || 'An error occurred.'
            });
        } finally {
            setLoading(false);
        }
    };

    // Suggestions based on typing
    const suggestions = useMemo(() => {
        if (searchTerm.length < 2 || unit) return [];
        const term = searchTerm.toUpperCase();
        return recentSearches
            .filter(id => id.toUpperCase().includes(term))
            .slice(0, 5);
    }, [searchTerm, recentSearches, unit]);

    // ═══════════════════════════════════════════════════════════════
    // 1. PROJECT SELECTION LANDING SCREEN (If no project selected)
    // ═══════════════════════════════════════════════════════════════
    if (!selectedProject) {
        return (
            <div className="animate-fade-in" style={{ maxWidth: 980, margin: '0 auto', padding: '1.5rem 1rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.4rem 1.1rem',
                        borderRadius: '999px',
                        background: 'var(--primary-alpha, rgba(37, 99, 235, 0.1))',
                        color: 'var(--primary)',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        marginBottom: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                    }}>
                        <Database size={14} /> Project-Scoped Info Centre
                    </div>
                    <h1 className="page-title" style={{ fontSize: '2.1rem', marginBottom: '0.5rem' }}>
                        Select Project to Continue
                    </h1>
                    <p className="page-subtitle" style={{ maxWidth: 540, margin: '0 auto', fontSize: '0.95rem' }}>
                        Unit traceability, production audits, and station history are strictly partitioned by project. Select a project to begin searching.
                    </p>
                </div>

                <div className="grid md-grid-2 gap-4">
                    {PROJECT_METADATA.map((p) => {
                        const IconComponent = p.icon;
                        const displayName = getDisplayName('projects', p.id);
                        return (
                            <div
                                key={p.id}
                                className="card clickable hover-lift"
                                onClick={() => handleSelectProject(p.id)}
                                style={{
                                    padding: '1.75rem',
                                    borderRadius: '1.1rem',
                                    border: `1.5px solid ${p.borderAlpha}`,
                                    background: 'var(--bg-card)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    cursor: 'pointer',
                                    transition: 'all 0.22s ease-in-out',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    boxShadow: 'var(--shadow-sm)'
                                }}
                            >
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: p.color }} />
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                                        <div style={{
                                            width: 52,
                                            height: 52,
                                            borderRadius: '0.85rem',
                                            background: p.bgAlpha,
                                            color: p.color,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <IconComponent size={26} />
                                        </div>
                                        <span style={{
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            padding: '0.3rem 0.75rem',
                                            borderRadius: '999px',
                                            background: p.bgAlpha,
                                            color: p.color,
                                            letterSpacing: '0.02em'
                                        }}>
                                            {p.tag}
                                        </span>
                                    </div>
                                    <h3 className="font-extrabold" style={{ fontSize: '1.35rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                                        {displayName}
                                    </h3>
                                    <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                                        {p.description}
                                    </p>
                                </div>

                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingTop: '1rem',
                                    borderTop: '1px solid var(--border-light)'
                                }}>
                                    <span style={{ fontSize: '0.84rem', fontWeight: 700, color: p.color }}>
                                        Open {displayName} Info Centre
                                    </span>
                                    <div style={{
                                        width: 34, height: 34, borderRadius: '50%',
                                        background: p.bgAlpha, color: p.color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <ArrowRight size={17} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. PROJECT-SCOPED INFO CENTRE VIEW
    // ═══════════════════════════════════════════════════════════════
    const selectedProjectMetadata = PROJECT_METADATA.find(p => p.id === selectedProject) || PROJECT_METADATA[0];
    const ProjectIcon = selectedProjectMetadata.icon;
    const projectDisplayName = getDisplayName('projects', selectedProject);

    return (
        <div className="animate-fade-in">
            {/* Header with Project Badge and Switch Project Button */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.5rem',
                flexWrap: 'wrap',
                gap: '1rem',
                paddingBottom: '1rem',
                borderBottom: '1px solid var(--border-light)'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                        <h1 className="page-title" style={{ margin: 0 }}>Info Centre</h1>
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            padding: '0.3rem 0.85rem',
                            borderRadius: '999px',
                            background: selectedProjectMetadata.bgAlpha,
                            color: selectedProjectMetadata.color,
                            border: `1px solid ${selectedProjectMetadata.borderAlpha}`
                        }}>
                            <ProjectIcon size={14} />
                            {projectDisplayName}
                        </span>
                    </div>
                    <p className="page-subtitle" style={{ margin: 0 }}>
                        Dedicated unit traceability, production audit, and stage progression for {projectDisplayName}
                    </p>
                </div>

                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleSwitchProject}
                    style={{ fontSize: '0.8125rem', height: 40, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    <RotateCcw size={15} /> Switch Project
                </button>
            </div>

            {/* ─── Search Section ─── */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem' }}>
                    <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', alignItems: 'stretch' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <div className="flex-center" style={{
                                position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)',
                                pointerEvents: 'none', zIndex: 1,
                            }}>
                                <Scan size={18} color={selectedProjectMetadata.color} />
                            </div>
                            <input
                                type="text"
                                placeholder={`Enter ${projectDisplayName} serial number...`}
                                autoFocus
                                className="font-bold text-mono"
                                style={{
                                    width: '100%',
                                    height: 56,
                                    paddingLeft: '3rem',
                                    fontSize: '1rem',
                                    letterSpacing: '0.03em'
                                }}
                                value={searchTerm}
                                onChange={e => {
                                    const val = e.target.value.toUpperCase().replace(/\//g, '-');
                                    setSearchTerm(val);
                                    if (val === '') {
                                        setUnit(null);
                                        setSearchError(null);
                                    }
                                }}
                            />
                            {/* Auto-suggestion dropdown */}
                            {suggestions.length > 0 && !unit && (
                                <div className="card animate-fade-in" style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 4px)',
                                    left: 0, right: 0,
                                    zIndex: 50,
                                    padding: '0.25rem',
                                    maxHeight: 200,
                                    overflowY: 'auto',
                                }}>
                                    {suggestions.map(s => (
                                        <button
                                            key={s}
                                            type="button"
                                            className="nav-item"
                                            style={{ fontSize: '0.8125rem' }}
                                            onClick={() => quickSearch(s)}
                                        >
                                            <Search size={13} />
                                            <span className="text-mono font-bold">{s}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            className="btn-scanner"
                            style={{ height: 56, width: 56 }}
                            onClick={() => setShowScanner(true)}
                            title="Scan barcode"
                        >
                            <Scan size={24} />
                        </button>
                        <button type="submit" className="btn btn-primary" style={{ minWidth: 100, height: 56, fontSize: '0.9375rem' }} disabled={loading}>
                            {loading ? <Loader2 size={20} className="animate-spin" /> : 'Search'}
                        </button>
                    </form>

                    {showScanner && (
                        <QRScanner
                            onScan={(code) => {
                                setSearchTerm(code);
                                quickSearch(code);
                            }}
                            onClose={() => setShowScanner(false)}
                        />
                    )}

                    {/* Recent Searches (Filtered to selected project) */}
                    {recentSearches.length > 0 && !unit && (
                        <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span className="text-xs font-semibold text-muted">Recent ({projectDisplayName}):</span>
                            {recentSearches.map(s => (
                                <button
                                    key={s}
                                    className="filter-chip"
                                    onClick={() => quickSearch(s)}
                                >
                                    <Clock size={10} />
                                    <span className="text-mono" style={{ fontSize: '0.6875rem' }}>{s}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>


            {/* ─── Tab Navigation ─── */}
            {unit && (
                <div className="tab-switcher" style={{ marginBottom: '1.5rem', maxWidth: 420 }}>
                    {[
                        { id: 'overview', label: 'Overview', icon: Info },
                        { id: 'activity', label: 'History', icon: History },
                        { id: 'movement', label: 'Movement', icon: Database },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            )}

            {/* ─── Content Area ─── */}
            {unit ? (
                <div className="animate-fade-in">
                    {/* Data Section */}
                    <div style={{ marginTop: '1.5rem' }}>

                    {activeTab === 'overview' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {(() => {
                                const latestLooper = unit.looper || 1;
                                
                                // Smart Project Resolution (Pre-computed in useCQA listener)
                                const currentProject = unit._resolvedProject || resolveActiveProject(unit);
                                
                                // ═══════════════════════════════════════════════════════════════
                                // LATEST RECEIVING DISCOVERY (Across all history, newest first)
                                // ═══════════════════════════════════════════════════════════════
                                const history = [...(unit.history || [])];
                                const allReceiving = history.filter(h => 
                                    h.stationId === 1 || 
                                    (h.station || '').toUpperCase().includes('RECEIVE')
                                ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                                const latestReceiving = allReceiving[0];
                                
                                // History for CURRENT active lifecycle (Latest Looper only)
                                let latestHistory = history.filter(h => (h.looper || 1) === latestLooper);
                                if (latestHistory.length === 0) latestHistory = history;

                                // Unified Specs: PRiORITIZE the latest receiving event's details
                                // This is the ONLY way to guarantee we don't show Looper 1 specs in Looper 2
                                const specs = { 
                                    ...(unit.details || {}), 
                                    ...(latestReceiving?.details || {}) 
                                };

                                return (
                                    <>
                                        {/* Progression Tracker (Latest Lifecycle) */}
                                        <div className="card" style={{ marginBottom: '0.5rem' }}>
                                            <div className="card-body">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                    <div className="text-xs font-bold uppercase text-muted tracking-wide">
                                                       Current Lifecycle Progression (Cycle {latestLooper})
                                                    </div>
                                                    {(user?.role === 'Admin' || user?.role === 'Super Admin') && (
                                                        <button
                                                            className="btn btn-primary text-xs"
                                                            style={{ padding: '4px 10px', height: 28 }}
                                                            onClick={() => {
                                                                if (onNavigateToConfig) {
                                                                    onNavigateToConfig(unit.id);
                                                                } else {
                                                                    window.open(`${window.location.origin}${window.location.pathname}?section=unit-config&serial=${unit.id}`, '_blank');
                                                                }
                                                            }}
                                                            title="Open Unit/Serial Configuration for this unit"
                                                        >
                                                            <Layers size={13} /> Administrative Movement
                                                        </button>
                                                    )}
                                                </div>
                                                <StageProgressionTracker history={latestHistory} project={currentProject} getDisplayName={getDisplayName} />
                                            </div>
                                        </div>

                                        <div className="grid md-grid-2 gap-4">
                                            {/* Left: Unit Details (Latest Looper Context) */}
                                            <div className="card" style={{ borderTop: '4px solid var(--primary)' }}>
                                                <div className="card-header">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <RefreshCw size={16} color="var(--primary)" />
                                                        <span className="text-sm font-bold">Unit Details (Cycle {latestLooper})</span>
                                                    </div>
                                                    <span className={`status-pill ${unit.status.toLowerCase()}`}>{unit.status}</span>
                                                </div>
                                                <div className="card-body">
                                                    <DetailItem label="Serial Number" value={unit.id} icon={Cpu} />
                                                    <DetailItem label="Resolved Project" value={getDisplayName('projects', currentProject)} icon={Package} />
                                                    <DetailItem label="Current Station" value={getDisplayName('stations', unit.stationName) || unit.stationName} icon={ClipboardList} />
                                                    <DetailItem label="Cycle Count" value={`Cycle ${latestLooper}`} icon={History} />
                                                    <DetailItem label="Last Activity" value={formatDate(unit.updatedAt || unit.createdAt)} icon={Calendar} />
                                                </div>
                                            </div>

                                            {/* Right: Technical Specifications */}
                                            <div className="card" style={{ borderTop: '4px solid var(--info)' }}>
                                                <div className="card-header">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <FileText size={16} color="var(--info)" />
                                                        <span className="text-sm font-bold">Technical Specifications</span>
                                                    </div>
                                                </div>
                                                <div className="card-body">
                                                    {Object.keys(specs).length === 0 ? (
                                                        <div className="text-muted text-xs font-semibold" style={{ padding: '1rem 0' }}>
                                                            No technical specification parameters recorded.
                                                        </div>
                                                    ) : (
                                                        Object.entries(specs)
                                                            .filter(([k, v]) => typeof v !== 'object' || v === null)
                                                            .slice(0, 5)
                                                            .map(([k, v]) => (
                                                                <DetailItem key={k} label={k.replace(/([A-Z])/g, ' $1')} value={String(v)} />
                                                            ))
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Reference to Historcal Looper Data */}
                                        {unit.looper > 1 && (
                                            <div className="card" style={{ background: 'var(--bg-input)', border: '1px dashed var(--border)' }}>
                                                <div className="card-body" style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <History size={14} color="var(--text-muted)" />
                                                        <span className="text-xs font-bold text-muted uppercase">History contains {unit.looper - 1} previous lifecycle(s)</span>
                                                    </div>
                                                    <button className="btn btn-ghost" style={{ minHeight: 'auto', padding: '2px 8px', fontSize: '10px' }} onClick={() => setActiveTab('activity')}>
                                                        VIEW FULL HISTORY
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )}

                    {activeTab === 'activity' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {!unit.history || unit.history.length === 0 ? (
                                <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                                    <History size={40} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
                                    <h3 className="font-bold" style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>No History Records Found</h3>
                                    <p className="text-sm text-muted">No station processing events have been recorded for this serial number yet.</p>
                                </div>
                            ) : (() => {

                                const grouped = [...unit.history].reduce((acc, h) => {
                                    const l = h.looper || 1;
                                    if (!acc[l]) acc[l] = [];
                                    acc[l].push(h);
                                    return acc;
                                }, {});

                                return Object.keys(grouped).sort((a, b) => b - a).map(looper => (
                                    <div key={looper} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {/* Looper Header/Divider */}
                                        <div style={{ 
                                            display: 'flex', alignItems: 'center', gap: '1rem', 
                                            padding: '1rem 0', marginTop: looper < (unit.looper || 1) ? '2rem' : '0' 
                                        }}>
                                            <div className="flex-center" style={{ 
                                                width: 32, height: 32, borderRadius: '50%', 
                                                background: looper == (unit.looper || 1) ? 'var(--primary)' : 'var(--text-muted)',
                                                color: 'white', fontWeight: 800, fontSize: '0.875rem'
                                            }}>
                                                {looper}
                                            </div>
                                            <span style={{ fontWeight: 800, fontSize: '0.875rem', color: looper == (unit.looper || 1) ? 'var(--text-main)' : 'var(--text-muted)' }}>
                                                {looper == (unit.looper || 1) ? 'LATEST CYCLE (ACTIVE)' : `HISTORICAL CYCLE ${looper}`}
                                            </span>
                                            <div style={{ flex: 1, height: 2, background: 'var(--border)', opacity: 0.5 }}></div>
                                        </div>

                                        {/* Steps for this looper */}
                                        {grouped[looper].reverse().map((h, i) => {
                                            const isAdminReroute = h.result === 'ADMIN_REROUTE';
                                            const isAdminReturn = h.result === 'ADMIN_RETURN';
                                            const isAdminTerminal = h.result === 'ADMIN_TERMINAL_MOVEMENT';
                                            const isAdminReversal = h.result === 'ADMIN_MOVEMENT_REVERSAL';
                                            const isAdminEvent = isAdminReroute || isAdminReturn || isAdminTerminal || isAdminReversal;

                                            const borderStyle = isAdminReroute
                                                ? '4px solid #8b5cf6'
                                                : isAdminReturn
                                                ? '4px solid var(--warning)'
                                                : isAdminTerminal
                                                ? '4px solid #06b6d4'
                                                : isAdminReversal
                                                ? '4px solid #ec4899'
                                                : h.result?.includes('Pass')
                                                ? '4px solid var(--success)'
                                                : '4px solid var(--error)';

                                            const skippedArr = h.skippedStations || h.details?.skippedStations || [];

                                            return (
                                                <div key={i} className="card animate-fade-in" style={{
                                                    borderLeft: borderStyle,
                                                    opacity: looper == (unit.looper || 1) ? 1 : 0.75
                                                }}>
                                                    <div className="card-header">
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <h4 className="font-bold uppercase" style={{ fontSize: '0.9375rem' }}>{getDisplayName('stations', h.station)}</h4>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                                    <User size={11} color="var(--text-muted)" />
                                                                    <span className="text-xs font-semibold text-muted">{h.operator}</span>
                                                                </div>
                                                            </div>
                                                            <div className="text-xs font-semibold text-muted" style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                                <Calendar size={11} /> {formatDate(h.timestamp)}
                                                                {h.project && <span className="status-pill info" style={{ fontSize: '0.65rem', padding: '2px 6px', marginLeft: '8px' }}>{getDisplayName('projects', h.project)}</span>}
                                                                {h.movementId && <span className="text-mono" style={{ fontSize: '0.65rem', color: 'var(--primary)', marginLeft: 8 }}>[{h.movementId}]</span>}
                                                            </div>
                                                        </div>
                                                        <span
                                                            className={`status-pill ${isAdminEvent ? '' : h.result?.includes('Pass') ? 'success' : 'error'}`}
                                                            style={isAdminEvent ? {
                                                                background: isAdminReroute ? '#8b5cf6' : isAdminReturn ? 'var(--warning-bg)' : isAdminTerminal ? '#06b6d4' : '#ec4899',
                                                                color: isAdminReturn ? 'var(--warning)' : '#fff',
                                                                fontWeight: 700
                                                            } : {}}
                                                        >
                                                            {h.result?.replace(/_/g, ' ')?.toUpperCase()}
                                                        </span>
                                                    </div>

                                                    {/* Admin movement callout banner */}
                                                    {isAdminEvent && (
                                                        <div style={{
                                                            padding: '0.75rem 1.25rem',
                                                            background: 'var(--bg-input)',
                                                            borderBottom: '1px solid var(--border-light)',
                                                            fontSize: '0.8125rem'
                                                        }}>
                                                            {skippedArr.length > 0 && (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--warning)', fontWeight: 700, marginBottom: 4 }}>
                                                                    <FastForward size={14} /> Skipped {skippedArr.length} Station(s): {skippedArr.map(s => typeof s === 'string' ? s : s.stationName).join(', ')}
                                                                </div>
                                                            )}
                                                            {(h.reason || h.details?.reason) && (
                                                                <div style={{ color: 'var(--text-main)', marginTop: 2 }}>
                                                                    <strong>Reason:</strong> {h.reasonCategory || h.details?.reasonCategory ? `${h.reasonCategory || h.details?.reasonCategory} — ` : ''}{h.reason || h.details?.reason}
                                                                </div>
                                                            )}
                                                            {(h.remarks || h.details?.remarks) && (
                                                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 2 }}>
                                                                    <strong>Remarks:</strong> {h.remarks || h.details?.remarks}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {h.details && Object.keys(h.details).length > 0 && !isAdminEvent && (
                                                        <div className="card-body" style={{ background: 'var(--bg-input)', padding: '1.25rem' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                                                {/* Station Input Fields */}
                                                                {(() => {
                                                                    const fields = Object.entries(h.details).filter(([_, v]) => typeof v !== 'object' || v === null);
                                                                    if (fields.length === 0) return null;
                                                                    return (
                                                                        <div className="grid md-grid-2" style={{
                                                                            columnGap: '2.5rem', rowGap: '0.25rem',
                                                                            background: 'var(--bg-card)', padding: '1.25rem',
                                                                            borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)',
                                                                            boxShadow: 'var(--shadow-sm)'
                                                                        }}>
                                                                            {fields.map(([key, val]) => (
                                                                                <div key={key} style={{
                                                                                    display: 'flex', justifyContent: 'space-between',
                                                                                    alignItems: 'center', padding: '0.5rem 0',
                                                                                    borderBottom: '1px solid var(--border-light)',
                                                                                }}>
                                                                                    <span className="text-xs font-bold uppercase text-muted" style={{ letterSpacing: '0.04em' }}>
                                                                                        {key.replace(/([A-Z])/g, ' $1').trim()}
                                                                                    </span>
                                                                                    <span className="font-semibold text-sm text-right" style={{ color: 'var(--text-main)' }}>
                                                                                        {val?.toString() || '—'}
                                                                                    </span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    );
                                                                })()}

                                                                {/* Checklist Fields */}
                                                                {Object.entries(h.details)
                                                                    .filter(([k, v]) => typeof v === 'object' && v !== null && k !== 'checkpointImages' && k !== 'tracker')
                                                                    .map(([key, checklist]) => (
                                                                        <div key={key} style={{
                                                                            background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
                                                                            border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-sm)',
                                                                            padding: '1.25rem',
                                                                        }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
                                                                                <ClipboardList size={16} color="var(--primary)" />
                                                                                <h5 className="text-xs font-bold uppercase text-muted tracking-tight">
                                                                                    {key.replace(/([A-Z])/g, ' $1').trim()} Inspection
                                                                                </h5>
                                                                            </div>
                                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                                {Object.entries(checklist).map(([checkName, checkVal], idx) => (
                                                                                    <div key={idx} style={{
                                                                                        display: 'flex', justifyContent: 'space-between',
                                                                                        alignItems: 'center', padding: '0.75rem 0',
                                                                                        borderBottom: idx < Object.keys(checklist).length - 1 ? '1px solid var(--border-light)' : 'none',
                                                                                        gap: '1.5rem'
                                                                                    }}>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                                                                                            {checkVal === true ? <Check size={16} strokeWidth={3} color="var(--success)" /> : <X size={16} strokeWidth={3} color="var(--error)" />}
                                                                                            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>{checkName}</span>
                                                                                        </div>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                            <span className={`status-pill ${checkVal === true ? 'success' : 'error'}`} style={{ fontSize: '0.625rem', minWidth: '55px', justifyContent: 'center' }}>
                                                                                                {checkVal === true ? 'PASS' : 'FAIL'}
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    ))}

                                                                {/* Checkpoint Images */}
                                                                {h.details?.checkpointImages && Object.keys(h.details.checkpointImages).length > 0 && (
                                                                    <div style={{ marginTop: '0.75rem' }}>
                                                                        <div className="flex items-center gap-2 mb-3 px-1">
                                                                            <Camera size={14} className="text-primary" />
                                                                            <span className="text-xs font-bold uppercase text-muted">Media Proofs</span>
                                                                        </div>
                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                                                            {Object.entries(h.details.checkpointImages).map(([label, urls]) => (
                                                                                urls.map((url, imgIdx) => (
                                                                                    <div 
                                                                                        key={`${label}-${imgIdx}`} 
                                                                                        style={{ position: 'relative', width: 90, height: 60, cursor: 'pointer', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border)' }}
                                                                                        onClick={() => setSelectedImage({ url, label })}
                                                                                    >
                                                                                        <img 
                                                                                            src={url} 
                                                                                            alt={label} 
                                                                                            loading="lazy"
                                                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                                                        />
                                                                                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '2px 4px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '8px', fontWeight: 'bold' }}>
                                                                                            {label}
                                                                                        </div>
                                                                                    </div>
                                                                                ))
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ));
                            })()}
                        </div>
                    )}


                    {activeTab === 'movement' && (
                        <div className="table-to-cards">
                            <div className="table-container card">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Station</th>
                                            <th>Operator</th>
                                            <th>Timestamp</th>
                                            <th style={{ textAlign: 'right' }}>Result</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...unit.history].reverse().map((h, i) => (
                                            <tr key={i}>
                                                <td data-label="Station"><span className="font-bold uppercase">{getDisplayName('stations', h.station)}</span></td>

                                                <td data-label="Operator"><span className="text-mono text-xs font-bold">{h.operator}</span></td>
                                                <td data-label="Timestamp"><span className="font-semibold text-sm">{formatDate(h.timestamp)}</span></td>
                                                <td data-label="Result" style={{ textAlign: 'right' }}>
                                                    <span className={`status-pill ${h.result?.includes('Pass') ? 'success' : 'error'}`}>
                                                        {h.result?.toUpperCase()}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    </div>
                </div>
            ) : searchError ? (
                <div className="card animate-fade-in" style={{
                    padding: '2.5rem 1.5rem',
                    textAlign: 'center',
                    maxWidth: 580,
                    margin: '1.5rem auto',
                    borderRadius: '1.25rem',
                    border: searchError.type === 'PROJECT_MISMATCH' 
                        ? '1.5px solid rgba(245, 158, 11, 0.35)' 
                        : '1.5px solid var(--border)',
                    background: searchError.type === 'PROJECT_MISMATCH'
                        ? 'rgba(245, 158, 11, 0.04)'
                        : 'var(--bg-card)',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <div style={{
                        width: 58,
                        height: 58,
                        borderRadius: '50%',
                        background: searchError.type === 'PROJECT_MISMATCH'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'var(--error-bg, rgba(239, 68, 68, 0.1))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1.25rem'
                    }}>
                        {searchError.type === 'PROJECT_MISMATCH' ? (
                            <AlertTriangle size={28} color="#d97706" />
                        ) : (
                            <XCircle size={28} color="var(--error, #ef4444)" />
                        )}
                    </div>
                    <h3 className="font-extrabold" style={{
                        fontSize: '1.3rem',
                        marginBottom: '0.5rem',
                        color: searchError.type === 'PROJECT_MISMATCH' ? '#d97706' : 'var(--text-main)'
                    }}>
                        {searchError.title}
                    </h3>
                    <p style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.9rem',
                        lineHeight: 1.6,
                        maxWidth: 480,
                        margin: '0 auto 1.5rem'
                    }}>
                        {searchError.message}
                        {searchError.hint && (
                            <span style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                                {searchError.hint}
                            </span>
                        )}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {searchError.type === 'PROJECT_MISMATCH' && searchError.actualProject && (
                            <button
                                type="button"
                                className="btn btn-primary"
                                style={{ fontSize: '0.875rem', height: 42, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                onClick={() => {
                                    const targetP = searchError.actualProject;
                                    handleSelectProject(targetP);
                                    quickSearch(searchError.searchedId);
                                }}
                            >
                                <ArrowRight size={16} /> Switch to {getDisplayName('projects', searchError.actualProject)} & View Records
                            </button>
                        )}
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: '0.875rem', height: 42 }}
                            onClick={() => {
                                setSearchError(null);
                                setSearchTerm('');
                            }}
                        >
                            Clear Search
                        </button>
                    </div>
                </div>
            ) : (
                <div className="empty-state" style={{
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-xl)',
                    border: '2px dashed var(--border)',
                }}>
                    <div className="empty-state-icon" style={{ background: selectedProjectMetadata?.bgAlpha, color: selectedProjectMetadata?.color }}>
                        <ProjectIcon size={32} />
                    </div>
                    <h3>{projectDisplayName} Traceability Ready</h3>
                    <p>Enter a {projectDisplayName} serial number to unlock production audit data, stage progression, and movement history.</p>
                </div>
            )}
            {/* Image Preview Modal */}
            {selectedImage && (
                <div 
                    className="modal-overlay" 
                    style={{ zIndex: 5000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                    onClick={() => setSelectedImage(null)}
                >
                    <div 
                        style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <img 
                            src={selectedImage.url} 
                            alt={selectedImage.label} 
                            style={{ 
                                display: 'block',
                                maxWidth: '100%', 
                                maxHeight: '70vh', 
                                borderRadius: 'var(--radius-lg)', 
                                border: '1px solid rgba(255,255,255,0.2)',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                            }} 
                        />
                        <div style={{ padding: '1rem', textAlign: 'center', color: '#fff' }}>
                            <h4 className="font-bold uppercase tracking-widest" style={{ fontSize: '0.75rem', opacity: 0.8 }}>Checkpoint Proof</h4>
                            <div className="font-extrabold" style={{ fontSize: '1.25rem' }}>{selectedImage.label}</div>
                            <button 
                                className="btn btn-secondary mt-4" 
                                onClick={() => setSelectedImage(null)}
                                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
                            >
                                Close Preview
                            </button>
                        </div>
                        <div
                            className="flex-center"
                            style={{ position: 'absolute', top: '-1rem', right: '-1rem', width: 40, height: 40, borderRadius: '50%', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: 'var(--shadow-lg)' }}
                            onClick={() => setSelectedImage(null)}
                        >
                            <X size={20} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InfoCentre;
