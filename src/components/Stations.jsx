import React, { useState, useEffect, useMemo } from 'react';
import { 
    ArrowRight, 
    Scan, 
    CheckCircle2, 
    AlertTriangle, 
    ShieldAlert, 
    PackageCheck, 
    Check, 
    X,
    XCircle, 
    RefreshCw, 
    Search, 
    Lock, 
    ChevronRight, 
    ArrowLeft, 
    Zap, 
    Clock, 
    Activity,
    Upload,
    Download,
    FileText,
    Trash2,
    CheckCircle,
    Info,
    ChevronDown,
    Camera,
    Plus,
    Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import { useCQA } from '../hooks/useCQA';
import QRScanner from './QRScanner';
import ImageCapture from './ImageCapture';


const DEVICE_STATIONS = [
    { id: 1, name: 'RECEIVING', admin: false },
    { id: 2, name: 'INSPECTION', admin: false },
    { id: 3, name: 'DEBUG', admin: false },
    { id: 4, name: 'REWORK', admin: false },
    { id: 5, name: 'FINAL QC', admin: false },
    { id: 6, name: 'PACKING', admin: false },
    { id: 7, name: 'MOVE TO FG', admin: false },
    { id: 8, name: 'SCRAP REVIEW', admin: true },
];

const PERIPHERAL_STATIONS = [
    { id: 1, name: 'RECEIVING', admin: false },
    { id: 2, name: 'QC', admin: false },
    { id: 3, name: 'MOVE TO FG', admin: false },
    { id: 4, name: 'REJECTION REVIEW', admin: true },
];

const INWARD_QC_STATIONS = [
    { id: 1, name: 'RECEIVING', admin: false },
    { id: 2, name: 'IQC', admin: false },
    { id: 3, name: 'MOVE TO FG', admin: false },
    { id: 4, name: 'REJECTION', admin: true },
];

const INSPECTION_CHECKLIST = [
    { label: 'Front Panel Condition', type: 'BOOL' },
    { label: 'Bottom Panel Condition', type: 'BOOL' },
    { label: 'Agency Label Verification', type: 'PASS' },
    { label: 'Screw Verification', type: 'PASS' },
    { label: 'Power-On Test', type: 'PASS' },
    { label: 'Login Verification', type: 'PASS' },
    { label: 'Display Segment Check', type: 'PASS' },
    { label: 'Charging Test', type: 'PASS' },
    { label: 'Printer Connectivity – USB', type: 'PASS' },
    { label: 'Printer Connectivity – Bluetooth', type: 'PASS' },
    { label: 'Numerical & Calculation Key Test', type: 'PASS' },
    { label: 'Tax, Expense & Transaction Validation', type: 'PASS' },
    { label: 'Wi-Fi Connectivity', type: 'PASS' },
    { label: 'Volume & Brightness Check', type: 'PASS' },
    { label: 'Factory Reset Verification', type: 'PASS' },
    { label: 'Power-Off Test', type: 'PASS' }
];

const PACKAGING_CHECKLIST = [
    'Device ID Matching Verification',
    'Check for Packaging Foam Availability',
    'Device properly inserted in the white sleeve.',
    'Check For Accessories Availability (Charging Cable & User Manual)',
    'Box sealed with two circular seal tapes.',
    'Box packed with green & white packaging sleeve.',
    'BIS certification label properly affixed in the Outer Packaging Sleeve',
    'Protective wrapping cover applied properly.'
];

const PERIPHERAL_QC_CHECKLIST = [
    'Check For The Packaging Box Condition.',
    'Check for the Procut outer Cosmetic Condition.',
    'Power On test',
    'Functionality Test (Connectivity, Key, Performance)',
    'Charging test',
    'Power Off test'
];

const NON_PRINTER_QC_CHECKLIST = [
    'Packaging Box & Accessories Condition',
    'Product Cosmetic Condition',
    'Functionality Test (Performance)'
];

const SCANNER_QC_CHECKLIST = [
    'Press power button to turn ON → verify LED/beep; wait for auto turn OFF. Repeat 5 cycles',
    'Scan standard 1D barcodes (EAN/Code128) 5–10 times from 10–20 cm distance',
    'Scan QR/DataMatrix codes 5–10 times under normal lighting',
    'Scan printed alphanumeric text 5 times using OCR mode',
    'Scan scratched or low-quality barcode 5 times',
    'Scan any barcode and observe response time',
    'Scan barcode and verify output matches printed value',
    'Connect scanner via USB & Dongle → scan barcode 5 times',
    'Pair scanner via Bluetooth → scan 10 barcodes continuously',
    'Perform continuous scanning for 30 minutes',
    'Press trigger 20 times continuously',
    'Perform visual inspection: body, lens, cable, connector',
    'Verify packaging: box, cushioning, accessories (cable/manual)',
    'Verify charging functionality → connect to power source and confirm charging indicator (LED/icon); ensure device charges and operates normally while charging'
];

// Permission Helper
const hasAccess = (user, project, stationName) => {
    if (!user) return false;
    if (user.role === 'Admin' || user.stations?.includes('ALL — Unrestricted Access')) return true;
    return user.stations?.includes(`${project} > ${stationName}`);
};

const PROJECT_STATION_MAP = {
    'Device':     DEVICE_STATIONS,
    'Peripherals': PERIPHERAL_STATIONS,
    'Inward QC':  INWARD_QC_STATIONS,
    'Calculator': [], // Coming Soon — no stations yet
};
const ACTIVE_PROJECTS = ['Device', 'Peripherals', 'Inward QC', 'Calculator'];

// ─── Main Component (Selection Page) ───
const Stations = ({ user }) => {
    const { getDisplayName, fetchStationMetrics } = useCQA();

    // ── Selection state ──
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedStation, setSelectedStation] = useState('');
    const [accessDenied, setAccessDenied] = useState(false);

    // ── WIP data (kept for station status display inside dropdowns) ──
    const [wipData, setWipData] = React.useState({ 'Device': {}, 'Peripherals': {}, 'Inward QC': {} });

    React.useEffect(() => {
        const loadMetrics = async () => {
            const [deviceMetrics, periphMetrics, iqcMetrics] = await Promise.all([
                fetchStationMetrics('Device'),
                fetchStationMetrics('Peripherals'),
                fetchStationMetrics('Inward QC')
            ]);
            setWipData({
                'Device': deviceMetrics.wipBreakdown || {},
                'Peripherals': periphMetrics.wipBreakdown || {},
                'Inward QC': iqcMetrics.wipBreakdown || {}
            });
        };
        loadMetrics();
        const interval = setInterval(loadMetrics, 60000); // refresh every minute
        return () => clearInterval(interval);
    }, [fetchStationMetrics]);

    const getStationWip = (project, stationName) => wipData[project]?.[stationName] || 0;

    // ── Derive available stations for selected project ──
    const availableStations = selectedProject ? (PROJECT_STATION_MAP[selectedProject] || []) : [];
    const isCalculator = selectedProject === 'Calculator';

    // ── Reset station when project changes ──
    const handleProjectChange = (e) => {
        setSelectedProject(e.target.value);
        setSelectedStation('');
        setAccessDenied(false);
    };

    // ── Enter handler: reuse existing access + open logic ──
    const handleEnter = () => {
        if (!selectedProject || !selectedStation || isCalculator) return;
        const station = availableStations.find(s => String(s.id) === selectedStation);
        if (!station) return;

        if (!hasAccess(user, selectedProject, station.name)) {
            setAccessDenied(true);
            return;
        }

        // ── Exact same URL logic as original handleStationClick ──
        const url = `${window.location.origin}${window.location.pathname}?project=${selectedProject}&stationId=${station.id}`;
        window.open(url, '_blank');
    };

    const canEnter = selectedProject && selectedStation && !isCalculator;
    const selectedStationObj = availableStations.find(s => String(s.id) === selectedStation);

    // ── renderProjectSection kept intact (used by StationExecutionView tab) ──
    const getStationStatus = (wip) => {
        if (wip > 10) return 'active';
        if (wip > 0) return 'slow';
        return 'idle';
    };

    const renderProjectSection = (projectKey, stations) => {
        const totalWip = stations.reduce((sum, s) => sum + getStationWip(projectKey, s.name), 0);
        return (
            <div key={projectKey}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Zap size={16} color="var(--primary)" />
                        <h3 className="font-bold" style={{ fontSize: '1rem' }}>{getDisplayName('projects', projectKey)}</h3>
                        <span className="status-pill info">{stations.length} Stations</span>
                    </div>
                    {totalWip > 0 && <span className="status-pill warning">{totalWip} WIP</span>}
                </div>
                <div className="station-grid">
                    {stations.map(s => {
                        const permitted = hasAccess(user, projectKey, s.name);
                        const wipCount = getStationWip(projectKey, s.name);
                        const status = getStationStatus(wipCount);
                        return (
                            <div key={s.id} className={`station-card ${!permitted ? 'locked' : status}`} style={{ opacity: permitted ? 1 : 0.5 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div className="flex-center text-mono" style={{ width: 32, height: 32, background: 'var(--primary-alpha)', color: 'var(--primary)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', fontWeight: 800 }}>{s.id}</div>
                                        <div>
                                            <div className="font-bold" style={{ fontSize: '0.875rem' }}>{getDisplayName('stations', s.name)}</div>
                                            <div className="text-xs text-muted" style={{ marginTop: 2 }}>{status === 'active' ? 'Active' : status === 'slow' ? 'Processing' : 'Idle'}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {s.admin && permitted && <span className="risk-badge high">Admin</span>}
                                        {!permitted ? <Lock size={14} color="var(--text-muted)" /> : <ChevronRight size={16} color="var(--text-muted)" />}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem' }}>
                                    <div><div className="text-xs text-muted font-semibold uppercase">WIP</div><div className="font-bold" style={{ fontSize: '1.125rem' }}>{wipCount}</div></div>
                                    <div><div className="text-xs text-muted font-semibold uppercase">Status</div><span className={`status-pill ${status === 'active' ? 'success' : status === 'slow' ? 'warning' : 'info'}`}>{status === 'active' ? 'Active' : status === 'slow' ? 'Slow' : 'Idle'}</span></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="animate-fade-in">
            {/* ── Page Header ── */}
            <div className="page-header">
                <h1 className="page-title">Operation Module</h1>
                <p className="page-subtitle">Select a project and station to open your manufacturing terminal</p>
            </div>

            {/* ══════════════════════════════════════
                  PROJECT & STATION SELECTION CARD
                ══════════════════════════════════════ */}
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
            }}>
                <div style={{
                    width: '100%',
                    maxWidth: 520,
                    background: 'var(--bg-card)',
                    borderRadius: '1.25rem',
                    boxShadow: 'var(--shadow-xl)',
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                }}>
                    {/* Card Header */}
                    <div style={{
                        background: 'linear-gradient(135deg, var(--primary) 0%, #14532d 100%)',
                        padding: '1.25rem 1.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.875rem',
                    }}>
                        <div style={{
                            width: 40, height: 40,
                            borderRadius: '0.75rem',
                            background: 'rgba(255,255,255,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <Zap size={20} color="#fff" />
                        </div>
                        <div>
                            <div style={{ color: '#fff', fontWeight: 700, fontSize: '1rem', lineHeight: 1.3 }}>
                                Station Entry
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.775rem', marginTop: 1 }}>
                                Choose your project and station to continue
                            </div>
                        </div>
                    </div>

                    {/* Card Body */}
                    <div style={{ padding: '1.5rem' }}>

                        {/* ── Step 1: Project ── */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                fontSize: '0.78rem', fontWeight: 700,
                                color: 'var(--text-secondary)',
                                textTransform: 'uppercase', letterSpacing: '0.06em',
                                marginBottom: '0.5rem',
                            }}>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: 18, height: 18, borderRadius: '50%',
                                    background: 'var(--primary)', color: '#fff',
                                    fontSize: '0.65rem', fontWeight: 800,
                                }}>1</span>
                                Select Project
                            </label>
                            <div style={{ position: 'relative' }}>
                                <select
                                    id="op-project-select"
                                    value={selectedProject}
                                    onChange={handleProjectChange}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem 2.5rem 0.75rem 1rem',
                                        borderRadius: '0.625rem',
                                        border: `1.5px solid ${selectedProject ? 'var(--primary)' : 'var(--border)'}`,
                                        background: 'var(--bg-input)',
                                        color: selectedProject ? 'var(--text-main)' : 'var(--text-muted)',
                                        fontSize: '0.9rem',
                                        fontWeight: selectedProject ? 600 : 400,
                                        fontFamily: 'var(--font-sans)',
                                        appearance: 'none',
                                        cursor: 'pointer',
                                        outline: 'none',
                                        transition: 'border-color 0.2s, box-shadow 0.2s',
                                        boxShadow: selectedProject ? '0 0 0 3px var(--primary-alpha)' : 'none',
                                    }}
                                >
                                    <option value="">— Choose a Project —</option>
                                    {ACTIVE_PROJECTS.map(p => (
                                        <option key={p} value={p}>{getDisplayName('projects', p)}</option>
                                    ))}
                                </select>
                                <ChevronDown size={16} color="var(--text-muted)" style={{
                                    position: 'absolute', right: '0.875rem', top: '50%',
                                    transform: 'translateY(-50%)', pointerEvents: 'none',
                                }} />
                            </div>
                        </div>

                        {/* ── Step 2: Station ── */}
                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                fontSize: '0.78rem', fontWeight: 700,
                                color: selectedProject ? 'var(--text-secondary)' : 'var(--text-muted)',
                                textTransform: 'uppercase', letterSpacing: '0.06em',
                                marginBottom: '0.5rem',
                                transition: 'color 0.2s',
                            }}>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: 18, height: 18, borderRadius: '50%',
                                    background: selectedProject ? 'var(--primary)' : 'var(--border)',
                                    color: selectedProject ? '#fff' : 'var(--text-muted)',
                                    fontSize: '0.65rem', fontWeight: 800,
                                    transition: 'background 0.2s',
                                }}>2</span>
                                Select Station
                            </label>
                            <div style={{ position: 'relative' }}>
                                <select
                                    id="op-station-select"
                                    value={selectedStation}
                                    onChange={e => { setSelectedStation(e.target.value); setAccessDenied(false); }}
                                    disabled={!selectedProject || isCalculator}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem 2.5rem 0.75rem 1rem',
                                        borderRadius: '0.625rem',
                                        border: `1.5px solid ${isCalculator ? '#f59e0b' : selectedStation ? 'var(--primary)' : 'var(--border)'}`,
                                        background: !selectedProject ? 'var(--bg-hover)' : isCalculator ? 'rgba(245,158,11,0.06)' : 'var(--bg-input)',
                                        color: isCalculator ? '#d97706' : selectedStation ? 'var(--text-main)' : 'var(--text-muted)',
                                        fontSize: '0.9rem',
                                        fontWeight: isCalculator ? 600 : selectedStation ? 600 : 400,
                                        fontFamily: 'var(--font-sans)',
                                        appearance: 'none',
                                        cursor: (selectedProject && !isCalculator) ? 'pointer' : 'not-allowed',
                                        outline: 'none',
                                        opacity: selectedProject ? 1 : 0.6,
                                        transition: 'border-color 0.2s, box-shadow 0.2s, opacity 0.2s',
                                        boxShadow: isCalculator ? '0 0 0 3px rgba(245,158,11,0.15)' : selectedStation ? '0 0 0 3px var(--primary-alpha)' : 'none',
                                    }}
                                >
                                    {isCalculator ? (
                                        <option value="">🚧 Coming Soon — Stations not yet available</option>
                                    ) : (
                                        <>
                                            <option value="">— Choose a Station —</option>
                                            {availableStations.map(s => {
                                                const wip = getStationWip(selectedProject, s.name);
                                                const permitted = hasAccess(user, selectedProject, s.name);
                                                return (
                                                    <option key={s.id} value={String(s.id)}>
                                                        {getDisplayName('stations', s.name)}{wip > 0 ? ` · ${wip} WIP` : ''}{!permitted ? ' 🔒' : ''}
                                                    </option>
                                                );
                                            })}
                                        </>
                                    )}
                                </select>
                                <ChevronDown size={16} color={isCalculator ? '#d97706' : 'var(--text-muted)'} style={{
                                    position: 'absolute', right: '0.875rem', top: '50%',
                                    transform: 'translateY(-50%)', pointerEvents: 'none',
                                }} />
                            </div>

                            {/* Coming Soon banner for Calculator */}
                            {isCalculator && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    marginTop: '0.5rem',
                                    padding: '0.5rem 0.75rem',
                                    borderRadius: '0.5rem',
                                    background: 'rgba(245,158,11,0.08)',
                                    border: '1px dashed #f59e0b',
                                }}>
                                    <span style={{ fontSize: '0.78rem', color: '#d97706', fontWeight: 600 }}>
                                        🧮 Calculator is under development. Process flow is being finalized.
                                    </span>
                                </div>
                            )}

                            {/* Station info pill for normal projects */}
                            {selectedStationObj && !isCalculator && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    marginTop: '0.5rem', flexWrap: 'wrap',
                                }}>
                                    {(() => {
                                        const wip = getStationWip(selectedProject, selectedStationObj.name);
                                        const status = getStationStatus(wip);
                                        return (
                                            <>
                                                <span className={`status-pill ${status === 'active' ? 'success' : status === 'slow' ? 'warning' : 'info'}`}>
                                                    {status === 'active' ? '● Active' : status === 'slow' ? '● Processing' : '○ Idle'}
                                                </span>
                                                {wip > 0 && <span className="status-pill warning">{wip} units in WIP</span>}
                                                {selectedStationObj.admin && <span className="risk-badge high">Admin Only</span>}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* ── Access Denied Inline Alert ── */}
                        <AnimatePresence>
                            {accessDenied && (
                                <motion.div
                                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                                    transition={{ duration: 0.22 }}
                                    style={{
                                        display: 'flex',
                                        gap: '0.875rem',
                                        padding: '1rem 1.125rem',
                                        borderRadius: '0.75rem',
                                        background: 'var(--error-bg)',
                                        border: '1.5px solid var(--error)',
                                        marginBottom: '1.25rem',
                                        alignItems: 'flex-start',
                                    }}
                                >
                                    <ShieldAlert size={20} color="var(--error)" style={{ flexShrink: 0, marginTop: 1 }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, color: 'var(--error)', fontSize: '0.875rem', marginBottom: '0.2rem' }}>
                                            Access Denied
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                            You do not have permission to access this station. Please select a station assigned to your user account or contact your administrator for access.
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setAccessDenied(false)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 }}
                                        title="Dismiss"
                                    >
                                        <X size={15} color="var(--error)" />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* ── Enter Button ── */}
                        <button
                            id="op-enter-btn"
                            onClick={handleEnter}
                            disabled={!canEnter}
                            style={{
                                width: '100%',
                                padding: '0.8rem 1rem',
                                borderRadius: '0.75rem',
                                border: 'none',
                                background: canEnter
                                    ? 'linear-gradient(135deg, var(--primary) 0%, #14532d 100%)'
                                    : 'var(--border)',
                                color: canEnter ? '#fff' : 'var(--text-muted)',
                                fontSize: '0.9rem',
                                fontWeight: 700,
                                fontFamily: 'var(--font-sans)',
                                cursor: canEnter ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                transition: 'all 0.2s',
                                boxShadow: canEnter ? '0 4px 16px rgba(22,101,52,0.35)' : 'none',
                                transform: 'translateY(0)',
                            }}
                            onMouseEnter={e => { if (canEnter) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                        >
                            <ArrowRight size={18} />
                            {isCalculator
                                ? '🚧 Under Development — Coming Soon'
                                : canEnter
                                    ? `Enter — ${getDisplayName('stations', selectedStationObj?.name)}`
                                    : 'Select Project & Station to Continue'}
                        </button>

                        {/* Helper note */}
                        <p style={{
                            textAlign: 'center', marginTop: '0.75rem',
                            fontSize: '0.72rem', color: 'var(--text-muted)',
                        }}>
                            The station will open in a new tab. 🔒 indicates stations outside your access.
                        </p>
                    </div>

                    {/* Card Footer — live project summary */}
                    <div style={{
                        borderTop: '1px solid var(--border)',
                        padding: '0.875rem 2rem',
                        display: 'flex',
                        gap: '1.5rem',
                        background: 'var(--bg-input)',
                        flexWrap: 'wrap',
                    }}>
                        {ACTIVE_PROJECTS.map(p => {
                            const stationList = PROJECT_STATION_MAP[p];
                            const isCalcProject = p === 'Calculator';
                            const totalWip = isCalcProject ? 0 : stationList.reduce((sum, s) => sum + getStationWip(p, s.name), 0);
                            return (
                                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        {isCalcProject ? '🧮 Calculator' : getDisplayName('projects', p)}
                                    </span>
                                    {isCalcProject
                                        ? <span style={{ fontSize: '0.62rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'rgba(245,158,11,0.12)', color: '#d97706', fontWeight: 700 }}>Soon</span>
                                        : totalWip > 0
                                            ? <span className="status-pill warning" style={{ fontSize: '0.65rem', padding: '0.1rem 0.45rem' }}>{totalWip} WIP</span>
                                            : <span className="status-pill info" style={{ fontSize: '0.65rem', padding: '0.1rem 0.45rem' }}>Idle</span>
                                    }
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Standalone View for Terminal Tabs ───
export const StationExecutionView = ({ stationId, project, user }) => {
    const { validateScan, processUnit, getUnit, store, getDisplayName, getProjectCategory } = useCQA();
    const [scannedId, setScannedId] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);
    const [lastProcessed, setLastProcessed] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    const [activeUnit, setActiveUnit] = useState(null);

    const projectCategory = getProjectCategory(project);
    const stations = projectCategory === 'Device' ? DEVICE_STATIONS : (projectCategory === 'Peripherals' ? PERIPHERAL_STATIONS : INWARD_QC_STATIONS);
    const selectedStation = stations.find(s => s.id === stationId);
    const permitted = selectedStation && hasAccess(user, project, selectedStation.name);

    // Dynamic Tab Title
    useEffect(() => {
        if (selectedStation) {
            const dispName = getDisplayName('stations', selectedStation.name);
            document.title = `CQA – ${dispName}`;
        }
    }, [selectedStation, getDisplayName]);

    const handleScan = async (e) => {
        if (e) e.preventDefault();
        const cleanId = scannedId.trim().toUpperCase().replace(/\//g, '-');
        if (!cleanId) return;

        const validation = await validateScan(cleanId, selectedStation, project);
        if (validation.success) {
            const unit = await getUnit(cleanId);
            setActiveUnit(unit);
            
            if (validation.prompt) {
                if (window.confirm(validation.prompt)) setIsProcessing(true);
            } else {
                setIsProcessing(true);
            }
            setErrorMessage('');
        } else {
            setErrorMessage(validation.message);
        }
    };

    const handleComplete = async (data, overrideId) => {
        const targetId = (overrideId || scannedId).trim().toUpperCase().replace(/\//g, '-');
        const result = await processUnit(targetId, {
            ...data,
            station: selectedStation,
            project: project,
            operator: user?.name || user?.id || JSON.parse(localStorage.getItem('cqa_user') || '{}')?.name || 'SYSTEM_ADMIN'
        });
        if (result) {
            setLastProcessed(targetId);
            if (selectedStation.id !== 1 || !overrideId) setShowSuccess(true);
        }
    };

    const handleReset = () => {
        setIsProcessing(false);
        setScannedId('');
        setErrorMessage('');
        setShowSuccess(false);
    };

    if (!selectedStation) return (
        <div className="flex-center" style={{ height: '100vh', padding: '2rem' }}>
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                <AlertTriangle size={48} color="var(--error)" style={{ marginBottom: '1rem' }} />
                <h2 className="font-bold">Terminal Error</h2>
                <p className="text-muted">Station identification failure</p>
            </div>
        </div>
    );

    if (!permitted) {
        return (
            <div className="flex-center" style={{ height: '100vh', padding: '1rem', background: 'var(--bg-main)' }}>
                <div className="card" style={{ padding: '3rem 2rem', textAlign: 'center', maxWidth: 440 }}>
                    <ShieldAlert size={64} color="var(--error)" style={{ margin: '0 auto 1.5rem' }} />
                    <h2 className="font-extrabold" style={{ fontSize: '1.375rem', color: 'var(--error)', marginBottom: '0.75rem' }}>ACCESS DENIED</h2>
                    <p className="text-muted" style={{ marginBottom: '2rem', lineHeight: 1.6 }}>
                        You do not have permission to access <strong>{getDisplayName('stations', selectedStation.name)}</strong> for <strong>{getDisplayName('projects', project)}</strong>.
                    </p>
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => window.close()}>Close Terminal</button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-main)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem' }}>
            <AnimatePresence mode="wait">
                {showSuccess ? (
                    <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ width: '100%', maxWidth: 500, margin: 'auto' }} onAnimationComplete={() => setTimeout(handleReset, 2000)}>
                        <div className="card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                            <CheckCircle2 size={80} color="var(--primary)" style={{ margin: '0 auto 1.5rem' }} />
                            <h1 className="font-extrabold" style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Transaction Complete</h1>
                            <div style={{ margin: '1.5rem 0' }}>
                                <span className="text-xs uppercase font-bold text-muted">Serial Number</span>
                                <div className="text-mono" style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', margin: '0.5rem 0' }}>{lastProcessed}</div>
                                <p style={{ fontSize: '0.9375rem' }}>Recorded at <strong>{getDisplayName('stations', selectedStation.name)}</strong></p>
                            </div>
                            <div className="flex-center" style={{ gap: '0.5rem', opacity: 0.4 }}>
                                <RefreshCw size={16} className="animate-spin" />
                                <span className="text-xs font-bold uppercase">Resetting terminal...</span>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <div style={{ width: '100%', maxWidth: 960, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Terminal Header */}
                        <div className="card" style={{ padding: '1rem 1.5rem' }}>
                            <div className="flex-between">
                                <div>
                                    <div className="text-xs uppercase font-bold" style={{ color: 'var(--primary)', letterSpacing: '0.06em' }}>
                                        {getDisplayName('projects', project)} / Terminal {selectedStation.id}
                                    </div>
                                    <h1 className="font-extrabold" style={{ fontSize: '1.375rem', marginTop: 2 }}>
                                        {getDisplayName('stations', selectedStation.name)}
                                    </h1>

                                </div>
                                <div className="status-indicator" style={{
                                    padding: '0.4rem 0.75rem',
                                    background: 'var(--success-bg)',
                                    borderRadius: 'var(--radius-full)',
                                }}>
                                    <div className="status-dot online"></div>
                                    <span style={{ color: 'var(--success)' }}>Live</span>
                                </div>
                            </div>
                        </div>

                        {/* Scan or Form */}
                        {!isProcessing && selectedStation.id !== 1 ? (
                            <div className="card animate-fade-in" style={{ padding: '4rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div className="flex-center" style={{ width: 72, height: 72, background: 'var(--primary-alpha)', borderRadius: '50%', margin: '0 auto 1.25rem' }}>
                                        <Scan size={36} color="var(--primary)" />
                                    </div>
                                    <h3 className="font-extrabold" style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>Ready to Scan</h3>
                                    <p className="text-muted font-semibold">Enter serial number to begin</p>
                                </div>

                                <form onSubmit={handleScan} style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input
                                            autoFocus
                                            type="text"
                                            placeholder="Scan serial..."
                                            value={scannedId}
                                            onChange={e => setScannedId(e.target.value.toUpperCase().replace(/\//g, '-'))}
                                            className="text-mono"
                                            style={{
                                                flex: 1,
                                                height: 64,
                                                fontSize: '1.75rem',
                                                textAlign: 'center',
                                                fontWeight: 800,
                                                letterSpacing: '0.08em'
                                            }}
                                        />
                                        <button
                                            type="button"
                                            className="btn-scanner"
                                            style={{ height: 64, width: 64 }}
                                            onClick={() => setShowScanner(true)}
                                            title="Scan with camera"
                                        >
                                            <Scan size={28} />
                                        </button>
                                    </div>
                                    <button type="submit" className="btn btn-primary" style={{ height: 56, fontSize: '1rem' }}>
                                        Process Unit
                                    </button>
                                </form>

                                {showScanner && (
                                    <QRScanner
                                        onScan={(code) => setScannedId(code.toUpperCase().replace(/\//g, '-'))}
                                        onClose={() => setShowScanner(false)}
                                    />
                                )}


                                {errorMessage && (
                                    <div className="animate-fade-in" style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        padding: '1rem 1.25rem',
                                        background: 'var(--error-bg)',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid rgba(220,38,38,0.2)',
                                        color: 'var(--error)',
                                        width: '100%',
                                        maxWidth: 420,
                                    }}>
                                        <AlertTriangle size={20} />
                                        <span className="font-bold text-sm">{errorMessage}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="animate-fade-in">
                                <StationForm
                                    key={`${selectedStation.id}-${scannedId}`}
                                    project={project}
                                    station={selectedStation}
                                    unitId={scannedId || 'BATCH'}
                                    unitData={activeUnit}
                                    onComplete={handleComplete}
                                    onBulkComplete={() => { setLastProcessed("BATCH"); setShowSuccess(true); }}
                                    onReset={handleReset}
                                    getDisplayName={getDisplayName}
                                />
                            </div>
                        )}
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ─── Station Form ───
const StationForm = ({ project, station, unitId, unitData, onComplete, onBulkComplete, onReset, getDisplayName }) => {
    const { getProjectCategory, store, consumeBaanParts, bulkProcessUnits, uploadProofImage, validateScan } = useCQA();
    const projectCategory = getProjectCategory(project);
    const [formData, setFormData] = useState({ result: null, decision: null, details: {} });
    const [reworkType, setReworkType] = useState(null); // 'NORMAL' or 'REPLACEMENT'
    const [baanRequestId, setBaanRequestId] = useState('');
    const [partChangeQty, setPartChangeQty] = useState(1);
    const [partChangeReason, setPartChangeReason] = useState('');
    
    const [isValidating, setIsValidating] = useState(false);
    const [issuedParts, setIssuedParts] = useState([]);
    const [checklist, setChecklist] = useState({});
    const [showScanner, setShowScanner] = useState(false);
    
    // CSV Logic States
    const [entryMode, setEntryMode] = useState('manual'); // 'manual' or 'csv'
    const [csvRows, setCsvRows] = useState([]); // [{ data: {}, status: 'Pending', error: '' }]
    const [isProcessingCsv, setIsProcessingCsv] = useState(false);
    const [csvFile, setCsvFile] = useState(null);
    
    // Camera Capture States
    const [capturingFor, setCapturingFor] = useState(null);
    const [checkpointImages, setCheckpointImages] = useState({});
    const [uploadingStatus, setUploadingStatus] = useState({}); // { [checkpoint]: count } tracking parallel uploads
    // const { uploadProofImage } = useCQA(); // Already moved to top deconstruction

    const activeIssuedRequests = useMemo(() => {
        return Object.values(store.baan?.partRequests || {})
            .filter(r => r.status === 'Issued');
    }, [store.baan]);

    const activeList = useMemo(() => {
        if (projectCategory === 'Device') {
            return station.id === 6 ? PACKAGING_CHECKLIST : INSPECTION_CHECKLIST;
        }
        if (projectCategory === 'Peripherals' && station.id === 2) {
            if (unitData?.details?.category === 'Scanner') {
                return SCANNER_QC_CHECKLIST;
            }
            if (unitData?.details?.category !== 'Printer') {
                return NON_PRINTER_QC_CHECKLIST;
            }
        }
        return PERIPHERAL_QC_CHECKLIST;
    }, [projectCategory, station.id, unitData]);

    const handleImageAttach = async (base64) => {
        if (!capturingFor) return;
        const checkpoint = capturingFor;
        const tempId = `temp-${Date.now()}`;
        
        // 1. Show preview instantly (Near real-time UI)
        setCheckpointImages(prev => ({
            ...prev,
            [checkpoint]: [...(prev[checkpoint] || []), { url: base64, pending: true, id: tempId }].slice(0, 5)
        }));
        
        setUploadingStatus(prev => ({ ...prev, [checkpoint]: (prev[checkpoint] || 0) + 1 }));
        setCapturingFor(null);

        // 2. Upload in background (Non-blocking)
        try {
            const timestamp = Date.now();
            const safeLabel = checkpoint.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const path = `checkpoint_proofs/${unitId}/${station.id}/${safeLabel}_${timestamp}.jpg`;
            
            const { url, error } = await uploadProofImage(base64, path);
            
            if (url) {
                // Update with real URL
                setCheckpointImages(prev => ({
                    ...prev,
                    [checkpoint]: prev[checkpoint].map(img => img.id === tempId ? { url, pending: false } : img)
                }));
            } else {
                // Remove failed upload or mark error
                setCheckpointImages(prev => ({
                    ...prev,
                    [checkpoint]: prev[checkpoint].filter(img => img.id !== tempId)
                }));
                alert(`Upload failed: ${error}`);
            }
        } catch (err) {
            console.error("Image attachment error:", err);
        } finally {
            setUploadingStatus(prev => ({ ...prev, [checkpoint]: Math.max(0, prev[checkpoint] - 1) }));
        }
    };


    const handleStationSubmit = async (e) => {
        e.preventDefault();

        // BAAN Integration: Ensure parts are consumed if replacement was done
        if (reworkType === 'REPLACEMENT' && baanRequestId) {
            const request = store.baan.partRequests[baanRequestId];
            if (request && request.status === 'Issued') {
                const res = await consumeBaanParts(baanRequestId, partChangeQty, unitId, partChangeReason || formData.details.remarks, JSON.parse(localStorage.getItem('cqa_user') || '{}'));
                if (!res.success) {
                    alert('Inventory consumption failed: ' + res.message);
                    return;
                }
            }
        }

        const isChecklistStation = (projectCategory === 'Device' && [2, 5, 6].includes(station.id)) || (projectCategory === 'Peripherals' && station.id === 2);
        if (isChecklistStation) {
            const list = activeList;
            const anyFail = Object.values(checklist).includes(false);
            const allDone = Object.keys(checklist).length === list.length;
            if (!allDone) { alert(`Incomplete: Please verify all ${list.length} items.`); return; }
            if (anyFail) {
                if (!formData.details.remarks?.trim()) { alert('Remarks required for failure points.'); return; }
                if (!formData.decision) { alert('Select failure disposition.'); return; }
            }
        }
        if (!formData.result) { alert('Please select a Pass or Fail result to continue.'); return; }

        // Filter out pending images and normalize to URL strings for DB storage
        const sanitizedCheckpointImages = {};
        Object.entries(checkpointImages).forEach(([checkpoint, imgs]) => {
            const validUrls = imgs
                .filter(img => typeof img === 'string' || (typeof img === 'object' && !img.pending))
                .map(img => typeof img === 'string' ? img : img.url);
            if (validUrls.length > 0) sanitizedCheckpointImages[checkpoint] = validUrls;
        });

        onComplete({
            ...formData,
            details: {
                ...formData.details,
                checklist,
                checkpointImages: sanitizedCheckpointImages,
                reworkType,
                baanRequestId,
                ...(projectCategory === 'Peripherals' && station.id === 2 && unitData?.details?.category === 'Scanner' ? { checklistVersion: 'v2' } : {})
            }
        });
    };

    const handleCheck = (item, status) => {
        setChecklist(prev => {
            const next = { ...prev, [item]: status };
            const anyFail = Object.values(next).includes(false);
            const list = activeList;
            const allDone = Object.keys(next).length === list.length;
            if (anyFail) setFormData(f => ({ ...f, result: 'Fail' }));
            else if (allDone) setFormData(f => ({ ...f, result: 'Pass', decision: null }));
            else setFormData(f => ({ ...f, result: null, decision: null }));
            return next;
        });
    };

    const renderActionButtons = () => (
        <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-light)', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 2, height: 52, fontSize: '0.9375rem' }}>
                <Check size={20} /> Complete
            </button>
            <button type="button" className="btn btn-secondary" style={{ flex: 1, height: 52 }} onClick={onReset}>
                <RefreshCw size={16} /> Reset
            </button>
        </div>
    );

    // ─── CSV Handling Logic ───
    const downloadTemplate = (e) => {
        e.preventDefault();
        const headers = [['Device ID', 'Batch No', 'Model', 'Device Type', 'HW Version', 'SW Version', 'CX Remarks']];
        const sampleData = [
            ['T110R4BEK00020', 'RF-30032026', 'Tohands Smart Calculator V5', 'Reverse', 'V1.10', 'OS16', 'Keypad Issue'],
            ['T110R4BEK01401', 'RF-08032026', 'Tohands Smart Calculator V5', 'Reverse', 'V1.10', 'OS16', 'Display Not Working']
        ];
        const worksheet = XLSX.utils.aoa_to_sheet([...headers, ...sampleData]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
        XLSX.writeFile(workbook, "Receiving_Template.csv");
    };

    const handleCsvSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { alert("File exceeds 5MB limit."); return; }
        setCsvFile(file);
        
        const reader = new FileReader();
        reader.onload = (evt) => {
            const data = evt.target.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            
            if (raw.length < 2) { alert("Template is empty."); return; }

            // Logic: Skip header and process rows
            const rows = raw.slice(1).filter(r => r.length > 0 && r[0]).map(r => {
                const deviceId = (r[0] || '').toString().trim().toUpperCase().replace(/\//g, '-');
                const rowData = {
                    deviceId,
                    batchNo: (r[1] || '').toString().trim(),
                    model: (r[2] || '').toString().trim(),
                    productType: (r[3] || '').toString().trim(),
                    hw: (r[4] || '').toString().trim(),
                    sw: (r[5] || '').toString().trim(),
                    cx_remarks: (r[6] || '').toString().trim()
                };

                // Immediate Basic Validation
                let error = '';
                if (!rowData.deviceId) error = 'Missing Device ID';
                else if (!rowData.batchNo) error = 'Missing Batch No';
                else if (!rowData.model) error = 'Missing Model';
                else if (!rowData.productType) error = 'Missing Device Type';
                else if (!rowData.hw) error = 'Missing HW Version';
                else if (!rowData.sw) error = 'Missing SW Version';

                return { data: rowData, status: error ? 'Invalid' : 'Pending', error };
            });

            // Duplicate Check in File
            const ids = new Set();
            rows.forEach(r => {
                if (ids.has(r.data.deviceId)) {
                    r.status = 'Invalid';
                    r.error = 'Duplicate in file';
                }
                ids.add(r.data.deviceId);
            });

            setCsvRows(rows);
        };
        reader.readAsBinaryString(file);
    };

    const validateCsvData = async () => {
        setIsProcessingCsv(true);
        try {
            // Use local store for instant validation (Bulk In-Memory)
            const updatedRows = [];
            for (let i = 0; i < csvRows.length; i++) {
                const row = csvRows[i];
                if (row.status === 'Invalid') {
                    updatedRows.push(row);
                    continue;
                }

                // Call validation directly for speed
                const validation = await validateScan(row.data.deviceId || '', station, project);
                if (!validation.success) {
                    updatedRows.push({ ...row, status: 'Invalid', error: validation.message });
                } else {
                    updatedRows.push({ ...row, status: 'Ready', error: validation.prompt || '' });
                }
            }
            setCsvRows(updatedRows);
        } catch (err) {
            console.error("CSV Validation Error:", err);
            alert("An error occurred during validation. Please check the file format.");
        } finally {
            setIsProcessingCsv(false);
        }
    };

    const handleCsvProcess = async () => {
        const readyRows = csvRows.filter(r => r.status === 'Ready');
        if (readyRows.length === 0) { alert('No valid rows to process.'); return; }

        setIsProcessingCsv(true);
        
        // Prepare data for bulk ingestion
        const unitConfigs = readyRows.map(row => ({
            id: row.data.deviceId,
            data: {
                station,
                project,
                operator: JSON.parse(localStorage.getItem('cqa_user') || '{}')?.name || 'SYSTEM_ADMIN',
                details: {
                    model: row.data.model,
                    batchNo: row.data.batchNo,
                    productType: row.data.productType,
                    hw: row.data.hw,
                    sw: row.data.sw,
                    cx_remarks: row.data.cx_remarks
                }
            }
        }));

        const result = await bulkProcessUnits(unitConfigs);

        setIsProcessingCsv(false);
        setCsvRows([]);
        setCsvFile(null);
        onBulkComplete();
        alert(`Bulk ingestion complete. Success: ${result.success}, Failed: ${result.fail}`);
    };

    const downloadErrorCsv = () => {
        const failed = csvRows.filter(r => r.status === 'Invalid');
        if (failed.length === 0) return;

        const headers = ['Device ID', 'Error Message'];
        const data = failed.map(r => [r.data.deviceId, r.error]);
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Errors");
        XLSX.writeFile(workbook, "Ingestion_Errors.csv");
    };

    // ─── Receiving Form ───
    if (station.id === 1) {
        return (
            <div className="card animate-fade-in shadow-xl">
                <div className="card-header" style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-light)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h2 className="font-extrabold" style={{ fontSize: '1.375rem', color: 'var(--primary)', letterSpacing: '-0.02em' }}>
                                {getDisplayName('projects', project)} — Receiving
                            </h2>
                            <p className="text-sm text-muted font-medium" style={{ marginTop: 2 }}>Select entry method for device registration</p>
                        </div>
                        <div className="tab-switcher" style={{ margin: 0, padding: '4px', background: 'var(--bg-main)', borderRadius: 'var(--radius-lg)' }}>
                            <button 
                                type="button"
                                className={`tab-item ${entryMode === 'manual' ? 'active shadow-sm' : ''}`} 
                                style={{ fontSize: '0.8125rem', padding: '0.5rem 1.25rem' }} 
                                onClick={() => setEntryMode('manual')}
                            >
                                <Info size={14} /> Manual Entry
                            </button>
                            <button 
                                type="button"
                                className={`tab-item ${entryMode === 'csv' ? 'active shadow-sm' : ''}`} 
                                style={{ fontSize: '0.8125rem', padding: '0.5rem 1.25rem' }} 
                                onClick={() => setEntryMode('csv')}
                            >
                                <FileText size={14} /> Upload CSV
                            </button>
                        </div>
                    </div>
                </div>

                <div className="card-body" style={{ padding: '2rem' }}>
                    {entryMode === 'manual' ? (
                        <form onSubmit={e => {
                            e.preventDefault();
                            const raw = e.target.ids.value.split('\n').map(x => x.trim().toUpperCase().replace(/\//g, '-')).filter(x => x);
                            if (!raw.length) { alert('Enter at least one Serial Number.'); return; }
                            if (projectCategory === 'Device' && !formData.details.productType) { alert('Select Device Type.'); return; }
                            if (projectCategory === 'Peripherals' && (!formData.details.category || !formData.details.productType)) { alert('Select Category and Device Type.'); return; }
                            if (projectCategory === 'Inward QC' && !formData.details.productType) { alert('Select Device Type.'); return; }
                            raw.forEach(id => onComplete({ details: formData.details }, id));
                            onBulkComplete();
                        }}>
                            <div className="grid md-grid-2 gap-5" style={{ marginBottom: '2rem' }}>
                                <div className="input-field">
                                    <label>Model Name</label>
                                    <input required placeholder="e.g. Pax A920" value={formData.details.model || ''} onChange={e => setFormData({ ...formData, details: { ...formData.details, model: e.target.value } })} />
                                </div>

                                {project === 'Peripherals' && (
                                    <div className="input-field">
                                        <label>Category</label>
                                        <select required value={formData.details.category || ''} onChange={e => setFormData({ ...formData, details: { ...formData.details, category: e.target.value } })}>
                                            <option value="">Select Category...</option>
                                            {['Printer', 'Charger', 'Cable', 'Scanner', 'Others'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </div>
                                )}

                                <div className="input-field">
                                    <label>Device Type</label>
                                    <select required value={formData.details.productType || ''} onChange={e => setFormData({ ...formData, details: { ...formData.details, productType: e.target.value } })}>
                                        <option value="">Select Type...</option>
                                        {projectCategory === 'Device' && ['Reverse', 'RTO', 'Manufacturing Defects', 'Others'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        {projectCategory === 'Peripherals' && ['Fresh Lot', 'Reverse', 'RTO', 'Others'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        {projectCategory === 'Inward QC' && ['Fresh Lot', 'Reworked RTO', 'Others'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>

                                {(projectCategory === 'Device' || projectCategory === 'Inward QC') && (
                                    <>
                                        <div className="input-field">
                                            <label>Hardware Version</label>
                                            <input required placeholder="e.g. V2.0" value={formData.details.hw || ''} onChange={e => setFormData({ ...formData, details: { ...formData.details, hw: e.target.value } })} />
                                        </div>
                                        <div className="input-field">
                                            <label>Software Version</label>
                                            <input required placeholder="e.g. 2.4.0" value={formData.details.sw || ''} onChange={e => setFormData({ ...formData, details: { ...formData.details, sw: e.target.value } })} />
                                        </div>
                                    </>
                                )}

                                <div className="input-field">
                                    <label>Batch / Lot No</label>
                                    <input required placeholder="e.g. LOT-2024-001" value={formData.details.batchNo || ''} onChange={e => setFormData({ ...formData, details: { ...formData.details, batchNo: e.target.value } })} />
                                </div>
                            </div>

                            <div className="input-field">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.5rem' }}>
                                    <label style={{ marginBottom: 0 }}>Serial Numbers (one per line)</label>
                                    <button
                                        type="button"
                                        className="btn-ghost"
                                        style={{ padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)' }}
                                        onClick={() => setShowScanner(true)}
                                    >
                                        <Scan size={14} />
                                        <span className="text-xs font-bold">Launch Camera</span>
                                    </button>
                                </div>
                                <textarea
                                    name="ids"
                                    rows={8}
                                    required
                                    placeholder="Paste serial numbers here..."
                                    className="text-mono"
                                    style={{ fontSize: '1rem', padding: '1rem', background: 'var(--bg-input)' }}
                                />
                            </div>

                            {showScanner && (
                                <QRScanner
                                    onScan={(code) => {
                                        const textarea = document.querySelector('textarea[name="ids"]');
                                        if (textarea) {
                                            const current = textarea.value.trim();
                                            const sanitizedCode = code.toUpperCase().replace(/\//g, '-');
                                            textarea.value = current ? `${current}\n${sanitizedCode}` : sanitizedCode;
                                        }
                                    }}
                                    onClose={() => setShowScanner(false)}
                                />
                            )}

                            {renderActionButtons()}
                        </form>
                    ) : (
                        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{
                                width: '100%',
                                padding: '2.5rem',
                                border: '2px dashed var(--border)',
                                borderRadius: 'var(--radius-xl)',
                                background: 'var(--bg-main)',
                                textAlign: 'center',
                                position: 'relative'
                            }}>
                                <div className="flex-center flex-col gap-4">
                                    <div className="flex-center" style={{ width: 64, height: 64, background: 'var(--primary-alpha)', borderRadius: '50%' }}>
                                        <Upload size={32} color="var(--primary)" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold" style={{ fontSize: '1.125rem', marginBottom: '0.25rem' }}>
                                            {csvFile ? csvFile.name : 'Select Bulk Ingestion File'}
                                        </h3>
                                        <p className="text-sm text-muted">Upload CSV with mandatory SN and Specification data</p>
                                    </div>
                                    <div className="flex-center" style={{ gap: '0.75rem' }}>
                                        <button className="btn btn-primary" onClick={() => document.getElementById('csv-input').click()}>
                                            <Upload size={16} /> {csvFile ? 'Change File' : 'Browse Files'}
                                        </button>
                                        <button className="btn btn-secondary" onClick={downloadTemplate}>
                                            <Download size={16} /> Download Template
                                        </button>
                                    </div>
                                    <input id="csv-input" type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCsvSelect} />
                                </div>
                            </div>

                            {csvRows.length > 0 && (
                                <div className="animate-fade-in">
                                    <div className="flex-between" style={{ marginBottom: '1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <h4 className="font-bold text-sm uppercase text-muted">Batch Preview</h4>
                                            <span className="status-pill info font-bold">{csvRows.length} Rows Detected</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button className="btn btn-secondary" style={{ height: 36, fontSize: '0.75rem' }} onClick={validateCsvData} disabled={isProcessingCsv}>
                                                {isProcessingCsv ? 'Validating...' : 'Validate Data'}
                                            </button>
                                            <button className="btn btn-danger" style={{ height: 36, width: 36, padding: 0 }} onClick={() => { setCsvRows([]); setCsvFile(null); }}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="table-container" style={{ maxHeight: '350px', background: 'var(--bg-input)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)' }}>
                                        <table style={{ fontSize: '0.8125rem' }}>
                                            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                                                <tr>
                                                    <th>Device ID</th>
                                                    <th>Model</th>
                                                    <th>Type</th>
                                                    <th>Status</th>
                                                    <th>Action / Error</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {csvRows.map((row, idx) => (
                                                    <tr key={idx}>
                                                        <td className="text-mono font-bold" style={{ color: 'var(--primary)' }}>{row.data.deviceId}</td>
                                                        <td>{row.data.model}</td>
                                                        <td>{row.data.productType}</td>
                                                        <td>
                                                            <span className={`status-pill ${row.status === 'Ready' ? 'success' : row.status === 'Invalid' ? 'error' : 'info'}`}>
                                                                {row.status}
                                                            </span>
                                                        </td>
                                                        <td style={{ color: row.status === 'Invalid' ? 'var(--error)' : 'var(--text-muted)' }}>
                                                            {row.error || '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--primary-alpha)', borderRadius: 'var(--radius-lg)' }}>
                                        <div className="text-xs font-bold" style={{ color: 'var(--primary)' }}>
                                            {csvRows.filter(r => r.status === 'Ready').length} valid rows ready for ingestion
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                                            {csvRows.some(r => r.status === 'Invalid') && (
                                                <button className="btn btn-secondary" style={{ border: '1px solid var(--error-light)', color: 'var(--error)' }} onClick={downloadErrorCsv}>
                                                    <AlertTriangle size={14} /> Download Errors
                                                </button>
                                            )}
                                            <button 
                                                className="btn btn-primary" 
                                                style={{ height: 44, padding: '0 2rem', fontSize: '0.875rem' }} 
                                                onClick={handleCsvProcess} 
                                                disabled={isProcessingCsv || !csvRows.some(r => r.status === 'Ready')}
                                            >
                                                {isProcessingCsv ? 'Ingesting...' : 'Confirm Bulk Receiving'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!csvFile && (
                                <div style={{ padding: '1.5rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)' }}>
                                    <h4 className="text-xs font-bold uppercase text-muted mb-3">Validation Requirements</h4>
                                    <div className="grid grid-2 gap-x-8 gap-y-2">
                                        <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }}></div> Mandatory Header Row
                                        </div>
                                        <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }}></div> Max 1000 rows per file
                                        </div>
                                        <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }}></div> Unique Device ID per row
                                        </div>
                                        <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }}></div> Valid Product Specs required
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ─── Checklist Stations ───
    const isChecklist = (projectCategory === 'Device' && [2, 5, 6].includes(station.id)) || (projectCategory === 'Peripherals' && station.id === 2) || (projectCategory === 'Inward QC' && station.id === 2);
    if (isChecklist) {
        const list = activeList;
        return (
            <form className="card animate-fade-in" onSubmit={handleStationSubmit}>
                <div className="card-header">
                    <div>
                        <span className="text-xs uppercase font-bold text-muted">Quality Checklist</span>
                        <h2 className="font-extrabold" style={{ fontSize: '1.25rem' }}>Interactive Inspection</h2>
                    </div>
                    <div className="text-mono flex-center" style={{
                        background: 'var(--bg-input)',
                        padding: '0.5rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '1rem',
                        fontWeight: 800,
                        border: '1px solid var(--border)'
                    }}>{unitId}</div>
                </div>
                <div className="card-body">
                    <div className="grid md-grid-2 gap-3" style={{ marginBottom: '1.5rem' }}>
                        {list.map((item, idx) => {
                            const label = typeof item === 'string' ? item : item.label;
                            return (
                                <div key={idx} style={{
                                    padding: '1rem',
                                    background: 'var(--bg-input)',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border-light)',
                                }}>
                                    <div className="font-semibold text-sm" style={{ marginBottom: '0.75rem', minHeight: '2.5rem' }}>
                                        {idx + 1}. {label}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '0.5rem' }}>
                                        <button type="button" className={`btn ${checklist[label] === true ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleCheck(label, true)} style={{ minHeight: 40, fontSize: '0.8rem' }}>Pass</button>
                                        <button type="button" className={`btn ${checklist[label] === false ? 'btn-danger' : 'btn-secondary'}`} onClick={() => handleCheck(label, false)} style={{ minHeight: 40, fontSize: '0.8rem' }}>Fail</button>
                                        <button type="button" className="btn btn-secondary" onClick={() => setCapturingFor(label)} style={{ minHeight: 40, fontSize: '0.8rem', gap: '4px' }}>
                                            <Camera size={14} /> Capture
                                        </button>
                                    </div>

                                    {/* Thumbnail Preview Area with Lazy Loading & Upload Status */}
                                    {((checkpointImages[label] && checkpointImages[label].length > 0) || (uploadingStatus[label] > 0)) && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem', padding: '0.5rem', background: '#fff', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                                            {(checkpointImages[label] || []).map((img, i) => {
                                                const imageUrl = typeof img === 'string' ? img : img.url;
                                                const isPending = typeof img === 'object' && img.pending;
                                                
                                                return (
                                                    <div key={i} style={{ 
                                                        position: 'relative', 
                                                        width: 56, 
                                                        height: 56, 
                                                        borderRadius: '6px', 
                                                        overflow: 'hidden', 
                                                        border: '2px solid var(--border-light)',
                                                        cursor: isPending ? 'not-allowed' : 'pointer'
                                                    }} onClick={() => !isPending && window.open(imageUrl, '_blank')}>
                                                        <img 
                                                            src={imageUrl} 
                                                            alt="proof" 
                                                            loading="lazy"
                                                            style={{ 
                                                                width: '100%', 
                                                                height: '100%', 
                                                                objectFit: 'cover',
                                                                opacity: isPending ? 0.4 : 1,
                                                                filter: isPending ? 'grayscale(1)' : 'none'
                                                            }} 
                                                        />
                                                        {isPending && (
                                                            <div className="flex-center" style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.4)' }}>
                                                                <Loader2 size={16} className="animate-spin text-primary" />
                                                            </div>
                                                        )}
                                                        {!isPending && (
                                                            <button 
                                                                type="button" 
                                                                style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(220,38,38,0.9)', color: '#fff', border: 'none', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: '0 0 0 4px' }} 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const newImgs = [...checkpointImages[label]];
                                                                    newImgs.splice(i, 1);
                                                                    setCheckpointImages({...checkpointImages, [label]: newImgs});
                                                                }}
                                                            >
                                                                <X size={10} strokeWidth={3} />
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {/* Parallel Upload Slot Indication */}
                                            {uploadingStatus[label] > 0 && (
                                                <div style={{ width: 56, height: 56, border: '2px dashed var(--primary-alpha)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
                                                    <Loader2 size={18} className="animate-spin text-primary" opacity={0.5} />
                                                </div>
                                            )}
                                            {(checkpointImages[label] || []).length < 5 && (
                                                <button type="button" onClick={() => setCapturingFor(label)} style={{ width: 56, height: 56, border: '2px dashed var(--border)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--primary)', transition: 'all 0.2s' }} className="hover-lift">
                                                    <Plus size={18} />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {formData.result === 'Fail' && (
                        <div className="animate-fade-in" style={{
                            padding: '1.5rem',
                            border: '1px solid rgba(220,38,38,0.2)',
                            background: 'var(--error-bg)',
                            borderRadius: 'var(--radius-md)',
                            marginBottom: '1rem'
                        }}>
                            <div className="input-field" style={{ marginBottom: '1rem' }}>
                                <label>Failure Remarks</label>
                                <textarea required rows={3} placeholder="Describe the issue..." onChange={e => setFormData({ ...formData, details: { ...formData.details, remarks: e.target.value } })} />
                            </div>
                            <div className="input-field">
                                <label>Disposition</label>
                                <div className="grid grid-2 gap-2">
                                    <button type="button" className={`btn ${formData.decision === 'debug' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFormData({ ...formData, decision: 'debug' })}>Debug</button>
                                    {station.id === 2 && <button type="button" className={`btn ${formData.decision === 'scrap_review' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setFormData({ ...formData, decision: 'scrap_review' })}>Scrap Review</button>}
                                </div>
                            </div>
                        </div>
                    )}
                    {renderActionButtons()}
                </div>

                {capturingFor && (
                    <ImageCapture 
                        title={`Capture Proof: ${capturingFor}`} 
                        onCapture={handleImageAttach} 
                        onClose={() => setCapturingFor(null)} 
                    />
                )}
                

            </form>
        );
    }

    // ─── Identification ───
    const currentStationName = (station.name || '').toUpperCase();
    const displayStationName = (getDisplayName('stations', station.name) || '').toUpperCase();
    const isDebug = (projectCategory === 'Device' && station.id === 3) || currentStationName.includes('DEBUG') || displayStationName.includes('DEBUG');
    const isRework = (projectCategory === 'Device' && station.id === 4) || currentStationName.includes('REWORK') || displayStationName.includes('REWORK');

    // ─── Debug Form ───
    if (isDebug) {
        return (
            <form className="card animate-fade-in" onSubmit={handleStationSubmit}>
                <div className="card-header">
                    <div>
                        <h2 className="font-extrabold" style={{ fontSize: '1.25rem' }}>{getDisplayName('stations', station.name)}</h2>
                        <p className="text-xs text-muted">Analysis and troubleshooting</p>
                    </div>
                    <div className="text-mono font-extrabold" style={{ fontSize: '1.25rem' }}>{unitId}</div>
                </div>
                <div className="card-body">
                    <div className="input-field" style={{ marginBottom: '1.5rem' }}>
                        <label>Debug Remarks</label>
                        <textarea
                            required
                            rows={3}
                            placeholder="Describe troubleshooting steps or discovered issue..."
                            value={formData.details.remarks || ''}
                            onChange={e => setFormData({ ...formData, details: { ...formData.details, remarks: e.target.value } })}
                        />
                    </div>
                    <div className="input-field" style={{ marginBottom: '1rem' }}>
                        <label>Operational Result</label>
                        <div className="grid grid-2 gap-3">
                            <button type="button" className={`btn ${formData.result === 'Pass' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFormData({ ...formData, result: 'Pass' })} style={{ height: 60, fontSize: '1.0625rem' }}>Pass</button>
                            <button type="button" className={`btn ${formData.result === 'Fail' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setFormData({ ...formData, result: 'Fail' })} style={{ height: 60, fontSize: '1.0625rem' }}>Fail</button>
                        </div>
                    </div>
                    {renderActionButtons()}
                </div>
            </form>
        );
    }

    // ─── Rework Form (MES 2.0 with BAAN Integration) ───
    if (isRework) {
        // Safeguard for Normal Rework
        const handleNormalReworkStart = () => {
            const existingRequest = Object.values(store.baan.partRequests || {}).find(r => r.deviceSn === unitId && r.status !== 'Consumed' && r.status !== 'Consumption Completed');
            if (existingRequest) {
                alert(`CRITICAL ALERT: A pending BAAN Part Request (${existingRequest.id}) exists for this SN. ` +
                    `Normal Rework is blocked. Please select "Part Change" to consume issued parts.`);
                return;
            }
            setReworkType('NORMAL');
        };

        return (
            <div className="card animate-fade-in">
                <div className="card-header">
                    <div>
                        <h2 className="font-extrabold" style={{ fontSize: '1.25rem' }}>{getDisplayName('stations', station.name)}</h2>
                        <p className="text-xs text-muted">BAAN Integrated Repair Control</p>
                    </div>
                    <div className="text-mono font-extrabold" style={{ fontSize: '1.25rem' }}>{unitId}</div>
                </div>

                <div className="card-body">
                    {/* Step 1: Select Rework Type */}
                    {!reworkType && (
                        <div className="animate-fade-in">
                            <h3 className="text-sm font-bold mb-4 uppercase text-muted">Select Rework Type</h3>
                            <div className="grid md-grid-2 gap-4">
                                <button className="card p-6 flex-center flex-col gap-3 hover-lift clickable" onClick={handleNormalReworkStart}>
                                    <RefreshCw size={32} color="var(--primary)" />
                                    <div className="text-center">
                                        <p className="font-bold">Normal Rework</p>
                                        <p className="text-xs text-muted">Software or minor adjustments (No parts)</p>
                                    </div>
                                </button>
                                <button className="card p-6 flex-center flex-col gap-3 hover-lift clickable" onClick={() => setReworkType('REPLACEMENT')}>
                                    <PackageCheck size={32} color="var(--success)" />
                                    <div className="text-center">
                                        <p className="font-bold">Part Change</p>
                                        <p className="text-xs text-muted">Requires Active BAAN Part Request</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Repair Details Form */}
                    {(reworkType === 'NORMAL' || reworkType === 'REPLACEMENT') && (
                        <form className="animate-fade-in" onSubmit={handleStationSubmit}>
                            <div className="flex-between mb-4">
                                <span className={`status-pill ${reworkType === 'NORMAL' ? 'info' : 'success'} font-bold`}>
                                    {reworkType === 'NORMAL' ? 'Normal Rework' : 'Part Change'}
                                </span>
                                {reworkType !== 'NORMAL' && (
                                    <button type="button" className="btn-ghost flex-center gap-1 text-xs" onClick={() => { setReworkType(null); setBaanRequestId(''); }}>
                                        <ArrowLeft size={12} /> Change Type
                                    </button>
                                )}
                            </div>

                            {reworkType === 'REPLACEMENT' && (
                                <div className="p-4 bg-faded rounded border mb-4">
                                    <div className="input-field mb-3">
                                        <label>Select Issued Request</label>
                                        <select 
                                            required
                                            value={baanRequestId}
                                            onChange={e => {
                                                setBaanRequestId(e.target.value);
                                                setPartChangeQty(1);
                                            }}
                                        >
                                            <option value="">-- Select active issued request --</option>
                                            {activeIssuedRequests.map(r => (
                                                <option key={r.id} value={r.id}>
                                                    {r.id} - {r.partNo} ({r.remainingQty} remaining)
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    {baanRequestId && store.baan.partRequests[baanRequestId] && (
                                        <>
                                            <div className="grid grid-2 gap-4 mb-3">
                                                <div>
                                                    <label className="text-xs font-bold uppercase text-muted block mb-1">Part Details</label>
                                                    <div className="text-sm font-semibold">{store.baan.partRequests[baanRequestId].partNo}</div>
                                                    <div className="text-xs text-muted">{store.baan.partRequests[baanRequestId].partName}</div>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold uppercase text-muted block mb-1">Consume Quantity</label>
                                                    <input 
                                                        type="number" 
                                                        min="1" 
                                                        max={store.baan.partRequests[baanRequestId].remainingQty}
                                                        value={partChangeQty}
                                                        onChange={e => setPartChangeQty(Math.min(e.target.value, store.baan.partRequests[baanRequestId].remainingQty))}
                                                        required
                                                    />
                                                </div>
                                            </div>
                                            <div className="input-field">
                                                <label>Reason for Part Change</label>
                                                <input 
                                                    type="text" 
                                                    placeholder="e.g. Damaged during assembly"
                                                    value={partChangeReason}
                                                    onChange={e => setPartChangeReason(e.target.value)}
                                                    required
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            <div className="input-field" style={{ marginBottom: '1.5rem' }}>
                                <label>Repair Remarks</label>
                                <textarea
                                    required
                                    rows={3}
                                    placeholder="Describe repair actions performed..."
                                    value={formData.details.remarks || ''}
                                    onChange={e => setFormData({ ...formData, details: { ...formData.details, remarks: e.target.value } })}
                                />
                            </div>

                            <div className="input-field" style={{ marginBottom: '1rem' }}>
                                <label>Operational Result</label>
                                <div className="grid grid-2 gap-3">
                                    <button type="button" className={`btn ${formData.result === 'Pass' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFormData({ ...formData, result: 'Pass' })} style={{ height: 60, fontSize: '1.0625rem' }}>Pass</button>
                                    <button type="button" className={`btn ${formData.result === 'Fail' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setFormData({ ...formData, result: 'Fail' })} style={{ height: 60, fontSize: '1.0625rem' }}>Fail</button>
                                </div>
                            </div>

                            {renderActionButtons()}
                        </form>
                    )}
                </div>
            </div>
        );
    }

    // ─── Default Form ───
    return (
        <form className="card animate-fade-in" onSubmit={handleStationSubmit}>
            <div className="card-header">
                <div>
                    <h2 className="font-extrabold" style={{ fontSize: '1.25rem' }}>{getDisplayName('stations', station.name)}</h2>
                    <p className="text-xs text-muted">Standard Process Confirmation (Default v2)</p>
                </div>

                <div className="text-mono font-extrabold" style={{ fontSize: '1.25rem' }}>{unitId}</div>
            </div>
            <div className="card-body">
                <div className="input-field" style={{ marginBottom: '1rem' }}>
                    <label>Operational Result</label>
                    <div className="grid grid-2 gap-3">
                        <button type="button" className={`btn ${formData.result === 'Pass' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFormData({ ...formData, result: 'Pass' })} style={{ height: 60, fontSize: '1.0625rem' }}>Pass</button>
                        <button type="button" className={`btn ${formData.result === 'Fail' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setFormData({ ...formData, result: 'Fail' })} style={{ height: 60, fontSize: '1.0625rem' }}>Fail</button>
                    </div>
                </div>
                {renderActionButtons()}
            </div>
        </form>
    );
};

export default Stations;
