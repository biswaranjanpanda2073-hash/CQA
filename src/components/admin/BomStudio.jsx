import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    FileSpreadsheet,
    Package,
    Layers,
    Cpu,
    Upload,
    Download,
    Search,
    Filter,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Clock,
    Lock,
    Unlock,
    Plus,
    RefreshCw,
    ExternalLink,
    ChevronDown,
    FileText,
    TrendingUp,
    ShieldAlert,
    Copy,
    Check,
    History,
    Sparkles,
    ArrowRight,
    Boxes
} from 'lucide-react';
import { useCQA } from '../../hooks/useCQA';
import { hasPermission, PERMISSIONS } from '../../utils/rbacEngine';
import {
    DEFAULT_BOM_VARIANTS,
    SEED_CALCULATOR_V5_BOM,
    BOM_CATEGORIES,
    parseBomSpreadsheet,
    calculateBomMrp,
    downloadBomTemplate,
    exportBomToSpreadsheet,
    exportMrpReport
} from '../../utils/bomEngine';

export const BomStudio = ({ user }) => {
    const {
        store,
        syncBomData,
        syncBaanData,
        saveBomRevision,
        activateBomRevision,
        createBatchBaanRequisition,
        getActiveBom
    } = useCQA();

    const isSuperAdmin = user?.role === 'Super Admin';
    const canUpload = isSuperAdmin || hasPermission(user, PERMISSIONS.BOM_UPLOAD);
    const canActivate = isSuperAdmin || hasPermission(user, PERMISSIONS.BOM_ACTIVATE);
    const canExport = isSuperAdmin || hasPermission(user, PERMISSIONS.BOM_EXPORT);
    const canMrp = isSuperAdmin || hasPermission(user, PERMISSIONS.BOM_MRP);

    // Sync BOM and BAAN data on mount
    useEffect(() => {
        const cleanupBom = syncBomData?.();
        const cleanupBaan = syncBaanData?.();
        return () => {
            cleanupBom?.();
            cleanupBaan?.();
        };
    }, [syncBomData, syncBaanData]);

    // Available Variants
    const customHeaders = store.bom?.headers || {};
    const variants = useMemo(() => {
        const list = [...DEFAULT_BOM_VARIANTS];
        Object.values(customHeaders).forEach(h => {
            if (!list.some(v => v.id === h.variantId)) {
                list.push({
                    id: h.variantId,
                    name: h.variantName || h.variantId,
                    category: h.category || 'CALCULATOR',
                    defaultActiveRevision: h.activeRevision || 'REV-01',
                    description: h.description || 'Custom product variant'
                });
            }
        });
        return list;
    }, [customHeaders]);

    // Active Variant Selection
    const [selectedVariantId, setSelectedVariantId] = useState('CALC_V5');

    // Active Header & Revision Info
    const activeHeader = customHeaders[selectedVariantId] || {
        variantId: selectedVariantId,
        variantName: variants.find(v => v.id === selectedVariantId)?.name || selectedVariantId,
        activeRevision: 'REV-01'
    };

    // All available revisions for this variant
    const allRevisions = store.bom?.revisions || {};
    const variantRevisions = useMemo(() => {
        const list = Object.values(allRevisions).filter(r => r.variantId === selectedVariantId);
        // If empty and CALC_V5, provide REV-01 seed representation
        if (list.length === 0 && selectedVariantId === 'CALC_V5') {
            return [{
                id: 'CALC_V5_REV-01',
                variantId: 'CALC_V5',
                variantName: 'Calculator V5 (Standard)',
                revision: 'REV-01',
                itemCount: 48,
                changeNotes: 'Initial production baseline BOM (48 items from Tohands R-BOM V5)',
                isLocked: true,
                uploadedBy: 'Tohands Engineering',
                uploadedAt: new Date().toISOString()
            }];
        }
        return list.sort((a, b) => (b.revision || '').localeCompare(a.revision || ''));
    }, [allRevisions, selectedVariantId]);

    // Current viewed revision (defaults to active revision)
    const [viewedRevision, setViewedRevision] = useState(activeHeader.activeRevision || 'REV-01');

    useEffect(() => {
        if (activeHeader.activeRevision) {
            setViewedRevision(activeHeader.activeRevision);
        }
    }, [selectedVariantId, activeHeader.activeRevision]);

    // Get items for viewed revision
    const currentRevisionDoc = allRevisions[`${selectedVariantId}_${viewedRevision}`];
    const currentItems = useMemo(() => {
        if (currentRevisionDoc?.items && Array.isArray(currentRevisionDoc.items)) {
            return currentRevisionDoc.items;
        }
        if (selectedVariantId === 'CALC_V5') {
            return SEED_CALCULATOR_V5_BOM;
        }
        return [];
    }, [currentRevisionDoc, selectedVariantId]);

    const isCurrentActive = viewedRevision === (activeHeader.activeRevision || 'REV-01');

    // BAAN parts & stock lookup
    const baanParts = store.baan?.parts || {};
    const baanBatches = store.baan?.batches || {};
    const baanStockMap = useMemo(() => {
        const counts = {};
        Object.values(baanBatches).forEach(batch => {
            const pn = String(batch.partNumber || '').toUpperCase().trim();
            if (!pn) return;
            counts[pn] = (counts[pn] || 0) + (Math.max(0, Number(batch.quantityAvailable)) || 0);
        });
        return counts;
    }, [baanBatches]);

    // ─── Filter & Search States ───
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [baanFilter, setBaanFilter] = useState('ALL'); // 'ALL' | 'LINKED' | 'UNLINKED'
    const [stationFilter, setStationFilter] = useState('ALL');
    const [copiedPn, setCopiedPn] = useState(null);

    // Copy PN helper
    const handleCopyPn = (pn) => {
        navigator.clipboard?.writeText(pn);
        setCopiedPn(pn);
        setTimeout(() => setCopiedPn(null), 1800);
    };

    // Filtered BOM items
    const filteredItems = useMemo(() => {
        return currentItems.filter(item => {
            const term = searchTerm.toLowerCase().trim();
            const matchesSearch = !term ||
                item.partNumber?.toLowerCase().includes(term) ||
                item.partName?.toLowerCase().includes(term) ||
                item.partDescription?.toLowerCase().includes(term) ||
                String(item.itemNo).includes(term);

            const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;

            const isLinked = Boolean(baanParts[item.partNumber?.toUpperCase()]);
            const matchesBaan = baanFilter === 'ALL' ||
                (baanFilter === 'LINKED' && isLinked) ||
                (baanFilter === 'UNLINKED' && !isLinked);

            const matchesStation = stationFilter === 'ALL' ||
                (item.stationTags && item.stationTags.some(t => t.toUpperCase().includes(stationFilter.toUpperCase())));

            return matchesSearch && matchesCategory && matchesBaan && matchesStation;
        });
    }, [currentItems, searchTerm, categoryFilter, baanFilter, stationFilter, baanParts]);

    // KPI Summary Metrics
    const metrics = useMemo(() => {
        const totalLines = currentItems.length;
        const catCounts = {
            Mechanical: 0,
            'Electronic Components': 0,
            'Labels & Stickers': 0,
            Packaging: 0
        };
        let linkedCount = 0;
        let totalQuantitySum = 0;

        currentItems.forEach(it => {
            if (catCounts[it.category] !== undefined) {
                catCounts[it.category]++;
            }
            totalQuantitySum += (Number(it.quantityRequired) || 1);
            if (baanParts[it.partNumber?.toUpperCase()]) {
                linkedCount++;
            }
        });

        const linkedPercent = totalLines > 0 ? Math.round((linkedCount / totalLines) * 100) : 0;

        return {
            totalLines,
            totalQuantitySum,
            catCounts,
            linkedCount,
            linkedPercent,
            unlinkedCount: totalLines - linkedCount
        };
    }, [currentItems, baanParts]);

    // ─── Modal States ───
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showMrpModal, setShowMrpModal] = useState(false);
    const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
    const [showAddVariantModal, setShowAddVariantModal] = useState(false);

    // ─── Upload Modal State ───
    const fileInputRef = useRef(null);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadFileName, setUploadFileName] = useState('');
    const [uploadRevisionId, setUploadRevisionId] = useState('');
    const [uploadChangeNotes, setUploadChangeNotes] = useState('');
    const [uploadSetAsActive, setUploadSetAsActive] = useState(true);
    const [uploadParseResult, setUploadParseResult] = useState(null);
    const [isParsing, setIsParsing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [uploadError, setUploadError] = useState('');

    // Open upload modal with auto-suggested revision name
    const handleOpenUpload = () => {
        const currentRevNum = parseInt((viewedRevision || 'REV-01').replace(/[^0-9]/g, '')) || 1;
        const nextRev = `REV-${String(currentRevNum + 1).padStart(2, '0')}`;
        setUploadRevisionId(nextRev);
        setUploadChangeNotes('');
        setUploadSetAsActive(true);
        setUploadFile(null);
        setUploadFileName('');
        setUploadParseResult(null);
        setUploadError('');
        setShowUploadModal(true);
    };

    // File selection & parsing
    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadFile(file);
        setUploadFileName(file.name);
        setIsParsing(true);
        setUploadError('');

        try {
            const dataBuffer = await file.arrayBuffer();
            const result = await parseBomSpreadsheet(dataBuffer, { filename: file.name });
            setUploadParseResult(result);
            if (!result.success && result.errors?.length > 0) {
                setUploadError(result.errors.slice(0, 3).join(' '));
            }
        } catch (err) {
            setUploadError(`Failed to read file: ${err.message}`);
        } finally {
            setIsParsing(false);
        }
    };

    // Confirm Upload / Save Revision
    const handleConfirmUpload = async () => {
        if (!uploadParseResult || !uploadParseResult.items || uploadParseResult.items.length === 0) {
            setUploadError('Please select a valid spreadsheet containing BOM component items.');
            return;
        }
        if (!uploadRevisionId.trim()) {
            setUploadError('Please specify a revision identifier (e.g. REV-02).');
            return;
        }

        setIsSaving(true);
        setUploadError('');

        const res = await saveBomRevision({
            variantId: selectedVariantId,
            variantName: variants.find(v => v.id === selectedVariantId)?.name || selectedVariantId,
            revision: uploadRevisionId.trim().toUpperCase(),
            changeNotes: uploadChangeNotes.trim() || 'Engineering change revision import',
            items: uploadParseResult.items,
            user,
            setAsActive: uploadSetAsActive
        });

        setIsSaving(false);
        if (res.success) {
            setViewedRevision(uploadRevisionId.trim().toUpperCase());
            setShowUploadModal(false);
        } else {
            setUploadError(`Save failed: ${res.error}`);
        }
    };

    // Activate Revision
    const handleActivateRevision = async (rev) => {
        if (!canActivate) return;
        const res = await activateBomRevision({
            variantId: selectedVariantId,
            revision: rev,
            user
        });
        if (res.success) {
            setViewedRevision(rev);
        }
    };

    // ─── MRP Planning State ───
    const [targetBatchSize, setTargetBatchSize] = useState(100);
    const [isRequestingBaan, setIsRequestingBaan] = useState(false);
    const [mrpRequestFeedback, setMrpRequestFeedback] = useState(null);

    const mrpAnalysis = useMemo(() => {
        return calculateBomMrp(currentItems, targetBatchSize, baanParts, baanBatches);
    }, [currentItems, targetBatchSize, baanParts, baanBatches]);

    const handleBatchRequisition = async () => {
        if (!canMrp || mrpAnalysis.shortageRows.length === 0) return;
        setIsRequestingBaan(true);
        setMrpRequestFeedback(null);

        const res = await createBatchBaanRequisition({
            variantId: selectedVariantId,
            revision: viewedRevision,
            targetBatchSize,
            shortageRows: mrpAnalysis.shortageRows,
            user
        });

        setIsRequestingBaan(false);
        if (res.success) {
            setMrpRequestFeedback({
                type: 'success',
                message: `Successfully created ${res.count} BAAN material requests in 'baan_part_requests'. Warehouse operators can now review and issue items.`
            });
        } else {
            setMrpRequestFeedback({
                type: 'error',
                message: `Failed to create requisitions: ${res.error}`
            });
        }
    };

    // Add Variant State
    const [newVariantId, setNewVariantId] = useState('');
    const [newVariantName, setNewVariantName] = useState('');
    const [newVariantDesc, setNewVariantDesc] = useState('');
    const [isCreatingVariant, setIsCreatingVariant] = useState(false);

    const handleCreateVariant = async () => {
        if (!newVariantId.trim() || !newVariantName.trim()) return;
        const cleanId = newVariantId.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        setIsCreatingVariant(true);

        const res = await saveBomRevision({
            variantId: cleanId,
            variantName: newVariantName.trim(),
            revision: 'REV-01',
            changeNotes: `Initial creation of ${newVariantName.trim()}`,
            items: SEED_CALCULATOR_V5_BOM, // Pre-clone from Calculator V5 as baseline
            user,
            setAsActive: true
        });

        setIsCreatingVariant(false);
        if (res.success) {
            setSelectedVariantId(cleanId);
            setViewedRevision('REV-01');
            setShowAddVariantModal(false);
            setNewVariantId('');
            setNewVariantName('');
            setNewVariantDesc('');
        }
    };

    return (
        <div className="bom-studio animate-fade-in" style={{ padding: '0 0.5rem' }}>
            {/* ═══════════════════════════════════════════════════════════ */}
            {/* HEADER CONTROLS STRIP */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <div className="card" style={{ marginBottom: '1.25rem', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    {/* Left: Variant & Revision Switcher */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.25rem' }}>
                                Product Architecture
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <select
                                    className="input-select"
                                    value={selectedVariantId}
                                    onChange={(e) => setSelectedVariantId(e.target.value)}
                                    style={{
                                        fontWeight: 700,
                                        fontSize: '0.95rem',
                                        padding: '0.45rem 0.85rem',
                                        minWidth: 240,
                                        background: 'var(--bg-secondary)',
                                        borderColor: 'var(--border)'
                                    }}
                                >
                                    {variants.map(v => (
                                        <option key={v.id} value={v.id}>{v.name} ({v.id})</option>
                                    ))}
                                </select>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setShowAddVariantModal(true)}
                                    title="Add New Product Variant"
                                    style={{ padding: '0.45rem 0.65rem' }}
                                >
                                    <Plus size={15} />
                                </button>
                            </div>
                        </div>

                        {/* Revision Switcher */}
                        <div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.25rem' }}>
                                Revision
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <select
                                    className="input-select"
                                    value={viewedRevision}
                                    onChange={(e) => setViewedRevision(e.target.value)}
                                    style={{
                                        fontWeight: 700,
                                        fontSize: '0.95rem',
                                        padding: '0.45rem 0.85rem',
                                        minWidth: 120,
                                        background: 'var(--bg-secondary)',
                                        borderColor: 'var(--border)'
                                    }}
                                >
                                    {variantRevisions.map(r => (
                                        <option key={r.revision} value={r.revision}>
                                            {r.revision} {r.revision === activeHeader.activeRevision ? '★ Active' : ''}
                                        </option>
                                    ))}
                                </select>

                                {/* Active vs Non-Active Status Pill */}
                                {isCurrentActive ? (
                                    <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.6rem' }}>
                                        <CheckCircle2 size={13} /> Active Baseline
                                    </span>
                                ) : (
                                    <button
                                        className="btn btn-warning btn-sm"
                                        onClick={() => handleActivateRevision(viewedRevision)}
                                        disabled={!canActivate}
                                        title="Promote this revision to the active production baseline"
                                        style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                                    >
                                        Set Active
                                    </button>
                                )}

                                <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.6rem' }} title="Revisions are locked and immutable once recorded">
                                    <Lock size={12} /> Frozen
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right Action Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <button
                            id="btn-bom-history"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setShowHistoryDrawer(true)}
                            title="View revision timeline & changes"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                            <History size={14} /> History ({variantRevisions.length})
                        </button>

                        {canMrp && (
                            <button
                                id="btn-mrp-shortage"
                                className="btn btn-primary btn-sm"
                                onClick={() => setShowMrpModal(true)}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'linear-gradient(135deg, #4f46e5, #06b6d4)' }}
                                title="Run Material Requirements Planning (MRP) analysis against BAAN stock"
                            >
                                <Boxes size={14} /> MRP Shortage Plan
                            </button>
                        )}

                        {canUpload && (
                            <button
                                id="btn-upload-revision"
                                className="btn btn-secondary btn-sm"
                                onClick={handleOpenUpload}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                title="Upload new revision from Excel or CSV"
                            >
                                <Upload size={14} /> Upload Revision
                            </button>
                        )}

                        {canExport && (
                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => exportBomToSpreadsheet(currentItems, selectedVariantId, viewedRevision, 'xlsx')}
                                    title="Export BOM to Excel"
                                    style={{ padding: '0.45rem 0.65rem' }}
                                >
                                    <FileSpreadsheet size={14} /> Excel
                                </button>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => exportBomToSpreadsheet(currentItems, selectedVariantId, viewedRevision, 'csv')}
                                    title="Export BOM to CSV"
                                    style={{ padding: '0.45rem 0.65rem' }}
                                >
                                    <Download size={14} /> CSV
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Subtitle / Notes */}
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                        <strong>{activeHeader.variantName || selectedVariantId}</strong> — {currentRevisionDoc?.changeNotes || 'Initial baseline BOM from Tohands engineering specifications.'}
                    </div>
                    <div>
                        Uploaded by <strong>{currentRevisionDoc?.uploadedBy || 'Tohands Engineering'}</strong> on {new Date(currentRevisionDoc?.uploadedAt || Date.now()).toLocaleDateString()}
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* KPI SUMMARY CARDS */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <div className="card" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>BOM Line Items</span>
                        <Package size={16} color="var(--primary)" />
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)' }}>
                        {metrics.totalLines}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {metrics.totalQuantitySum} total unit components
                    </div>
                </div>

                <div className="card" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Mechanical</span>
                        <Layers size={16} color="#06b6d4" />
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#06b6d4' }}>
                        {metrics.catCounts.Mechanical}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Housing, Screws, Ribs, Sleeves
                    </div>
                </div>

                <div className="card" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Electronics & PCBA</span>
                        <Cpu size={16} color="#a855f7" />
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#a855f7' }}>
                        {metrics.catCounts['Electronic Components']}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Main PCB, Keypad, Battery, LCD
                    </div>
                </div>

                <div className="card" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Stickers & Labels</span>
                        <FileText size={16} color="#f59e0b" />
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f59e0b' }}>
                        {metrics.catCounts['Labels & Stickers']}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        SN stickers, QA seals, sub-assembly
                    </div>
                </div>

                <div className="card" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Packaging</span>
                        <Package size={16} color="#10b981" />
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981' }}>
                        {metrics.catCounts.Packaging}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Boxes, Sleeves, Inserts, ESD bags
                    </div>
                </div>

                <div className="card" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>BAAN Inventory Link</span>
                        <TrendingUp size={16} color={metrics.linkedPercent >= 90 ? '#10b981' : '#f59e0b'} />
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: metrics.linkedPercent >= 90 ? '#10b981' : '#f59e0b' }}>
                        {metrics.linkedCount} / {metrics.totalLines}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {metrics.linkedPercent}% parts mapped in BAAN
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* SEARCH & FILTER CONTROLS */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                    {/* Search Input */}
                    <div style={{ flex: '1 1 280px', position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Search by part number, component name, description..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ paddingLeft: '2.4rem', width: '100%' }}
                        />
                    </div>

                    {/* Category Filter */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                            className={`btn btn-sm ${categoryFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setCategoryFilter('ALL')}
                        >
                            All Categories
                        </button>
                        {BOM_CATEGORIES.map(cat => (
                            <button
                                key={cat}
                                className={`btn btn-sm ${categoryFilter === cat ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setCategoryFilter(cat)}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    {/* Secondary Filters */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <select
                            className="input-select"
                            value={baanFilter}
                            onChange={(e) => setBaanFilter(e.target.value)}
                            style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                        >
                            <option value="ALL">All BAAN States</option>
                            <option value="LINKED">Linked in BAAN</option>
                            <option value="UNLINKED">Unlinked</option>
                        </select>

                        <select
                            className="input-select"
                            value={stationFilter}
                            onChange={(e) => setStationFilter(e.target.value)}
                            style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                        >
                            <option value="ALL">All Stations</option>
                            <option value="ASSEMBLY">Station 6: Assembly</option>
                            <option value="HARDWARE QC / DEBUG">Station 4: Debug QC</option>
                            <option value="HARDWARE REWORK">Station 5: Rework</option>
                            <option value="PACKING & CLEANING">Station 8: Packing</option>
                        </select>

                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={downloadBomTemplate}
                            title="Download standard BOM Excel template"
                        >
                            Template
                        </button>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* DATA GRID */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', width: 60 }}>#</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', minWidth: 160 }}>Part Number</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', minWidth: 200 }}>Part Name</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', minWidth: 220 }}>Description</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', width: 140 }}>Category</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', width: 70 }}>Qty</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', minWidth: 140 }}>Sub-Assembly</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', minWidth: 150 }}>BAAN Inventory</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', minWidth: 140 }}>Station Affinity</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan={9} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                                        No BOM components match the specified search or filter criteria.
                                    </td>
                                </tr>
                            ) : (
                                filteredItems.map((item, idx) => {
                                    const pn = item.partNumber?.toUpperCase();
                                    const baanPart = baanParts[pn];
                                    const inStock = baanStockMap[pn] || 0;
                                    const isCritical = Boolean(item.isCritical);

                                    let catBadgeColor = '#06b6d4';
                                    if (item.category === 'Electronic Components') catBadgeColor = '#a855f7';
                                    if (item.category === 'Labels & Stickers') catBadgeColor = '#f59e0b';
                                    if (item.category === 'Packaging') catBadgeColor = '#10b981';

                                    return (
                                        <tr
                                            key={`${item.itemNo}_${item.partNumber}`}
                                            style={{
                                                borderBottom: '1px solid var(--border)',
                                                background: idx % 2 === 0 ? 'transparent' : 'var(--bg-primary-alt)'
                                            }}
                                        >
                                            {/* Item No */}
                                            <td style={{ padding: '0.65rem 1rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                {item.itemNo}
                                            </td>

                                            {/* Part Number */}
                                            <td style={{ padding: '0.65rem 1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text)' }}>
                                                        {item.partNumber}
                                                    </span>
                                                    <button
                                                        onClick={() => handleCopyPn(item.partNumber)}
                                                        className="btn-icon-subtle"
                                                        title="Copy Part Number"
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}
                                                    >
                                                        {copiedPn === item.partNumber ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                                                    </button>
                                                </div>
                                                {isCritical && (
                                                    <span style={{ fontSize: '0.68rem', color: 'var(--primary)', fontWeight: 700, letterSpacing: '0.04em' }}>
                                                        CRITICAL COMPONENT
                                                    </span>
                                                )}
                                            </td>

                                            {/* Part Name */}
                                            <td style={{ padding: '0.65rem 1rem', fontWeight: 600, color: 'var(--text)' }}>
                                                {item.partName}
                                            </td>

                                            {/* Description */}
                                            <td style={{ padding: '0.65rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.35 }}>
                                                {item.partDescription || '—'}
                                            </td>

                                            {/* Category */}
                                            <td style={{ padding: '0.65rem 1rem' }}>
                                                <span
                                                    className="badge"
                                                    style={{
                                                        background: `${catBadgeColor}18`,
                                                        color: catBadgeColor,
                                                        border: `1px solid ${catBadgeColor}40`,
                                                        fontSize: '0.72rem',
                                                        whiteSpace: 'nowrap'
                                                    }}
                                                >
                                                    {item.category}
                                                </span>
                                            </td>

                                            {/* Qty Required */}
                                            <td style={{ padding: '0.65rem 1rem', textAlign: 'center', fontWeight: 700, fontSize: '0.95rem' }}>
                                                {item.quantityRequired}
                                            </td>

                                            {/* Sub Assembly */}
                                            <td style={{ padding: '0.65rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                {item.subAssembly || 'Base Unit'}
                                            </td>

                                            {/* BAAN Inventory Matching */}
                                            <td style={{ padding: '0.65rem 1rem' }}>
                                                {baanPart ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                                        <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                            <CheckCircle2 size={12} /> BAAN Linked
                                                        </span>
                                                        <span style={{ fontSize: '0.75rem', color: inStock > 0 ? 'var(--text)' : 'var(--error)', fontWeight: 600 }}>
                                                            {inStock} in stock
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                        <AlertTriangle size={12} color="#f59e0b" /> Not in BAAN
                                                    </span>
                                                )}
                                            </td>

                                            {/* Station Affinity */}
                                            <td style={{ padding: '0.65rem 1rem' }}>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                                    {(item.stationTags || []).map(tag => (
                                                        <span
                                                            key={tag}
                                                            style={{
                                                                fontSize: '0.68rem',
                                                                background: 'var(--bg-secondary)',
                                                                padding: '0.15rem 0.4rem',
                                                                borderRadius: 3,
                                                                border: '1px solid var(--border)',
                                                                color: 'var(--text-muted)',
                                                                whiteSpace: 'nowrap'
                                                            }}
                                                        >
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <span>Showing <strong>{filteredItems.length}</strong> of <strong>{currentItems.length}</strong> components</span>
                    <span>Active Version: <strong>{viewedRevision}</strong> ({isCurrentActive ? 'Active Baseline' : 'Archived/Draft'})</span>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* UPLOAD & VALIDATION MODAL */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {showUploadModal && (
                <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                    <div className="card animate-scale-up" style={{ width: '100%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Upload BOM Revision</h3>
                                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    Target Product Architecture: <strong>{variants.find(v => v.id === selectedVariantId)?.name}</strong>
                                </p>
                            </div>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowUploadModal(false)}
                                style={{ padding: '0.25rem 0.5rem' }}
                            >
                                ✕
                            </button>
                        </div>

                        {uploadError && (
                            <div className="badge badge-error" style={{ width: '100%', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'normal', lineHeight: 1.4 }}>
                                <AlertTriangle size={16} />
                                <span>{uploadError}</span>
                            </div>
                        )}

                        {/* File Dropzone */}
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: '2px dashed var(--border)',
                                borderRadius: 8,
                                padding: '2rem 1.5rem',
                                textAlign: 'center',
                                cursor: 'pointer',
                                background: 'var(--bg-secondary)',
                                marginBottom: '1.25rem',
                                transition: 'border-color 0.2s ease'
                            }}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx, .xls, .csv"
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />
                            <Upload size={32} color="var(--primary)" style={{ margin: '0 auto 0.75rem' }} />
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.25rem' }}>
                                {uploadFileName ? uploadFileName : 'Select or Drop Excel (.xlsx, .xls) or CSV'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Supports standard column headers, title rows, and R-BOM specifications.
                            </div>
                        </div>

                        {/* Revision Metadata Inputs */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', marginBottom: '1rem' }}>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                                    Revision ID *
                                </label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="REV-02"
                                    value={uploadRevisionId}
                                    onChange={(e) => setUploadRevisionId(e.target.value.toUpperCase())}
                                    style={{ width: '100%', fontWeight: 700 }}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                                    Change Notes / Engineering Order Reason *
                                </label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="e.g. Updated battery pack capacity to 4000mAh and new packaging sticker"
                                    value={uploadChangeNotes}
                                    onChange={(e) => setUploadChangeNotes(e.target.value)}
                                    style={{ width: '100%' }}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={uploadSetAsActive}
                                    onChange={(e) => setUploadSetAsActive(e.target.checked)}
                                />
                                <span>Promote this revision to active production baseline immediately upon save</span>
                            </label>
                        </div>

                        {/* Parsing Live Validation Preview */}
                        {isParsing && (
                            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                Analyzing spreadsheet headers and validating schema...
                            </div>
                        )}

                        {uploadParseResult && (
                            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '1rem', marginBottom: '1.25rem', border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: uploadParseResult.success ? '#10b981' : '#f59e0b' }}>
                                        {uploadParseResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                                        Validated {uploadParseResult.summary.totalLineItems} Components
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Detected Title: <strong>{uploadParseResult.detectedTitle}</strong>
                                    </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', fontSize: '0.75rem', textAlign: 'center' }}>
                                    <div style={{ background: 'var(--bg-primary)', padding: '0.4rem', borderRadius: 4 }}>
                                        Mechanical: <strong>{uploadParseResult.summary.categoryCounts?.Mechanical || 0}</strong>
                                    </div>
                                    <div style={{ background: 'var(--bg-primary)', padding: '0.4rem', borderRadius: 4 }}>
                                        Electronics: <strong>{uploadParseResult.summary.categoryCounts?.['Electronic Components'] || 0}</strong>
                                    </div>
                                    <div style={{ background: 'var(--bg-primary)', padding: '0.4rem', borderRadius: 4 }}>
                                        Stickers: <strong>{uploadParseResult.summary.categoryCounts?.['Labels & Stickers'] || 0}</strong>
                                    </div>
                                    <div style={{ background: 'var(--bg-primary)', padding: '0.4rem', borderRadius: 4 }}>
                                        Packaging: <strong>{uploadParseResult.summary.categoryCounts?.Packaging || 0}</strong>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowUploadModal(false)}
                                disabled={isSaving}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleConfirmUpload}
                                disabled={isSaving || !uploadParseResult || !uploadParseResult.items?.length}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                                {isSaving ? 'Recording Revision...' : 'Save & Lock Revision'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* MRP SHORTAGE PLANNING MODAL (OPTION B) */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {showMrpModal && (
                <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                    <div className="card animate-scale-up" style={{ width: '100%', maxWidth: 960, maxHeight: '92vh', overflowY: 'auto', padding: '1.75rem', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Boxes size={20} color="var(--primary)" /> Material Requirements Planning (MRP)
                                </h3>
                                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    Target Production Run for <strong>{variants.find(v => v.id === selectedVariantId)?.name}</strong> ({viewedRevision})
                                </p>
                            </div>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowMrpModal(false)}
                                style={{ padding: '0.25rem 0.5rem' }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Batch Size Input Bar */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 8, marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <label style={{ fontWeight: 700, fontSize: '0.9rem' }}>Target Build Batch Size:</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="100000"
                                    className="input-field"
                                    value={targetBatchSize}
                                    onChange={(e) => setTargetBatchSize(Math.max(1, parseInt(e.target.value) || 1))}
                                    style={{ width: 110, fontWeight: 800, textAlign: 'center' }}
                                />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Units</span>
                            </div>

                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                {[50, 100, 250, 500, 1000].map(sz => (
                                    <button
                                        key={sz}
                                        className={`btn btn-sm ${targetBatchSize === sz ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => setTargetBatchSize(sz)}
                                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                                    >
                                        {sz}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* MRP Metrics Summary Strip */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <div className="card" style={{ padding: '0.85rem' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL REQUIRED UNITS</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{mrpAnalysis.totalRequiredUnits}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Across {mrpAnalysis.totalBomItems} BOM parts</div>
                            </div>

                            <div className="card" style={{ padding: '0.85rem' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>STOCK HEALTH COVERAGE</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: mrpAnalysis.stockHealthPercent >= 80 ? '#10b981' : '#f59e0b' }}>
                                    {mrpAnalysis.stockHealthPercent}%
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Components sufficient</div>
                            </div>

                            <div className="card" style={{ padding: '0.85rem' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>SHORTAGE DEFICIT LINES</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: mrpAnalysis.totalShortageLines > 0 ? 'var(--error)' : '#10b981' }}>
                                    {mrpAnalysis.totalShortageLines}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Parts needing replenishment</div>
                            </div>

                            <div className="card" style={{ padding: '0.85rem' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>UNMAPPED BAAN PARTS</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: mrpAnalysis.unmappedPartCount > 0 ? '#f59e0b' : '#10b981' }}>
                                    {mrpAnalysis.unmappedPartCount}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Parts missing from BAAN catalog</div>
                            </div>
                        </div>

                        {/* Requisition Feedback */}
                        {mrpRequestFeedback && (
                            <div
                                className={`badge ${mrpRequestFeedback.type === 'success' ? 'badge-success' : 'badge-error'}`}
                                style={{ width: '100%', padding: '0.75rem 1rem', marginBottom: '1rem', whiteSpace: 'normal', lineHeight: 1.4 }}
                            >
                                {mrpRequestFeedback.message}
                            </div>
                        )}

                        {/* Shortage Breakdown Table */}
                        <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: '1.25rem' }}>
                            <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-secondary)', fontWeight: 700, fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Component Stock Sufficiency Analysis ({targetBatchSize} Units)</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {mrpAnalysis.shortageRows.length} shortages identified
                                </span>
                            </div>
                            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--bg-primary-alt)', borderBottom: '1px solid var(--border)' }}>
                                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Part No</th>
                                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Part Name</th>
                                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Per Unit</th>
                                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Req Total</th>
                                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Current Stock</th>
                                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Deficit</th>
                                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', width: 140 }}>Coverage %</th>
                                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mrpAnalysis.rows.map(row => {
                                            const isShort = row.deficit > 0;
                                            return (
                                                <tr key={row.partNumber} style={{ borderBottom: '1px solid var(--border)', background: isShort ? 'rgba(239, 68, 68, 0.04)' : 'transparent' }}>
                                                    <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontWeight: 700 }}>
                                                        {row.partNumber}
                                                    </td>
                                                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>
                                                        {row.partName}
                                                    </td>
                                                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                                                        {row.quantityRequired}
                                                    </td>
                                                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 700 }}>
                                                        {row.requiredTotal}
                                                    </td>
                                                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 600 }}>
                                                        {row.currentStock}
                                                    </td>
                                                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 800, color: row.deficit > 0 ? 'var(--error)' : '#10b981' }}>
                                                        {row.deficit > 0 ? `-${row.deficit}` : '0'}
                                                    </td>
                                                    <td style={{ padding: '0.5rem 0.75rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                            <div style={{ flex: 1, background: 'var(--border)', height: 6, borderRadius: 3, overflow: 'hidden' }}>
                                                                <div
                                                                    style={{
                                                                        width: `${row.coveragePercent}%`,
                                                                        height: '100%',
                                                                        background: row.coveragePercent >= 100 ? '#10b981' : row.coveragePercent > 0 ? '#f59e0b' : 'var(--error)'
                                                                    }}
                                                                />
                                                            </div>
                                                            <span style={{ fontSize: '0.72rem', minWidth: 32 }}>{row.coveragePercent}%</span>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '0.5rem 0.75rem' }}>
                                                        <span
                                                            className={`badge ${
                                                                row.status === 'SUFFICIENT' ? 'badge-success' :
                                                                row.status === 'PARTIAL_SHORTAGE' ? 'badge-warning' :
                                                                row.status === 'CRITICAL_SHORTAGE' ? 'badge-error' : 'badge-neutral'
                                                            }`}
                                                            style={{ fontSize: '0.7rem' }}
                                                        >
                                                            {row.status.replace(/_/g, ' ')}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => exportMrpReport(mrpAnalysis, selectedVariantId, viewedRevision)}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                                <Download size={14} /> Export MRP Report (Excel)
                            </button>

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setShowMrpModal(false)}
                                >
                                    Close
                                </button>
                                {canMrp && mrpAnalysis.shortageRows.length > 0 && (
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleBatchRequisition}
                                        disabled={isRequestingBaan}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#059669' }}
                                    >
                                        <Package size={15} />
                                        {isRequestingBaan ? 'Dispatching Requests...' : `Request ${mrpAnalysis.shortageRows.length} Shortages from Stores`}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* REVISION HISTORY DRAWER */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {showHistoryDrawer && (
                <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'flex-end', zIndex: 1000 }}>
                    <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 480, height: '100%', borderRadius: 0, padding: '1.75rem', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Revision History</h3>
                                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {variants.find(v => v.id === selectedVariantId)?.name}
                                </p>
                            </div>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowHistoryDrawer(false)}
                                style={{ padding: '0.25rem 0.5rem' }}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {variantRevisions.map(rev => {
                                const isActive = rev.revision === activeHeader.activeRevision;
                                return (
                                    <div
                                        key={rev.revision}
                                        style={{
                                            border: '1px solid var(--border)',
                                            borderRadius: 8,
                                            padding: '1rem',
                                            background: isActive ? 'rgba(79, 70, 229, 0.06)' : 'var(--bg-secondary)',
                                            borderColor: isActive ? 'var(--primary)' : 'var(--border)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontWeight: 800, fontSize: '1rem' }}>{rev.revision}</span>
                                                {isActive && (
                                                    <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Active Baseline</span>
                                                )}
                                                <span className="badge badge-info" style={{ fontSize: '0.7rem' }}><Lock size={10} /> Locked</span>
                                            </div>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => {
                                                    setViewedRevision(rev.revision);
                                                    setShowHistoryDrawer(false);
                                                }}
                                                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                            >
                                                Inspect
                                            </button>
                                        </div>

                                        <p style={{ margin: '0.25rem 0 0.5rem', fontSize: '0.82rem', color: 'var(--text)' }}>
                                            {rev.changeNotes || 'Engineering revision record.'}
                                        </p>

                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>{rev.itemCount || 48} parts</span>
                                            <span>By {rev.uploadedBy || 'Engineering'} • {new Date(rev.uploadedAt || Date.now()).toLocaleDateString()}</span>
                                        </div>

                                        {!isActive && canActivate && (
                                            <button
                                                className="btn btn-warning btn-sm"
                                                onClick={() => handleActivateRevision(rev.revision)}
                                                style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.75rem', padding: '0.35rem' }}
                                            >
                                                Promote to Active Production Baseline
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* ADD PRODUCT VARIANT MODAL */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {showAddVariantModal && (
                <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                    <div className="card animate-scale-up" style={{ width: '100%', maxWidth: 480, padding: '1.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Create New Product Architecture</h3>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowAddVariantModal(false)}
                                style={{ padding: '0.25rem 0.5rem' }}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Variant Code / ID *</label>
                            <input
                                type="text"
                                className="input-field"
                                placeholder="e.g. CALC_V6"
                                value={newVariantId}
                                onChange={(e) => setNewVariantId(e.target.value.toUpperCase())}
                                style={{ width: '100%', fontWeight: 700 }}
                            />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Display Name *</label>
                            <input
                                type="text"
                                className="input-field"
                                placeholder="e.g. Tohands Calculator V6 Pro"
                                value={newVariantName}
                                onChange={(e) => setNewVariantName(e.target.value)}
                                style={{ width: '100%' }}
                            />
                        </div>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Description</label>
                            <input
                                type="text"
                                className="input-field"
                                placeholder="Next generation calculator with solar cell"
                                value={newVariantDesc}
                                onChange={(e) => setNewVariantDesc(e.target.value)}
                                style={{ width: '100%' }}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowAddVariantModal(false)}
                                disabled={isCreatingVariant}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleCreateVariant}
                                disabled={isCreatingVariant || !newVariantId.trim() || !newVariantName.trim()}
                            >
                                {isCreatingVariant ? 'Creating Architecture...' : 'Create Architecture'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BomStudio;
