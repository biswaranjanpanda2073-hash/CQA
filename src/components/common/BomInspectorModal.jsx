import React, { useState, useMemo, useEffect } from 'react';
import {
    Boxes,
    Search,
    Copy,
    Check,
    Layers,
    Cpu,
    FileText,
    Package,
    AlertTriangle,
    CheckCircle2,
    Send,
    X,
    Filter
} from 'lucide-react';
import { useCQA } from '../../hooks/useCQA';
import { SEED_CALCULATOR_V5_BOM, BOM_CATEGORIES } from '../../utils/bomEngine';

export const BomInspectorModal = ({
    isOpen,
    onClose,
    stationId = null,
    stationName = '',
    user = null,
    project = 'Calculator'
}) => {
    const { store, requestBaanPart, getActiveBom } = useCQA();

    if (!isOpen) return null;

    // Load active BOM for Calculator V5
    const activeBom = useMemo(() => {
        return getActiveBom?.('CALC_V5') || {
            header: { variantName: 'Calculator V5 (Standard)', activeRevision: 'REV-01' },
            items: SEED_CALCULATOR_V5_BOM
        };
    }, [getActiveBom]);

    const items = activeBom.items || SEED_CALCULATOR_V5_BOM;
    const baanParts = store.baan?.parts || {};
    const baanBatches = store.baan?.batches || {};

    // Stock lookup
    const stockMap = useMemo(() => {
        const counts = {};
        Object.values(baanBatches).forEach(batch => {
            const pn = String(batch.partNumber || '').toUpperCase().trim();
            if (!pn) return;
            counts[pn] = (counts[pn] || 0) + (Math.max(0, Number(batch.quantityAvailable)) || 0);
        });
        return counts;
    }, [baanBatches]);

    // Determine default station filter
    const initialFilter = useMemo(() => {
        const nameUpper = (stationName || '').toUpperCase();
        if (nameUpper.includes('ASSEMBL') || stationId === 6) return 'STATION_AFFINITY';
        if (nameUpper.includes('DEBUG') || nameUpper.includes('REWORK') || stationId === 4 || stationId === 5) return 'STATION_AFFINITY';
        if (nameUpper.includes('PACK') || stationId === 8) return 'STATION_AFFINITY';
        return 'ALL';
    }, [stationId, stationName]);

    const [activeTab, setActiveTab] = useState(initialFilter);
    const [searchTerm, setSearchTerm] = useState('');
    const [copiedPn, setCopiedPn] = useState(null);

    // Requisition sub-form state
    const [requestingItem, setRequestingItem] = useState(null);
    const [reqQty, setReqQty] = useState(1);
    const [isSubmittingReq, setIsSubmittingReq] = useState(false);
    const [reqSuccessMsg, setReqSuccessMsg] = useState('');

    const handleCopyPn = (pn) => {
        navigator.clipboard?.writeText(pn);
        setCopiedPn(pn);
        setTimeout(() => setCopiedPn(null), 1800);
    };

    // Filter items
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            const term = searchTerm.toLowerCase().trim();
            const matchesSearch = !term ||
                item.partNumber?.toLowerCase().includes(term) ||
                item.partName?.toLowerCase().includes(term) ||
                item.partDescription?.toLowerCase().includes(term);

            let matchesTab = true;
            if (activeTab === 'STATION_AFFINITY') {
                const sName = (stationName || '').toUpperCase();
                if (sName.includes('PACK') || stationId === 8) {
                    matchesTab = item.category === 'Packaging' || item.category === 'Labels & Stickers';
                } else if (sName.includes('DEBUG') || sName.includes('REWORK') || stationId === 4 || stationId === 5) {
                    matchesTab = item.category === 'Electronic Components' || item.isCritical;
                } else if (sName.includes('ASSEMBL') || stationId === 6) {
                    matchesTab = item.category === 'Mechanical' || item.category === 'Labels & Stickers';
                }
            } else if (activeTab !== 'ALL') {
                matchesTab = item.category === activeTab;
            }

            return matchesSearch && matchesTab;
        });
    }, [items, searchTerm, activeTab, stationId, stationName]);

    // Handle submit part requisition from station
    const handleSendRequest = async () => {
        if (!requestingItem || reqQty <= 0) return;
        setIsSubmittingReq(true);
        setReqSuccessMsg('');

        try {
            const res = await requestBaanPart({
                partNo: requestingItem.partNumber,
                partName: requestingItem.partName,
                requestedQty: reqQty,
                stationId,
                stationName,
                issueCategory: 'Station Assembly / Rework Requisition'
            }, user);

            if (res.success) {
                setReqSuccessMsg(`Requisition ${res.requestId} created! Warehouse notified to issue ${reqQty}x ${requestingItem.partNumber}.`);
                setTimeout(() => {
                    setRequestingItem(null);
                    setReqSuccessMsg('');
                }, 2800);
            }
        } catch (err) {
            console.error('Error submitting part request:', err);
        } finally {
            setIsSubmittingReq(false);
        }
    };

    return (
        <div
            className="modal-overlay"
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.75)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2000,
                padding: '1rem'
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="card animate-scale-up"
                style={{
                    width: '100%',
                    maxWidth: 880,
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: 0,
                    overflow: 'hidden',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                    border: '1px solid var(--border)'
                }}
            >
                {/* Header Strip */}
                <div
                    style={{
                        padding: '1.25rem 1.5rem',
                        background: 'var(--bg-secondary)',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                            className="flex-center"
                            style={{
                                width: 38,
                                height: 38,
                                borderRadius: 8,
                                background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.2), rgba(6, 182, 212, 0.2))',
                                color: 'var(--primary)'
                            }}
                        >
                            <Boxes size={22} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                                    Bill of Materials (BOM) Reference
                                </h3>
                                <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                                    {activeBom.header.activeRevision || 'REV-01'} Active
                                </span>
                            </div>
                            <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                {activeBom.header.variantName || 'Calculator V5'} • Context: <strong>{stationName || `Station ${stationId}`}</strong>
                            </p>
                        </div>
                    </div>

                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={onClose}
                        style={{ padding: '0.35rem 0.65rem' }}
                        title="Close Inspector (Esc)"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Search & Tabs */}
                <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-primary-alt)' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ flex: '1 1 240px', position: 'relative' }}>
                            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                className="input-field"
                                placeholder="Search by part number, name, or description..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ paddingLeft: '2.2rem', width: '100%', fontSize: '0.85rem', padding: '0.4rem 0.5rem 0.4rem 2.2rem' }}
                            />
                        </div>

                        {/* Filter Tabs */}
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <button
                                className={`btn btn-sm ${activeTab === 'STATION_AFFINITY' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setActiveTab('STATION_AFFINITY')}
                                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                            >
                                Station Relevant
                            </button>
                            <button
                                className={`btn btn-sm ${activeTab === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setActiveTab('ALL')}
                                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                            >
                                All ({items.length})
                            </button>
                            {BOM_CATEGORIES.map(cat => (
                                <button
                                    key={cat}
                                    className={`btn btn-sm ${activeTab === cat ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setActiveTab(cat)}
                                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                                >
                                    {cat.replace('Electronic Components', 'Electronics')}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Table Content */}
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 280, maxHeight: 420 }}>
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10 }}>
                                <th style={{ padding: '0.6rem 0.85rem', textAlign: 'left', width: 45 }}>#</th>
                                <th style={{ padding: '0.6rem 0.85rem', textAlign: 'left', minWidth: 150 }}>Part Number</th>
                                <th style={{ padding: '0.6rem 0.85rem', textAlign: 'left', minWidth: 180 }}>Component Name</th>
                                <th style={{ padding: '0.6rem 0.85rem', textAlign: 'left', width: 130 }}>Category</th>
                                <th style={{ padding: '0.6rem 0.85rem', textAlign: 'center', width: 60 }}>Qty</th>
                                <th style={{ padding: '0.6rem 0.85rem', textAlign: 'center', width: 110 }}>Stores Stock</th>
                                <th style={{ padding: '0.6rem 0.85rem', textAlign: 'right', width: 110 }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                                        No components match the filter for this station.
                                    </td>
                                </tr>
                            ) : (
                                filteredItems.map((it, idx) => {
                                    const pn = it.partNumber?.toUpperCase();
                                    const isBaanLinked = Boolean(baanParts[pn]);
                                    const inStock = stockMap[pn] || 0;

                                    let catBadgeColor = '#06b6d4';
                                    if (it.category === 'Electronic Components') catBadgeColor = '#a855f7';
                                    if (it.category === 'Labels & Stickers') catBadgeColor = '#f59e0b';
                                    if (it.category === 'Packaging') catBadgeColor = '#10b981';

                                    return (
                                        <tr
                                            key={`${it.itemNo}_${it.partNumber}`}
                                            style={{
                                                borderBottom: '1px solid var(--border)',
                                                background: idx % 2 === 0 ? 'transparent' : 'var(--bg-primary-alt)'
                                            }}
                                        >
                                            <td style={{ padding: '0.55rem 0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                {it.itemNo}
                                            </td>

                                            <td style={{ padding: '0.55rem 0.85rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text)' }}>
                                                        {it.partNumber}
                                                    </span>
                                                    <button
                                                        onClick={() => handleCopyPn(it.partNumber)}
                                                        className="btn-icon-subtle"
                                                        title="Copy Part Number"
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}
                                                    >
                                                        {copiedPn === it.partNumber ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                                                    </button>
                                                </div>
                                            </td>

                                            <td style={{ padding: '0.55rem 0.85rem' }}>
                                                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{it.partName}</div>
                                                {it.partDescription && (
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
                                                        {it.partDescription}
                                                    </div>
                                                )}
                                            </td>

                                            <td style={{ padding: '0.55rem 0.85rem' }}>
                                                <span
                                                    className="badge"
                                                    style={{
                                                        background: `${catBadgeColor}18`,
                                                        color: catBadgeColor,
                                                        border: `1px solid ${catBadgeColor}40`,
                                                        fontSize: '0.7rem'
                                                    }}
                                                >
                                                    {it.category}
                                                </span>
                                            </td>

                                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'center', fontWeight: 700 }}>
                                                {it.quantityRequired}
                                            </td>

                                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'center' }}>
                                                {isBaanLinked ? (
                                                    <span style={{ fontWeight: 700, color: inStock > 0 ? '#10b981' : 'var(--error)', fontSize: '0.8rem' }}>
                                                        {inStock} in stock
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                        Uncataloged
                                                    </span>
                                                )}
                                            </td>

                                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'right' }}>
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => {
                                                        setRequestingItem(it);
                                                        setReqQty(it.quantityRequired || 1);
                                                        setReqSuccessMsg('');
                                                    }}
                                                    style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem' }}
                                                >
                                                    Request
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Sub-form: Request Part Drawer */}
                {requestingItem && (
                    <div style={{ padding: '1rem 1.5rem', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Send size={14} color="var(--primary)" />
                                Requesting <strong>{requestingItem.partName}</strong> ({requestingItem.partNumber})
                            </div>
                            <button
                                onClick={() => setRequestingItem(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem' }}
                            >
                                Cancel
                            </button>
                        </div>

                        {reqSuccessMsg ? (
                            <div className="badge badge-success" style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                                <CheckCircle2 size={14} /> {reqSuccessMsg}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Quantity to Request:</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="500"
                                        className="input-field"
                                        value={reqQty}
                                        onChange={(e) => setReqQty(Math.max(1, parseInt(e.target.value) || 1))}
                                        style={{ width: 80, padding: '0.3rem 0.5rem', textAlign: 'center', fontWeight: 700 }}
                                    />
                                </div>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    Will create a pending dispatch request for stores.
                                </span>
                                <div style={{ marginLeft: 'auto' }}>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={handleSendRequest}
                                        disabled={isSubmittingReq}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                    >
                                        <Send size={13} /> {isSubmittingReq ? 'Sending...' : 'Dispatch Requisition'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                <div
                    style={{
                        padding: '0.75rem 1.5rem',
                        borderTop: '1px solid var(--border)',
                        background: 'var(--bg-primary)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)'
                    }}
                >
                    <span>Showing <strong>{filteredItems.length}</strong> of <strong>{items.length}</strong> parts</span>
                    <span>BOM Immutability: <strong>Active Production Frozen Baseline</strong></span>
                </div>
            </div>
        </div>
    );
};

export default BomInspectorModal;
