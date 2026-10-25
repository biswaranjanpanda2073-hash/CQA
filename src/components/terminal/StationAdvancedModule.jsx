import React, { useState, useEffect, useRef } from 'react';
import {
    CheckCircle2,
    XCircle,
    AlertTriangle,
    ArrowLeft,
    Scan,
    RefreshCw,
    ShieldAlert,
    Check,
    X,
    Loader2,
    Info,
    FileText,
    Sparkles,
    Trash2,
    ArrowRight,
    ShieldCheck
} from 'lucide-react';
import QRScanner from '../QRScanner';

export const COMMON_FAILURE_REASONS = [
    'Cosmetic / Housing Damage',
    'Display / Segment Check Failure',
    'Power-On / Booting Failure',
    'Keypad / Button Malfunction',
    'Charging / Battery Fault',
    'Connectivity Test Failure (USB / Bluetooth / Wi-Fi)',
    'Sensor / Barcode Reading Defect',
    'Firmware / Software Execution Error',
    'Component / Hardware Defect',
    'Packaging / Labeling Defect',
    'Other / Custom Failure'
];

/**
 * StationAdvancedModule
 * Provides Advanced station interface for:
 * 1. Approved FG (single or multiple serial numbers, QC Remarks, Conditional Reason)
 * 2. Commit Rejection (strictly ONE serial number per transaction, Failure Reason)
 */
export const StationAdvancedModule = ({
    project,
    station,
    user,
    onBackToStation,
    getDisplayName,
    validateAdvancedUnit,
    executeAdvancedFGApproval,
    executeAdvancedRejection
}) => {
    // Sub-view: 'menu' | 'approved_fg' | 'commit_rejection'
    const [activeSubView, setActiveSubView] = useState('menu');

    // =========================================================================
    // 1. APPROVED FG STATE
    // =========================================================================
    const [fgInputSerial, setFgInputSerial] = useState('');
    const [fgScannedList, setFgScannedList] = useState([]); // Array of { id, isValid, statusKey, message, unit }
    const [fgQcRemarks, setFgQcRemarks] = useState(''); // 'Approved FG' | 'Conditional Approved'
    const [fgConditionalReason, setFgConditionalReason] = useState('');
    const [fgShowScanner, setFgShowScanner] = useState(false);
    const [fgIsValidating, setFgIsValidating] = useState(false);
    const [fgErrorMessage, setFgErrorMessage] = useState('');
    const [fgShowConfirmModal, setFgShowConfirmModal] = useState(false);
    const [fgIsProcessing, setFgIsProcessing] = useState(false);
    const [fgProcessResult, setFgProcessResult] = useState(null);

    const fgInputRef = useRef(null);

    // Auto-focus input when entering Approved FG
    useEffect(() => {
        if (activeSubView === 'approved_fg' && !fgProcessResult) {
            setTimeout(() => fgInputRef.current?.focus(), 100);
        }
    }, [activeSubView, fgProcessResult]);

    // Handle adding serial number in Approved FG
    const handleAddFgSerial = async (serialToAdd) => {
        const raw = serialToAdd || fgInputSerial;
        if (!raw || !raw.trim()) return;
        const cleanId = raw.trim().toUpperCase().replace(/\//g, '-');
        setFgErrorMessage('');

        // Duplicate check within submission
        if (fgScannedList.some(item => item.id === cleanId)) {
            setFgErrorMessage(`Duplicate Serial Number: "${cleanId}" has already been added to this submission.`);
            return;
        }

        setFgIsValidating(true);
        try {
            const validation = await validateAdvancedUnit(cleanId, project, 'APPROVED_FG');
            const newItem = {
                id: cleanId,
                isValid: validation.isValid,
                statusKey: validation.statusKey,
                message: validation.message,
                unit: validation.unit || null
            };
            setFgScannedList(prev => [...prev, newItem]);
            setFgInputSerial('');
            setTimeout(() => fgInputRef.current?.focus(), 50);
        } catch (err) {
            setFgErrorMessage(err.message || 'Error validating serial number.');
        } finally {
            setFgIsValidating(false);
        }
    };

    const handleRemoveFgSerial = (idToRemove) => {
        setFgScannedList(prev => prev.filter(item => item.id !== idToRemove));
    };

    const handleResetFg = () => {
        setFgInputSerial('');
        setFgScannedList([]);
        setFgQcRemarks('');
        setFgConditionalReason('');
        setFgErrorMessage('');
        setFgShowConfirmModal(false);
        setFgIsProcessing(false);
        setFgProcessResult(null);
        setTimeout(() => fgInputRef.current?.focus(), 100);
    };

    const handlePreSubmitFg = () => {
        setFgErrorMessage('');
        if (fgScannedList.length === 0) {
            setFgErrorMessage('Please enter and validate at least one serial number.');
            return;
        }
        if (!fgQcRemarks) {
            setFgErrorMessage('QC Remarks is mandatory. Please select "Approved FG" or "Conditional Approved".');
            return;
        }
        if (fgQcRemarks === 'Conditional Approved' && (!fgConditionalReason || !fgConditionalReason.trim())) {
            setFgErrorMessage('Reason for Conditional Approval is mandatory.');
            return;
        }
        setFgShowConfirmModal(true);
    };

    const handleConfirmCommitFg = async () => {
        setFgIsProcessing(true);
        try {
            const validSerials = fgScannedList.filter(item => item.isValid).map(item => item.id);
            if (validSerials.length === 0) {
                throw new Error('No eligible serial numbers to process.');
            }

            const result = await executeAdvancedFGApproval({
                serialNumbers: validSerials,
                qcRemarks: fgQcRemarks,
                conditionalApprovalReason: fgConditionalReason,
                station,
                project,
                user
            });

            // Include any pre-existing invalid items in the failure report
            const preInvalid = fgScannedList
                .filter(item => !item.isValid)
                .map(item => ({ serialNumber: item.id, error: item.message }));

            const totalFailedUnits = [...(result.failedUnits || []), ...preInvalid];

            setFgProcessResult({
                successCount: result.success,
                failedCount: result.failed + preInvalid.length,
                successUnits: result.successUnits || [],
                failedUnits: totalFailedUnits,
                qcRemarks: fgQcRemarks,
                conditionalApprovalReason: fgConditionalReason
            });
            setFgShowConfirmModal(false);
        } catch (err) {
            setFgErrorMessage(err.message || 'Processing failed.');
            setFgShowConfirmModal(false);
        } finally {
            setFgIsProcessing(false);
        }
    };

    // =========================================================================
    // 2. COMMIT REJECTION STATE
    // =========================================================================
    const [rejInputSerial, setRejInputSerial] = useState('');
    const [rejActiveUnit, setRejActiveUnit] = useState(null); // Exactly one unit
    const [rejValidation, setRejValidation] = useState(null);
    const [rejFailureReasonCategory, setRejFailureReasonCategory] = useState(COMMON_FAILURE_REASONS[0]);
    const [rejCustomReason, setRejCustomReason] = useState('');
    const [rejSingleWarning, setRejSingleWarning] = useState('');
    const [rejShowScanner, setRejShowScanner] = useState(false);
    const [rejIsValidating, setRejIsValidating] = useState(false);
    const [rejErrorMessage, setRejErrorMessage] = useState('');
    const [rejShowConfirmModal, setRejShowConfirmModal] = useState(false);
    const [rejIsProcessing, setRejIsProcessing] = useState(false);
    const [rejProcessResult, setRejProcessResult] = useState(null);

    const rejInputRef = useRef(null);

    // Auto-focus input when entering Commit Rejection
    useEffect(() => {
        if (activeSubView === 'commit_rejection' && !rejProcessResult && !rejActiveUnit) {
            setTimeout(() => rejInputRef.current?.focus(), 100);
        }
    }, [activeSubView, rejProcessResult, rejActiveUnit]);

    // Handle single SN entry for Rejection
    const handleAddRejSerial = async (serialToAdd) => {
        const raw = serialToAdd || rejInputSerial;
        if (!raw || !raw.trim()) return;

        // SINGLE-SN ENFORCEMENT:
        // "If the operator attempts to enter or scan another SN before completing or resetting the current transaction,
        // prevent the second SN from being added. Display this message:
        // 'Only one Serial Number can be processed at a time. Please complete or reset the current transaction.'"
        if (rejActiveUnit) {
            setRejSingleWarning('Only one Serial Number can be processed at a time. Please complete or reset the current transaction.');
            setRejInputSerial('');
            return;
        }

        const cleanId = raw.trim().toUpperCase().replace(/\//g, '-');
        setRejErrorMessage('');
        setRejSingleWarning('');
        setRejIsValidating(true);

        try {
            const validation = await validateAdvancedUnit(cleanId, project, 'COMMIT_REJECTION');
            setRejValidation(validation);
            setRejActiveUnit({
                id: cleanId,
                isValid: validation.isValid,
                statusKey: validation.statusKey,
                message: validation.message,
                unit: validation.unit || null
            });
            setRejInputSerial('');
            if (!validation.isValid) {
                setRejErrorMessage(validation.message);
            }
        } catch (err) {
            setRejErrorMessage(err.message || 'Error validating defective serial number.');
        } finally {
            setRejIsValidating(false);
        }
    };

    const handleResetRej = () => {
        setRejInputSerial('');
        setRejActiveUnit(null);
        setRejValidation(null);
        setRejFailureReasonCategory(COMMON_FAILURE_REASONS[0]);
        setRejCustomReason('');
        setRejSingleWarning('');
        setRejErrorMessage('');
        setRejShowConfirmModal(false);
        setRejIsProcessing(false);
        setRejProcessResult(null);
        setTimeout(() => rejInputRef.current?.focus(), 100);
    };

    const getFinalFailureReason = () => {
        if (rejFailureReasonCategory === 'Other / Custom Failure') {
            return rejCustomReason.trim();
        }
        return rejCustomReason.trim()
            ? `${rejFailureReasonCategory} — ${rejCustomReason.trim()}`
            : rejFailureReasonCategory;
    };

    const handlePreSubmitRej = () => {
        setRejErrorMessage('');
        setRejSingleWarning('');

        if (!rejActiveUnit) {
            setRejErrorMessage('Please enter and validate exactly one defective serial number.');
            return;
        }
        if (!rejActiveUnit.isValid) {
            setRejErrorMessage(`Unit "${rejActiveUnit.id}" is not eligible for rejection: ${rejActiveUnit.message}`);
            return;
        }

        const finalReason = getFinalFailureReason();
        if (!finalReason || !finalReason.trim()) {
            setRejErrorMessage('Failure Reason is mandatory. Please provide a meaningful defect description.');
            return;
        }

        setRejShowConfirmModal(true);
    };

    const handleConfirmCommitRej = async () => {
        setRejIsProcessing(true);
        try {
            const finalReason = getFinalFailureReason();
            const result = await executeAdvancedRejection({
                serialNumber: rejActiveUnit.id,
                failureReason: finalReason,
                station,
                project,
                user
            });

            setRejProcessResult({
                success: true,
                serialNumber: result.serialNumber,
                failureReason: result.failureReason,
                unit: result.unit
            });
            setRejShowConfirmModal(false);
        } catch (err) {
            setRejErrorMessage(err.message || 'Rejection commit failed.');
            setRejShowConfirmModal(false);
        } finally {
            setRejIsProcessing(false);
        }
    };

    // Safe back navigation warning if unsubmitted work exists
    const handleSafeNavigateBack = () => {
        if (activeSubView === 'approved_fg') {
            if (fgScannedList.length > 0 && !fgProcessResult) {
                if (!window.confirm('You have unsubmitted serial numbers. Are you sure you want to leave this workflow?')) {
                    return;
                }
            }
            setActiveSubView('menu');
        } else if (activeSubView === 'commit_rejection') {
            if (rejActiveUnit && !rejProcessResult) {
                if (!window.confirm('You have an active defective serial number. Are you sure you want to leave this workflow?')) {
                    return;
                }
            }
            setActiveSubView('menu');
        } else {
            onBackToStation();
        }
    };

    const isEligible = project === 'Peripherals' || project === 'Inward QC' || (getDisplayName && (getDisplayName('projects', project) === 'Peripherals' || getDisplayName('projects', project) === 'Inward QC'));
    if (!isEligible) {
        return (
            <div className="advanced-view-container animate-fade-in" style={{ padding: '2rem 1rem', maxWidth: 600, margin: 'auto' }}>
                <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
                    <ShieldAlert size={48} color="var(--warning, #f59e0b)" style={{ margin: '0 auto 1rem' }} />
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>Feature Restricted</h3>
                    <p style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                        Advanced quality workflows (Approved FG & Commit Rejection) are only enabled for the <strong>Peripherals</strong> and <strong>Inward QC</strong> projects.
                    </p>
                    <button className="btn btn-primary" onClick={onBackToStation} style={{ margin: '0 auto' }}>
                        Return to Station
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="advanced-view-container animate-fade-in">
            {/* Top Navigation Bar */}
            <div className="advanced-nav-bar">
                <div className="advanced-breadcrumb-title">
                    <Sparkles size={18} style={{ color: 'var(--primary, #16a34a)' }} />
                    <span>Station Advanced Controls</span>
                    <span style={{ color: 'var(--text-muted, #94a3b8)' }}>/</span>
                    <span style={{ color: 'var(--primary, #16a34a)' }}>
                        {activeSubView === 'menu'
                            ? 'Overview'
                            : activeSubView === 'approved_fg'
                            ? 'Approved FG'
                            : 'Commit Rejection'}
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                        type="button"
                        id="advanced-back-nav-btn"
                        className="advanced-back-btn"
                        onClick={handleSafeNavigateBack}
                        title={activeSubView === 'menu' ? 'Return to Station View' : 'Back to Advanced Menu'}
                    >
                        <ArrowLeft size={14} />
                        <span>{activeSubView === 'menu' ? 'Back to Station' : 'Back to Advanced Menu'}</span>
                    </button>
                </div>
            </div>

            {/* ================================================================= */}
            {/* SUB-VIEW 1: ADVANCED MENU HUB (TWO ACTION BUTTONS) */}
            {/* ================================================================= */}
            {activeSubView === 'menu' && (
                <div className="advanced-hub-wrapper animate-fade-in">
                    <div className="advanced-hub-card">
                        {/* Context Badge */}
                        <div className="advanced-hub-badge">
                            <span className="advanced-status-dot" />
                            <span>Station Context: <strong>{getDisplayName('stations', station?.name)}</strong> &bull; {getDisplayName('projects', project)}</span>
                        </div>

                        {/* Title & Subtitle */}
                        <h2 className="advanced-hub-title">Advanced Quality & Terminal Workflows</h2>
                        <p className="advanced-hub-subtitle">
                            Direct execution workflows for Finished Goods approval and defective unit rejection. Select an action below to proceed.
                        </p>

                        {/* Operational Context Strip - utilizes canvas space with real MES utility */}
                        <div className="advanced-hub-meta-bar">
                            <div className="advanced-hub-meta-item">
                                <span className="meta-label">Station Name</span>
                                <span className="meta-val">{getDisplayName('stations', station?.name)}</span>
                            </div>
                            <div className="advanced-hub-meta-divider" />
                            <div className="advanced-hub-meta-item">
                                <span className="meta-label">Production Line</span>
                                <span className="meta-val">{getDisplayName('projects', project)}</span>
                            </div>
                            <div className="advanced-hub-meta-divider" />
                            <div className="advanced-hub-meta-item">
                                <span className="meta-label">Operator</span>
                                <span className="meta-val">{user?.name || user?.id || 'Biswaranjan Panda'}</span>
                            </div>
                            <div className="advanced-hub-meta-divider" />
                            <div className="advanced-hub-meta-item">
                                <span className="meta-label">Execution Mode</span>
                                <span className="meta-val" style={{ color: 'var(--success, #059669)', fontWeight: 700 }}>● Live MES Terminal</span>
                            </div>
                        </div>

                        {/* Sleek, Proper-Sized Action Buttons Grid */}
                        <div className="advanced-actions-grid">
                            {/* BUTTON 1: Approved FG */}
                            <button
                                type="button"
                                id="btn-open-approved-fg"
                                className="advanced-action-btn btn-approved-fg"
                                onClick={() => {
                                    handleResetFg();
                                    setActiveSubView('approved_fg');
                                }}
                            >
                                <div className="advanced-action-icon-wrapper">
                                    <CheckCircle2 size={22} color="#ffffff" strokeWidth={2.5} />
                                </div>
                                <div className="advanced-action-content">
                                    <div className="advanced-action-btn-title">
                                        <span>Approved FG</span>
                                        <span className="advanced-badge-pill pill-green">Batch / Multi-SN</span>
                                    </div>
                                    <div className="advanced-action-btn-desc">
                                        Approve units to Finished Goods with QC remarks & conditional justification.
                                    </div>
                                </div>
                                <ArrowRight size={18} className="advanced-action-arrow" />
                            </button>

                            {/* BUTTON 2: Commit Rejection */}
                            <button
                                type="button"
                                id="btn-open-commit-rejection"
                                className="advanced-action-btn btn-commit-rejection"
                                onClick={() => {
                                    handleResetRej();
                                    setActiveSubView('commit_rejection');
                                }}
                            >
                                <div className="advanced-action-icon-wrapper">
                                    <XCircle size={22} color="#ffffff" strokeWidth={2.5} />
                                </div>
                                <div className="advanced-action-content">
                                    <div className="advanced-action-btn-title">
                                        <span>Commit Rejection</span>
                                        <span className="advanced-badge-pill pill-red">Single-SN Strict</span>
                                    </div>
                                    <div className="advanced-action-btn-desc">
                                        Record mandatory failure reason and commit unit rejection for 1 defective unit.
                                    </div>
                                </div>
                                <ArrowRight size={18} className="advanced-action-arrow" />
                            </button>
                        </div>

                        {/* Audit & Compliance Footer Strip */}
                        <div className="advanced-hub-footer-notice">
                            <ShieldCheck size={16} color="var(--primary, #059669)" style={{ flexShrink: 0 }} />
                            <span>
                                <strong>MES Governance:</strong> All Approved FG and Rejection transactions record operator credentials, station timestamps, and update inventory instantly in compliance with quality standards.
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* ================================================================= */}
            {/* SUB-VIEW 2: APPROVED FG WORKFLOW */}
            {/* ================================================================= */}
            {activeSubView === 'approved_fg' && (
                <div className="advanced-card animate-fade-in">
                    <div className="advanced-card-header">
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-main, #0f172a)' }}>
                                Approved FG
                            </h2>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', margin: '0.2rem 0 0 0' }}>
                                Process one or multiple eligible serial numbers to Finished Goods status (FG / WIP Complete).
                            </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className="terminal-status-pill online">
                                <CheckCircle2 size={13} />
                                <span>Multi-SN Enabled</span>
                            </span>
                        </div>
                    </div>

                    <div className="advanced-card-body">
                        {/* Error Alert Banner */}
                        {fgErrorMessage && (
                            <div className="terminal-alert-banner error animate-fade-in">
                                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                                <span>{fgErrorMessage}</span>
                            </div>
                        )}

                        {/* Completed Results Summary Banner */}
                        {fgProcessResult && (
                            <div style={{
                                padding: '1.5rem',
                                borderRadius: 'var(--radius-md, 0.5rem)',
                                background: fgProcessResult.failedCount === 0 ? 'rgba(22, 163, 74, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                border: `1.5px solid ${fgProcessResult.failedCount === 0 ? '#16a34a' : '#f59e0b'}`,
                                marginBottom: '1rem'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                    <CheckCircle2 size={24} color={fgProcessResult.failedCount === 0 ? '#16a34a' : '#d97706'} />
                                    <div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                                            {fgProcessResult.failedCount === 0 ? 'Approved FG Completed Successfully' : 'Approved FG Completed with Warnings'}
                                        </h3>
                                        <p style={{ fontSize: '0.8rem', color: '#475569', margin: '0.2rem 0 0 0' }}>
                                            Disposition: <strong>{fgProcessResult.qcRemarks}</strong>
                                            {fgProcessResult.conditionalApprovalReason && (
                                                <span> | Reason: "{fgProcessResult.conditionalApprovalReason}"</span>
                                            )}
                                        </p>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                    <div style={{ padding: '0.5rem 1rem', background: '#ffffff', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>SUCCESSFULLY PROCESSED (FG)</span>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16a34a' }}>
                                            {fgProcessResult.successCount}
                                        </div>
                                    </div>
                                    <div style={{ padding: '0.5rem 1rem', background: '#ffffff', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>FAILED / INELIGIBLE</span>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: fgProcessResult.failedCount > 0 ? '#dc2626' : '#64748b' }}>
                                            {fgProcessResult.failedCount}
                                        </div>
                                    </div>
                                </div>

                                {fgProcessResult.failedUnits?.length > 0 && (
                                    <div style={{ marginTop: '0.75rem' }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626', marginBottom: '0.4rem' }}>
                                            Failed Serial Numbers:
                                        </div>
                                        <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: '#dc2626' }}>
                                            {fgProcessResult.failedUnits.map((fu, idx) => (
                                                <li key={idx}>
                                                    <strong>{fu.serialNumber}</strong>: {fu.error}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem' }}>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={handleResetFg}
                                        style={{ height: 40, padding: '0 1.25rem', fontSize: '0.85rem' }}
                                    >
                                        Start New Approval Transaction
                                    </button>
                                </div>
                            </div>
                        )}

                        {!fgProcessResult && (
                            <>
                                {/* Input Field 1: Serial Number Scan / Enter */}
                                <div className="advanced-input-group">
                                    <label className="advanced-input-label" htmlFor="fg-serial-input">
                                        <span>Scan Serial Number</span>
                                        <span className="required">*</span>
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input
                                            ref={fgInputRef}
                                            id="fg-serial-input"
                                            type="text"
                                            className="advanced-text-input font-bold text-mono"
                                            placeholder="Scan barcode or type Serial Number and press Enter..."
                                            value={fgInputSerial}
                                            onChange={e => setFgInputSerial(e.target.value.toUpperCase())}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleAddFgSerial();
                                                }
                                            }}
                                            disabled={fgIsValidating || fgIsProcessing}
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            id="btn-fg-add-serial"
                                            className="btn btn-primary"
                                            style={{ height: 46, padding: '0 1.5rem', fontWeight: 700 }}
                                            onClick={() => handleAddFgSerial()}
                                            disabled={!fgInputSerial.trim() || fgIsValidating || fgIsProcessing}
                                        >
                                            {fgIsValidating ? <Loader2 size={16} className="animate-spin" /> : 'Add SN'}
                                        </button>
                                        <button
                                            type="button"
                                            id="btn-fg-camera-scan"
                                            className="btn btn-secondary"
                                            style={{ height: 46, padding: '0 1rem' }}
                                            onClick={() => setFgShowScanner(!fgShowScanner)}
                                            title="Open Barcode Camera Scanner"
                                        >
                                            <Scan size={18} />
                                        </button>
                                    </div>

                                    {fgShowScanner && (
                                        <div style={{ marginTop: '0.75rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', padding: '0.5rem' }}>
                                            <QRScanner
                                                onScan={(scanned) => {
                                                    const clean = scanned.toUpperCase().replace(/\//g, '-');
                                                    handleAddFgSerial(clean);
                                                    setFgShowScanner(false);
                                                }}
                                                onClose={() => setFgShowScanner(false)}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Image 3 Flextronics / Baan Style Detail Information Table */}
                                <div className="baan-table-wrapper">
                                    <div className="baan-table-header">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <FileText size={14} color="#475569" />
                                            <span>Detail Information — Scanned Units Review ({fgScannedList.length})</span>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                            Verify units before committing
                                        </span>
                                    </div>

                                    {fgScannedList.length === 0 ? (
                                        <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: '#94a3b8' }}>
                                            <Scan size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                                            <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600 }}>
                                                No serial numbers scanned yet. Scan or type serial numbers above.
                                            </p>
                                        </div>
                                    ) : (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table className="baan-detail-table">
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: 45 }}>#</th>
                                                        <th>Serial Number</th>
                                                        <th>Station / Stage</th>
                                                        <th>Current Status</th>
                                                        <th>Eligibility Status</th>
                                                        <th style={{ width: 60, textAlign: 'center' }}>Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {fgScannedList.map((item, idx) => (
                                                        <tr key={item.id}>
                                                            <td style={{ color: '#94a3b8', fontWeight: 700 }}>{idx + 1}</td>
                                                            <td className="text-mono font-bold" style={{ fontSize: '0.9rem' }}>
                                                                {item.id}
                                                            </td>
                                                            <td>
                                                                {item.unit?.stationName || (item.unit ? `Station ${item.unit.currentStation}` : '—')}
                                                            </td>
                                                            <td>
                                                                <span className="status-pill info" style={{ fontSize: '0.7rem' }}>
                                                                    {item.unit?.status || 'Unknown'}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                {item.isValid ? (
                                                                    <span className="baan-status-badge pass">
                                                                        <CheckCircle2 size={14} />
                                                                        <span>Eligible for FG Approval</span>
                                                                    </span>
                                                                ) : (
                                                                    <span className="baan-status-badge fail">
                                                                        <XCircle size={14} />
                                                                        <span>{item.message}</span>
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td style={{ textAlign: 'center' }}>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-secondary"
                                                                    style={{ padding: '0.25rem 0.5rem', color: '#dc2626' }}
                                                                    onClick={() => handleRemoveFgSerial(item.id)}
                                                                    title="Remove serial from list"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>

                                {/* Input Field 2: QC Remarks Dropdown */}
                                <div className="advanced-input-group">
                                    <label className="advanced-input-label" htmlFor="fg-qc-remarks-select">
                                        <span>QC Remarks</span>
                                        <span className="required">*</span>
                                    </label>
                                    <select
                                        id="fg-qc-remarks-select"
                                        className="advanced-select-input"
                                        value={fgQcRemarks}
                                        onChange={e => setFgQcRemarks(e.target.value)}
                                    >
                                        <option value="">-- Select QC Remarks --</option>
                                        <option value="Approved FG">Approved FG</option>
                                        <option value="Conditional Approved">Conditional Approved</option>
                                    </select>
                                </div>

                                {/* Dynamic Multiline Textarea: Reason for Conditional Approval */}
                                {fgQcRemarks === 'Conditional Approved' && (
                                    <div className="advanced-input-group animate-fade-in">
                                        <label className="advanced-input-label" htmlFor="fg-conditional-reason">
                                            <span>Reason for Conditional Approval</span>
                                            <span className="required">*</span>
                                        </label>
                                        <textarea
                                            id="fg-conditional-reason"
                                            className="advanced-textarea-input"
                                            rows={3}
                                            placeholder="Describe the operational or quality justification for conditional approval..."
                                            value={fgConditionalReason}
                                            onChange={e => setFgConditionalReason(e.target.value)}
                                        />
                                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                            Mandatory: Both Approved FG and Conditional Approved result in Unit Status = FG and WIP Status = Complete.
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {!fgProcessResult && (
                        <div className="advanced-card-footer">
                            <button
                                type="button"
                                id="btn-fg-reset"
                                className="btn btn-secondary"
                                onClick={handleResetFg}
                                disabled={fgIsProcessing}
                                style={{ height: 44, padding: '0 1.5rem', fontWeight: 600 }}
                            >
                                <RefreshCw size={14} /> Reset
                            </button>

                            <button
                                type="button"
                                id="btn-fg-complete"
                                className="btn btn-primary"
                                onClick={handlePreSubmitFg}
                                disabled={
                                    fgIsProcessing ||
                                    fgScannedList.length === 0 ||
                                    !fgQcRemarks ||
                                    (fgQcRemarks === 'Conditional Approved' && !fgConditionalReason.trim())
                                }
                                style={{
                                    height: 44,
                                    padding: '0 2rem',
                                    fontWeight: 800,
                                    background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                                    color: '#ffffff'
                                }}
                            >
                                {fgIsProcessing ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        <span>Processing...</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={16} />
                                        <span>Complete ({fgScannedList.length} SNs)</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Step 2: Confirmation Modal */}
                    {fgShowConfirmModal && (
                        <div className="advanced-modal-overlay">
                            <div className="advanced-modal-card">
                                <div style={{
                                    padding: '1.25rem 1.5rem',
                                    background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                                    color: '#ffffff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem'
                                }}>
                                    <CheckCircle2 size={24} color="#ffffff" />
                                    <div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                                            Confirm Finished Goods Approval
                                        </h3>
                                        <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.85)' }}>
                                            Please verify transaction details before committing
                                        </span>
                                    </div>
                                </div>

                                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }}>
                                            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total SNs</span>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{fgScannedList.length}</div>
                                        </div>
                                        <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }}>
                                            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Valid & Eligible</span>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16a34a' }}>
                                                {fgScannedList.filter(item => item.isValid).length}
                                            </div>
                                        </div>
                                    </div>

                                    {fgScannedList.some(item => !item.isValid) && (
                                        <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '0.375rem', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626', marginBottom: '0.25rem' }}>
                                                ⚠️ Ineligible Units ({fgScannedList.filter(item => !item.isValid).length}):
                                            </div>
                                            <span style={{ fontSize: '0.75rem', color: '#b91c1c' }}>
                                                Ineligible units will not be transitioned to FG.
                                            </span>
                                        </div>
                                    )}

                                    <div style={{ padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }}>
                                        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>QC Remarks:</span>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#16a34a', marginTop: 2 }}>{fgQcRemarks}</div>
                                        {fgQcRemarks === 'Conditional Approved' && (
                                            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed #cbd5e1' }}>
                                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Reason:</span>
                                                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#334155' }}>{fgConditionalReason}</p>
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
                                        By confirming, eligible units will be updated to:
                                        <strong style={{ color: '#0f172a' }}> Unit Status = FG</strong> and
                                        <strong style={{ color: '#0f172a' }}> WIP Status = Complete</strong>.
                                    </div>
                                </div>

                                <div style={{ padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => setFgShowConfirmModal(false)}
                                        disabled={fgIsProcessing}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        id="btn-fg-confirm-submit"
                                        className="btn btn-primary"
                                        onClick={handleConfirmCommitFg}
                                        disabled={fgIsProcessing || fgScannedList.filter(item => item.isValid).length === 0}
                                        style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', color: '#ffffff', fontWeight: 800 }}
                                    >
                                        {fgIsProcessing ? 'Committing Changes...' : 'Confirm & Approve FG'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ================================================================= */}
            {/* SUB-VIEW 3: COMMIT REJECTION WORKFLOW */}
            {/* ================================================================= */}
            {activeSubView === 'commit_rejection' && (
                <div className="advanced-card animate-fade-in">
                    <div className="advanced-card-header">
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-main, #0f172a)' }}>
                                Commit Rejection
                            </h2>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', margin: '0.2rem 0 0 0' }}>
                                Strictly ONE defective serial number per transaction. Record observed defect and commit rejection.
                            </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className="terminal-status-pill online" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                                <XCircle size={13} />
                                <span>Single-SN Enforced</span>
                            </span>
                        </div>
                    </div>

                    <div className="advanced-card-body">
                        {/* Single-SN Enforcement Warning Banner */}
                        {rejSingleWarning && (
                            <div className="terminal-alert-banner warning animate-fade-in" id="rej-single-warning-banner">
                                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                                <span style={{ fontWeight: 700 }}>{rejSingleWarning}</span>
                            </div>
                        )}

                        {/* General Error Banner */}
                        {rejErrorMessage && (
                            <div className="terminal-alert-banner error animate-fade-in">
                                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                                <span>{rejErrorMessage}</span>
                            </div>
                        )}

                        {/* Completed Rejection Outcome Banner */}
                        {rejProcessResult && (
                            <div style={{
                                padding: '1.5rem',
                                borderRadius: 'var(--radius-md, 0.5rem)',
                                background: 'rgba(239, 68, 68, 0.08)',
                                border: '1.5px solid #dc2626',
                                marginBottom: '1rem'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                    <XCircle size={24} color="#dc2626" />
                                    <div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#dc2626' }}>
                                            Rejection Committed Successfully
                                        </h3>
                                        <p style={{ fontSize: '0.8rem', color: '#475569', margin: '0.2rem 0 0 0' }}>
                                            Unit Status: <strong>Rejected</strong> | WIP Status: <strong>Complete</strong>
                                        </p>
                                    </div>
                                </div>

                                <div style={{ padding: '0.75rem 1rem', background: '#ffffff', borderRadius: '0.375rem', border: '1px solid #cbd5e1', marginBottom: '1rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>SERIAL NUMBER:</span>
                                        <span className="text-mono font-bold" style={{ fontSize: '0.95rem', color: '#dc2626' }}>{rejProcessResult.serialNumber}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>FAILURE REASON:</span>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>{rejProcessResult.failureReason}</span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={handleResetRej}
                                        style={{ height: 40, padding: '0 1.25rem', fontSize: '0.85rem', background: '#dc2626' }}
                                    >
                                        Reject Another Unit
                                    </button>
                                </div>
                            </div>
                        )}

                        {!rejProcessResult && (
                            <>
                                {/* Input Field 1: Defective Serial Number */}
                                <div className="advanced-input-group">
                                    <label className="advanced-input-label" htmlFor="rej-serial-input">
                                        <span>Enter the Defective Serial Number</span>
                                        <span className="required">*</span>
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input
                                            ref={rejInputRef}
                                            id="rej-serial-input"
                                            type="text"
                                            className="advanced-text-input font-bold text-mono"
                                            placeholder={rejActiveUnit ? "Single SN active. Complete or reset transaction..." : "Scan or enter the defective Serial Number and press Enter..."}
                                            value={rejInputSerial}
                                            onChange={e => setRejInputSerial(e.target.value.toUpperCase())}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleAddRejSerial();
                                                }
                                            }}
                                            disabled={rejIsValidating || rejIsProcessing}
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            id="btn-rej-validate-serial"
                                            className="btn btn-secondary"
                                            style={{ height: 46, padding: '0 1.5rem', fontWeight: 700 }}
                                            onClick={() => handleAddRejSerial()}
                                            disabled={!rejInputSerial.trim() || rejIsValidating || rejIsProcessing}
                                        >
                                            {rejIsValidating ? <Loader2 size={16} className="animate-spin" /> : 'Verify SN'}
                                        </button>
                                        <button
                                            type="button"
                                            id="btn-rej-camera-scan"
                                            className="btn btn-secondary"
                                            style={{ height: 46, padding: '0 1rem' }}
                                            onClick={() => setRejShowScanner(!rejShowScanner)}
                                            title="Open Barcode Camera Scanner"
                                            disabled={Boolean(rejActiveUnit)}
                                        >
                                            <Scan size={18} />
                                        </button>
                                    </div>

                                    {rejShowScanner && (
                                        <div style={{ marginTop: '0.75rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', padding: '0.5rem' }}>
                                            <QRScanner
                                                onScan={(scanned) => {
                                                    const clean = scanned.toUpperCase().replace(/\//g, '-');
                                                    handleAddRejSerial(clean);
                                                    setRejShowScanner(false);
                                                }}
                                                onClose={() => setRejShowScanner(false)}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Image 3 Flextronics / Baan Style Detail Information Table for the Active Unit */}
                                {rejActiveUnit && (
                                    <div className="baan-table-wrapper animate-fade-in">
                                        <div className="baan-table-header">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <FileText size={14} color="#475569" />
                                                <span>Detail Information — Defective Unit Verification</span>
                                            </div>
                                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                                Single Serial Number Transaction
                                            </span>
                                        </div>

                                        <table className="baan-detail-table">
                                            <thead>
                                                <tr>
                                                    <th>Details</th>
                                                    <th>Detail Value</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td style={{ fontWeight: 700 }}>Serial Number</td>
                                                    <td className="text-mono font-bold" style={{ fontSize: '0.95rem' }}>
                                                        {rejActiveUnit.id}
                                                    </td>
                                                    <td>
                                                        <span className="baan-status-badge pass">
                                                            <CheckCircle2 size={14} />
                                                            <span>Verified</span>
                                                        </span>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style={{ fontWeight: 700 }}>Project</td>
                                                    <td>{rejActiveUnit.unit?.project || project}</td>
                                                    <td>—</td>
                                                </tr>
                                                <tr>
                                                    <td style={{ fontWeight: 700 }}>Current Station</td>
                                                    <td>{rejActiveUnit.unit?.stationName || 'Unknown'}</td>
                                                    <td>—</td>
                                                </tr>
                                                <tr>
                                                    <td style={{ fontWeight: 700 }}>Current System Status</td>
                                                    <td>
                                                        <span className="status-pill info" style={{ fontSize: '0.75rem' }}>
                                                            {rejActiveUnit.unit?.status || 'Unknown'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {rejActiveUnit.isValid ? (
                                                            <span className="baan-status-badge pass">
                                                                <CheckCircle2 size={14} />
                                                                <span>Eligible for Rejection</span>
                                                            </span>
                                                        ) : (
                                                            <span className="baan-status-badge fail">
                                                                <XCircle size={14} />
                                                                <span>{rejActiveUnit.message}</span>
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Input Field 2: Failure Reason */}
                                <div className="advanced-input-group">
                                    <label className="advanced-input-label" htmlFor="rej-failure-reason-cat">
                                        <span>Failure Reason</span>
                                        <span className="required">*</span>
                                    </label>
                                    <select
                                        id="rej-failure-reason-cat"
                                        className="advanced-select-input"
                                        value={rejFailureReasonCategory}
                                        onChange={e => setRejFailureReasonCategory(e.target.value)}
                                    >
                                        {COMMON_FAILURE_REASONS.map(reason => (
                                            <option key={reason} value={reason}>{reason}</option>
                                        ))}
                                    </select>

                                    <textarea
                                        id="rej-failure-reason-text"
                                        className="advanced-textarea-input"
                                        rows={3}
                                        placeholder="Enter detailed description of the observed defect or failure symptom..."
                                        value={rejCustomReason}
                                        onChange={e => setRejCustomReason(e.target.value)}
                                        style={{ marginTop: '0.5rem' }}
                                    />
                                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                        Mandatory: Describe the defect. Successful rejection sets Unit Status = Rejected and WIP Status = Complete.
                                    </span>
                                </div>
                            </>
                        )}
                    </div>

                    {!rejProcessResult && (
                        <div className="advanced-card-footer">
                            <button
                                type="button"
                                id="btn-rej-reset"
                                className="btn btn-secondary"
                                onClick={handleResetRej}
                                disabled={rejIsProcessing}
                                style={{ height: 44, padding: '0 1.5rem', fontWeight: 600 }}
                            >
                                <RefreshCw size={14} /> Reset
                            </button>

                            <button
                                type="button"
                                id="btn-rej-complete"
                                className="btn btn-primary"
                                onClick={handlePreSubmitRej}
                                disabled={
                                    rejIsProcessing ||
                                    !rejActiveUnit ||
                                    !rejActiveUnit.isValid ||
                                    !getFinalFailureReason().trim()
                                }
                                style={{
                                    height: 44,
                                    padding: '0 2rem',
                                    fontWeight: 800,
                                    background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                                    color: '#ffffff'
                                }}
                            >
                                {rejIsProcessing ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        <span>Processing...</span>
                                    </>
                                ) : (
                                    <>
                                        <XCircle size={16} />
                                        <span>Complete (Commit Rejection)</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Step 2: Confirmation Modal */}
                    {rejShowConfirmModal && (
                        <div className="advanced-modal-overlay">
                            <div className="advanced-modal-card">
                                <div style={{
                                    padding: '1.25rem 1.5rem',
                                    background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                                    color: '#ffffff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem'
                                }}>
                                    <XCircle size={24} color="#ffffff" />
                                    <div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                                            Confirm Unit Rejection
                                        </h3>
                                        <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.85)' }}>
                                            Please verify before committing terminal status change
                                        </span>
                                    </div>
                                </div>

                                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }}>
                                        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Defective Serial Number:</span>
                                        <div className="text-mono font-bold" style={{ fontSize: '1.15rem', color: '#dc2626', marginTop: 2 }}>
                                            {rejActiveUnit.id}
                                        </div>
                                    </div>

                                    <div style={{ padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }}>
                                        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Failure Reason:</span>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                                            {getFinalFailureReason()}
                                        </div>
                                    </div>

                                    <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
                                        By confirming, the unit status will be permanently marked as:
                                        <strong style={{ color: '#dc2626' }}> Unit Status = Rejected</strong> and
                                        <strong style={{ color: '#0f172a' }}> WIP Status = Complete</strong>.
                                    </div>
                                </div>

                                <div style={{ padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => setRejShowConfirmModal(false)}
                                        disabled={rejIsProcessing}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        id="btn-rej-confirm-submit"
                                        className="btn btn-primary"
                                        onClick={handleConfirmCommitRej}
                                        disabled={rejIsProcessing}
                                        style={{ background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', color: '#ffffff', fontWeight: 800 }}
                                    >
                                        {rejIsProcessing ? 'Committing Rejection...' : 'Confirm & Commit Rejection'}
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

export default StationAdvancedModule;
