import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, HelpCircle, Info, X } from 'lucide-react';
import { registerDialogHandler, registerToastHandler } from '../../utils/dialogService';

export const GlobalDialogContainer = () => {
    const [currentDialog, setCurrentDialog] = useState(null);
    const [promptValue, setPromptValue] = useState('');
    const [toasts, setToasts] = useState([]);
    const confirmBtnRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        // Register dialog handler
        registerDialogHandler((dialogConfig) => {
            return new Promise((resolve) => {
                setPromptValue(dialogConfig.defaultValue || '');
                setCurrentDialog({
                    ...dialogConfig,
                    resolve: (val) => {
                        setCurrentDialog(null);
                        resolve(val);
                    }
                });
            });
        });

        // Register toast handler
        registerToastHandler(({ message, type, durationMs }) => {
            const id = Date.now() + Math.random().toString(36).substring(2, 9);
            const newToast = { id, message, type: type || 'info' };
            setToasts((prev) => [...prev, newToast]);

            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, durationMs || 3500);
        });

        // Intercept native window dialogs safely if needed
        if (typeof window !== 'undefined') {
            window.cqaAlertMounted = true;
        }
    }, []);

    // Autofocus appropriate element when dialog opens
    useEffect(() => {
        if (!currentDialog) return;

        const timer = setTimeout(() => {
            if (currentDialog.type === 'prompt' && inputRef.current) {
                inputRef.current.focus();
                inputRef.current.select();
            } else if (confirmBtnRef.current) {
                confirmBtnRef.current.focus();
            }
        }, 50);

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            } else if (e.key === 'Enter' && currentDialog.type !== 'prompt') {
                e.preventDefault();
                handleConfirm();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [currentDialog, promptValue]);

    const handleConfirm = () => {
        if (!currentDialog) return;
        if (currentDialog.type === 'prompt') {
            currentDialog.resolve(promptValue);
        } else {
            currentDialog.resolve(true);
        }
    };

    const handleCancel = () => {
        if (!currentDialog) return;
        if (currentDialog.type === 'prompt') {
            currentDialog.resolve(null);
        } else if (currentDialog.type === 'confirm') {
            currentDialog.resolve(false);
        } else {
            currentDialog.resolve(true);
        }
    };

    const removeToast = (id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <>
            {/* Modal Dialog */}
            {currentDialog && (
                <div
                    className="dialog-backdrop"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.6)',
                        backdropFilter: 'blur(3px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 99999,
                        padding: '1rem',
                        animation: 'fadeIn 0.15s ease-out'
                    }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget && currentDialog.type !== 'prompt') {
                            handleCancel();
                        }
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="dialog-title"
                        aria-describedby="dialog-desc"
                        className="card"
                        style={{
                            maxWidth: '460px',
                            width: '100%',
                            background: 'var(--bg-card)',
                            borderRadius: 'var(--radius-lg)',
                            boxShadow: 'var(--shadow-xl)',
                            border: '1px solid var(--border)',
                            overflow: 'hidden',
                            animation: 'scaleUp 0.15s ease-out'
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderBottom: '1px solid var(--border-light)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            background: currentDialog.danger ? 'var(--error-bg)' : 'var(--bg-card)'
                        }}>
                            {currentDialog.danger ? (
                                <AlertCircle size={22} color="var(--error)" style={{ flexShrink: 0 }} />
                            ) : currentDialog.type === 'confirm' ? (
                                <HelpCircle size={22} color="var(--warning)" style={{ flexShrink: 0 }} />
                            ) : (
                                <Info size={22} color="var(--primary)" style={{ flexShrink: 0 }} />
                            )}
                            <h3
                                id="dialog-title"
                                style={{
                                    margin: 0,
                                    fontSize: '1.05rem',
                                    fontWeight: 700,
                                    color: currentDialog.danger ? 'var(--error)' : 'var(--text-main)',
                                    flex: 1
                                }}
                            >
                                {currentDialog.title || 'Notification'}
                            </h3>
                            <button
                                type="button"
                                onClick={handleCancel}
                                aria-label="Close dialog"
                                className="btn-ghost"
                                style={{ padding: '0.25rem', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '1.25rem 1.5rem' }}>
                            <p
                                id="dialog-desc"
                                style={{
                                    margin: 0,
                                    fontSize: '0.9375rem',
                                    lineHeight: 1.55,
                                    color: 'var(--text-secondary)',
                                    whiteSpace: 'pre-line'
                                }}
                            >
                                {currentDialog.message}
                            </p>

                            {currentDialog.type === 'prompt' && (
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        handleConfirm();
                                    }}
                                    style={{ marginTop: '1rem' }}
                                >
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={promptValue}
                                        onChange={(e) => setPromptValue(e.target.value)}
                                        placeholder={currentDialog.placeholder || 'Type here...'}
                                        style={{
                                            width: '100%',
                                            padding: '0.65rem 0.85rem',
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--border)',
                                            fontSize: '0.9375rem',
                                            backgroundColor: 'var(--bg-input)',
                                            color: 'var(--text-main)'
                                        }}
                                    />
                                </form>
                            )}
                        </div>

                        {/* Footer Actions */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            borderTop: '1px solid var(--border-light)',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '0.75rem',
                            background: 'var(--bg-main)'
                        }}>
                            {(currentDialog.type === 'confirm' || currentDialog.type === 'prompt') && (
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    className="btn btn-secondary"
                                    style={{
                                        minHeight: '40px',
                                        padding: '0.5rem 1.25rem',
                                        fontWeight: 600,
                                        fontSize: '0.875rem'
                                    }}
                                >
                                    {currentDialog.cancelText || 'Cancel'}
                                </button>
                            )}
                            <button
                                ref={confirmBtnRef}
                                type="button"
                                onClick={handleConfirm}
                                className={currentDialog.danger ? 'btn btn-danger' : 'btn btn-primary'}
                                style={{
                                    minHeight: '40px',
                                    padding: '0.5rem 1.5rem',
                                    fontWeight: 600,
                                    fontSize: '0.875rem'
                                }}
                            >
                                {currentDialog.confirmText || 'OK'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notifications */}
            {toasts.length > 0 && (
                <div
                    aria-live="polite"
                    aria-atomic="true"
                    style={{
                        position: 'fixed',
                        top: '1.25rem',
                        right: '1.25rem',
                        zIndex: 999999,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        maxWidth: '380px',
                        width: 'calc(100% - 2.5rem)',
                        pointerEvents: 'none'
                    }}
                >
                    {toasts.map((toast) => (
                        <div
                            key={toast.id}
                            style={{
                                pointerEvents: 'auto',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.75rem 1rem',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-card)',
                                color: 'var(--text-main)',
                                boxShadow: 'var(--shadow-lg)',
                                border: `1px solid ${
                                    toast.type === 'error'
                                        ? 'var(--error)'
                                        : toast.type === 'success'
                                        ? 'var(--success)'
                                        : toast.type === 'warning'
                                        ? 'var(--warning)'
                                        : 'var(--primary)'
                                }`,
                                animation: 'slideInRight 0.2s ease-out'
                            }}
                        >
                            {toast.type === 'error' && <AlertCircle size={18} color="var(--error)" style={{ flexShrink: 0 }} />}
                            {toast.type === 'success' && <CheckCircle2 size={18} color="var(--success)" style={{ flexShrink: 0 }} />}
                            {toast.type === 'warning' && <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0 }} />}
                            {toast.type === 'info' && <Info size={18} color="var(--primary)" style={{ flexShrink: 0 }} />}

                            <span style={{ fontSize: '0.875rem', fontWeight: 600, flex: 1, wordBreak: 'break-word' }}>
                                {toast.message}
                            </span>

                            <button
                                type="button"
                                onClick={() => removeToast(toast.id)}
                                aria-label="Dismiss toast"
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    padding: '2px',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)'
                                }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
};

export default GlobalDialogContainer;

