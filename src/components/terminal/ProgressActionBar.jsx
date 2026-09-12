import React from 'react';
import { Check, RefreshCw, AlertTriangle, CheckCircle2, XCircle, PauseCircle } from 'lucide-react';
import './TerminalUI.css';

/**
 * ProgressActionBar: Sticky bottom action bar for inspection and QC terminals.
 * Never covers form controls because parent viewport has sufficient bottom padding.
 * Displays:
 *  - Checkpoint answered count and visual progress bar
 *  - Overall status badge (Pass, Fail, Hold, Incomplete)
 *  - Submit and Reset buttons
 */
export const ProgressActionBar = ({
    answeredCount = 0,
    totalCount = 0,
    overallResult = null,
    onSubmit,
    onReset,
    submitText = 'Submit & Complete Terminal',
    isSubmitting = false,
    submitDisabled = false,
    extraActions = null,
    className = '',
    style = {}
}) => {
    const percent = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;

    const renderStatusBadge = () => {
        if (!overallResult || overallResult === 'Incomplete') {
            return (
                <div className="terminal-status-pill standby" style={{ fontSize: '0.85rem', fontWeight: 800 }}>
                    <span>Incomplete ({answeredCount}/{totalCount})</span>
                </div>
            );
        }

        if (overallResult === 'Pass') {
            return (
                <div className="terminal-status-pill online" style={{ fontSize: '0.85rem', fontWeight: 800 }}>
                    <CheckCircle2 size={15} />
                    <span>Overall: PASS</span>
                </div>
            );
        }

        if (overallResult === 'Fail') {
            return (
                <div className="terminal-status-pill warning" style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', fontSize: '0.85rem', fontWeight: 800 }}>
                    <XCircle size={15} />
                    <span>Overall: FAIL</span>
                </div>
            );
        }

        if (overallResult === 'Hold') {
            return (
                <div className="terminal-status-pill warning" style={{ fontSize: '0.85rem', fontWeight: 800 }}>
                    <PauseCircle size={15} />
                    <span>Overall: HOLD</span>
                </div>
            );
        }

        return (
            <div className="terminal-status-pill standby" style={{ fontSize: '0.85rem', fontWeight: 800 }}>
                <span>{overallResult}</span>
            </div>
        );
    };

    return (
        <div className={`terminal-sticky-action-bar ${className}`} style={style}>
            <div className="terminal-action-inner">
                <div className="terminal-progress-summary">
                    <div className="terminal-progress-stats">
                        <span className="terminal-progress-label">
                            Checkpoints: {answeredCount} / {totalCount} ({percent}%)
                        </span>
                        <div className="terminal-progress-bar-wrap">
                            <div
                                className="terminal-progress-bar-fill"
                                style={{
                                    width: `${percent}%`,
                                    background: overallResult === 'Fail' ? '#ef4444' : (overallResult === 'Hold' ? '#f59e0b' : 'var(--primary)')
                                }}
                            />
                        </div>
                    </div>

                    {renderStatusBadge()}
                </div>

                <div className="terminal-action-btns">
                    {extraActions}

                    <button
                        type="button"
                        className="btn btn-secondary terminal-reset-btn"
                        onClick={onReset}
                        disabled={isSubmitting}
                        title="Reset terminal inputs"
                    >
                        <RefreshCw size={16} />
                        <span>Reset</span>
                    </button>

                    <button
                        type={onSubmit ? 'button' : 'submit'}
                        className="btn btn-primary terminal-submit-btn"
                        onClick={onSubmit}
                        disabled={submitDisabled || isSubmitting}
                        title={submitText}
                    >
                        <Check size={18} />
                        <span>{isSubmitting ? 'Processing...' : submitText}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProgressActionBar;
