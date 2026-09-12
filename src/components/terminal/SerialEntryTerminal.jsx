import React, { useEffect, useRef } from 'react';
import { Scan, Cpu, Activity, Database, CheckCircle2, AlertTriangle, RefreshCw, Layers } from 'lucide-react';
import './TerminalUI.css';

/**
 * SerialEntryTerminal: Unified scanner-first interface for Serial Entry & Scan Terminals.
 * Philosophy: Simple → Fast → Scanner-first → State-aware.
 * Features:
 *  - Dominant, auto-focused serial number input.
 *  - Full Enter-key submission and barcode scanner compatibility.
 *  - Status overview side panel utilizing desktop screen real-estate.
 *  - Reliable system state indicators (Live MES, Operational Station, Scanner Ready).
 *  - Last processed unit display.
 *  - Inline hold resolution / unhold trigger when permitted.
 */
export const SerialEntryTerminal = ({
    scannedId,
    setScannedId,
    onSubmit,
    onCameraScanClick,
    isValidating = false,
    errorMessage = '',
    activeUnit = null,
    onUnhold = null,
    canUnhold = false,
    unholdStation = '',
    lastProcessed = null,
    stationName = '',
    projectName = '',
    terminalId = '',
    instructions = 'Scan physical barcode or enter serial number and press Enter.'
}) => {
    const inputRef = useRef(null);

    // Auto-focus input when terminal mounts or resets
    useEffect(() => {
        const timer = setTimeout(() => {
            inputRef.current?.focus();
        }, 80);
        return () => clearTimeout(timer);
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (scannedId && !isValidating) {
            onSubmit(e);
        }
    };

    return (
        <div className="serial-entry-layout animate-fade-in">
            {/* Primary Scanner Zone */}
            <div className="serial-scan-card">
                <div className="serial-scan-headline">
                    <div className="flex-center" style={{
                        width: 76,
                        height: 76,
                        background: 'var(--primary-alpha, rgba(37, 99, 235, 0.1))',
                        borderRadius: '50%',
                        margin: '0 auto 1rem',
                        color: 'var(--primary)'
                    }}>
                        <Scan size={38} />
                    </div>
                    <h2 className="serial-scan-title">Ready to Scan</h2>
                    <p className="serial-scan-subtitle">{instructions}</p>
                </div>

                <form onSubmit={handleSubmit} className="serial-scan-form">
                    <div className="serial-input-wrapper">
                        <input
                            ref={inputRef}
                            type="text"
                            autoFocus
                            placeholder="SCAN SERIAL / QR..."
                            value={scannedId}
                            onChange={(e) => setScannedId(e.target.value.toUpperCase().replace(/\//g, '-'))}
                            className="serial-scan-input"
                            disabled={isValidating}
                            autoComplete="off"
                            spellCheck="false"
                        />
                        {onCameraScanClick && (
                            <button
                                type="button"
                                className="btn-scanner"
                                style={{ height: 64, width: 64, flexShrink: 0 }}
                                onClick={onCameraScanClick}
                                title="Open camera barcode/QR scanner"
                            >
                                <Scan size={28} />
                            </button>
                        )}
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary serial-scan-btn"
                        disabled={!scannedId || isValidating}
                    >
                        {isValidating ? (
                            <>
                                <RefreshCw size={20} className="animate-spin" />
                                <span>Validating Unit...</span>
                            </>
                        ) : (
                            <>
                                <CheckCircle2 size={20} />
                                <span>Process Unit</span>
                            </>
                        )}
                    </button>
                </form>

                {/* Error Banner & Unhold Action */}
                {errorMessage && (
                    <div className="terminal-alert-banner error" style={{ width: '100%', maxWidth: 540 }}>
                        <AlertTriangle size={22} style={{ flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{errorMessage}</div>

                            {activeUnit?.holdStatus === 'HOLD' && (
                                <div style={{
                                    paddingTop: '0.6rem',
                                    borderTop: '1px solid rgba(239, 68, 68, 0.25)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.5rem'
                                }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        Held at: <strong>{activeUnit.holdStation}</strong>
                                        {activeUnit.holdReason && ` (${activeUnit.holdReason})`}
                                    </div>
                                    {canUnhold && onUnhold ? (
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            style={{ height: 38, fontSize: '0.85rem' }}
                                            onClick={onUnhold}
                                        >
                                            <RefreshCw size={14} /> Unhold Serial at {activeUnit.holdStation}
                                        </button>
                                    ) : (
                                        <div style={{ fontSize: '0.78rem', color: 'var(--error)' }}>
                                            Requires <strong>{projectName} &gt; {activeUnit.holdStation}</strong> permission to unhold.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Desktop Operational Information Panel */}
            <aside className="serial-operational-panel">
                {/* Station Status Card */}
                <div className="operational-tile-card">
                    <div className="operational-tile-title">
                        <span>Terminal Telemetry</span>
                        <Activity size={14} />
                    </div>

                    <div className="operational-status-grid">
                        <div className="operational-status-item">
                            <span className="operational-status-label">Project</span>
                            <span className="operational-status-val">{projectName || 'CQA MES'}</span>
                        </div>

                        <div className="operational-status-item">
                            <span className="operational-status-label">Terminal ID</span>
                            <span className="operational-status-val">Station {terminalId}</span>
                        </div>

                        <div className="operational-status-item">
                            <span className="operational-status-label">Station State</span>
                            <span className="operational-status-val" style={{ color: 'var(--success)' }}>
                                <span className="terminal-dot" /> Ready
                            </span>
                        </div>

                        <div className="operational-status-item">
                            <span className="operational-status-label">Scanner Input</span>
                            <span className="operational-status-val" style={{ color: 'var(--success)' }}>
                                <Cpu size={14} /> Active
                            </span>
                        </div>
                    </div>
                </div>

                {/* Last Processed Unit Card */}
                {lastProcessed && (
                    <div className="operational-tile-card">
                        <div className="operational-tile-title">
                            <span>Last Processed Unit</span>
                            <CheckCircle2 size={14} color="var(--success)" />
                        </div>

                        <div className="last-processed-card">
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                Serial Number
                            </span>
                            <span className="last-processed-sn">
                                {typeof lastProcessed === 'string' ? lastProcessed : (lastProcessed.serialNumber || lastProcessed.id || 'N/A')}
                            </span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                Successfully passed {stationName}
                            </span>
                        </div>
                    </div>
                )}

                {/* Station Quick Tips */}
                <div className="operational-tile-card" style={{ background: 'var(--bg-input)' }}>
                    <div className="operational-tile-title">
                        <span>Operator Quick Guide</span>
                        <Layers size={14} />
                    </div>
                    <ul style={{
                        margin: 0,
                        paddingLeft: '1.2rem',
                        fontSize: '0.8rem',
                        lineHeight: '1.5',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem'
                    }}>
                        <li>Barcode scanner automatically submits on scan.</li>
                        <li>Format uppercase characters and hyphens automatically.</li>
                        <li>To switch stations, click back in breadcrumbs or navigation.</li>
                    </ul>
                </div>
            </aside>
        </div>
    );
};

export default SerialEntryTerminal;
