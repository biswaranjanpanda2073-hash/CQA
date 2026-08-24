import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Scan,
    Search,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    ShieldAlert,
    ArrowRight,
    FastForward,
    CornerDownLeft,
    RefreshCw,
    FileSpreadsheet,
    Upload,
    Layers,
    ListFilter,
    ShieldCheck,
    Check,
    X,
    Clock,
    User,
    Calendar,
    ChevronRight,
    ChevronDown,
    Loader2,
    Download,
    Eye,
    RotateCcw,
    FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useCQA } from '../hooks/useCQA';
import QRScanner from './QRScanner';
import {
    PROJECT_WORKFLOWS,
    REASON_CATEGORIES,
    normalizeSerialNumbers,
    calculateSkippedStations,
    calculateMovementClassification,
    calculateRiskLevel
} from '../utils/movementEngine';

export const UnitSerialConfig = ({ user, initialSerial, onNavigateToInfo }) => {
    const {
        validateMovementUnits,
        executeAdminMovement,
        reverseAdminMovement,
        fetchAdminMovements,
        getDisplayName
    } = useCQA();

    // Check authorization
    const isAuthorized = user?.role === 'Admin' || user?.role === 'Super Admin';

    // Top-level tab: 'wizard' | 'history'
    const [activeTab, setActiveTab] = useState('wizard');

    // ─── WIZARD STATE ───
    const [wizardStep, setWizardStep] = useState(1); // 1: Select, 2: Validate, 3: Destination, 4: Reason, 5: Impact/Confirm, 6: Executing, 7: Report
    const [inputMode, setInputMode] = useState('single'); // 'single' | 'bulk'
    const [singleInput, setSingleInput] = useState(initialSerial || '');
    const [bulkInput, setBulkInput] = useState('');
    const [showScanner, setShowScanner] = useState(false);

    // Validation State
    const [isValidating, setIsValidating] = useState(false);
    const [validationData, setValidationData] = useState(null);
    const [tableFilter, setTableFilter] = useState('ALL');
    const [tableSearch, setTableSearch] = useState('');

    // Destination State
    const [selectedProject, setSelectedProject] = useState('Device');
    const [selectedTargetStationId, setSelectedTargetStationId] = useState(null);

    // Reason State
    const [reasonCategory, setReasonCategory] = useState('Engineering');
    const [selectedReason, setSelectedReason] = useState(REASON_CATEGORIES['Engineering'][0]);
    const [remarks, setRemarks] = useState('');

    // Confirmation State
    const [skippedCheckbox, setSkippedCheckbox] = useState(false);
    const [typedConfirmInput, setTypedConfirmInput] = useState('');

    // Execution State
    const [isExecuting, setIsExecuting] = useState(false);
    const [executionProgress, setExecutionProgress] = useState({ currentBatch: 0, totalBatches: 0, processedCount: 0, totalCount: 0, percentage: 0 });
    const [executionReport, setExecutionReport] = useState(null);

    // ─── HISTORY TAB STATE ───
    const [movementHistory, setMovementHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historySearch, setHistorySearch] = useState('');
    const [selectedMovementDetail, setSelectedMovementDetail] = useState(null);
    const [reversingId, setReversingId] = useState(null);

    const fileInputRef = useRef(null);

    // Load initial serial if provided
    useEffect(() => {
        if (initialSerial) {
            setSingleInput(initialSerial);
            setInputMode('single');
        }
    }, [initialSerial]);

    // Load history when switching to history tab
    useEffect(() => {
        if (activeTab === 'history') {
            loadHistory();
        }
    }, [activeTab]);

    const loadHistory = async () => {
        setHistoryLoading(true);
        try {
            const list = await fetchAdminMovements();
            setMovementHistory(list);
        } catch (e) {
            console.error(e);
        } finally {
            setHistoryLoading(false);
        }
    };

    if (!isAuthorized) {
        return (
            <div className="card" style={{ padding: '3rem 2rem', textAlign: 'center', maxWidth: 600, margin: '2rem auto' }}>
                <ShieldAlert size={48} color="var(--error)" style={{ margin: '0 auto 1rem' }} />
                <h2 className="font-bold text-xl" style={{ marginBottom: '0.5rem' }}>Access Denied</h2>
                <p className="text-muted text-sm">
                    The <strong>Unit/Serial Configuration</strong> module is strictly restricted to Admin and Super Admin roles.
                </p>
            </div>
        );
    }

    // ─── FILE UPLOAD HANDLER ───
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

                // Flatten all rows and columns to find strings
                const extracted = [];
                data.forEach(row => {
                    if (Array.isArray(row)) {
                        row.forEach(cell => {
                            if (cell && String(cell).trim()) {
                                extracted.push(String(cell).trim());
                            }
                        });
                    }
                });

                if (extracted.length > 0) {
                    setBulkInput(prev => prev ? `${prev}\n${extracted.join('\n')}` : extracted.join('\n'));
                    setInputMode('bulk');
                }
            } catch (err) {
                alert('Failed to parse Excel / CSV file: ' + err.message);
            }
        };
        reader.readAsBinaryString(file);
    };

    // ─── STEP 1 -> STEP 2: RUN VALIDATION ───
    const handleStartValidation = async () => {
        const raw = inputMode === 'single' ? singleInput : bulkInput;
        if (!raw || !raw.trim()) {
            alert('Please enter or paste at least one Serial Number.');
            return;
        }

        setIsValidating(true);
        try {
            const res = await validateMovementUnits(raw, selectedTargetStationId, user);
            setValidationData(res);

            // Auto-detect predominant project if possible
            const projects = Object.keys(res.groupedByProject || {}).filter(p => p !== 'Unknown');
            if (projects.length > 0) {
                setSelectedProject(projects[0]);
            }

            setWizardStep(2);
        } catch (err) {
            alert('Validation error: ' + err.message);
        } finally {
            setIsValidating(false);
        }
    };

    // Filtered validation rows
    const filteredValidationRows = useMemo(() => {
        if (!validationData?.validatedUnits) return [];
        return validationData.validatedUnits.filter(u => {
            const matchesFilter = tableFilter === 'ALL' || u.validationStatus === tableFilter;
            const matchesSearch = !tableSearch || u.serialNumber.toLowerCase().includes(tableSearch.toLowerCase()) || u.stationName.toLowerCase().includes(tableSearch.toLowerCase());
            return matchesFilter && matchesSearch;
        });
    }, [validationData, tableFilter, tableSearch]);

    // Available target stations based on selected project workflow
    const targetStationOptions = useMemo(() => {
        return PROJECT_WORKFLOWS[selectedProject] || PROJECT_WORKFLOWS['Device'];
    }, [selectedProject]);

    // Target station object
    const selectedTargetStationObj = useMemo(() => {
        if (!selectedTargetStationId) return null;
        return targetStationOptions.find(s => s.id === Number(selectedTargetStationId)) || null;
    }, [selectedTargetStationId, targetStationOptions]);

    // Calculate Impact for all eligible units
    const impactSummary = useMemo(() => {
        if (!validationData?.validatedUnits || !selectedTargetStationObj) {
            return {
                totalEligible: 0,
                totalExcluded: 0,
                classification: 'FORWARD_REROUTE',
                maxRisk: 'LOW',
                skippedStats: {},
                sampleUnit: null,
                requiredConfirmPhrase: null
            };
        }

        const eligible = validationData.validatedUnits.filter(u => u.isValid || u.validationStatus === 'READY_TO_MOVE');
        const excluded = validationData.validatedUnits.filter(u => !u.isValid && u.validationStatus !== 'READY_TO_MOVE');

        const targetStId = selectedTargetStationObj.id;
        const skippedMap = {};
        let dominantClassification = 'FORWARD_REROUTE';
        let highestRisk = 'LOW';

        eligible.forEach(u => {
            const fromStId = u.currentStation || 1;
            const p = u.project || selectedProject;
            const skipped = calculateSkippedStations(fromStId, targetStId, p);
            const classification = calculateMovementClassification(fromStId, targetStId, p, u.status);
            const risk = calculateRiskLevel(fromStId, targetStId, p, u.status, skipped);

            dominantClassification = classification;

            if (risk === 'HIGH') highestRisk = 'HIGH';
            else if (risk === 'MEDIUM' && highestRisk !== 'HIGH') highestRisk = 'MEDIUM';

            skipped.forEach(s => {
                skippedMap[s.stationName] = (skippedMap[s.stationName] || 0) + 1;
            });
        });

        let requiredPhrase = null;
        if (selectedTargetStationObj.type === 'TERMINAL_FG') requiredPhrase = 'MOVE TO FG';
        else if (selectedTargetStationObj.type === 'TERMINAL_SCRAP') requiredPhrase = (selectedProject === 'Device') ? 'SCRAP' : 'REJECT';
        else if (dominantClassification === 'ADMIN_REOPEN') requiredPhrase = 'REOPEN';

        return {
            totalEligible: eligible.length,
            totalExcluded: excluded.length,
            classification: dominantClassification,
            maxRisk: highestRisk,
            skippedStats: skippedMap,
            sampleUnit: eligible[0] || null,
            requiredConfirmPhrase: requiredPhrase
        };
    }, [validationData, selectedTargetStationObj, selectedProject]);

    // ─── EXECUTE MOVEMENT ───
    const handleExecuteMovement = async () => {
        if (!selectedTargetStationObj) {
            alert('Please choose a destination station.');
            return;
        }

        if (!reasonCategory || !selectedReason) {
            alert('Reason category and reason are mandatory.');
            return;
        }

        if (reasonCategory === 'Other' && !remarks.trim()) {
            alert('Remarks are mandatory when reason is "Other".');
            return;
        }

        if (impactSummary.maxRisk === 'MEDIUM' && !skippedCheckbox) {
            alert('Please check the confirmation box acknowledging skipped stations.');
            return;
        }

        if (impactSummary.requiredConfirmPhrase && typedConfirmInput.trim().toUpperCase() !== impactSummary.requiredConfirmPhrase.toUpperCase()) {
            alert(`Please type "${impactSummary.requiredConfirmPhrase}" to confirm this high-risk movement.`);
            return;
        }

        setIsExecuting(true);
        setWizardStep(6);

        try {
            const res = await executeAdminMovement({
                units: validationData.validatedUnits,
                targetStationId: selectedTargetStationObj.id,
                targetStationName: selectedTargetStationObj.name,
                reasonCategory,
                reason: selectedReason,
                remarks,
                user,
                onProgress: (p) => setExecutionProgress(p)
            });

            setExecutionReport(res);
            setWizardStep(7);
        } catch (err) {
            alert('Execution failed: ' + err.message);
            setWizardStep(5);
        } finally {
            setIsExecuting(false);
        }
    };

    // ─── REVERSE MOVEMENT ───
    const handleReverseMovement = async (movId) => {
        if (!window.confirm(`Are you sure you want to REVERSE movement ${movId}? This will safely route affected units back to their previous stations and log a reversal audit transaction.`)) {
            return;
        }

        setReversingId(movId);
        try {
            const res = await reverseAdminMovement(movId, user);
            alert(`Movement ${movId} reversed successfully! Reversal Transaction: ${res.reversalMovementId}. Success: ${res.successCount}, Failures: ${res.failedCount}`);
            loadHistory();
            if (selectedMovementDetail?.movementId === movId) {
                setSelectedMovementDetail(null);
            }
        } catch (err) {
            alert('Reversal failed: ' + err.message);
        } finally {
            setReversingId(null);
        }
    };

    // ─── EXPORT REPORT ───
    const handleExportReport = () => {
        if (!executionReport) return;
        const rows = [
            ['Movement ID', executionReport.movementId],
            ['Status', executionReport.status],
            ['Target Station', selectedTargetStationObj?.name || ''],
            ['Reason Category', reasonCategory],
            ['Reason', selectedReason],
            ['Remarks', remarks],
            ['Success Count', executionReport.success],
            ['Failed Count', executionReport.failed],
            [],
            ['Serial Number', 'Status', 'Details']
        ];

        (executionReport.successUnits || []).forEach(u => {
            rows.push([u.serialNumber, 'SUCCESS', `Moved from ${u.fromStation} to ${u.toStation}`]);
        });
        (executionReport.failedUnits || []).forEach(u => {
            rows.push([u.serialNumber, 'FAILED', u.error || 'Execution failed']);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Movement_Report');
        XLSX.writeFile(wb, `${executionReport.movementId}_Report.xlsx`);
    };

    // Reset Wizard
    const handleResetWizard = () => {
        setWizardStep(1);
        setSingleInput('');
        setBulkInput('');
        setValidationData(null);
        setSelectedTargetStationId(null);
        setReasonCategory('Engineering');
        setSelectedReason(REASON_CATEGORIES['Engineering'][0]);
        setRemarks('');
        setSkippedCheckbox(false);
        setTypedConfirmInput('');
        setExecutionReport(null);
    };

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '3rem' }}>
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="page-title">Unit/Serial Configuration</h1>
                    <p className="page-subtitle">Administrative movement, station fast-tracking, and workflow rerouting</p>
                </div>

                {/* Sub-tab switcher */}
                <div className="tab-switcher" style={{ maxWidth: 360, margin: 0 }}>
                    <button
                        className={`tab-item ${activeTab === 'wizard' ? 'active' : ''}`}
                        onClick={() => setActiveTab('wizard')}
                    >
                        <Layers size={14} /> Movement Wizard
                    </button>
                    <button
                        className={`tab-item ${activeTab === 'history' ? 'active' : ''}`}
                        onClick={() => setActiveTab('history')}
                    >
                        <Clock size={14} /> Audit History
                    </button>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════
               TAB 1: UNIFIED MOVEMENT WIZARD
               ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'wizard' && (
                <div>
                    {/* Stepper Progress Bar */}
                    <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                            {[
                                { step: 1, label: 'Select Units' },
                                { step: 2, label: 'Validate' },
                                { step: 3, label: 'Destination' },
                                { step: 4, label: 'Reason' },
                                { step: 5, label: 'Review Impact' },
                                { step: 6, label: 'Execute' },
                                { step: 7, label: 'Report' }
                            ].map(({ step, label }, idx) => {
                                const isPassed = wizardStep > step;
                                const isCurrent = wizardStep === step;

                                return (
                                    <React.Fragment key={step}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, minWidth: 65, textAlign: 'center' }}>
                                            <div style={{
                                                width: 30, height: 30, borderRadius: '50%',
                                                background: isPassed ? 'var(--success)' : isCurrent ? 'var(--primary)' : 'var(--bg-input)',
                                                color: (isPassed || isCurrent) ? '#fff' : 'var(--text-muted)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '12px', fontWeight: 800,
                                                boxShadow: isCurrent ? '0 0 0 4px var(--primary-alpha)' : 'none',
                                                transition: 'all 0.2s'
                                            }}>
                                                {isPassed ? <Check size={14} strokeWidth={3} /> : step}
                                            </div>
                                            <span style={{
                                                fontSize: '10px', marginTop: 4, fontWeight: isCurrent ? 700 : 500,
                                                color: isCurrent ? 'var(--primary)' : isPassed ? 'var(--text-main)' : 'var(--text-muted)'
                                            }}>
                                                {label}
                                            </span>
                                        </div>
                                        {idx < 6 && (
                                            <div style={{
                                                flex: 1, height: 2,
                                                background: wizardStep > step ? 'var(--success)' : 'var(--border)',
                                                margin: '0 4px 14px'
                                            }} />
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>

                    {/* ─── STEP 1: SELECT UNITS ─── */}
                    {wizardStep === 1 && (
                        <div className="card animate-fade-in">
                            <div className="card-header">
                                <div>
                                    <h3 className="font-bold" style={{ fontSize: '1rem' }}>Step 1 — Select Units for Movement</h3>
                                    <p className="text-xs text-muted">Choose single Serial Number lookup or bulk multi-serial upload</p>
                                </div>
                                <div className="tab-switcher" style={{ maxWidth: 260, margin: 0 }}>
                                    <button
                                        className={`tab-item ${inputMode === 'single' ? 'active' : ''}`}
                                        onClick={() => setInputMode('single')}
                                    >
                                        Find One Unit
                                    </button>
                                    <button
                                        className={`tab-item ${inputMode === 'bulk' ? 'active' : ''}`}
                                        onClick={() => setInputMode('bulk')}
                                    >
                                        Select Multiple
                                    </button>
                                </div>
                            </div>

                            <div className="card-body" style={{ padding: '1.5rem' }}>
                                {inputMode === 'single' ? (
                                    <div style={{ maxWidth: 540 }}>
                                        <label className="text-xs font-bold uppercase tracking-wide text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>
                                            Serial Number
                                        </label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <div style={{ position: 'relative', flex: 1 }}>
                                                <input
                                                    type="text"
                                                    placeholder="Scan or type Serial Number (e.g. SN12345)..."
                                                    value={singleInput}
                                                    onChange={e => setSingleInput(e.target.value.toUpperCase().replace(/\//g, '-'))}
                                                    className="font-bold text-mono"
                                                    style={{ height: 48, fontSize: '0.9375rem', width: '100%' }}
                                                    autoFocus
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                style={{ height: 48, padding: '0 1rem' }}
                                                onClick={() => setShowScanner(!showScanner)}
                                                title="Open Camera QR/Barcode Scanner"
                                            >
                                                <Scan size={18} />
                                            </button>
                                        </div>

                                        {showScanner && (
                                            <div style={{ marginTop: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.5rem' }}>
                                                <QRScanner
                                                    onScan={(scanned) => {
                                                        setSingleInput(scanned.toUpperCase().replace(/\//g, '-'));
                                                        setShowScanner(false);
                                                    }}
                                                    onClose={() => setShowScanner(false)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                <label className="text-xs font-bold uppercase tracking-wide text-muted">
                                                    Paste Serial Numbers (Comma, Newline, or Space separated)
                                                </label>
                                                <button
                                                    type="button"
                                                    className="btn-ghost text-xs"
                                                    style={{ color: 'var(--primary)', padding: '2px 8px' }}
                                                    onClick={() => fileInputRef.current?.click()}
                                                >
                                                    <Upload size={13} /> Upload Excel (.xlsx) / CSV
                                                </button>
                                                <input
                                                    type="file"
                                                    ref={fileInputRef}
                                                    style={{ display: 'none' }}
                                                    accept=".xlsx,.xls,.csv"
                                                    onChange={handleFileUpload}
                                                />
                                            </div>
                                            <textarea
                                                rows={7}
                                                placeholder={`Paste Serial Numbers here...\nSN0001\nSN0002\nSN0003, SN0004`}
                                                value={bulkInput}
                                                onChange={e => setBulkInput(e.target.value.toUpperCase())}
                                                className="font-bold text-mono text-sm"
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-input)' }}
                                            />
                                        </div>

                                        {/* Real-time input stats */}
                                        {(() => {
                                            const norm = normalizeSerialNumbers(bulkInput);
                                            if (norm.totalEntered === 0) return null;
                                            return (
                                                <div style={{
                                                    display: 'flex', gap: '1.5rem', background: 'var(--bg-input)',
                                                    padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)'
                                                }}>
                                                    <div>
                                                        <span className="text-xs text-muted uppercase font-bold">Total Entered: </span>
                                                        <span className="font-bold text-mono">{norm.totalEntered}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-xs text-muted uppercase font-bold">Unique SNs: </span>
                                                        <span className="font-bold text-mono" style={{ color: 'var(--success)' }}>{norm.uniqueCount}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-xs text-muted uppercase font-bold">Duplicates Removed: </span>
                                                        <span className="font-bold text-mono" style={{ color: norm.duplicatesCount > 0 ? 'var(--warning)' : 'inherit' }}>{norm.duplicatesCount}</span>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>

                            <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem 1.5rem' }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleStartValidation}
                                    disabled={isValidating || !(inputMode === 'single' ? singleInput.trim() : bulkInput.trim())}
                                    style={{ height: 44, padding: '0 1.5rem' }}
                                >
                                    {isValidating ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                                    Validate Units
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ─── STEP 2: VALIDATION RESULTS ─── */}
                    {wizardStep === 2 && validationData && (
                        <div className="card animate-fade-in">
                            <div className="card-header">
                                <div>
                                    <h3 className="font-bold" style={{ fontSize: '1rem' }}>Step 2 — Unit Validation Summary</h3>
                                    <p className="text-xs text-muted">Review unit statuses, active project workflows, and movement eligibility</p>
                                </div>
                            </div>

                            <div className="card-body" style={{ padding: '1.5rem' }}>
                                {/* Metrics Cards */}
                                <div className="grid md-grid-3 md-grid-6 gap-3" style={{ marginBottom: '1.5rem' }}>
                                    <div className="card" style={{ padding: '0.75rem 1rem', borderLeft: '4px solid var(--success)' }}>
                                        <div className="text-xs font-bold text-muted uppercase">Ready to Move</div>
                                        <div className="text-xl font-extrabold text-mono" style={{ color: 'var(--success)' }}>
                                            {validationData.counts.ready}
                                        </div>
                                    </div>
                                    <div className="card" style={{ padding: '0.75rem 1rem', borderLeft: '4px solid var(--info)' }}>
                                        <div className="text-xs font-bold text-muted uppercase">At Destination</div>
                                        <div className="text-xl font-extrabold text-mono">
                                            {validationData.counts.alreadyAtDestination}
                                        </div>
                                    </div>
                                    <div className="card" style={{ padding: '0.75rem 1rem', borderLeft: '4px solid var(--error)' }}>
                                        <div className="text-xs font-bold text-muted uppercase">Locked</div>
                                        <div className="text-xl font-extrabold text-mono" style={{ color: 'var(--error)' }}>
                                            {validationData.counts.locked}
                                        </div>
                                    </div>
                                    <div className="card" style={{ padding: '0.75rem 1rem', borderLeft: '4px solid var(--warning)' }}>
                                        <div className="text-xs font-bold text-muted uppercase">Completed (FG)</div>
                                        <div className="text-xl font-extrabold text-mono" style={{ color: 'var(--warning)' }}>
                                            {validationData.counts.completed}
                                        </div>
                                    </div>
                                    <div className="card" style={{ padding: '0.75rem 1rem', borderLeft: '4px solid var(--text-muted)' }}>
                                        <div className="text-xs font-bold text-muted uppercase">Not Found</div>
                                        <div className="text-xl font-extrabold text-mono text-muted">
                                            {validationData.counts.notFound}
                                        </div>
                                    </div>
                                    <div className="card" style={{ padding: '0.75rem 1rem', borderLeft: '4px solid var(--primary)' }}>
                                        <div className="text-xs font-bold text-muted uppercase">Total Unique</div>
                                        <div className="text-xl font-extrabold text-mono">
                                            {validationData.counts.unique}
                                        </div>
                                    </div>
                                </div>

                                {/* Table Search & Filters */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        {['ALL', 'READY_TO_MOVE', 'ALREADY_AT_DESTINATION', 'LOCKED', 'COMPLETED_RESTRICTED', 'NOT_FOUND'].map(f => (
                                            <button
                                                key={f}
                                                className={`filter-chip ${tableFilter === f ? 'active' : ''}`}
                                                onClick={() => setTableFilter(f)}
                                                style={{ fontSize: '0.75rem' }}
                                            >
                                                {f.replace(/_/g, ' ')}
                                            </button>
                                        ))}
                                    </div>
                                    <div style={{ position: 'relative', width: 220 }}>
                                        <input
                                            type="text"
                                            placeholder="Search SN..."
                                            value={tableSearch}
                                            onChange={e => setTableSearch(e.target.value)}
                                            style={{ height: 34, paddingLeft: '2rem', fontSize: '0.8125rem' }}
                                        />
                                        <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)' }} />
                                    </div>
                                </div>

                                {/* Validation Table */}
                                <div className="table-to-cards" style={{ maxHeight: 340, overflowY: 'auto' }}>
                                    <div className="table-container card">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Serial Number</th>
                                                    <th>Project</th>
                                                    <th>Current Station</th>
                                                    <th>Status</th>
                                                    <th>Validation Result</th>
                                                    <th>Message</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredValidationRows.map(row => (
                                                    <tr key={row.id}>
                                                        <td data-label="Serial Number">
                                                            <span className="text-mono font-bold text-sm">{row.serialNumber}</span>
                                                        </td>
                                                        <td data-label="Project">
                                                            <span className="status-pill info" style={{ fontSize: '0.65rem' }}>{row.project}</span>
                                                        </td>
                                                        <td data-label="Current Station">
                                                            <span className="font-semibold text-xs">{row.stationName}</span>
                                                        </td>
                                                        <td data-label="Status">
                                                            <span className={`status-pill ${row.status.toLowerCase()}`}>{row.status}</span>
                                                        </td>
                                                        <td data-label="Validation Result">
                                                            <span className={`status-pill ${row.isValid ? 'success' : 'error'}`} style={{ fontSize: '0.65rem' }}>
                                                                {row.validationStatus.replace(/_/g, ' ')}
                                                            </span>
                                                        </td>
                                                        <td data-label="Message">
                                                            <span className="text-xs text-muted">{row.message}</span>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {filteredValidationRows.length === 0 && (
                                                    <tr>
                                                        <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                                                            No units matching filter.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 1.5rem' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setWizardStep(1)}
                                >
                                    Cancel and Correct
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => setWizardStep(3)}
                                    disabled={validationData.counts.ready === 0}
                                    style={{ height: 44, padding: '0 1.5rem' }}
                                >
                                    Move Valid Units Only ({validationData.counts.ready}) <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ─── STEP 3: CHOOSE DESTINATION ─── */}
                    {wizardStep === 3 && (
                        <div className="card animate-fade-in">
                            <div className="card-header">
                                <div>
                                    <h3 className="font-bold" style={{ fontSize: '1rem' }}>Step 3 — Choose Destination Station</h3>
                                    <p className="text-xs text-muted">Select target workflow station configured for this production line</p>
                                </div>
                            </div>

                            <div className="card-body" style={{ padding: '1.5rem' }}>
                                {/* Project selector */}
                                <div style={{ maxWidth: 360, marginBottom: '1.5rem' }}>
                                    <label className="text-xs font-bold uppercase tracking-wide text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>
                                        Project Workflow
                                    </label>
                                    <select
                                        value={selectedProject}
                                        onChange={e => {
                                            setSelectedProject(e.target.value);
                                            setSelectedTargetStationId(null);
                                        }}
                                        style={{ height: 44, fontSize: '0.9375rem' }}
                                    >
                                        <option value="Device">Device Workflow</option>
                                        <option value="Peripherals">Peripherals Workflow</option>
                                        <option value="Inward QC">Inward QC Workflow</option>
                                    </select>
                                </div>

                                {/* Destination Station Grid */}
                                <label className="text-xs font-bold uppercase tracking-wide text-muted" style={{ display: 'block', marginBottom: '0.75rem' }}>
                                    Select Target Station ({selectedProject})
                                </label>
                                <div className="grid md-grid-2 md-grid-4 gap-3" style={{ marginBottom: '1.5rem' }}>
                                    {targetStationOptions.map(st => {
                                        const isSelected = selectedTargetStationId === st.id;
                                        const isTerminal = st.type === 'TERMINAL_FG' || st.type === 'TERMINAL_SCRAP';

                                        return (
                                            <div
                                                key={st.id}
                                                className={`card clickable ${isSelected ? 'active' : ''}`}
                                                style={{
                                                    padding: '1rem',
                                                    border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                                                    background: isSelected ? 'var(--primary-alpha)' : 'var(--bg-card)',
                                                    cursor: 'pointer',
                                                    borderRadius: 'var(--radius-md)',
                                                    transition: 'all 0.15s'
                                                }}
                                                onClick={() => setSelectedTargetStationId(st.id)}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                                    <span className="text-xs font-extrabold text-mono" style={{ color: 'var(--text-muted)' }}>
                                                        STATION {st.id}
                                                    </span>
                                                    {isTerminal && (
                                                        <span className="status-pill warning" style={{ fontSize: '0.5625rem', padding: '1px 5px' }}>
                                                            TERMINAL
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="font-bold text-sm" style={{ color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>
                                                    {getDisplayName('stations', st.name) || st.name}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {selectedTargetStationObj && (
                                    <div style={{
                                        background: 'var(--bg-input)', padding: '1rem',
                                        borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)'
                                    }}>
                                        <div className="text-xs font-bold uppercase text-muted" style={{ marginBottom: '0.25rem' }}>Target Destination Selected:</div>
                                        <div className="font-extrabold text-sm" style={{ color: 'var(--primary)' }}>
                                            {selectedTargetStationObj.name} (Station ID: {selectedTargetStationObj.id})
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 1.5rem' }}>
                                <button className="btn btn-secondary" onClick={() => setWizardStep(2)}>
                                    Back to Validation
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => setWizardStep(4)}
                                    disabled={!selectedTargetStationId}
                                    style={{ height: 44, padding: '0 1.5rem' }}
                                >
                                    Continue to Reason <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ─── STEP 4: PROVIDE REASON ─── */}
                    {wizardStep === 4 && (
                        <div className="card animate-fade-in">
                            <div className="card-header">
                                <div>
                                    <h3 className="font-bold" style={{ fontSize: '1rem' }}>Step 4 — Mandatory Reason & Audit Context</h3>
                                    <p className="text-xs text-muted">Provide operational justification for quality traceability and MES audit logs</p>
                                </div>
                            </div>

                            <div className="card-body" style={{ padding: '1.5rem' }}>
                                <div className="grid md-grid-2 gap-4" style={{ marginBottom: '1.5rem' }}>
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wide text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>
                                            Reason Category *
                                        </label>
                                        <select
                                            value={reasonCategory}
                                            onChange={e => {
                                                const cat = e.target.value;
                                                setReasonCategory(cat);
                                                setSelectedReason(REASON_CATEGORIES[cat][0]);
                                            }}
                                            style={{ height: 44, fontSize: '0.9375rem' }}
                                        >
                                            {Object.keys(REASON_CATEGORIES).map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wide text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>
                                            Specific Reason *
                                        </label>
                                        <select
                                            value={selectedReason}
                                            onChange={e => setSelectedReason(e.target.value)}
                                            style={{ height: 44, fontSize: '0.9375rem' }}
                                        >
                                            {(REASON_CATEGORIES[reasonCategory] || []).map(r => (
                                                <option key={r} value={r}>{r}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wide text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>
                                        Remarks / Authorization Details {reasonCategory === 'Other' || impactSummary.maxRisk === 'HIGH' ? '*' : '(Optional)'}
                                    </label>
                                    <textarea
                                        rows={3}
                                        placeholder="e.g. Authorized by Quality Lead for urgent batch dispatch..."
                                        value={remarks}
                                        onChange={e => setRemarks(e.target.value)}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-input)' }}
                                    />
                                </div>
                            </div>

                            <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 1.5rem' }}>
                                <button className="btn btn-secondary" onClick={() => setWizardStep(3)}>
                                    Back to Destination
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => setWizardStep(5)}
                                    disabled={!selectedReason || (reasonCategory === 'Other' && !remarks.trim())}
                                    style={{ height: 44, padding: '0 1.5rem' }}
                                >
                                    Review Impact & Confirm <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ─── STEP 5: REVIEW IMPACT & CONFIRM ─── */}
                    {wizardStep === 5 && (
                        <div className="card animate-fade-in">
                            <div className="card-header">
                                <div>
                                    <h3 className="font-bold" style={{ fontSize: '1rem' }}>Step 5 — Review Movement Impact & Confirm</h3>
                                    <p className="text-xs text-muted">Verify skipped stations, lifecycle direction, and risk assessment before committing</p>
                                </div>
                                <span className={`risk-badge ${impactSummary.maxRisk.toLowerCase()}`}>
                                    {impactSummary.maxRisk} RISK
                                </span>
                            </div>

                            <div className="card-body" style={{ padding: '1.5rem' }}>
                                {/* Movement Classification Header */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '1rem 1.25rem', borderRadius: 'var(--radius-md)',
                                    background: 'var(--bg-input)', border: '1px solid var(--border-light)',
                                    marginBottom: '1.5rem'
                                }}>
                                    <div>
                                        <span className="text-xs font-bold text-muted uppercase">Movement Classification:</span>
                                        <div className="font-extrabold text-base" style={{ color: 'var(--primary)', marginTop: 2 }}>
                                            {impactSummary.classification.replace(/_/g, ' ')}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span className="text-xs font-bold text-muted uppercase">Destination:</span>
                                        <div className="font-extrabold text-base" style={{ color: 'var(--text-main)', marginTop: 2 }}>
                                            {selectedTargetStationObj?.name}
                                        </div>
                                    </div>
                                </div>

                                {/* Skipped Stations Summary */}
                                {Object.keys(impactSummary.skippedStats).length > 0 && (
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <div className="text-xs font-bold uppercase text-muted" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <FastForward size={14} color="var(--warning)" /> Automatically Calculated Skipped Stations:
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            {Object.entries(impactSummary.skippedStats).map(([stName, count]) => (
                                                <div
                                                    key={stName}
                                                    style={{
                                                        padding: '0.4rem 0.75rem',
                                                        background: 'var(--warning-bg)',
                                                        color: 'var(--warning)',
                                                        borderRadius: 'var(--radius-sm)',
                                                        border: '1px solid var(--warning)',
                                                        fontSize: '0.8125rem',
                                                        fontWeight: 700
                                                    }}
                                                >
                                                    {stName} ({count} Units Skipped)
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Reason Review */}
                                <div className="grid md-grid-2 gap-3" style={{
                                    background: 'var(--bg-input)', padding: '1rem',
                                    borderRadius: 'var(--radius-md)', marginBottom: '1.5rem'
                                }}>
                                    <div>
                                        <span className="text-xs font-bold text-muted uppercase">Reason:</span>
                                        <div className="font-bold text-sm">{reasonCategory} — {selectedReason}</div>
                                    </div>
                                    <div>
                                        <span className="text-xs font-bold text-muted uppercase">Remarks:</span>
                                        <div className="text-sm text-muted">{remarks || 'None provided'}</div>
                                    </div>
                                </div>

                                {/* Confirmation Section */}
                                {impactSummary.maxRisk === 'MEDIUM' && (
                                    <div style={{
                                        padding: '1rem', background: 'var(--warning-bg)',
                                        borderRadius: 'var(--radius-md)', border: '1px solid var(--warning)',
                                        marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem'
                                    }}>
                                        <input
                                            type="checkbox"
                                            id="confirmSkipped"
                                            checked={skippedCheckbox}
                                            onChange={e => setSkippedCheckbox(e.target.checked)}
                                            style={{ width: 18, height: 18, cursor: 'pointer' }}
                                        />
                                        <label htmlFor="confirmSkipped" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-main)', cursor: 'pointer' }}>
                                            I confirm that the skipped stations and movement route are authorized.
                                        </label>
                                    </div>
                                )}

                                {impactSummary.requiredConfirmPhrase && (
                                    <div style={{
                                        padding: '1rem', background: 'var(--error-bg)',
                                        borderRadius: 'var(--radius-md)', border: '1px solid var(--error)',
                                        marginBottom: '1rem'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                            <AlertTriangle size={16} color="var(--error)" />
                                            <span className="font-bold text-sm" style={{ color: 'var(--error)' }}>
                                                High Risk Action — Typed Confirmation Required
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted" style={{ marginBottom: '0.75rem' }}>
                                            To confirm this major lifecycle transition, please type <strong>{impactSummary.requiredConfirmPhrase}</strong> below:
                                        </p>
                                        <input
                                            type="text"
                                            placeholder={`Type ${impactSummary.requiredConfirmPhrase} here...`}
                                            value={typedConfirmInput}
                                            onChange={e => setTypedConfirmInput(e.target.value)}
                                            className="font-bold text-mono"
                                            style={{ height: 40, width: '100%', maxWidth: 300, background: 'var(--bg-card)' }}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 1.5rem' }}>
                                <button className="btn btn-secondary" onClick={() => setWizardStep(4)}>
                                    Back to Reason
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleExecuteMovement}
                                    style={{ height: 44, padding: '0 1.75rem' }}
                                >
                                    <ShieldCheck size={16} /> Execute Movement ({impactSummary.totalEligible} Units)
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ─── STEP 6: EXECUTING PROGRESS ─── */}
                    {wizardStep === 6 && (
                        <div className="card animate-fade-in" style={{ padding: '3rem 2rem', textAlign: 'center', maxWidth: 540, margin: '2rem auto' }}>
                            <Loader2 size={40} className="animate-spin text-primary" style={{ margin: '0 auto 1.5rem' }} />
                            <h3 className="font-bold text-lg" style={{ marginBottom: '0.5rem' }}>Processing Movement</h3>
                            <p className="text-sm text-muted" style={{ marginBottom: '1.5rem' }}>
                                Batch {executionProgress.currentBatch} of {executionProgress.totalBatches} — {executionProgress.percentage}%
                            </p>

                            <div style={{ width: '100%', height: 8, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden', marginBottom: '1rem' }}>
                                <div style={{
                                    height: '100%', width: `${executionProgress.percentage}%`,
                                    background: 'var(--primary)', transition: 'width 0.2s ease'
                                }} />
                            </div>

                            <span className="text-xs text-muted font-mono font-bold">
                                {executionProgress.processedCount} / {executionProgress.totalCount} Units Completed
                            </span>
                        </div>
                    )}

                    {/* ─── STEP 7: MOVEMENT REPORT ─── */}
                    {wizardStep === 7 && executionReport && (
                        <div className="card animate-fade-in">
                            <div className="card-header" style={{ padding: '1.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div className="flex-center" style={{
                                        width: 44, height: 44, borderRadius: 'var(--radius-md)',
                                        background: executionReport.failed === 0 ? 'var(--success-bg)' : 'var(--warning-bg)'
                                    }}>
                                        {executionReport.failed === 0 ? (
                                            <CheckCircle2 size={24} color="var(--success)" />
                                        ) : (
                                            <AlertTriangle size={24} color="var(--warning)" />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold" style={{ fontSize: '1.125rem' }}>
                                            Movement {executionReport.status}
                                        </h3>
                                        <p className="text-xs text-mono text-muted" style={{ marginTop: 2 }}>
                                            Transaction ID: <strong>{executionReport.movementId}</strong>
                                        </p>
                                    </div>
                                </div>

                                <button className="btn btn-secondary text-xs" onClick={handleExportReport}>
                                    <Download size={14} /> Export Report (.xlsx)
                                </button>
                            </div>

                            <div className="card-body" style={{ padding: '1.5rem' }}>
                                {/* Results Cards */}
                                <div className="grid md-grid-3 gap-3" style={{ marginBottom: '1.5rem' }}>
                                    <div className="card" style={{ padding: '0.75rem 1rem', borderLeft: '4px solid var(--success)' }}>
                                        <span className="text-xs font-bold text-muted uppercase">Successfully Moved</span>
                                        <div className="text-2xl font-extrabold text-mono" style={{ color: 'var(--success)' }}>
                                            {executionReport.success}
                                        </div>
                                    </div>
                                    <div className="card" style={{ padding: '0.75rem 1rem', borderLeft: '4px solid var(--error)' }}>
                                        <span className="text-xs font-bold text-muted uppercase">Failed</span>
                                        <div className="text-2xl font-extrabold text-mono" style={{ color: executionReport.failed > 0 ? 'var(--error)' : 'inherit' }}>
                                            {executionReport.failed}
                                        </div>
                                    </div>
                                    <div className="card" style={{ padding: '0.75rem 1rem', borderLeft: '4px solid var(--primary)' }}>
                                        <span className="text-xs font-bold text-muted uppercase">Target Station</span>
                                        <div className="text-sm font-extrabold text-mono" style={{ color: 'var(--primary)', marginTop: 4 }}>
                                            {selectedTargetStationObj?.name}
                                        </div>
                                    </div>
                                </div>

                                {/* Detailed unit list */}
                                {executionReport.failedUnits?.length > 0 && (
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <h4 className="text-xs font-bold uppercase text-error" style={{ marginBottom: '0.5rem' }}>
                                            Failed Units ({executionReport.failedUnits.length})
                                        </h4>
                                        <div className="table-container card">
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th>Serial Number</th>
                                                        <th>Failure Reason</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {executionReport.failedUnits.map((fu, idx) => (
                                                        <tr key={idx}>
                                                            <td className="text-mono font-bold text-sm">{fu.serialNumber}</td>
                                                            <td className="text-xs text-error">{fu.error}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 1.5rem' }}>
                                <button className="btn btn-secondary" onClick={() => setActiveTab('history')}>
                                    <Clock size={16} /> View Audit History
                                </button>
                                <button className="btn btn-primary" onClick={handleResetWizard}>
                                    <RefreshCw size={16} /> Start New Movement
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
               TAB 2: MOVEMENT AUDIT HISTORY & REVERSAL
               ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'history' && (
                <div className="animate-fade-in">
                    {/* Search & Export bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', width: 280 }}>
                            <input
                                type="text"
                                placeholder="Search by ID, User, Station..."
                                value={historySearch}
                                onChange={e => setHistorySearch(e.target.value)}
                                style={{ height: 38, paddingLeft: '2rem', fontSize: '0.8125rem' }}
                            />
                            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn btn-secondary text-xs" onClick={loadHistory} disabled={historyLoading}>
                                <RefreshCw size={14} className={historyLoading ? 'animate-spin' : ''} /> Refresh
                            </button>
                        </div>
                    </div>

                    {/* History Table */}
                    <div className="table-to-cards">
                        <div className="table-container card">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Movement ID</th>
                                        <th>Target Station</th>
                                        <th>Reason & Category</th>
                                        <th>Operator</th>
                                        <th>Units</th>
                                        <th>Status</th>
                                        <th>Date/Time</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {movementHistory
                                        .filter(m => {
                                            if (!historySearch) return true;
                                            const s = historySearch.toLowerCase();
                                            return (
                                                m.movementId?.toLowerCase().includes(s) ||
                                                m.targetStationName?.toLowerCase().includes(s) ||
                                                m.createdBy?.name?.toLowerCase().includes(s) ||
                                                m.reason?.toLowerCase().includes(s) ||
                                                (m.unitIds || []).some(uid => uid.toLowerCase().includes(s))
                                            );
                                        })
                                        .map(m => {
                                            const isReversed = !!m.reversedAt;

                                            return (
                                                <tr key={m.movementId}>
                                                    <td data-label="Movement ID">
                                                        <span className="text-mono font-bold text-xs" style={{ color: 'var(--primary)' }}>
                                                            {m.movementId}
                                                        </span>
                                                        {m.reversesMovementId && (
                                                            <span className="status-pill info" style={{ fontSize: '0.5625rem', marginLeft: 4 }}>
                                                                REVERSAL
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td data-label="Target Station">
                                                        <span className="font-semibold text-xs">{m.targetStationName || '—'}</span>
                                                    </td>
                                                    <td data-label="Reason">
                                                        <div className="text-xs font-semibold">{m.reasonCategory}</div>
                                                        <div className="text-xs text-muted truncate" style={{ maxWidth: 160 }}>{m.reason}</div>
                                                    </td>
                                                    <td data-label="Operator">
                                                        <span className="text-xs text-muted">{m.createdBy?.name || m.createdBy?.userId || 'Admin'}</span>
                                                    </td>
                                                    <td data-label="Units">
                                                        <span className="font-bold text-mono text-xs">{m.successCount || (m.unitIds?.length) || 0}</span>
                                                    </td>
                                                    <td data-label="Status">
                                                        <span className={`status-pill ${isReversed ? 'warning' : m.status === 'COMPLETED' ? 'success' : m.status === 'PROCESSING' ? 'info' : m.status === 'PARTIALLY_COMPLETED' ? 'warning' : 'error'}`} style={{ fontSize: '0.625rem' }}>
                                                            {isReversed ? 'REVERSED' : (m.status || 'COMPLETED').replace(/_/g, ' ')}
                                                        </span>
                                                    </td>
                                                    <td data-label="Date/Time">
                                                        <span className="text-xs text-muted">
                                                            {m.createdAt ? new Date(m.createdAt).toLocaleString() : '—'}
                                                        </span>
                                                    </td>
                                                    <td data-label="Actions" style={{ textAlign: 'right' }}>
                                                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                                                            <button
                                                                className="btn-ghost"
                                                                title="View Details"
                                                                style={{ padding: '0.35rem' }}
                                                                onClick={() => setSelectedMovementDetail(m)}
                                                            >
                                                                <Eye size={15} />
                                                            </button>
                                                            {!isReversed && m.type !== 'ADMIN_MOVEMENT_REVERSAL' && (
                                                                <button
                                                                    className="btn-ghost"
                                                                    title="Reverse Movement"
                                                                    style={{ padding: '0.35rem', color: 'var(--warning)' }}
                                                                    onClick={() => handleReverseMovement(m.movementId)}
                                                                    disabled={reversingId === m.movementId}
                                                                >
                                                                    {reversingId === m.movementId ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    {movementHistory.length === 0 && !historyLoading && (
                                        <tr>
                                            <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                                No administrative movements recorded yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Detail Modal */}
                    {selectedMovementDetail && (
                        <div className="modal-overlay" onClick={() => setSelectedMovementDetail(null)}>
                            <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 580 }}>
                                <div className="card-header" style={{ padding: '1.25rem 1.5rem' }}>
                                    <div>
                                        <h3 className="font-bold" style={{ fontSize: '1rem' }}>
                                            Movement Details — {selectedMovementDetail.movementId}
                                        </h3>
                                        <span className="text-xs text-muted">
                                            Logged at {new Date(selectedMovementDetail.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <button className="btn-ghost" onClick={() => setSelectedMovementDetail(null)} style={{ padding: '0.35rem' }}>
                                        <X size={18} />
                                    </button>
                                </div>

                                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div className="grid md-grid-2 gap-3" style={{ background: 'var(--bg-input)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                                        <div>
                                            <span className="text-xs font-bold text-muted uppercase">Target Station:</span>
                                            <div className="font-bold text-sm">{selectedMovementDetail.targetStationName}</div>
                                        </div>
                                        <div>
                                            <span className="text-xs font-bold text-muted uppercase">Operator:</span>
                                            <div className="font-bold text-sm">{selectedMovementDetail.createdBy?.name} ({selectedMovementDetail.createdBy?.role})</div>
                                        </div>
                                        <div>
                                            <span className="text-xs font-bold text-muted uppercase">Reason Category:</span>
                                            <div className="font-bold text-sm">{selectedMovementDetail.reasonCategory}</div>
                                        </div>
                                        <div>
                                            <span className="text-xs font-bold text-muted uppercase">Reason:</span>
                                            <div className="font-bold text-sm">{selectedMovementDetail.reason}</div>
                                        </div>
                                    </div>

                                    {selectedMovementDetail.remarks && (
                                        <div>
                                            <span className="text-xs font-bold text-muted uppercase">Remarks:</span>
                                            <p className="text-sm" style={{ marginTop: 2 }}>{selectedMovementDetail.remarks}</p>
                                        </div>
                                    )}

                                    <div>
                                        <span className="text-xs font-bold text-muted uppercase" style={{ display: 'block', marginBottom: '0.5rem' }}>
                                            Affected Serial Numbers ({selectedMovementDetail.unitIds?.length || 0}):
                                        </span>
                                        <div style={{
                                            display: 'flex', gap: '0.35rem', flexWrap: 'wrap',
                                            maxHeight: 160, overflowY: 'auto', padding: '0.5rem',
                                            background: 'var(--bg-input)', borderRadius: 'var(--radius-md)'
                                        }}>
                                            {(selectedMovementDetail.unitIds || []).map(sn => (
                                                <span
                                                    key={sn}
                                                    className="text-mono font-bold text-xs"
                                                    style={{
                                                        padding: '2px 8px', background: 'var(--bg-card)',
                                                        borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)'
                                                    }}
                                                >
                                                    {sn}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 1.5rem' }}>
                                    {!selectedMovementDetail.reversedAt && selectedMovementDetail.type !== 'ADMIN_MOVEMENT_REVERSAL' ? (
                                        <button
                                            className="btn btn-secondary text-xs"
                                            style={{ color: 'var(--warning)' }}
                                            onClick={() => handleReverseMovement(selectedMovementDetail.movementId)}
                                            disabled={reversingId === selectedMovementDetail.movementId}
                                        >
                                            <RotateCcw size={14} /> Reverse This Movement
                                        </button>
                                    ) : <div />}
                                    <button className="btn btn-secondary" onClick={() => setSelectedMovementDetail(null)}>
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default UnitSerialConfig;
