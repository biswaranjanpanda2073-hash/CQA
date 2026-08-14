import React, { useState, useMemo } from 'react';
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
    Image as ImageIcon
} from 'lucide-react';

import { useCQA } from '../hooks/useCQA';
import QRScanner from './QRScanner';


// ─── Stage Progression Tracker ───
const DEVICE_FLOW = ['Receiving', 'Inspection', 'Debug', 'Rework', 'Final QC', 'Packing', 'FG'];
const PERIPHERAL_FLOW = ['Receiving', 'QC', 'FG'];
const INWARD_FLOW = ['Receiving', 'IQC', 'FG'];

const StageProgressionTracker = ({ history = [], project, getDisplayName, hideLabels = false }) => {
    const flow = project === 'Peripherals' ? PERIPHERAL_FLOW :
        project === 'Inward QC' ? INWARD_FLOW : DEVICE_FLOW;

    const completedStages = new Set();
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
    });

    return (
        <div className="progression-track" style={{ gap: hideLabels ? '0.5rem' : '1rem' }}>
            {flow.map((stage, i) => {
                const isCompleted = completedStages.has(i);
                const isCurrent = i === currentStage;

                return (
                    <React.Fragment key={i}>
                        <div className="progression-step" style={{ minWidth: hideLabels ? 'auto' : '80px' }}>
                            <div 
                                className={`progression-dot ${isCompleted ? (isCurrent ? 'current' : 'completed') : ''}`}
                                style={{ width: hideLabels ? 24 : 28, height: hideLabels ? 24 : 28, fontSize: hideLabels ? '10px' : '11px' }}
                            >
                                {isCompleted && !isCurrent ? <CheckCircle2 size={hideLabels ? 12 : 14} /> : (i + 1)}
                            </div>
                            {!hideLabels && (
                                <span className={`progression-label ${isCurrent ? 'current' : ''}`}>{getDisplayName('stations', stage.toUpperCase()) || stage}</span>
                            )}
                        </div>
                        {i < flow.length - 1 && (
                            <div className={`progression-connector ${isCompleted && !isCurrent ? 'completed' : ''}`} style={{ margin: hideLabels ? '0 -4px' : '0 4px' }} />
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
const InfoCentre = () => {
    const { getUnit, store, getDisplayName, resolveActiveProject } = useCQA();

    const [searchTerm, setSearchTerm] = useState('');
    const [unit, setUnit] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);

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
    const [showScanner, setShowScanner] = useState(false);
    const [recentSearches, setRecentSearches] = useState(() => {

        try {
            return JSON.parse(localStorage.getItem('cqa_recent_searches') || '[]');
        } catch { return []; }
    });

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        const cleanId = searchTerm.trim().toUpperCase().replace(/\//g, '-');
        if (!cleanId) return;

        setLoading(true);
        try {
            const found = await getUnit(cleanId);
            setUnit(found);
            if (found) {
                setActiveTab('overview');
                const updated = [cleanId, ...recentSearches.filter(s => s !== cleanId)].slice(0, 8);
                setRecentSearches(updated);
                localStorage.setItem('cqa_recent_searches', JSON.stringify(updated));
            }
        } catch (err) {
            console.error("Search error:", err);
        } finally {
            setLoading(false);
        }
    };

    const quickSearch = async (term) => {
        const cleanTerm = term.trim().toUpperCase().replace(/\//g, '-');
        setSearchTerm(cleanTerm);
        setLoading(true);
        try {
            const found = await getUnit(cleanTerm);
            setUnit(found);
            if (found) setActiveTab('overview');
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

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h1 className="page-title">Info Centre</h1>
                <p className="page-subtitle">Unit traceability, production audit, and historical tracking</p>
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
                                <Scan size={18} color="var(--primary)" />
                            </div>
                            <input
                                type="text"
                                placeholder="Enter serial number..."
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
                                    if (val === '') setUnit(null);
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


                    {/* Recent Searches */}
                    {recentSearches.length > 0 && !unit && (
                        <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span className="text-xs font-semibold text-muted">Recent:</span>
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
                                                <div className="text-xs font-bold uppercase text-muted tracking-wide" style={{ marginBottom: '0.75rem' }}>
                                                   Current Lifecycle Progression (Cycle {latestLooper})
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
                                                    <DetailItem label="Status" value={unit.status} icon={Activity} />
                                                    <DetailItem label="Current Station" value={getDisplayName('stations', unit.stationName)} icon={Database} />
                                                    <DetailItem label="Project" value={getDisplayName('projects', currentProject)} icon={FileText} />
                                                    <DetailItem label="Cycle Started" value={formatDate(latestHistory[0]?.timestamp)} icon={Clock} />
                                                </div>
                                            </div>

                                            {/* Right: Product Specifications (Latest Looper Context) */}
                                            <div className="card">
                                                <div className="card-header">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <Package size={16} color="var(--info)" />
                                                        <span className="text-sm font-bold">Product Specification</span>
                                                    </div>
                                                </div>
                                                <div className="card-body">
                                                    <DetailItem label="Model" value={specs.model} icon={Cpu} />
                                                    <DetailItem label="Type" value={specs.productType} icon={Package} />
                                                    <DetailItem label="Batch ID" value={specs.batchNo} icon={Database} />
                                                    <DetailItem label="Hardware Rev" value={specs.hw} icon={Activity} />
                                                    <DetailItem label="Firmware" value={specs.sw} icon={Loader2} />
                                                    {specs.cx_remarks && <DetailItem label="CX Remarks" value={specs.cx_remarks} icon={AlertTriangle} />}
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
                                        {grouped[looper].reverse().map((h, i) => (
                                            <div key={i} className="card animate-fade-in" style={{
                                                borderLeft: `4px solid ${h.result?.includes('Pass') ? 'var(--success)' : 'var(--error)'}`,
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
                                                            {h.project && <span className="status-pill info" style={{fontSize: '0.65rem', padding: '2px 6px', marginLeft: '8px'}}>{getDisplayName('projects', h.project)}</span>}
                                                        </div>
                                                    </div>
                                                    <span className={`status-pill ${h.result?.includes('Pass') ? 'success' : 'error'}`}>
                                                        {h.result?.toUpperCase()}
                                                    </span>
                                                </div>

                                                {h.details && Object.keys(h.details).length > 0 && (
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
                                                                            urls.map((url, i) => (
                                                                                <div 
                                                                                    key={`${label}-${i}`} 
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
                                        ))}
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
            ) : (
                <div className="empty-state" style={{
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-xl)',
                    border: '2px dashed var(--border)',
                }}>
                    <div className="empty-state-icon">
                        <ShieldCheck size={32} color="var(--primary)" />
                    </div>
                    <h3>Traceability Engine Ready</h3>
                    <p>Enter a serial number to unlock production audit data, stage progression, and movement history.</p>
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
