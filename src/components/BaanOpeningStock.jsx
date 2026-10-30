import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
    Download, Upload, CheckCircle2, AlertTriangle, AlertCircle,
    FileSpreadsheet, Lock, RefreshCw, ArrowRight, ShieldCheck,
    Box, PackageCheck, Info, Check, Filter, Search
} from 'lucide-react';
import { useCQA } from '../hooks/useCQA';
import { downloadOpeningStockTemplate } from '../utils/bomEngine';

export const BaanOpeningStock = () => {
    const {
        store,
        syncBomData,
        getActiveBom,
        acquireSkuLocks,
        releaseSkuLocks,
        initializeOpeningStockChunk,
        createDiscrepancyTicket
    } = useCQA();

    // Real-time synchronization of BOM master data
    useEffect(() => {
        const unsub = syncBomData?.();
        return () => unsub?.();
    }, [syncBomData]);

    // Dynamic user-uploaded BOM variants from database
    const availableVariants = useMemo(() => {
        return Object.values(store.bom?.headers || {});
    }, [store.bom?.headers]);

    // ─── Step State: 1 = Scope Selection, 2 = Upload & Reconcile, 3 = Confirmation & Posting ───
    const [currentStep, setCurrentStep] = useState(1);
    const [selectedVariantId, setSelectedVariantId] = useState('');
    const [selectedRevision, setSelectedRevision] = useState('');

    useEffect(() => {
        if (!selectedVariantId && availableVariants.length > 0) {
            setSelectedVariantId(availableVariants[0].variantId || availableVariants[0].id);
        }
    }, [availableVariants, selectedVariantId]);

    const activeHeader = useMemo(() => {
        return availableVariants.find(v => (v.variantId || v.id) === selectedVariantId) || null;
    }, [availableVariants, selectedVariantId]);

    const availableRevisions = useMemo(() => {
        if (!selectedVariantId) return [];
        const all = Object.values(store.bom?.revisions || {});
        const forVariant = all.filter(r => r.variantId === selectedVariantId);
        return forVariant.sort((a, b) => (b.revision || '').localeCompare(a.revision || ''));
    }, [selectedVariantId, store.bom?.revisions]);

    const activeRevisionDoc = useMemo(() => {
        if (!selectedVariantId || !selectedRevision) return null;
        return store.bom?.revisions?.[`${selectedVariantId}_${selectedRevision}`] || null;
    }, [selectedVariantId, selectedRevision, store.bom?.revisions]);

    useEffect(() => {
        if (activeHeader?.activeRevision) {
            setSelectedRevision(activeHeader.activeRevision);
        } else if (availableRevisions.length > 0) {
            setSelectedRevision(availableRevisions[0].revision);
        } else {
            setSelectedRevision('');
        }
    }, [activeHeader, availableRevisions]);

    // ─── File & Data State ───
    const [uploadedFile, setUploadedFile] = useState(null);
    const [parsedRows, setParsedRows] = useState([]);
    const [validationErrors, setValidationErrors] = useState([]);
    const [reconciliationItems, setReconciliationItems] = useState([]);

    // ─── Posting State ───
    const [isPosting, setIsPosting] = useState(false);
    const [postingProgress, setPostingProgress] = useState({ currentChunk: 0, totalChunks: 0, message: '' });
    const [postResult, setPostResult] = useState(null);
    const [searchFilter, setSearchFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');

    // Current user
    const currentUser = store.user || { id: 'StoreManager', name: 'Store Manager', role: 'Store Manager' };

    // 1. Dynamic Stock Map: aggregated across all active batches
    const liveStockMap = useMemo(() => {
        const map = {};
        Object.values(store.baan?.batches || {}).forEach(b => {
            if (b.partNumber) {
                const qty = Number(b.quantityAvailable) || 0;
                map[b.partNumber] = (map[b.partNumber] || 0) + qty;
            }
        });
        return map;
    }, [store.baan?.batches]);

    // 2. Active Components for the chosen variant/revision (strictly from database)
    const bomComponents = useMemo(() => {
        if (!selectedVariantId) return [];
        if (activeRevisionDoc?.items && Array.isArray(activeRevisionDoc.items)) {
            return activeRevisionDoc.items;
        }
        const liveBom = getActiveBom(selectedVariantId);
        const list = liveBom?.items || liveBom?.components;
        return list && Array.isArray(list) ? list : [];
    }, [selectedVariantId, activeRevisionDoc, getActiveBom]);

    // Handle Template Download
    const handleDownloadTemplate = () => {
        if (bomComponents.length === 0) {
            alert('Cannot download template: No components found in the selected BOM revision.');
            return;
        }
        const variantName = activeHeader?.variantName || activeHeader?.name || selectedVariantId;
        downloadOpeningStockTemplate(bomComponents, variantName, selectedRevision || 'REV-01', liveStockMap);
    };

    // Handle File Upload and Reconciliation Computation
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadedFile(file);
        setValidationErrors([]);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                if (jsonRows.length === 0) {
                    setValidationErrors(['The uploaded file contains no data rows.']);
                    return;
                }

                // Parse and validate rows
                const errors = [];
                const seenSkus = new Set();
                const reconciled = [];

                jsonRows.forEach((row, idx) => {
                    const rowNum = idx + 2;
                    // Find part number using aliases
                    const rawPart = row['Part Number'] || row['part number'] || row['Part No'] || row['part_number'] || row['PartNo'] || '';
                    const partNumber = String(rawPart).trim();

                    if (!partNumber) {
                        errors.push(`Row ${rowNum}: Part Number is missing.`);
                        return;
                    }

                    if (seenSkus.has(partNumber.toUpperCase())) {
                        errors.push(`Row ${rowNum}: Duplicate Part Number "${partNumber}" in spreadsheet.`);
                        return;
                    }
                    seenSkus.add(partNumber.toUpperCase());

                    const partName = String(row['Part Name'] || row['part name'] || '').trim();
                    const rawPhysical = row['Physical Quantity'] || row['physical quantity'] || row['Quantity'] || row['Qty'] || 0;
                    const physicalQty = Number(rawPhysical);

                    if (isNaN(physicalQty) || physicalQty < 0) {
                        errors.push(`Row ${rowNum} (${partNumber}): Invalid physical quantity "${rawPhysical}". Must be a non-negative number.`);
                    }

                    const locationName = String(row['Location Name'] || row['Location No/Name'] || row['Rack'] || 'Warehouse').trim();
                    const locationCode = String(row['Location Code'] || row['Bin'] || 'Code A').trim();
                    const perUnitCost = Number(row['Per Unit Cost'] || row['Cost'] || 0);

                    // Reconcile against live database stock
                    const currentStock = liveStockMap[partNumber] || 0;
                    const delta = physicalQty - currentStock;

                    let status = 'RECONCILE_MATCH';
                    let statusLabel = 'Count Matches System';
                    let statusColor = '#10b981'; // green

                    if (currentStock === 0) {
                        status = 'NEW_STOCK';
                        statusLabel = 'New Inventory Initialized';
                        statusColor = '#3b82f6'; // blue
                    } else if (delta > 0) {
                        status = 'PHYSICAL_SURPLUS';
                        statusLabel = `Surplus (+${delta})`;
                        statusColor = '#f59e0b'; // amber
                    } else if (delta < 0) {
                        if (Math.abs(delta) > currentStock) {
                            status = 'BLOCKED_DISCREPANCY';
                            statusLabel = 'Deficit Exceeds Available (Blocked)';
                            statusColor = '#ef4444'; // red
                            errors.push(`Critical Discrepancy on "${partNumber}": physical count deficit (${delta}) exceeds total available warehouse stock (${currentStock}). Automatic posting blocked.`);
                        } else {
                            status = 'PHYSICAL_SHORTAGE';
                            statusLabel = `Shortage (${delta})`;
                            statusColor = '#f97316'; // orange
                        }
                    }

                    reconciled.push({
                        itemNo: row['Item No.'] || idx + 1,
                        partNumber,
                        partName,
                        category: row['Category'] || 'Mechanical',
                        locationName,
                        locationCode,
                        perUnitCost,
                        currentStock,
                        physicalQuantity: physicalQty,
                        delta,
                        status,
                        statusLabel,
                        statusColor,
                        remarks: row['Remarks'] || ''
                    });
                });

                setParsedRows(jsonRows);
                setValidationErrors(errors);
                setReconciliationItems(reconciled);
                if (errors.length === 0) {
                    setCurrentStep(2);
                }
            } catch (err) {
                console.error("Spreadsheet Parsing Error:", err);
                setValidationErrors([`File parse error: ${err.message}`]);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // Calculate Summary Metrics
    const summary = useMemo(() => {
        const total = reconciliationItems.length;
        const newStock = reconciliationItems.filter(i => i.status === 'NEW_STOCK').length;
        const matches = reconciliationItems.filter(i => i.status === 'RECONCILE_MATCH').length;
        const shortages = reconciliationItems.filter(i => i.status === 'PHYSICAL_SHORTAGE').length;
        const surpluses = reconciliationItems.filter(i => i.status === 'PHYSICAL_SURPLUS').length;
        const blocked = reconciliationItems.filter(i => i.status === 'BLOCKED_DISCREPANCY').length;
        const totalPhysicalUnits = reconciliationItems.reduce((acc, i) => acc + (i.physicalQuantity || 0), 0);
        return { total, newStock, matches, shortages, surpluses, blocked, totalPhysicalUnits };
    }, [reconciliationItems]);

    // Filtered items for table
    const displayedItems = useMemo(() => {
        return reconciliationItems.filter(item => {
            const matchesSearch = !searchFilter || 
                item.partNumber.toLowerCase().includes(searchFilter.toLowerCase()) ||
                item.partName.toLowerCase().includes(searchFilter.toLowerCase());
            const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [reconciliationItems, searchFilter, statusFilter]);

    // ─── Execute Fenced, Chunked Commit ───
    const handleCommitOpeningStock = async () => {
        if (reconciliationItems.length === 0) return;
        if (summary.blocked > 0) {
            alert('Cannot post: There are critical discrepancies where shortage exceeds available stock. Please resolve them before posting.');
            return;
        }

        setIsPosting(true);
        const sessionId = `OPN-${selectedVariantId}-${selectedRevision}-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        try {
            // Step A: Acquire Locks across all SKUs
            setPostingProgress({ currentChunk: 0, totalChunks: 0, message: 'Acquiring mutually exclusive inventory locks...' });
            const skuList = reconciliationItems.map(i => i.partNumber);
            const lockResult = await acquireSkuLocks(skuList, sessionId, currentUser);

            if (!lockResult.success) {
                alert(`Lock Acquisition Failed:\n${lockResult.message}`);
                setIsPosting(false);
                return;
            }

            // Step B: Chunk Items (Max 15 items per chunk to respect 20-lookup rule)
            const CHUNK_SIZE = 15;
            const chunks = [];
            for (let i = 0; i < reconciliationItems.length; i += CHUNK_SIZE) {
                chunks.push(reconciliationItems.slice(i, i + CHUNK_SIZE));
            }

            const totalChunks = chunks.length;

            // Step C: Post chunks sequentially
            for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
                setPostingProgress({
                    currentChunk: chunkIdx + 1,
                    totalChunks,
                    message: `Committing Chunk ${chunkIdx + 1} of ${totalChunks} (${chunks[chunkIdx].length} items)...`
                });

                const chunkItems = chunks[chunkIdx];
                const res = await initializeOpeningStockChunk(
                    sessionId,
                    selectedVariantId,
                    selectedRevision,
                    chunkItems,
                    chunkIdx,
                    totalChunks,
                    currentUser
                );

                if (!res.success) {
                    throw new Error(`Chunk ${chunkIdx + 1} commit failed: ${res.message}`);
                }
            }

            // Step D: Release SKU locks
            setPostingProgress({ currentChunk: totalChunks, totalChunks, message: 'Releasing inventory locks...' });
            await releaseSkuLocks(skuList, sessionId);

            // Step E: Create discrepancy tickets for any variances
            const varianceItems = reconciliationItems.filter(i => i.delta !== 0);
            for (const v of varianceItems) {
                await createDiscrepancyTicket({
                    sessionId,
                    sku: v.partNumber,
                    partName: v.partName,
                    location: `${v.locationName} — ${v.locationCode}`,
                    systemQty: v.currentStock,
                    physicalQty: v.physicalQuantity,
                    delta: v.delta,
                    reason: v.delta > 0 ? 'Opening Stock Surplus' : 'Opening Stock Shortage',
                    remarks: v.remarks
                }, currentUser);
            }

            setPostResult({
                success: true,
                sessionId,
                totalItems: reconciliationItems.length,
                totalUnits: summary.totalPhysicalUnits,
                variancesCount: varianceItems.length
            });
            setCurrentStep(3);
        } catch (err) {
            console.error("Posting Error:", err);
            alert(`Opening Stock Posting Error: ${err.message}`);
        } finally {
            setIsPosting(false);
        }
    };

    return (
        <div style={{ background: '#0f172a', borderRadius: '12px', padding: '1.5rem', color: '#f8fafc', border: '1px solid #1e293b' }}>
            {/* Header Banner */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <PackageCheck size={26} color="#38bdf8" /> BAAN Opening Stock Initialization & Physical Reconciliation
                    </h2>
                    <p style={{ margin: '0.35rem 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                        Select approved BOM revision, export pre-filled inventory template, enter physical counts, and reconcile against live warehouse stock.
                    </p>
                </div>

                {/* Step indicator */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {[
                        { step: 1, label: '1. Scope & Template' },
                        { step: 2, label: '2. Reconcile & Preview' },
                        { step: 3, label: '3. Complete' }
                    ].map(s => (
                        <div
                            key={s.step}
                            style={{
                                padding: '0.35rem 0.8rem',
                                borderRadius: '20px',
                                fontSize: '0.8rem',
                                fontWeight: '600',
                                background: currentStep === s.step ? '#0284c7' : '#1e293b',
                                color: currentStep === s.step ? '#ffffff' : '#64748b'
                            }}
                        >
                            {s.label}
                        </div>
                    ))}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* STEP 1: SCOPE SELECTION & TEMPLATE GENERATION                   */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {currentStep === 1 && (
                availableVariants.length === 0 ? (
                    <div style={{ background: '#1e293b', padding: '3rem 1.5rem', borderRadius: '10px', border: '1px solid #334155', textAlign: 'center' }}>
                        <Box size={48} color="#38bdf8" style={{ margin: '0 auto 1.25rem' }} />
                        <h3 style={{ margin: '0 0 0.5rem 0', color: '#f1f5f9', fontSize: '1.25rem' }}>No BOM Variants Found</h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: 540, margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
                            No Bill of Materials (BOM) has been uploaded or activated yet. BOMs must be added by authorized users in BOM Master Studio before performing Opening Stock initialization.
                        </p>
                        <button
                            onClick={() => {
                                const url = new URL(window.location.href);
                                url.searchParams.set('section', 'bom-studio');
                                window.location.href = url.toString();
                            }}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.65rem 1.5rem',
                                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }}
                        >
                            Open BOM Master Studio <ArrowRight size={16} />
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        {/* Left: Product & BOM Selection */}
                        <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #334155' }}>
                            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Box size={18} color="#38bdf8" /> Product Variant & BOM Scope
                            </h3>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Product Variant</label>
                                <select
                                    value={selectedVariantId}
                                    onChange={(e) => setSelectedVariantId(e.target.value)}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155' }}
                                >
                                    {availableVariants.map(v => (
                                        <option key={v.id || v.variantId} value={v.variantId || v.id}>
                                            {v.variantName || v.name || v.variantId} {v.category ? `(${v.category})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Approved BOM Revision</label>
                                <select
                                    value={selectedRevision}
                                    onChange={(e) => setSelectedRevision(e.target.value)}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155' }}
                                >
                                    {availableRevisions.length > 0 ? (
                                        availableRevisions.map(r => (
                                            <option key={r.revision} value={r.revision}>
                                                {r.revision} {r.isLocked ? '(Approved Release)' : ''}
                                            </option>
                                        ))
                                    ) : (
                                        <option value="REV-01">REV-01</option>
                                    )}
                                </select>
                            </div>

                            <div style={{ padding: '0.9rem', background: '#0f172a', borderRadius: '8px', borderLeft: '4px solid #38bdf8', marginBottom: '1.25rem' }}>
                                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Loaded BOM Components:</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#38bdf8' }}>{bomComponents.length} Parts</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                                    {activeHeader?.description || activeRevisionDoc?.changeNotes || (bomComponents.length > 0 ? 'Active BOM components loaded from database' : 'No components found in this revision')}
                                </div>
                            </div>

                            <button
                                onClick={handleDownloadTemplate}
                                disabled={bomComponents.length === 0}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    background: bomComponents.length > 0 ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : '#334155',
                                    color: bomComponents.length > 0 ? '#ffffff' : '#94a3b8',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontWeight: '600',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    cursor: bomComponents.length > 0 ? 'pointer' : 'not-allowed'
                                }}
                            >
                                <Download size={18} /> Download Component Count Template (.xlsx)
                            </button>
                        </div>

                    {/* Right: File Upload */}
                    <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Upload size={18} color="#10b981" /> Upload Completed Physical Count
                        </h3>

                        <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
                            Fill in the verified physical quantities and storage bins into the downloaded spreadsheet and upload it below.
                        </p>

                        <div
                            style={{
                                flex: 1,
                                border: '2px dashed #475569',
                                borderRadius: '8px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '2rem',
                                background: '#0f172a',
                                textAlign: 'center',
                                cursor: 'pointer'
                            }}
                            onClick={() => document.getElementById('opening-stock-file-input').click()}
                        >
                            <FileSpreadsheet size={42} color="#38bdf8" style={{ marginBottom: '0.75rem' }} />
                            <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#f1f5f9' }}>
                                {uploadedFile ? uploadedFile.name : 'Click to select or drag & drop .xlsx file'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem' }}>
                                Accepts Excel (.xlsx, .xls) or CSV files
                            </div>
                            <input
                                id="opening-stock-file-input"
                                type="file"
                                accept=".xlsx, .xls, .csv"
                                onChange={handleFileUpload}
                                style={{ display: 'none' }}
                            />
                        </div>

                        {validationErrors.length > 0 && (
                            <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#450a0a', border: '1px solid #991b1b', borderRadius: '6px', color: '#fca5a5', fontSize: '0.85rem' }}>
                                <div style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                                    <AlertCircle size={16} /> Validation Errors:
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                                    {validationErrors.slice(0, 4).map((err, idx) => (
                                        <li key={idx}>{err}</li>
                                    ))}
                                    {validationErrors.length > 4 && <li>...and {validationErrors.length - 4} more errors</li>}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
                )
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* STEP 2: RECONCILIATION PREVIEW & BATCH COMMIT GATE              */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {currentStep === 2 && (
                <div>
                    {/* Metric Cards Banner */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{ background: '#1e293b', padding: '0.9rem', borderRadius: '8px', borderLeft: '4px solid #38bdf8' }}>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Total Parts</div>
                            <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#f8fafc' }}>{summary.total}</div>
                        </div>
                        <div style={{ background: '#1e293b', padding: '0.9rem', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>New Inventory</div>
                            <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#60a5fa' }}>{summary.newStock}</div>
                        </div>
                        <div style={{ background: '#1e293b', padding: '0.9rem', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Matched Exact</div>
                            <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#34d399' }}>{summary.matches}</div>
                        </div>
                        <div style={{ background: '#1e293b', padding: '0.9rem', borderRadius: '8px', borderLeft: '4px solid #f97316' }}>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Shortages</div>
                            <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#fb923c' }}>{summary.shortages}</div>
                        </div>
                        <div style={{ background: '#1e293b', padding: '0.9rem', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Surpluses</div>
                            <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#fbbf24' }}>{summary.surpluses}</div>
                        </div>
                        <div style={{ background: '#1e293b', padding: '0.9rem', borderRadius: '8px', borderLeft: '4px solid #ef4444' }}>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Blocked Items</div>
                            <div style={{ fontSize: '1.3rem', fontWeight: '700', color: summary.blocked > 0 ? '#f87171' : '#94a3b8' }}>{summary.blocked}</div>
                        </div>
                    </div>

                    {/* Filter and Search Bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1 }}>
                            <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
                                <Search size={16} color="#64748b" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                                <input
                                    type="text"
                                    placeholder="Search part number or name..."
                                    value={searchFilter}
                                    onChange={(e) => setSearchFilter(e.target.value)}
                                    style={{ width: '100%', padding: '0.55rem 0.55rem 0.55rem 2rem', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}
                                />
                            </div>

                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                style={{ padding: '0.55rem', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc', fontSize: '0.85rem' }}
                            >
                                <option value="ALL">All Statuses ({reconciliationItems.length})</option>
                                <option value="NEW_STOCK">New Inventory ({summary.newStock})</option>
                                <option value="RECONCILE_MATCH">Matched ({summary.matches})</option>
                                <option value="PHYSICAL_SHORTAGE">Shortages ({summary.shortages})</option>
                                <option value="PHYSICAL_SURPLUS">Surpluses ({summary.surpluses})</option>
                                <option value="BLOCKED_DISCREPANCY">Blocked ({summary.blocked})</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                onClick={() => { setCurrentStep(1); setUploadedFile(null); }}
                                style={{ padding: '0.6rem 1rem', background: '#334155', color: '#f8fafc', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
                            >
                                Back to File Upload
                            </button>
                            <button
                                onClick={handleCommitOpeningStock}
                                disabled={isPosting || summary.blocked > 0}
                                style={{
                                    padding: '0.6rem 1.4rem',
                                    background: summary.blocked > 0 ? '#475569' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontWeight: '700',
                                    cursor: summary.blocked > 0 ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                <ShieldCheck size={18} />
                                {isPosting ? 'Posting Chunks...' : 'Confirm & Post Opening Stock'}
                            </button>
                        </div>
                    </div>

                    {/* Progress Bar when Posting */}
                    {isPosting && (
                        <div style={{ marginBottom: '1.25rem', padding: '1rem', background: '#1e293b', borderRadius: '8px', border: '1px solid #38bdf8' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#38bdf8', marginBottom: '0.4rem', fontWeight: '600' }}>
                                <span>{postingProgress.message}</span>
                                <span>Chunk {postingProgress.currentChunk} of {postingProgress.totalChunks}</span>
                            </div>
                            <div style={{ width: '100%', height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden' }}>
                                <div
                                    style={{
                                        width: `${postingProgress.totalChunks ? (postingProgress.currentChunk / postingProgress.totalChunks) * 100 : 0}%`,
                                        height: '100%',
                                        background: '#38bdf8',
                                        transition: 'width 0.3s ease'
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Reconciliation Table */}
                    <div style={{ overflowX: 'auto', border: '1px solid #334155', borderRadius: '8px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                                    <th style={{ padding: '0.75rem 0.9rem' }}>Item</th>
                                    <th style={{ padding: '0.75rem 0.9rem' }}>Part Number</th>
                                    <th style={{ padding: '0.75rem 0.9rem' }}>Part Name</th>
                                    <th style={{ padding: '0.75rem 0.9rem' }}>Location Bin</th>
                                    <th style={{ padding: '0.75rem 0.9rem', textAlign: 'right' }}>System Stock</th>
                                    <th style={{ padding: '0.75rem 0.9rem', textAlign: 'right' }}>Physical Count</th>
                                    <th style={{ padding: '0.75rem 0.9rem', textAlign: 'right' }}>Variance (&Delta;)</th>
                                    <th style={{ padding: '0.75rem 0.9rem' }}>Reconciliation Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayedItems.map((item, idx) => (
                                    <tr
                                        key={item.partNumber + idx}
                                        style={{
                                            borderBottom: '1px solid #1e293b',
                                            background: idx % 2 === 0 ? '#0f172a' : '#141e33'
                                        }}
                                    >
                                        <td style={{ padding: '0.65rem 0.9rem', color: '#64748b' }}>{item.itemNo}</td>
                                        <td style={{ padding: '0.65rem 0.9rem', fontWeight: '600', color: '#f8fafc' }}>{item.partNumber}</td>
                                        <td style={{ padding: '0.65rem 0.9rem', color: '#cbd5e1' }}>{item.partName}</td>
                                        <td style={{ padding: '0.65rem 0.9rem', color: '#94a3b8' }}>{item.locationName} &mdash; {item.locationCode}</td>
                                        <td style={{ padding: '0.65rem 0.9rem', textAlign: 'right', color: '#94a3b8' }}>{item.currentStock}</td>
                                        <td style={{ padding: '0.65rem 0.9rem', textAlign: 'right', fontWeight: '700', color: '#38bdf8' }}>{item.physicalQuantity}</td>
                                        <td style={{ padding: '0.65rem 0.9rem', textAlign: 'right', fontWeight: '700', color: item.delta > 0 ? '#fbbf24' : item.delta < 0 ? '#f87171' : '#34d399' }}>
                                            {item.delta > 0 ? `+${item.delta}` : item.delta}
                                        </td>
                                        <td style={{ padding: '0.65rem 0.9rem' }}>
                                            <span style={{
                                                padding: '0.2rem 0.55rem',
                                                borderRadius: '12px',
                                                fontSize: '0.75rem',
                                                fontWeight: '600',
                                                background: `${item.statusColor}22`,
                                                color: item.statusColor,
                                                border: `1px solid ${item.statusColor}44`
                                            }}>
                                                {item.statusLabel}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* STEP 3: POSTING COMPLETE & AUDIT SUMMARY                        */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {currentStep === 3 && postResult && (
                <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                    <div style={{ display: 'inline-flex', padding: '1rem', background: '#064e3b', borderRadius: '50%', color: '#34d399', marginBottom: '1rem' }}>
                        <Check size={48} />
                    </div>
                    <h3 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f8fafc', margin: '0 0 0.5rem 0' }}>
                        Opening Stock Successfully Posted!
                    </h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.95rem', maxWidth: '500px', margin: '0 auto 1.5rem auto' }}>
                        Inventory batches have been created, movement ledgers recorded, and inventory locks released cleanly.
                    </p>

                    <div style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', background: '#1e293b', padding: '1rem 1.5rem', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'left' }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Session ID</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#38bdf8' }}>{postResult.sessionId}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Items Posted</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#f8fafc' }}>{postResult.totalItems} Parts ({postResult.totalUnits} Units)</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Discrepancies Logged</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: postResult.variancesCount > 0 ? '#f59e0b' : '#10b981' }}>
                                {postResult.variancesCount} Tickets Created
                            </div>
                        </div>
                    </div>

                    <div>
                        <button
                            onClick={() => { setCurrentStep(1); setUploadedFile(null); setReconciliationItems([]); }}
                            style={{
                                padding: '0.75rem 1.5rem',
                                background: '#0284c7',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }}
                        >
                            Initialize Another BOM Scope
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BaanOpeningStock;
