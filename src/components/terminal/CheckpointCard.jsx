import React, { useRef, useEffect } from 'react';
import { CheckCircle2, XCircle, PauseCircle, Camera, Loader2, X, Plus } from 'lucide-react';
import './TerminalUI.css';

/**
 * CheckpointCard: Reusable inspection card supporting:
 *  - 2-state (Pass / Fail) with optional Camera capture & preview thumbnails
 *  - 3-state (Pass / Fail / Hold)
 *  - Numeric measurement data entry with unit badge
 *  - Full-width diagnostic note entry
 *  - Universal keyboard / focus navigation active highlight
 */
export const CheckpointCard = ({
    index,
    label,
    type = 'PFH', // 'PFH' | 'PF' | 'DATA' | 'TEXT'
    value,
    required = false,
    unit = '',
    placeholder = '',
    onSelectStatus,
    onValueChange,
    // Keyboard / Focus props
    isActive = false,
    onClick = null,
    // Camera proof props (for 2-state checklist)
    onCaptureClick,
    images = [],
    isUploading = false,
    onDeleteImage,
    fullWidth = false,
    className = '',
    style = {}
}) => {
    const formattedNum = String(index).padStart(2, '0');
    const inputRef = useRef(null);

    // Auto-focus input when this checkpoint card becomes active
    useEffect(() => {
        if (isActive) {
            if (type === 'DATA' || type === 'TEXT') {
                const timer = setTimeout(() => {
                    inputRef.current?.focus();
                    inputRef.current?.select?.();
                }, 30);
                return () => clearTimeout(timer);
            } else {
                // For PF / PFH buttons, if focus is inside an input, blur it so P/F/H work immediately
                if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                    document.activeElement.blur();
                }
            }
        }
    }, [isActive, type]);

    // ── 1. Full-Width Diagnostic / Remark Note ──
    if (type === 'TEXT' || fullWidth) {
        return (
            <div 
                className={`checkpoint-card card-full-width ${isActive ? 'active-checkpoint' : ''} ${className}`} 
                style={style}
                onClick={onClick}
            >
                <div className="checkpoint-card-header">
                    <div className="checkpoint-card-title-group">
                        <span className="checkpoint-card-num">#{formattedNum}</span>
                        <div className="checkpoint-card-title">
                            {label} {required && <span className="checkpoint-required-star">*</span>}
                        </div>
                    </div>
                    {isActive && (
                        <span className="checkpoint-active-pill">
                            <span className="terminal-dot" style={{ width: 6, height: 6 }} /> Active
                        </span>
                    )}
                </div>
                <textarea
                    ref={inputRef}
                    required={required}
                    rows={2}
                    className="checkpoint-textarea"
                    placeholder={placeholder || `Enter technical observation for ${label}...`}
                    value={value || ''}
                    onChange={e => onValueChange?.(e.target.value)}
                />
            </div>
        );
    }

    // ── 2. Numeric / Measurement Data Entry ──
    if (type === 'DATA') {
        return (
            <div 
                className={`checkpoint-card ${isActive ? 'active-checkpoint' : ''} ${className}`} 
                style={style}
                onClick={onClick}
            >
                <div className="checkpoint-card-header">
                    <div className="checkpoint-card-title-group">
                        <span className="checkpoint-card-num">#{formattedNum}</span>
                        <div className="checkpoint-card-title">
                            {label} {required && <span className="checkpoint-required-star">*</span>}
                        </div>
                    </div>
                    {isActive && (
                        <span className="checkpoint-active-pill">
                            <span className="terminal-dot" style={{ width: 6, height: 6 }} /> Active
                        </span>
                    )}
                </div>
                <div className="checkpoint-measurement-wrapper">
                    <input
                        ref={inputRef}
                        type="text"
                        required={required}
                        data-checkpoint-input="true"
                        className="checkpoint-measurement-input"
                        placeholder={placeholder || `Measure ${label}`}
                        value={value || ''}
                        onChange={e => onValueChange?.(e.target.value)}
                    />
                    {unit && <span className="checkpoint-measurement-unit">{unit}</span>}
                </div>
            </div>
        );
    }

    // ── 3. 2-State (Pass / Fail) with optional Camera Proof ──
    if (type === 'PF') {
        const isPass = value === true || value === 'Pass';
        const isFail = value === false || value === 'Fail';

        return (
            <div 
                className={`checkpoint-card ${isActive ? 'active-checkpoint' : ''} ${className}`} 
                style={style}
                onClick={onClick}
            >
                <div className="checkpoint-card-header">
                    <div className="checkpoint-card-title-group">
                        <span className="checkpoint-card-num">#{formattedNum}</span>
                        <div className="checkpoint-card-title">
                            {label} {required && <span className="checkpoint-required-star">*</span>}
                        </div>
                    </div>
                    {isActive && (
                        <span className="checkpoint-active-pill">
                            <span className="terminal-dot" style={{ width: 6, height: 6 }} /> Active
                        </span>
                    )}
                </div>

                <div className={`checkpoint-control-group ${onCaptureClick ? 'cols-capture' : 'cols-2'}`}>
                    <button
                        type="button"
                        className={`checkpoint-btn ${isPass ? 'selected-pass' : ''}`}
                        onClick={() => onSelectStatus?.(true)}
                        title="Mark checkpoint as Pass (Shortcut: P)"
                    >
                        <CheckCircle2 size={15} />
                        <span>Pass</span>
                    </button>

                    <button
                        type="button"
                        className={`checkpoint-btn ${isFail ? 'selected-fail' : ''}`}
                        onClick={() => onSelectStatus?.(false)}
                        title="Mark checkpoint as Fail (Shortcut: F)"
                    >
                        <XCircle size={15} />
                        <span>Fail</span>
                    </button>

                    {onCaptureClick && (
                        <button
                            type="button"
                            className="checkpoint-btn"
                            onClick={onCaptureClick}
                            title="Capture verification photo"
                        >
                            <Camera size={15} />
                            <span>Capture</span>
                        </button>
                    )}
                </div>

                {/* Optional Attached Image Previews */}
                {(images.length > 0 || isUploading) && (
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.4rem',
                        marginTop: '0.35rem',
                        padding: '0.4rem',
                        background: 'var(--bg-card)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-light)'
                    }}>
                        {images.map((img, i) => {
                            const imgUrl = typeof img === 'string' ? img : img.url;
                            const isPending = typeof img === 'object' && img.pending;
                            return (
                                <div
                                    key={i}
                                    style={{
                                        position: 'relative',
                                        width: 48,
                                        height: 48,
                                        borderRadius: '4px',
                                        overflow: 'hidden',
                                        border: '1.5px solid var(--border-light)',
                                        cursor: isPending ? 'not-allowed' : 'pointer'
                                    }}
                                    onClick={() => !isPending && window.open(imgUrl, '_blank')}
                                >
                                    <img
                                        src={imgUrl}
                                        alt="proof"
                                        loading="lazy"
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover',
                                            opacity: isPending ? 0.4 : 1
                                        }}
                                    />
                                    {isPending && (
                                        <div className="flex-center" style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.4)' }}>
                                            <Loader2 size={14} className="animate-spin text-primary" />
                                        </div>
                                    )}
                                    {!isPending && onDeleteImage && (
                                        <button
                                            type="button"
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                right: 0,
                                                background: 'rgba(220,38,38,0.9)',
                                                color: '#fff',
                                                border: 'none',
                                                width: 16,
                                                height: 16,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                borderRadius: '0 0 0 3px'
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteImage(i);
                                            }}
                                        >
                                            <X size={10} strokeWidth={3} />
                                        </button>
                                    )}
                                </div>
                            );
                        })}

                        {isUploading && (
                            <div style={{ width: 48, height: 48, border: '1.5px dashed var(--primary-alpha)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Loader2 size={16} className="animate-spin text-primary" opacity={0.6} />
                            </div>
                        )}

                        {images.length < 5 && onCaptureClick && (
                            <button
                                type="button"
                                onClick={onCaptureClick}
                                style={{
                                    width: 48,
                                    height: 48,
                                    border: '1.5px dashed var(--border)',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'transparent',
                                    color: 'var(--primary)',
                                    cursor: 'pointer'
                                }}
                                title="Add another photo"
                            >
                                <Plus size={16} />
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // ── 4. 3-State (Pass / Fail / Hold) Default Checkpoint ──
    const isPass = value === 'Pass';
    const isFail = value === 'Fail';
    const isHold = value === 'Hold';

    return (
        <div 
            className={`checkpoint-card ${isActive ? 'active-checkpoint' : ''} ${className}`} 
            style={style}
            onClick={onClick}
        >
            <div className="checkpoint-card-header">
                <div className="checkpoint-card-title-group">
                    <span className="checkpoint-card-num">#{formattedNum}</span>
                    <div className="checkpoint-card-title">
                        {label} {required && <span className="checkpoint-required-star">*</span>}
                    </div>
                </div>
                {isActive && (
                    <span className="checkpoint-active-pill">
                        <span className="terminal-dot" style={{ width: 6, height: 6 }} /> Active
                    </span>
                )}
            </div>

            <div className="checkpoint-control-group cols-3">
                <button
                    type="button"
                    className={`checkpoint-btn ${isPass ? 'selected-pass' : ''}`}
                    onClick={() => onSelectStatus?.('Pass')}
                    title="Mark checkpoint as Pass (Shortcut: P)"
                >
                    <CheckCircle2 size={15} />
                    <span>Pass</span>
                </button>

                <button
                    type="button"
                    className={`checkpoint-btn ${isFail ? 'selected-fail' : ''}`}
                    onClick={() => onSelectStatus?.('Fail')}
                    title="Mark checkpoint as Fail (Shortcut: F)"
                >
                    <XCircle size={15} />
                    <span>Fail</span>
                </button>

                <button
                    type="button"
                    className={`checkpoint-btn ${isHold ? 'selected-hold' : ''}`}
                    onClick={() => onSelectStatus?.('Hold')}
                    title="Mark checkpoint as Hold (Shortcut: H)"
                >
                    <PauseCircle size={15} />
                    <span>Hold</span>
                </button>
            </div>
        </div>
    );
};

export default CheckpointCard;
