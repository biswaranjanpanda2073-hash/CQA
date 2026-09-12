import React, { useState, useMemo, useEffect } from 'react';
import {
    Check,
    AlertTriangle,
    ShieldAlert,
    PackageCheck,
    RefreshCw,
    ChevronRight,
    ArrowLeft,
    ArrowRight,
    Zap,
    Clock,
    Activity,
    FileText,
    Info,
    Camera,
    Plus,
    Trash2,
    RotateCcw,
    ShieldCheck,
    History,
    HelpCircle,
    CheckCircle2,
    XCircle,
    Search
} from 'lucide-react';
import { useCQA } from '../hooks/useCQA';
import {
    CALCULATOR_STATIONS,
    CALC_CHECKPOINTS,
    CALC_DYNAMIC_FAIL_TARGETS,
    CALC_LOOPER_ELIGIBLE_STATIONS,
    CALC_SCRAP_ELIGIBLE_FROM,
    getCalcStationById,
    calculateCalcResult,
    validateCalcStationData,
    getCalcDynamicOptions,
    canRouteToScrap
} from '../utils/calculatorEngine';
import { CheckpointGrid, CheckpointCard, ProgressActionBar, useCheckpointNavigation } from './terminal';

export const CalculatorStationForm = ({
    project,
    station,
    unitId,
    unitData,
    user,
    onComplete,
    onReset,
    getDisplayName
}) => {
    const { store, processScrapAnalysis, unholdCalculatorSerial, syncBaanData } = useCQA();

    // Sync BAAN inventory and part masters for Assembly & Rework — run once on mount only
    useEffect(() => {
        const unsub = syncBaanData?.();
        return () => unsub?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── STATE ───
    const [checkpointResults, setCheckpointResults] = useState({});
    const [dataValues, setDataValues] = useState({});
    const [textValues, setTextValues] = useState({});
    const [selectedNextStationId, setSelectedNextStationId] = useState('');
    const [disposition, setDisposition] = useState('default'); // 'default' | 'scrap_analysis'

    // Operational results for manual stations (Rework, Assembly)
    const [reworkResult, setReworkResult] = useState(null); // 'Pass' | 'Fail'
    const [reworkParts, setReworkParts] = useState([{ partNumber: '', partName: '', quantity: 1 }]);

    const [assemblyResult, setAssemblyResult] = useState(null); // 'Pass' | 'Fail'
    const [partChanged, setPartChanged] = useState('No');
    const [assemblyParts, setAssemblyParts] = useState([{ partNumber: '', partName: '', quantity: 1, reason: '' }]);
    const [baanSearchTerm, setBaanSearchTerm] = useState('');

    // Scrap Analysis specific state
    const [scrapReason, setScrapReason] = useState('');
    const [scrapRemarks, setScrapRemarks] = useState('');
    const [returnReason, setReturnReason] = useState('');
    const [returnRemarks, setReturnRemarks] = useState('');
    const [isSubmittingScrap, setIsSubmittingScrap] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ─── PREVIOUS FAILURE & DEBUG NOTE DETECTION ───
    const previousHistory = useMemo(() => {
        if (!unitData || !Array.isArray(unitData.history)) return [];
        return [...unitData.history].reverse();
    }, [unitData]);

    const latestFailureEntry = useMemo(() => {
        return previousHistory.find(h => 
            h.result === 'Fail' || 
            h.result === 'ROUTED_TO_SCRAP' || 
            h.details?.failureReason || 
            h.details?.textValues?.failureReason
        );
    }, [previousHistory]);

    const latestDebugNote = useMemo(() => {
        const debugEntry = previousHistory.find(h => 
            h.stationId === 4 || 
            h.details?.debug_note || 
            h.details?.textValues?.debug_note
        );
        return debugEntry?.details?.textValues?.debug_note || debugEntry?.details?.debug_note || null;
    }, [previousHistory]);

    // Inbound Movement to Scrap Analysis
    const inboundMovement = useMemo(() => {
        if (!unitData) return null;
        const inboundId = unitData.scrapInboundMovementId;
        if (inboundId && Array.isArray(unitData.history)) {
            return unitData.history.find(h => h.movementId === inboundId) || null;
        }
        // Fallback: find latest entry with fromStationId or stationId before scrap
        return previousHistory.find(h => h.stationId !== 9) || null;
    }, [unitData, previousHistory]);

    // Checkpoints for current station
    const checkpoints = CALC_CHECKPOINTS[station.id] || [];
    const calcResult = useMemo(() => {
        return calculateCalcResult(station.id, checkpointResults);
    }, [station.id, checkpointResults]);

    // Dynamic next station options
    const dynamicOptions = useMemo(() => {
        if (station.id === 3) {
            return CALC_LOOPER_ELIGIBLE_STATIONS.map(id => getCalcStationById(id)).filter(Boolean);
        }
        if (calcResult.result === 'Fail') {
            const targets = CALC_DYNAMIC_FAIL_TARGETS[station.id] || [];
            return targets.map(id => getCalcStationById(id)).filter(Boolean);
        }
        return [];
    }, [station.id, calcResult.result]);

    // Available BAAN parts with live stock for Assembly station
    const availableBaanParts = useMemo(() => {
        const partsObj = store.baan?.parts || {};
        const batches = Object.values(store.baan?.batches || {});
        
        // Sum total available stock per part number across batches
        const stockMap = {};
        batches.forEach(b => {
            const pNo = (b.partNumber || '').toUpperCase().trim();
            stockMap[pNo] = (stockMap[pNo] || 0) + (Number(b.quantityAvailable) || 0);
        });

        const list = Object.values(partsObj).map(p => {
            const partId = (p.id || p.partNumber || '').toUpperCase().trim();
            return {
                ...p,
                id: partId,
                name: p.name || p.partName || '',
                availableStock: stockMap[partId] ?? 0
            };
        });

        if (!baanSearchTerm) return list.slice(0, 10);
        const term = baanSearchTerm.trim().toLowerCase();
        // Support '0' vs 'O' interchangeability in part number search
        const termNorm = term.replace(/o/g, '0');
        
        return list.filter(p => {
            const pId = (p.id || '').toLowerCase();
            const pName = (p.name || '').toLowerCase();
            const pIdNorm = pId.replace(/o/g, '0');
            return pId.includes(term) || pName.includes(term) || pIdNorm.includes(termNorm);
        }).slice(0, 15);
    }, [store.baan?.parts, store.baan?.batches, baanSearchTerm]);

    // ─── CHECKPOINT HANDLER ───
    const handleSetCheckpoint = (key, status) => {
        setCheckpointResults(prev => ({
            ...prev,
            [key]: status
        }));
    };

    // ─── KEYBOARD & FOCUS NAVIGATION ───
    const isCheckpointStation = [2, 4, 7, 8].includes(station.id);
    const { activeIndex, setActiveIndex } = useCheckpointNavigation({
        items: checkpoints,
        unitId,
        enabled: isCheckpointStation,
        onStatusSelect: (index, cp, status) => {
            if (!cp || cp.type !== 'PFH') return false;
            handleSetCheckpoint(cp.key, status);
            return true;
        },
        onValueSubmit: (index, cp) => {
            if (!cp) return false;
            if (cp.type === 'DATA') {
                const val = dataValues[cp.key];
                if (cp.required && (!val || !String(val).trim())) {
                    return false; // Remain on checkpoint if required value missing
                }
                return true;
            }
            if (cp.type === 'TEXT') {
                const val = textValues[cp.key];
                if (cp.required && (!val || !String(val).trim())) {
                    return false;
                }
                return true;
            }
            return true;
        },
        isItemValueType: (index, cp) => cp?.type === 'DATA'
    });

    // ─── FORM SUBMISSION ───
    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        setIsSubmitting(true);
        try {
            // Standard Checkpoint Stations (2: Initial QC, 4: HW QC, 7: Firmware QC, 8: Packing)
            if ([2, 4, 7, 8].includes(station.id)) {
                const validation = validateCalcStationData(station.id, checkpointResults, dataValues, textValues);
                if (!validation.valid) {
                    alert("Validation Check Failed:\n\n• " + validation.errors.join("\n• "));
                    return;
                }

                if (!calcResult.result) {
                    alert("Please complete all checkpoints with Pass, Fail, or Hold.");
                    return;
                }

                // If Fail and Station 7 or 8 (dynamic selection required)
                if (calcResult.result === 'Fail' && [7, 8].includes(station.id)) {
                    if (!selectedNextStationId) {
                        alert("Please select the Next Station for this failed unit.");
                        return;
                    }
                }

                const isRouteToScrap = disposition === 'scrap_analysis';

                await onComplete({
                    result: calcResult.result,
                    details: {
                        checkpointResults,
                        dataValues,
                        textValues: {
                            ...textValues,
                            failureReason: textValues.failureReason || '',
                            failureRemarks: textValues.failureRemarks || textValues.remarks || '',
                            holdReason: textValues.holdReason || '',
                            holdRemarks: textValues.holdRemarks || textValues.remarks || '',
                            scrapRouteReason: textValues.scrapRouteReason || ''
                        },
                        selectedNextStationId: isRouteToScrap ? 9 : (selectedNextStationId ? Number(selectedNextStationId) : null),
                        routeToScrap: isRouteToScrap
                    }
                });
                return;
            }

            // Station 3: Looper Analysis
            if (station.id === 3) {
                if (!textValues.analysis_note?.trim()) {
                    alert("Analysis Note is mandatory for Looper Analysis.");
                    return;
                }
                if (!selectedNextStationId) {
                    alert("Please select the Next Station from the eligible list.");
                    return;
                }
                const isRouteToScrap = Number(selectedNextStationId) === 9;
                await onComplete({
                    result: 'Pass',
                    details: {
                        textValues: {
                            analysis_note: textValues.analysis_note.trim(),
                            remarks: textValues.remarks?.trim() || ''
                        },
                        selectedNextStationId: Number(selectedNextStationId),
                        routeToScrap: isRouteToScrap
                    }
                });
                return;
            }

            // Station 5: Hardware Rework
            if (station.id === 5) {
                if (!reworkResult) {
                    alert("Please select Operational Result (Pass or Fail).");
                    return;
                }
                if (!textValues.rework_note?.trim()) {
                    alert("Rework Note is mandatory.");
                    return;
                }
                const isRouteToScrap = disposition === 'scrap_analysis';
                await onComplete({
                    result: reworkResult,
                    details: {
                        reworkParts: reworkParts.filter(p => p.partNumber && p.partNumber.trim()),
                        textValues: {
                            rework_note: textValues.rework_note.trim(),
                            remarks: textValues.remarks?.trim() || '',
                            failureReason: textValues.failureReason?.trim() || '',
                            scrapRouteReason: textValues.scrapRouteReason?.trim() || ''
                        },
                        selectedNextStationId: isRouteToScrap ? 9 : (reworkResult === 'Pass' ? 6 : null),
                        routeToScrap: isRouteToScrap
                    }
                });
                return;
            }

            // Station 6: Assembly
            if (station.id === 6) {
                if (!assemblyResult) {
                    alert("Please select Operational Result (Pass or Fail).");
                    return;
                }
                if (!textValues.assembly_note?.trim()) {
                    alert("Assembly Note is mandatory.");
                    return;
                }
                if (partChanged === 'Yes' && assemblyParts.some(p => !p.partNumber.trim())) {
                    alert("Please specify the Part Number for each replaced part, or remove unused rows.");
                    return;
                }
                const isRouteToScrap = disposition === 'scrap_analysis';
                await onComplete({
                    result: assemblyResult,
                    details: {
                        partChanged,
                        assemblyParts: partChanged === 'Yes' ? assemblyParts.filter(p => p.partNumber.trim()) : [],
                        textValues: {
                            assembly_note: textValues.assembly_note.trim(),
                            remarks: textValues.remarks?.trim() || '',
                            failureReason: textValues.failureReason?.trim() || '',
                            scrapRouteReason: textValues.scrapRouteReason?.trim() || ''
                        },
                        selectedNextStationId: isRouteToScrap ? 9 : (assemblyResult === 'Pass' ? 7 : null),
                        routeToScrap: isRouteToScrap
                    }
                });
                return;
            }
        } catch (err) {
            console.error("Submission error:", err);
            alert(err.message || 'Submission error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // ─── SCRAP APPROVAL HANDLER ───
    const handleApproveScrap = async () => {
        if (!scrapReason.trim()) {
            alert("Please select or enter a Scrap Reason.");
            return;
        }
        if (!scrapRemarks.trim()) {
            alert("Scrap Remarks are required.");
            return;
        }
        if (!window.confirm(`CONFIRM SCRAP:\n\nAre you sure you want to permanently SCRAP unit "${unitId}"?\nThis action sets the unit status to SCRAPPED and locks it.`)) {
            return;
        }
        setIsSubmittingScrap(true);
        try {
            const res = await processScrapAnalysis({
                serialNumber: unitId,
                action: 'APPROVE_SCRAP',
                scrapReason: scrapReason.trim(),
                scrapRemarks: scrapRemarks.trim()
            });
            if (res.success) {
                alert(`Transaction Complete:\nUnit "${unitId}" has been marked as SCRAPPED.`);
                onReset();
            } else {
                alert(`Scrap Approval Error: ${res.message || 'Operation failed.'}`);
            }
        } catch (err) {
            alert(`Execution Error: ${err.message}`);
        } finally {
            setIsSubmittingScrap(false);
        }
    };

    // ─── SCRAP RETURN HANDLER ───
    const handleReturnToPrevious = async () => {
        if (!returnReason.trim()) {
            alert("Return Reason is required.");
            return;
        }
        if (!returnRemarks.trim()) {
            alert("Return Remarks are required.");
            return;
        }

        const returnStationName = inboundMovement?.fromStationName || inboundMovement?.station || 'Previous Station';

        if (!window.confirm(`CONFIRM RETURN:\n\nReturn unit "${unitId}" back to "${returnStationName}"?`)) {
            return;
        }
        setIsSubmittingScrap(true);
        try {
            const res = await processScrapAnalysis({
                serialNumber: unitId,
                action: 'RETURN_TO_PREVIOUS',
                returnReason: returnReason.trim(),
                returnRemarks: returnRemarks.trim()
            });
            if (res.success) {
                alert(`Transaction Complete:\nUnit "${unitId}" successfully routed back to "${res.destination || returnStationName}".`);
                onReset();
            } else {
                alert(`Return Error: ${res.message || 'Operation failed.'}`);
            }
        } catch (err) {
            alert(`Execution Error: ${err.message}`);
        } finally {
            setIsSubmittingScrap(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // RENDER: STATION 9 — SCRAP ANALYSIS (DECISION STATION)
    // ═══════════════════════════════════════════════════════════════
    if (station.id === 9) {
        const returnStationName = inboundMovement?.fromStationName || inboundMovement?.station || 'Unknown Station';
        const inboundMovementId = inboundMovement?.movementId || unitData?.scrapInboundMovementId || 'N/A';

        return (
            <div className="card animate-fade-in shadow-xl">
                <div className="card-header" style={{ padding: '1.25rem 1.75rem', borderBottom: '1px solid var(--border-light)', background: 'rgba(220,38,38,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <ShieldAlert size={20} color="var(--error)" />
                                <h2 className="font-extrabold" style={{ fontSize: '1.25rem', color: 'var(--error)' }}>
                                    Scrap Analysis & Decision Terminal
                                </h2>
                            </div>
                            <p className="text-xs text-muted" style={{ marginTop: 2 }}>Authorized scrap review and disposition</p>
                        </div>
                        <div className="text-mono" style={{
                            padding: '0.4rem 0.85rem',
                            background: 'var(--bg-input)',
                            borderRadius: 'var(--radius-md)',
                            fontWeight: 800,
                            border: '1px solid var(--border)'
                        }}>
                            {unitId}
                        </div>
                    </div>
                </div>

                <div className="card-body" style={{ padding: '1.75rem' }}>
                    {/* Inbound Origin Banner */}
                    <div style={{
                        padding: '1rem 1.25rem',
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(245,158,11,0.08)',
                        border: '1.5px solid rgba(245,158,11,0.3)',
                        marginBottom: '1.5rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <Info size={16} color="#d97706" />
                            <span className="font-bold text-sm" style={{ color: '#d97706' }}>Inbound Routing Context</span>
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            Arrived from: <strong>{returnStationName}</strong> · Movement ID: <span className="text-mono font-bold">{inboundMovementId}</span>
                            {inboundMovement?.details?.scrapRouteReason && (
                                <div style={{ marginTop: 4 }}>
                                    Route Reason: <em>"{inboundMovement.details.scrapRouteReason}"</em>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Unit History Panel */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                            <History size={16} color="var(--primary)" />
                            <h4 className="text-xs uppercase font-bold text-muted">Movement & Inspection Audit Trail</h4>
                        </div>
                        <div style={{ maxHeight: 220, overflowY: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', background: 'var(--bg-input)' }}>
                            <table style={{ fontSize: '0.8rem', width: '100%' }}>
                                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)' }}>
                                    <tr>
                                        <th style={{ padding: '0.5rem' }}>Station</th>
                                        <th style={{ padding: '0.5rem' }}>Result</th>
                                        <th style={{ padding: '0.5rem' }}>Operator</th>
                                        <th style={{ padding: '0.5rem' }}>Details / Remarks</th>
                                        <th style={{ padding: '0.5rem' }}>Timestamp</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previousHistory.map((h, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                            <td style={{ padding: '0.5rem', fontWeight: 600 }}>{h.station}</td>
                                            <td style={{ padding: '0.5rem' }}>
                                                <span className={`status-pill ${h.result === 'Pass' || h.result === 'COMPLETED' ? 'success' : (h.result === 'Fail' || h.result === 'ROUTED_TO_SCRAP' ? 'error' : 'warning')}`}>
                                                    {h.result}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>{h.operator}</td>
                                            <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>
                                                {h.details?.failureReason && <div><strong>Fail:</strong> {h.details.failureReason}</div>}
                                                {h.details?.debug_note && <div><strong>Debug:</strong> {h.details.debug_note}</div>}
                                                {h.details?.textValues?.debug_note && <div><strong>Debug:</strong> {h.details.textValues.debug_note}</div>}
                                                {h.details?.rework_note && <div><strong>Rework:</strong> {h.details.rework_note}</div>}
                                                {h.details?.assembly_note && <div><strong>Assembly:</strong> {h.details.assembly_note}</div>}
                                                {h.details?.remarks && <div>{h.details.remarks}</div>}
                                                {h.details?.scrapRemarks && <div>{h.details.scrapRemarks}</div>}
                                                {h.details?.returnRemarks && <div>{h.details.returnRemarks}</div>}
                                            </td>
                                            <td style={{ padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                                {h.timestamp ? new Date(h.timestamp).toLocaleString() : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                    {previousHistory.length === 0 && (
                                        <tr><td colSpan="5" style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>No previous movements recorded.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Decision Action Tabs */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                        {/* Option 1: Approve Scrap */}
                        <div style={{
                            padding: '1.25rem',
                            borderRadius: 'var(--radius-lg)',
                            border: '2px solid rgba(220,38,38,0.25)',
                            background: 'rgba(220,38,38,0.02)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                <Trash2 size={18} color="var(--error)" />
                                <h3 className="font-bold text-sm" style={{ color: 'var(--error)' }}>Action A: Approve Scrap</h3>
                            </div>
                            <div className="input-field" style={{ marginBottom: '0.75rem' }}>
                                <label style={{ fontSize: '0.75rem' }}>Scrap Classification</label>
                                <select 
                                    value={scrapReason} 
                                    onChange={e => setScrapReason(e.target.value)}
                                    style={{ fontSize: '0.85rem' }}
                                >
                                    <option value="">-- Select Reason --</option>
                                    <option value="BER - Beyond Economic Repair">BER - Beyond Economic Repair</option>
                                    <option value="PCB Burn / Trace Damage">PCB Burn / Trace Damage</option>
                                    <option value="Component Short Circuit">Component Short Circuit</option>
                                    <option value="Liquid / Corrosion Damage">Liquid / Corrosion Damage</option>
                                    <option value="Enclosure / Shell Shattered">Enclosure / Shell Shattered</option>
                                    <option value="Obsolete Hardware Revision">Obsolete Hardware Revision</option>
                                    <option value="Other Scrap Reason">Other Scrap Reason</option>
                                </select>
                            </div>
                            <div className="input-field" style={{ marginBottom: '1rem' }}>
                                <label style={{ fontSize: '0.75rem' }}>Scrap Justification Remarks</label>
                                <textarea
                                    rows={2}
                                    placeholder="Explain reason for scrapping..."
                                    value={scrapRemarks}
                                    onChange={e => setScrapRemarks(e.target.value)}
                                    style={{ fontSize: '0.85rem' }}
                                />
                            </div>
                            <button
                                type="button"
                                className="btn btn-danger"
                                style={{ width: '100%', height: 44, fontSize: '0.875rem' }}
                                onClick={handleApproveScrap}
                                disabled={isSubmittingScrap || !scrapReason || !scrapRemarks.trim()}
                            >
                                <Trash2 size={16} /> Confirm & Approve Scrap
                            </button>
                        </div>

                        {/* Option 2: Return to Previous Station */}
                        <div style={{
                            padding: '1.25rem',
                            borderRadius: 'var(--radius-lg)',
                            border: '2px solid rgba(22,101,52,0.25)',
                            background: 'rgba(22,101,52,0.02)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                <RotateCcw size={18} color="var(--primary)" />
                                <h3 className="font-bold text-sm" style={{ color: 'var(--primary)' }}>Action B: Return to Previous Station</h3>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                                Destination: <strong>{returnStationName}</strong>
                            </div>
                            <div className="input-field" style={{ marginBottom: '0.75rem' }}>
                                <label style={{ fontSize: '0.75rem' }}>Return Reason</label>
                                <input
                                    type="text"
                                    placeholder="e.g. False reject, recoverable with rework"
                                    value={returnReason}
                                    onChange={e => setReturnReason(e.target.value)}
                                    style={{ fontSize: '0.85rem' }}
                                />
                            </div>
                            <div className="input-field" style={{ marginBottom: '1rem' }}>
                                <label style={{ fontSize: '0.75rem' }}>Return Instructions / Remarks</label>
                                <textarea
                                    rows={2}
                                    placeholder="Detailed return notes..."
                                    value={returnRemarks}
                                    onChange={e => setReturnRemarks(e.target.value)}
                                    style={{ fontSize: '0.85rem' }}
                                />
                            </div>
                            <button
                                type="button"
                                className="btn btn-primary"
                                style={{ width: '100%', height: 44, fontSize: '0.875rem' }}
                                onClick={handleReturnToPrevious}
                                disabled={isSubmittingScrap || !returnReason.trim() || !returnRemarks.trim()}
                            >
                                <RotateCcw size={16} /> Return to {returnStationName}
                            </button>
                        </div>
                    </div>

                    <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
                        <button type="button" className="btn btn-secondary" onClick={onReset}>
                            <RefreshCw size={14} /> Cancel / Reset
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // RENDER: STANDARD STATION FORMS (STATIONS 2, 3, 4, 5, 6, 7, 8)
    // ═══════════════════════════════════════════════════════════════
    return (
        <form className="card animate-fade-in shadow-xl" onSubmit={handleSubmit} style={{ paddingBottom: [2, 4, 7, 8].includes(station.id) ? '6rem' : '1.5rem' }}>
            <div className="card-body" style={{ padding: '1.5rem' }}>
                {/* ── Previous Failure Banner (if arrived from failed station) ── */}
                {latestFailureEntry && (
                    <div style={{
                        padding: '1rem 1.25rem',
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(220,38,38,0.06)',
                        border: '1.5px solid rgba(220,38,38,0.25)',
                        marginBottom: '1.5rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                            <AlertTriangle size={18} color="var(--error)" />
                            <span className="font-bold text-sm" style={{ color: 'var(--error)' }}>
                                Previous Inspection Alert (from {latestFailureEntry.station})
                            </span>
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            <div>
                                <strong>Failure Reason:</strong> {latestFailureEntry.details?.textValues?.failureReason || latestFailureEntry.details?.failureReason || 'Reported Issue'}
                            </div>
                            {(latestFailureEntry.details?.textValues?.failureRemarks || latestFailureEntry.details?.remarks) && (
                                <div>
                                    <strong>Remarks:</strong> {latestFailureEntry.details?.textValues?.failureRemarks || latestFailureEntry.details?.remarks}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Prominent Debug Note (Station 5: Hardware Rework) ── */}
                {station.id === 5 && (
                    <div style={{
                        padding: '1.25rem',
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(59,130,246,0.06)',
                        border: '1.5px solid rgba(59,130,246,0.3)',
                        marginBottom: '1.5rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                            <FileText size={18} color="var(--primary)" />
                            <span className="font-bold text-sm" style={{ color: 'var(--primary)' }}>
                                Hardware Debug Note from Previous Diagnosis
                            </span>
                        </div>
                        <div className="text-sm font-semibold" style={{ color: 'var(--text-main)', padding: '0.5rem 0.75rem', background: '#fff', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                            {latestDebugNote || 'No specific debug note recorded by QC technician.'}
                        </div>
                    </div>
                )}

                {/* ── STATION 3: LOOPER ANALYSIS UI ── */}
                {station.id === 3 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div className="input-field">
                            <label>Looper Diagnosis / Root-Cause Analysis <span style={{ color: 'var(--error)' }}>*</span></label>
                            <textarea
                                required
                                rows={4}
                                placeholder="Detail the root cause of repeated cycling, component degradation, or multi-station failure..."
                                value={textValues.analysis_note || ''}
                                onChange={e => setTextValues({ ...textValues, analysis_note: e.target.value })}
                            />
                        </div>

                        <div className="input-field">
                            <label>Designated Next Station <span style={{ color: 'var(--error)' }}>*</span></label>
                            <select
                                required
                                value={selectedNextStationId}
                                onChange={e => setSelectedNextStationId(e.target.value)}
                            >
                                <option value="">-- Select Valid Next Station --</option>
                                {dynamicOptions.map(opt => (
                                    <option key={opt.id} value={opt.id}>
                                        {opt.id}. {opt.name} {opt.id === 9 ? '⚠️ (Route to Scrap Analysis)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="input-field">
                            <label>General Remarks</label>
                            <input
                                type="text"
                                placeholder="Optional operator remarks..."
                                value={textValues.remarks || ''}
                                onChange={e => setTextValues({ ...textValues, remarks: e.target.value })}
                            />
                        </div>
                    </div>
                )}

                {/* ── STATION 5: HARDWARE REWORK UI ── */}
                {station.id === 5 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {/* Parts Replaced Section */}
                        <div style={{ padding: '1rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <label style={{ fontWeight: 700, margin: 0 }}>Components / Parts Replaced</label>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ height: 32, fontSize: '0.75rem', padding: '0 0.75rem' }}
                                    onClick={() => setReworkParts([...reworkParts, { partNumber: '', partName: '', quantity: 1 }])}
                                >
                                    <Plus size={14} /> Add Part
                                </button>
                            </div>

                            {reworkParts.map((p, idx) => (
                                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                                    <input
                                        placeholder="Part Number"
                                        value={p.partNumber}
                                        onChange={e => {
                                            const next = [...reworkParts];
                                            next[idx].partNumber = e.target.value;
                                            setReworkParts(next);
                                        }}
                                        style={{ fontSize: '0.85rem' }}
                                    />
                                    <input
                                        placeholder="Part Description"
                                        value={p.partName}
                                        onChange={e => {
                                            const next = [...reworkParts];
                                            next[idx].partName = e.target.value;
                                            setReworkParts(next);
                                        }}
                                        style={{ fontSize: '0.85rem' }}
                                    />
                                    <input
                                        type="number"
                                        min="1"
                                        placeholder="Qty"
                                        value={p.quantity}
                                        onChange={e => {
                                            const next = [...reworkParts];
                                            next[idx].quantity = Math.max(1, parseInt(e.target.value) || 1);
                                            setReworkParts(next);
                                        }}
                                        style={{ fontSize: '0.85rem' }}
                                    />
                                    {reworkParts.length > 1 && (
                                        <button
                                            type="button"
                                            className="btn-ghost"
                                            style={{ color: 'var(--error)', padding: '0.35rem' }}
                                            onClick={() => setReworkParts(reworkParts.filter((_, i) => i !== idx))}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Rework Note */}
                        <div className="input-field">
                            <label>Rework Note (Action Taken) <span style={{ color: 'var(--error)' }}>*</span></label>
                            <textarea
                                required
                                rows={3}
                                placeholder="Describe rework actions performed on PCB/components..."
                                value={textValues.rework_note || ''}
                                onChange={e => setTextValues({ ...textValues, rework_note: e.target.value })}
                            />
                        </div>

                        {/* Operational Result */}
                        <div className="input-field">
                            <label>Operational Result <span style={{ color: 'var(--error)' }}>*</span></label>
                            <div className="grid grid-2 gap-3">
                                <button
                                    type="button"
                                    className={`btn ${reworkResult === 'Pass' ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => { setReworkResult('Pass'); setDisposition('default'); }}
                                    style={{ height: 50, fontSize: '1rem' }}
                                >
                                    Pass (Advance to Assembly)
                                </button>
                                <button
                                    type="button"
                                    className={`btn ${reworkResult === 'Fail' ? 'btn-danger' : 'btn-secondary'}`}
                                    onClick={() => setReworkResult('Fail')}
                                    style={{ height: 50, fontSize: '1rem' }}
                                >
                                    Fail / Unrepairable
                                </button>
                            </div>
                        </div>

                        {/* If Fail: Disposition */}
                        {reworkResult === 'Fail' && (
                            <div style={{ padding: '1rem', background: 'var(--error-bg)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(220,38,38,0.2)' }}>
                                <div className="input-field" style={{ marginBottom: '0.75rem' }}>
                                    <label>Failure Reason</label>
                                    <input
                                        type="text"
                                        placeholder="Reason for rework failure..."
                                        value={textValues.failureReason || ''}
                                        onChange={e => setTextValues({ ...textValues, failureReason: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="input-field">
                                    <label>Disposition Action</label>
                                    <div className="grid grid-2 gap-2">
                                        <button
                                            type="button"
                                            className={`btn ${disposition === 'default' ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => setDisposition('default')}
                                        >
                                            Return to Debug
                                        </button>
                                        <button
                                            type="button"
                                            className={`btn ${disposition === 'scrap_analysis' ? 'btn-danger' : 'btn-secondary'}`}
                                            onClick={() => setDisposition('scrap_analysis')}
                                        >
                                            Route to Scrap Analysis
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── STATION 6: ASSEMBLY UI ── */}
                {station.id === 6 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {/* Cosmetic Check */}
                        <div style={{ padding: '1rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                            <div className="font-semibold text-sm" style={{ marginBottom: '0.5rem' }}>
                                Mechanical Assembly & Cosmetic Fit Verification
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                <button
                                    type="button"
                                    className={`btn ${checkpointResults['cosmetic'] === 'Pass' ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => handleSetCheckpoint('cosmetic', 'Pass')}
                                    style={{ minHeight: 40 }}
                                >
                                    Pass
                                </button>
                                <button
                                    type="button"
                                    className={`btn ${checkpointResults['cosmetic'] === 'Fail' ? 'btn-danger' : 'btn-secondary'}`}
                                    onClick={() => handleSetCheckpoint('cosmetic', 'Fail')}
                                    style={{ minHeight: 40 }}
                                >
                                    Fail
                                </button>
                            </div>
                        </div>

                        {/* Part Changed Question */}
                        <div style={{ padding: '1rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: partChanged === 'Yes' ? '1rem' : 0 }}>
                                <label style={{ fontWeight: 700, margin: 0 }}>Were any parts changed during assembly?</label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        type="button"
                                        className={`btn ${partChanged === 'No' ? 'btn-primary' : 'btn-secondary'}`}
                                        style={{ height: 32, padding: '0 1rem' }}
                                        onClick={() => setPartChanged('No')}
                                    >
                                        No
                                    </button>
                                    <button
                                        type="button"
                                        className={`btn ${partChanged === 'Yes' ? 'btn-primary' : 'btn-secondary'}`}
                                        style={{ height: 32, padding: '0 1rem' }}
                                        onClick={() => setPartChanged('Yes')}
                                    >
                                        Yes
                                    </button>
                                </div>
                            </div>

                            {/* BAAN Part Master Selector */}
                            {partChanged === 'Yes' && (
                                <div>
                                    <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input
                                            placeholder="Search BAAN Part Master..."
                                            value={baanSearchTerm}
                                            onChange={e => setBaanSearchTerm(e.target.value)}
                                            style={{ paddingLeft: '2rem', fontSize: '0.85rem' }}
                                        />
                                    </div>

                                    {baanSearchTerm && (
                                        <div style={{ maxHeight: 200, overflowY: 'auto', background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: '0.75rem', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                            {availableBaanParts.map(p => (
                                                <div
                                                    key={p.id}
                                                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid var(--border-light)', fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background-color 0.15s' }}
                                                    onClick={() => {
                                                        const cleanRow = { partNumber: p.id, partName: p.name || '', quantity: 1, reason: '' };
                                                        if (assemblyParts.length === 1 && !assemblyParts[0].partNumber.trim()) {
                                                            setAssemblyParts([cleanRow]);
                                                        } else {
                                                            setAssemblyParts([...assemblyParts, cleanRow]);
                                                        }
                                                        setBaanSearchTerm('');
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-main, #f8fafc)'}
                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <div>
                                                        <strong>{p.id}</strong> — {p.name}
                                                    </div>
                                                    <span style={{
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                        padding: '0.15rem 0.5rem',
                                                        borderRadius: 999,
                                                        background: p.availableStock > 0 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                        color: p.availableStock > 0 ? '#16a34a' : '#ef4444'
                                                    }}>
                                                        {p.availableStock} in stock
                                                    </span>
                                                </div>
                                            ))}
                                            {availableBaanParts.length === 0 && (
                                                <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                    No matching BAAN parts for "{baanSearchTerm}"
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Added Parts Table */}
                                    {assemblyParts.map((p, idx) => (
                                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                                            <input
                                                placeholder="Part Number"
                                                value={p.partNumber}
                                                onChange={e => {
                                                    const next = [...assemblyParts];
                                                    next[idx].partNumber = e.target.value;
                                                    setAssemblyParts(next);
                                                }}
                                                style={{ fontSize: '0.85rem' }}
                                            />
                                            <input
                                                placeholder="Description"
                                                value={p.partName}
                                                onChange={e => {
                                                    const next = [...assemblyParts];
                                                    next[idx].partName = e.target.value;
                                                    setAssemblyParts(next);
                                                }}
                                                style={{ fontSize: '0.85rem' }}
                                            />
                                            <input
                                                type="number"
                                                min="1"
                                                value={p.quantity}
                                                onChange={e => {
                                                    const next = [...assemblyParts];
                                                    next[idx].quantity = Math.max(1, parseInt(e.target.value) || 1);
                                                    setAssemblyParts(next);
                                                }}
                                                style={{ fontSize: '0.85rem' }}
                                            />
                                            <button
                                                type="button"
                                                className="btn-ghost"
                                                style={{ color: 'var(--error)', padding: '0.35rem' }}
                                                onClick={() => setAssemblyParts(assemblyParts.filter((_, i) => i !== idx))}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        style={{ height: 32, fontSize: '0.75rem', padding: '0 0.75rem', marginTop: '0.5rem' }}
                                        onClick={() => setAssemblyParts([...assemblyParts, { partNumber: '', partName: '', quantity: 1, reason: '' }])}
                                    >
                                        <Plus size={14} /> Add Another Part
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Assembly Note */}
                        <div className="input-field">
                            <label>Assembly Note <span style={{ color: 'var(--error)' }}>*</span></label>
                            <textarea
                                required
                                rows={3}
                                placeholder="Describe assembly verification, torquing, cable routing..."
                                value={textValues.assembly_note || ''}
                                onChange={e => setTextValues({ ...textValues, assembly_note: e.target.value })}
                            />
                        </div>

                        {/* Operational Result */}
                        <div className="input-field">
                            <label>Operational Result <span style={{ color: 'var(--error)' }}>*</span></label>
                            <div className="grid grid-2 gap-3">
                                <button
                                    type="button"
                                    className={`btn ${assemblyResult === 'Pass' ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => { setAssemblyResult('Pass'); setDisposition('default'); }}
                                    style={{ height: 50, fontSize: '1rem' }}
                                >
                                    Pass (Advance to Firmware QC)
                                </button>
                                <button
                                    type="button"
                                    className={`btn ${assemblyResult === 'Fail' ? 'btn-danger' : 'btn-secondary'}`}
                                    onClick={() => setAssemblyResult('Fail')}
                                    style={{ height: 50, fontSize: '1rem' }}
                                >
                                    Fail
                                </button>
                            </div>
                        </div>

                        {/* If Fail: Disposition */}
                        {assemblyResult === 'Fail' && (
                            <div style={{ padding: '1rem', background: 'var(--error-bg)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(220,38,38,0.2)' }}>
                                <div className="input-field" style={{ marginBottom: '0.75rem' }}>
                                    <label>Failure Reason</label>
                                    <input
                                        type="text"
                                        placeholder="Reason for assembly failure..."
                                        value={textValues.failureReason || ''}
                                        onChange={e => setTextValues({ ...textValues, failureReason: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="input-field">
                                    <label>Disposition Action</label>
                                    <div className="grid grid-2 gap-2">
                                        <button
                                            type="button"
                                            className={`btn ${disposition === 'default' ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => setDisposition('default')}
                                        >
                                            Return to Hardware Rework
                                        </button>
                                        <button
                                            type="button"
                                            className={`btn ${disposition === 'scrap_analysis' ? 'btn-danger' : 'btn-secondary'}`}
                                            onClick={() => setDisposition('scrap_analysis')}
                                        >
                                            Route to Scrap Analysis
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── STATIONS 2, 4, 7, 8: 3-STATE CHECKPOINT GRID ── */}
                {[2, 4, 7, 8].includes(station.id) && (
                    <>
                        <CheckpointGrid style={{ marginBottom: '1.5rem' }}>
                            {checkpoints.map((cp, idx) => {
                                const isCurrentActive = activeIndex === idx;
                                const cardValue = cp.type === 'PFH'
                                    ? checkpointResults[cp.key]
                                    : (cp.type === 'DATA' ? dataValues[cp.key] : textValues[cp.key]);

                                return (
                                    <CheckpointCard
                                        key={cp.key}
                                        index={idx + 1}
                                        label={cp.label}
                                        type={cp.type}
                                        value={cardValue}
                                        required={cp.required}
                                        unit={cp.unit || (cp.key.includes('BAT') ? 'V' : (cp.key.includes('CHG') ? 'mA' : ''))}
                                        placeholder={cp.dataLabel || (cp.type === 'TEXT' ? 'Enter technical debug diagnosis note...' : `Enter ${cp.label}...`)}
                                        isActive={isCurrentActive}
                                        onClick={() => setActiveIndex(idx)}
                                        onSelectStatus={(status) => handleSetCheckpoint(cp.key, status)}
                                        onValueChange={(val) => {
                                            if (cp.type === 'DATA') {
                                                setDataValues(prev => ({ ...prev, [cp.key]: val }));
                                            } else if (cp.type === 'TEXT') {
                                                setTextValues(prev => ({ ...prev, [cp.key]: val }));
                                            }
                                        }}
                                        fullWidth={cp.type === 'TEXT'}
                                    />
                                );
                            })}
                        </CheckpointGrid>

                        {/* ── FAIL FORM: Failure Reason & Dynamic Next Station ── */}
                        {calcResult.result === 'Fail' && (
                            <div style={{
                                padding: '1.25rem',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--error-bg)',
                                border: '1px solid rgba(220,38,38,0.25)',
                                marginBottom: '1rem'
                            }}>
                                <div className="input-field" style={{ marginBottom: '0.75rem' }}>
                                    <label>Failure Reason <span style={{ color: 'var(--error)' }}>*</span></label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="Specific reason for inspection failure..."
                                        value={textValues.failureReason || ''}
                                        onChange={e => setTextValues({ ...textValues, failureReason: e.target.value })}
                                    />
                                </div>
                                <div className="input-field" style={{ marginBottom: '0.75rem' }}>
                                    <label>Failure Remarks</label>
                                    <textarea
                                        rows={2}
                                        placeholder="Detailed operator remarks on failure..."
                                        value={textValues.failureRemarks || ''}
                                        onChange={e => setTextValues({ ...textValues, failureRemarks: e.target.value })}
                                    />
                                </div>

                                {/* Dynamic Next Station Dropdown for Stations 7 & 8 */}
                                {[7, 8].includes(station.id) && (
                                    <div className="input-field" style={{ marginBottom: '0.75rem' }}>
                                        <label>Designated Next Station <span style={{ color: 'var(--error)' }}>*</span></label>
                                        <select
                                            required
                                            value={selectedNextStationId}
                                            onChange={e => setSelectedNextStationId(e.target.value)}
                                        >
                                            <option value="">-- Select Valid Next Station --</option>
                                            {dynamicOptions.map(opt => (
                                                <option key={opt.id} value={opt.id}>
                                                    {opt.id}. {opt.name} {opt.id === 9 ? '⚠️ (Route to Scrap Analysis)' : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Route to Scrap Action Option for Stations 2 & 4 */}
                                {[2, 4].includes(station.id) && (
                                    <div className="input-field" style={{ marginTop: '0.5rem' }}>
                                        <label>Disposition Override</label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                type="button"
                                                className={`btn ${disposition === 'default' ? 'btn-primary' : 'btn-secondary'}`}
                                                onClick={() => setDisposition('default')}
                                                style={{ flex: 1, fontSize: '0.8rem', height: 38 }}
                                            >
                                                Standard Routing ({station.id === 2 ? 'Hardware QC' : 'Hardware Rework'})
                                            </button>
                                            <button
                                                type="button"
                                                className={`btn ${disposition === 'scrap_analysis' ? 'btn-danger' : 'btn-secondary'}`}
                                                onClick={() => setDisposition('scrap_analysis')}
                                                style={{ flex: 1, fontSize: '0.8rem', height: 38 }}
                                            >
                                                ⚠️ Route to Scrap Analysis
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── HOLD FORM: Hold Reason & Remarks ── */}
                        {calcResult.result === 'Hold' && (
                            <div style={{
                                padding: '1.25rem',
                                borderRadius: 'var(--radius-md)',
                                background: 'rgba(245,158,11,0.08)',
                                border: '1px solid rgba(245,158,11,0.3)',
                                marginBottom: '1rem'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                    <AlertTriangle size={18} color="#d97706" />
                                    <span className="font-bold text-sm" style={{ color: '#d97706' }}>
                                        Station Hold Notice — Serial will remain at {station.name}
                                    </span>
                                </div>
                                <div className="input-field" style={{ marginBottom: '0.75rem' }}>
                                    <label>Hold Reason <span style={{ color: 'var(--error)' }}>*</span></label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="State specific reason for holding this unit..."
                                        value={textValues.holdReason || ''}
                                        onChange={e => setTextValues({ ...textValues, holdReason: e.target.value })}
                                    />
                                </div>
                                <div className="input-field">
                                    <label>Hold Remarks / Investigation Steps</label>
                                    <textarea
                                        rows={2}
                                        placeholder="Detailed hold remarks..."
                                        value={textValues.holdRemarks || ''}
                                        onChange={e => setTextValues({ ...textValues, holdRemarks: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ── ACTION BUTTONS ── */}
                {[2, 4, 7, 8].includes(station.id) ? (
                    <ProgressActionBar
                        answeredCount={calcResult.passCount + calcResult.failCount + calcResult.holdCount}
                        totalCount={calcResult.total}
                        overallResult={calcResult.result}
                        onSubmit={handleSubmit}
                        onReset={onReset}
                        submitText="Submit & Complete Terminal"
                        isSubmitting={isSubmitting}
                        submitDisabled={
                            !calcResult.complete ||
                            (calcResult.result === 'Fail' && !textValues.failureReason) ||
                            (calcResult.result === 'Hold' && !textValues.holdReason) ||
                            ([7, 8].includes(station.id) && calcResult.result === 'Fail' && !selectedNextStationId)
                        }
                    />
                ) : (
                    <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-light)', marginTop: '1rem' }}>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ flex: 2, height: 50, fontSize: '0.95rem' }}
                            disabled={isSubmitting}
                        >
                            <Check size={18} /> Submit & Complete Terminal
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ flex: 1, height: 50 }}
                            onClick={onReset}
                            disabled={isSubmitting}
                        >
                            <RefreshCw size={16} /> Reset
                        </button>
                    </div>
                )}
            </div>
        </form>
    );
};

export default CalculatorStationForm;
