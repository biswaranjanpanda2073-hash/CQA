import React, { useRef, useEffect } from 'react';
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
    const submitBtnRef = useRef(null);
    const resetBtnRef = useRef(null);
    const prevCanSubmitRef = useRef(false);

    // ── 1. Focus Submit & Complete button when all checkpoints complete and enabled ──
    useEffect(() => {
        const canSubmit = !submitDisabled && !isSubmitting && totalCount > 0 && answeredCount === totalCount;
        if (canSubmit && !prevCanSubmitRef.current) {
            const timer = setTimeout(() => {
                if (submitBtnRef.current && !submitBtnRef.current.disabled) {
                    submitBtnRef.current.focus();
                }
            }, 60);
            return () => clearTimeout(timer);
        }
        prevCanSubmitRef.current = canSubmit;
    }, [submitDisabled, isSubmitting, answeredCount, totalCount]);

    // ── 2. Global Enter key listener to submit when complete & enabled ──
    useEffect(() => {
        const handleGlobalEnter = (e) => {
            if (e.key === 'Enter' && !submitDisabled && !isSubmitting && totalCount > 0 && answeredCount === totalCount) {
                const target = e.target;
                const isTextInput = target && (
                    (target.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(target.type)) ||
                    target.tagName === 'TEXTAREA' ||
                    target.isContentEditable
                );
                if (isTextInput) return;
                if (target === submitBtnRef.current) return; // Native click handles it
                if (target === resetBtnRef.current) return; // Enter on reset button triggers reset

                e.preventDefault();
                if (onSubmit) {
                    onSubmit();
                } else if (submitBtnRef.current) {
                    submitBtnRef.current.click();
                }
            }
        };

        window.addEventListener('keydown', handleGlobalEnter);
        return () => window.removeEventListener('keydown', handleGlobalEnter);
    }, [submitDisabled, isSubmitting, answeredCount, totalCount, onSubmit]);

    // ── 3. Tab navigation on Submit button: Tab -> navigate highlight to Reset button ──
    const handleSubmitKeyDown = (e) => {
        if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            resetBtnRef.current?.focus();
        }
    };

    // ── 4. Tab navigation on Reset button: Tab -> navigate highlight back to Submit button ──
    const handleResetKeyDown = (e) => {
        if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            submitBtnRef.current?.focus();
        } else if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault();
            submitBtnRef.current?.focus();
        }
    };

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
                        ref={resetBtnRef}
                        type="button"
                        className="btn btn-secondary terminal-reset-btn"
                        onClick={onReset}
                        onKeyDown={handleResetKeyDown}
                        disabled={isSubmitting}
                        title="Reset terminal inputs"
                    >
                        <RefreshCw size={16} />
                        <span>Reset</span>
                    </button>

                    <button
                        ref={submitBtnRef}
                        type={onSubmit ? 'button' : 'submit'}
                        className="btn btn-primary terminal-submit-btn"
                        onClick={onSubmit}
                        onKeyDown={handleSubmitKeyDown}
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
