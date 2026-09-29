import React, { useState, useEffect, useMemo } from 'react';
import {
    Database,
    Package,
    MapPin,
    Plus,
    Search,
    Edit3,
    Archive,
    AlertTriangle,
    CheckCircle2,
    X
} from 'lucide-react';
import { db, doc, setDoc } from '../../firebase.js';
import { useCQA } from '../../hooks/useCQA.jsx';
import { hasPermission, PERMISSIONS } from '../../utils/rbacEngine.js';
import { logAdminAction, AUDIT_ACTIONS } from '../../utils/auditLogger.js';

export const BaanMasterStudio = ({ user }) => {
    const { store, syncBaanData } = useCQA();
    const isSuperAdmin = user?.role === 'Super Admin';

    // RBAC Checks
    const canCreatePart = isSuperAdmin || hasPermission(user, PERMISSIONS.BAAN_PART_CREATE);
    const canEditPart = isSuperAdmin || hasPermission(user, PERMISSIONS.BAAN_PART_EDIT);
    const canArchivePart = isSuperAdmin || hasPermission(user, PERMISSIONS.BAAN_PART_ARCHIVE);

    const canCreateLoc = isSuperAdmin || hasPermission(user, PERMISSIONS.BAAN_LOCATION_CREATE);
    const canEditLoc = isSuperAdmin || hasPermission(user, PERMISSIONS.BAAN_LOCATION_EDIT);
    const canArchiveLoc = isSuperAdmin || hasPermission(user, PERMISSIONS.BAAN_LOCATION_ARCHIVE);

    // Active Tab: 'parts' | 'locations' | 'health'
    const [activeTab, setActiveTab] = useState('parts');

    // Sync BAAN real-time data
    useEffect(() => {
        const cleanup = syncBaanData();
        return () => {
            if (cleanup) cleanup();
        };
    }, [syncBaanData]);

    // Data from Context Store
    const partsMap = store.baan.parts || {};
    const locationsMap = store.baan.locations || {};
    const batchesMap = store.baan.batches || {};

    const partsList = useMemo(() => Object.values(partsMap), [partsMap]);
    const locationsList = useMemo(() => Object.values(locationsMap), [locationsMap]);

    // Stock Quantity Calculations by Part Number
    const stockByPart = useMemo(() => {
        const counts = {};
        Object.values(batchesMap).forEach(b => {
            const pn = b.partNumber || b.partNo;
            if (!pn) return;
            counts[pn] = (counts[pn] || 0) + (Number(b.quantityAvailable) || 0);
        });
        return counts;
    }, [batchesMap]);

    // ─── Filter & Search States ───
    const [partSearch, setPartSearch] = useState('');
    const [partCategoryFilter, setPartCategoryFilter] = useState('ALL');
    const [partStatusFilter, setPartStatusFilter] = useState('ALL');

    const [locSearch, setLocSearch] = useState('');
    const [locTypeFilter, setLocTypeFilter] = useState('ALL');
    const [locStatusFilter, setLocStatusFilter] = useState('ALL');

    // ─── Modals State ───
    const [editingPart, setEditingPart] = useState(null); // null, 'new', or part object
    const [partFormData, setPartFormData] = useState({
        partNumber: '',
        name: '',
        category: 'General',
        unitCost: 0,
        minStockLevel: 10,
        status: 'Active',
        description: '',
        preferredSupplier: ''
    });

    const [archivingPart, setArchivingPart] = useState(null);
    const [partArchiveReason, setPartArchiveReason] = useState('');

    const [editingLoc, setEditingLoc] = useState(null); // null, 'new', or loc object
    const [locFormData, setLocFormData] = useState({
        id: '',
        name: '',
        type: 'WAREHOUSE',
        capacity: 1000,
        status: 'Active',
        description: ''
    });

    const [archivingLoc, setArchivingLoc] = useState(null);
    const [locArchiveReason, setLocArchiveReason] = useState('');

    // Available Categories
    const categories = useMemo(() => {
        const set = new Set(['General', 'Display', 'PCB', 'Casing', 'Battery', 'Cables', 'Fasteners', 'Packaging']);
        partsList.forEach(p => { if (p.category) set.add(p.category); });
        return ['ALL', ...Array.from(set)];
    }, [partsList]);

    // Filtered Parts
    const filteredParts = useMemo(() => {
        return partsList.filter(p => {
            const matchesSearch = !partSearch ||
                p.partNumber?.toLowerCase().includes(partSearch.toLowerCase()) ||
                p.name?.toLowerCase().includes(partSearch.toLowerCase()) ||
                p.category?.toLowerCase().includes(partSearch.toLowerCase());

            const matchesCat = partCategoryFilter === 'ALL' || p.category === partCategoryFilter;
            const matchesStatus = partStatusFilter === 'ALL' || (p.status || 'Active') === partStatusFilter;

            return matchesSearch && matchesCat && matchesStatus;
        });
    }, [partsList, partSearch, partCategoryFilter, partStatusFilter]);

    // Filtered Locations
    const filteredLocations = useMemo(() => {
        return locationsList.filter(l => {
            const matchesSearch = !locSearch ||
                l.id?.toLowerCase().includes(locSearch.toLowerCase()) ||
                l.name?.toLowerCase().includes(locSearch.toLowerCase()) ||
                l.description?.toLowerCase().includes(locSearch.toLowerCase());

            const matchesType = locTypeFilter === 'ALL' || l.type === locTypeFilter;
            const matchesStatus = locStatusFilter === 'ALL' || (l.status || 'Active') === locStatusFilter;

            return matchesSearch && matchesType && matchesStatus;
        });
    }, [locationsList, locSearch, locTypeFilter, locStatusFilter]);

    // Critical low stock parts count
    const lowStockParts = useMemo(() => {
        return partsList.filter(p => {
            const available = stockByPart[p.partNumber] || 0;
            const min = Number(p.minStockLevel) || 10;
            return available <= min && (p.status || 'Active') === 'Active';
        });
    }, [partsList, stockByPart]);

    // ─── PART CRUD ACTIONS ───
    const handleOpenCreatePart = () => {
        setPartFormData({
            partNumber: '',
            name: '',
            category: 'General',
            unitCost: 0,
            minStockLevel: 10,
            status: 'Active',
            description: '',
            preferredSupplier: ''
        });
        setEditingPart('new');
    };

    const handleOpenEditPart = (part) => {
        setPartFormData({
            partNumber: part.partNumber || part.id,
            name: part.name || '',
            category: part.category || 'General',
            unitCost: part.unitCost || 0,
            minStockLevel: part.minStockLevel !== undefined ? part.minStockLevel : 10,
            status: part.status || 'Active',
            description: part.description || '',
            preferredSupplier: part.preferredSupplier || ''
        });
        setEditingPart(part);
    };

    const handleSavePart = async (e) => {
        e.preventDefault();
        const isNew = editingPart === 'new';
        const pn = partFormData.partNumber.trim().toUpperCase();

        if (!pn) {
            alert('Part Number is required.');
            return;
        }

        if (isNew && partsMap[pn]) {
            alert(`Part Number "${pn}" already exists in the master catalog.`);
            return;
        }

        const payload = {
            id: pn,
            partNumber: pn,
            name: partFormData.name.trim(),
            category: partFormData.category,
            unitCost: Number(partFormData.unitCost) || 0,
            minStockLevel: Number(partFormData.minStockLevel) || 0,
            status: partFormData.status,
            description: partFormData.description.trim(),
            preferredSupplier: partFormData.preferredSupplier.trim(),
            updatedAt: new Date().toISOString(),
            updatedBy: user?.name || user?.id || 'Admin'
        };

        if (isNew) {
            payload.createdAt = new Date().toISOString();
            payload.createdBy = user?.name || user?.id || 'Admin';
        }

        try {
            await setDoc(doc(db, 'baan_parts', pn), payload, { merge: true });

            await logAdminAction({
                actor: user,
                action: isNew ? AUDIT_ACTIONS.BAAN_PART_CREATED : AUDIT_ACTIONS.BAAN_PART_UPDATED,
                entity: 'baan_part',
                entityId: pn,
                previousValue: isNew ? null : editingPart,
                newValue: payload,
                reason: isNew ? 'Added new spare part to BAAN catalog' : 'Updated part specifications'
            });

            setEditingPart(null);
        } catch (err) {
            console.error('Failed to save BAAN part:', err);
            alert(`Error saving part: ${err.message}`);
        }
    };

    const handleOpenArchivePart = (part) => {
        setArchivingPart(part);
        setPartArchiveReason('');
    };

    const handleExecuteArchivePart = async () => {
        if (!archivingPart) return;
        if (!partArchiveReason.trim()) {
            alert('Operational reason required for audit trail.');
            return;
        }

        const pn = archivingPart.partNumber || archivingPart.id;

        try {
            const updatePayload = {
                status: 'Archived',
                archivedAt: new Date().toISOString(),
                archivedBy: user?.name || user?.id || 'Admin',
                archiveReason: partArchiveReason.trim()
            };

            await setDoc(doc(db, 'baan_parts', pn), updatePayload, { merge: true });

            await logAdminAction({
                actor: user,
                action: AUDIT_ACTIONS.BAAN_PART_ARCHIVED,
                entity: 'baan_part',
                entityId: pn,
                previousValue: { status: archivingPart.status },
                newValue: updatePayload,
                reason: partArchiveReason.trim()
            });

            setArchivingPart(null);
        } catch (err) {
            console.error('Failed to archive part:', err);
            alert(`Error archiving part: ${err.message}`);
        }
    };

    // ─── LOCATION CRUD ACTIONS ───
    const handleOpenCreateLoc = () => {
        setLocFormData({
            id: '',
            name: '',
            type: 'WAREHOUSE',
            capacity: 1000,
            status: 'Active',
            description: ''
        });
        setEditingLoc('new');
    };

    const handleOpenEditLoc = (locObj) => {
        setLocFormData({
            id: locObj.id,
            name: locObj.name || '',
            type: locObj.type || 'WAREHOUSE',
            capacity: locObj.capacity || 1000,
            status: locObj.status || 'Active',
            description: locObj.description || ''
        });
        setEditingLoc(locObj);
    };

    const handleSaveLoc = async (e) => {
        e.preventDefault();
        const isNew = editingLoc === 'new';
        let locId = locFormData.id.trim();

        if (isNew) {
            if (!locId) {
                locId = locFormData.name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
            }
            if (!locId) {
                alert('Location ID / Code is required.');
                return;
            }
            if (locationsMap[locId]) {
                alert(`Location "${locId}" already exists.`);
                return;
            }
        }

        const payload = {
            id: locId,
            name: locFormData.name.trim(),
            type: locFormData.type,
            capacity: Number(locFormData.capacity) || 1000,
            status: locFormData.status,
            description: locFormData.description.trim(),
            updatedAt: new Date().toISOString(),
            updatedBy: user?.name || user?.id || 'Admin'
        };

        if (isNew) {
            payload.createdAt = new Date().toISOString();
            payload.createdBy = user?.name || user?.id || 'Admin';
        }

        try {
            await setDoc(doc(db, 'baan_locations', locId), payload, { merge: true });

            await logAdminAction({
                actor: user,
                action: isNew ? AUDIT_ACTIONS.BAAN_LOCATION_CREATED : AUDIT_ACTIONS.BAAN_LOCATION_UPDATED,
                entity: 'baan_location',
                entityId: locId,
                previousValue: isNew ? null : editingLoc,
                newValue: payload,
                reason: isNew ? 'Created new inventory location' : 'Updated location parameters'
            });

            setEditingLoc(null);
        } catch (err) {
            console.error('Failed to save location:', err);
            alert(`Error saving location: ${err.message}`);
        }
    };

    const handleOpenArchiveLoc = (locObj) => {
        setArchivingLoc(locObj);
        setLocArchiveReason('');
    };

    const handleExecuteArchiveLoc = async () => {
        if (!archivingLoc) return;
        if (!locArchiveReason.trim()) {
            alert('Operational reason required for audit trail.');
            return;
        }

        try {
            const updatePayload = {
                status: 'Archived',
                archivedAt: new Date().toISOString(),
                archivedBy: user?.name || user?.id || 'Admin',
                archiveReason: locArchiveReason.trim()
            };

            await setDoc(doc(db, 'baan_locations', archivingLoc.id), updatePayload, { merge: true });

            await logAdminAction({
                actor: user,
                action: AUDIT_ACTIONS.BAAN_LOCATION_ARCHIVED,
                entity: 'baan_location',
                entityId: archivingLoc.id,
                previousValue: { status: archivingLoc.status },
                newValue: updatePayload,
                reason: locArchiveReason.trim()
            });

            setArchivingLoc(null);
        } catch (err) {
            console.error('Failed to archive location:', err);
            alert(`Error archiving location: ${err.message}`);
        }
    };

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '2.5rem' }}>
            {/* Top Navigation & Metrics Bar */}
            <div className="card mb-4" style={{ padding: '0.85rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="flex-center" style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'rgba(234, 88, 12, 0.12)', color: '#ea580c' }}>
                            <Database size={20} />
                        </div>
                        <div>
                            <h2 className="font-extrabold text-lg" style={{ margin: 0 }}>
                                BAAN Master Data & Warehouse Locations Studio
                            </h2>
                            <p className="text-muted text-xs" style={{ margin: 0 }}>
                                Centralized governance of spare parts catalog, unit costs, low-stock thresholds, and physical storage bins
                            </p>
                        </div>
                    </div>

                    {/* Sub-Tab Switcher */}
                    <div style={{ display: 'flex', gap: '0.35rem', background: 'var(--bg-main)', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
                        <button
                            className={`btn-ghost ${activeTab === 'parts' ? 'font-bold' : ''}`}
                            onClick={() => setActiveTab('parts')}
                            style={{
                                padding: '0.45rem 0.85rem',
                                fontSize: '0.8125rem',
                                borderRadius: 'var(--radius-sm)',
                                background: activeTab === 'parts' ? 'var(--bg-card)' : 'transparent',
                                color: activeTab === 'parts' ? 'var(--primary)' : 'var(--text-muted)',
                                boxShadow: activeTab === 'parts' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                            }}
                        >
                            <Package size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
                            Parts Catalog ({partsList.length})
                        </button>

                        <button
                            className={`btn-ghost ${activeTab === 'locations' ? 'font-bold' : ''}`}
                            onClick={() => setActiveTab('locations')}
                            style={{
                                padding: '0.45rem 0.85rem',
                                fontSize: '0.8125rem',
                                borderRadius: 'var(--radius-sm)',
                                background: activeTab === 'locations' ? 'var(--bg-card)' : 'transparent',
                                color: activeTab === 'locations' ? 'var(--primary)' : 'var(--text-muted)',
                                boxShadow: activeTab === 'locations' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                            }}
                        >
                            <MapPin size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
                            Locations ({locationsList.length})
                        </button>

                        <button
                            className={`btn-ghost ${activeTab === 'health' ? 'font-bold' : ''}`}
                            onClick={() => setActiveTab('health')}
                            style={{
                                padding: '0.45rem 0.85rem',
                                fontSize: '0.8125rem',
                                borderRadius: 'var(--radius-sm)',
                                background: activeTab === 'health' ? 'var(--bg-card)' : 'transparent',
                                color: activeTab === 'health' ? 'var(--error)' : 'var(--text-muted)',
                                boxShadow: activeTab === 'health' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                            }}
                        >
                            <AlertTriangle size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
                            Stock Alerts ({lowStockParts.length})
                        </button>
                    </div>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════ */}
            {/* TAB 1: SPARE PARTS MASTER CATALOG                             */}
            {/* ═════════════════════════════════════════════════════════════ */}
            {activeTab === 'parts' && (
                <div>
                    {/* Filter & Control Bar */}
                    <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                            <div style={{ flex: 1, minWidth: 260, position: 'relative' }}>
                                <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Search by part number, name, or category..."
                                    value={partSearch}
                                    onChange={(e) => setPartSearch(e.target.value)}
                                    style={{ paddingLeft: '2.2rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <select
                                    className="form-control"
                                    value={partCategoryFilter}
                                    onChange={(e) => setPartCategoryFilter(e.target.value)}
                                    style={{ padding: '0.4rem 0.65rem', fontSize: '0.75rem', width: 'auto' }}
                                >
                                    {categories.map(c => (
                                        <option key={c} value={c}>Category: {c}</option>
                                    ))}
                                </select>

                                <select
                                    className="form-control"
                                    value={partStatusFilter}
                                    onChange={(e) => setPartStatusFilter(e.target.value)}
                                    style={{ padding: '0.4rem 0.65rem', fontSize: '0.75rem', width: 'auto' }}
                                >
                                    <option value="ALL">All Statuses</option>
                                    <option value="Active">Active</option>
                                    <option value="Archived">Archived</option>
                                </select>

                                {canCreatePart && (
                                    <button className="btn btn-primary" onClick={handleOpenCreatePart} style={{ fontSize: '0.8125rem' }}>
                                        <Plus size={15} />
                                        <span>Add Spare Part</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Parts Grid */}
                    {filteredParts.length === 0 ? (
                        <div className="card p-8 text-center">
                            <Package size={36} style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }} />
                            <h3 className="font-bold text-base mb-1">No Parts Found</h3>
                            <p className="text-muted text-xs">Adjust your search or add a new spare part to the master catalog</p>
                        </div>
                    ) : (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '18px',
                            width: '100%'
                        }}>
                            {filteredParts.map(part => {
                                const pn = part.partNumber || part.id;
                                const isArchived = part.status === 'Archived';
                                const currentStock = stockByPart[pn] || 0;
                                const minStock = Number(part.minStockLevel) || 10;
                                const isLowStock = currentStock <= minStock && !isArchived;

                                return (
                                    <div
                                        key={pn}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            opacity: isArchived ? 0.75 : 1,
                                            border: isLowStock ? '1px solid var(--warning)' : '1px solid var(--border)',
                                            borderRadius: 'var(--radius-lg)',
                                            background: 'var(--bg-card)',
                                            boxShadow: 'var(--shadow-sm)',
                                            width: '100%',
                                            overflow: 'hidden',
                                            transition: 'box-shadow 0.2s ease, border-color 0.2s ease'
                                        }}
                                    >
                                        {/* Row 1: Code + Category + Name + Unit Cost + Stock Health + Status */}
                                        <div style={{
                                            padding: '0.75rem 1.25rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.65rem',
                                            flexWrap: 'wrap',
                                            borderBottom: '1px solid var(--border-light)'
                                        }}>
                                            <span style={{
                                                background: 'var(--bg-main)',
                                                border: '1px solid var(--border)',
                                                borderRadius: 'var(--radius-sm)',
                                                padding: '2px 6px',
                                                fontSize: '11px',
                                                fontFamily: 'monospace',
                                                fontWeight: 700,
                                                color: 'var(--primary)',
                                                flexShrink: 0
                                            }}>
                                                {pn}
                                            </span>
                                            <span className="status-pill info" style={{ fontSize: '10px', flexShrink: 0 }}>
                                                {part.category || 'General'}
                                            </span>
                                            <span className="font-extrabold text-base" style={{ color: 'var(--text-main)', letterSpacing: '-0.01em', minWidth: 120 }}>
                                                {part.name}
                                            </span>

                                            <div style={{ width: '1px', height: '14px', background: 'var(--border)', margin: '0 0.15rem', flexShrink: 0 }} />

                                            {/* Unit Cost Chip */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                background: 'var(--bg-main)',
                                                border: '1px solid var(--border-light)',
                                                borderRadius: 'var(--radius-sm)',
                                                padding: '2px 8px',
                                                fontSize: '0.7rem',
                                                flexShrink: 0
                                            }}>
                                                <span className="text-muted font-bold">Unit Cost:</span>
                                                <span className="font-extrabold" style={{ color: 'var(--primary)' }}>
                                                    ₹{Number(part.unitCost || 0).toLocaleString()}
                                                </span>
                                            </div>

                                            {/* Stock Health Chip */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                background: 'var(--bg-main)',
                                                border: '1px solid var(--border-light)',
                                                borderRadius: 'var(--radius-sm)',
                                                padding: '2px 8px',
                                                fontSize: '0.7rem',
                                                flexShrink: 0
                                            }}>
                                                <span className="text-muted font-bold">Stock:</span>
                                                <span className={`font-bold ${isLowStock ? 'text-warning' : 'text-success'}`}>
                                                    {currentStock} units
                                                </span>
                                                <span className="text-muted text-xs">
                                                    (min: {minStock})
                                                </span>
                                            </div>

                                            {/* Right-aligned tags */}
                                            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
                                                {isLowStock && (
                                                    <span className="status-pill warning" style={{ fontSize: '9px', padding: '2px 7px', fontWeight: 700 }}>
                                                        Low Stock Alert
                                                    </span>
                                                )}
                                                <span className={`status-pill ${isArchived ? 'default' : 'success'}`} style={{ fontSize: '10px', padding: '2px 8px', fontWeight: 700 }}>
                                                    {part.status || 'Active'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Row 2: Description + Actions */}
                                        <div style={{
                                            padding: '0.55rem 1.25rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '1rem',
                                            background: 'var(--bg-main)'
                                        }}>
                                            <p className="text-muted text-xs" style={{
                                                margin: 0,
                                                lineHeight: 1.5,
                                                flex: 1,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }} title={part.description}>
                                                {part.description || 'Standard manufacturing/rework replacement component.'}
                                            </p>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}>
                                                {canEditPart && (
                                                    <button
                                                        className="btn-ghost"
                                                        title="Edit Part Master"
                                                        onClick={() => handleOpenEditPart(part)}
                                                        style={{ padding: '0.3rem', borderRadius: 'var(--radius-sm)' }}
                                                    >
                                                        <Edit3 size={14} />
                                                    </button>
                                                )}

                                                {canArchivePart && !isArchived && (
                                                    <button
                                                        className="btn-ghost"
                                                        title="Archive Part"
                                                        onClick={() => handleOpenArchivePart(part)}
                                                        style={{ padding: '0.3rem', borderRadius: 'var(--radius-sm)', color: 'var(--error)' }}
                                                    >
                                                        <Archive size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════ */}
            {/* TAB 2: WAREHOUSE & INVENTORY LOCATIONS                        */}
            {/* ═════════════════════════════════════════════════════════════ */}
            {activeTab === 'locations' && (
                <div>
                    {/* Location Filters Bar */}
                    <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                            <div style={{ flex: 1, minWidth: 260, position: 'relative' }}>
                                <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Search locations by code or name..."
                                    value={locSearch}
                                    onChange={(e) => setLocSearch(e.target.value)}
                                    style={{ paddingLeft: '2.2rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <select
                                    className="form-control"
                                    value={locTypeFilter}
                                    onChange={(e) => setLocTypeFilter(e.target.value)}
                                    style={{ padding: '0.4rem 0.65rem', fontSize: '0.75rem', width: 'auto' }}
                                >
                                    <option value="ALL">All Types</option>
                                    <option value="WAREHOUSE">WAREHOUSE</option>
                                    <option value="SHOP_FLOOR">SHOP FLOOR</option>
                                    <option value="HOLD_RETURN">HOLD / RETURN</option>
                                    <option value="SCRAP_BIN">SCRAP BIN</option>
                                </select>

                                <select
                                    className="form-control"
                                    value={locStatusFilter}
                                    onChange={(e) => setLocStatusFilter(e.target.value)}
                                    style={{ padding: '0.4rem 0.65rem', fontSize: '0.75rem', width: 'auto' }}
                                >
                                    <option value="ALL">All Statuses</option>
                                    <option value="Active">Active</option>
                                    <option value="Archived">Archived</option>
                                </select>

                                {canCreateLoc && (
                                    <button className="btn btn-primary" onClick={handleOpenCreateLoc} style={{ fontSize: '0.8125rem' }}>
                                        <Plus size={15} />
                                        <span>Add Location</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Locations Grid */}
                    {filteredLocations.length === 0 ? (
                        <div className="card p-8 text-center">
                            <MapPin size={36} style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }} />
                            <h3 className="font-bold text-base mb-1">No Locations Found</h3>
                            <p className="text-muted text-xs">Define storage racks and warehouse bins for inventory allocation</p>
                        </div>
                    ) : (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '18px',
                            width: '100%'
                        }}>
                            {filteredLocations.map(locObj => {
                                const isArchived = locObj.status === 'Archived';

                                return (
                                    <div
                                        key={locObj.id}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            opacity: isArchived ? 0.75 : 1,
                                            border: '1px solid var(--border)',
                                            borderRadius: 'var(--radius-lg)',
                                            background: 'var(--bg-card)',
                                            boxShadow: 'var(--shadow-sm)',
                                            width: '100%',
                                            overflow: 'hidden',
                                            transition: 'box-shadow 0.2s ease, border-color 0.2s ease'
                                        }}
                                    >
                                        {/* Row 1: ID + Type + Name + Capacity + Status */}
                                        <div style={{
                                            padding: '0.75rem 1.25rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.65rem',
                                            flexWrap: 'wrap',
                                            borderBottom: '1px solid var(--border-light)'
                                        }}>
                                            <span style={{
                                                background: 'var(--bg-main)',
                                                border: '1px solid var(--border)',
                                                borderRadius: 'var(--radius-sm)',
                                                padding: '2px 6px',
                                                fontSize: '11px',
                                                fontFamily: 'monospace',
                                                fontWeight: 700,
                                                color: '#ea580c',
                                                flexShrink: 0
                                            }}>
                                                {locObj.id}
                                            </span>
                                            <span className="status-pill default" style={{ fontSize: '10px', flexShrink: 0 }}>
                                                {locObj.type || 'WAREHOUSE'}
                                            </span>
                                            <span className="font-extrabold text-base" style={{ color: 'var(--text-main)', letterSpacing: '-0.01em', minWidth: 120 }}>
                                                {locObj.name}
                                            </span>

                                            <div style={{ width: '1px', height: '14px', background: 'var(--border)', margin: '0 0.15rem', flexShrink: 0 }} />

                                            {/* Capacity Chip */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                background: 'var(--bg-main)',
                                                border: '1px solid var(--border-light)',
                                                borderRadius: 'var(--radius-sm)',
                                                padding: '2px 8px',
                                                fontSize: '0.7rem',
                                                flexShrink: 0
                                            }}>
                                                <span className="text-muted font-bold">Capacity:</span>
                                                <span className="font-bold">{locObj.capacity || 1000} units max</span>
                                            </div>

                                            {/* Right-aligned status */}
                                            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
                                                <span className={`status-pill ${isArchived ? 'default' : 'success'}`} style={{ fontSize: '10px', padding: '2px 8px', fontWeight: 700 }}>
                                                    {locObj.status || 'Active'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Row 2: Description + Actions */}
                                        <div style={{
                                            padding: '0.55rem 1.25rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '1rem',
                                            background: 'var(--bg-main)'
                                        }}>
                                            <p className="text-muted text-xs" style={{
                                                margin: 0,
                                                lineHeight: 1.5,
                                                flex: 1,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }} title={locObj.description}>
                                                {locObj.description || 'Inventory storage and batch staging location.'}
                                            </p>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}>
                                                {canEditLoc && (
                                                    <button
                                                        className="btn-ghost"
                                                        title="Edit Location"
                                                        onClick={() => handleOpenEditLoc(locObj)}
                                                        style={{ padding: '0.3rem', borderRadius: 'var(--radius-sm)' }}
                                                    >
                                                        <Edit3 size={14} />
                                                    </button>
                                                )}

                                                {canArchiveLoc && !isArchived && (
                                                    <button
                                                        className="btn-ghost"
                                                        title="Archive Location"
                                                        onClick={() => handleOpenArchiveLoc(locObj)}
                                                        style={{ padding: '0.3rem', borderRadius: 'var(--radius-sm)', color: 'var(--error)' }}
                                                    >
                                                        <Archive size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════ */}
            {/* TAB 3: STOCK HEALTH & THRESHOLD ALERTS                        */}
            {/* ═════════════════════════════════════════════════════════════ */}
            {activeTab === 'health' && (
                <div>
                    <div className="card mb-4" style={{ padding: '1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                            <div>
                                <h3 className="font-extrabold text-base" style={{ margin: 0, color: 'var(--error)' }}>
                                    Critical Depleted & Low Stock Monitor
                                </h3>
                                <p className="text-muted text-xs" style={{ margin: 0 }}>
                                    Parts currently at or below their configured minimum threshold ({lowStockParts.length} flagged)
                                </p>
                            </div>
                        </div>
                    </div>

                    {lowStockParts.length === 0 ? (
                        <div className="card p-8 text-center">
                            <CheckCircle2 size={36} style={{ margin: '0 auto 1rem', color: 'var(--success)' }} />
                            <h3 className="font-bold text-base mb-1">Stock Health is Optimal</h3>
                            <p className="text-muted text-xs">All active master parts are currently above minimum threshold reserves</p>
                        </div>
                    ) : (
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: '11px', color: 'var(--text-muted)' }}>
                                        <th style={{ padding: '0.75rem 1rem' }}>PART NUMBER</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>NAME & CATEGORY</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>AVAILABLE QTY</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>MIN THRESHOLD</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>DEFICIT</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>ACTION</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lowStockParts.map(part => {
                                        const pn = part.partNumber || part.id;
                                        const available = stockByPart[pn] || 0;
                                        const min = Number(part.minStockLevel) || 10;
                                        const deficit = Math.max(0, min - available);

                                        return (
                                            <tr key={pn} style={{ borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                                                <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700 }}>
                                                    {pn}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem' }}>
                                                    <div className="font-bold">{part.name}</div>
                                                    <span className="text-muted text-xs">{part.category || 'General'}</span>
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: available === 0 ? 'var(--error)' : 'var(--warning)' }}>
                                                    {available} units
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem' }}>
                                                    {min} units
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', color: 'var(--error)', fontWeight: 700 }}>
                                                    -{deficit} units
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                                    {canEditPart && (
                                                        <button
                                                            className="btn-ghost text-xs font-bold"
                                                            onClick={() => handleOpenEditPart(part)}
                                                            style={{ color: 'var(--primary)' }}
                                                        >
                                                            Edit Threshold
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ─── MODAL: CREATE / EDIT PART ─── */}
            {editingPart && (
                <div className="modal-overlay" onClick={() => setEditingPart(null)}>
                    <div className="card modal-box animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Package size={20} color="var(--primary)" />
                                <h3 className="font-extrabold text-lg" style={{ margin: 0 }}>
                                    {editingPart === 'new' ? 'Add Spare Part to Master Catalog' : 'Edit Part Specifications'}
                                </h3>
                            </div>
                            <button className="btn-ghost" onClick={() => setEditingPart(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSavePart}>
                            <div className="form-row">
                                <div>
                                    <label className="form-label text-xs font-bold">Part Number (PN) *</label>
                                    <input
                                        type="text"
                                        className="form-control font-mono"
                                        required
                                        disabled={editingPart !== 'new'}
                                        placeholder="e.g. PN-DISP-001"
                                        value={partFormData.partNumber}
                                        onChange={(e) => setPartFormData(p => ({ ...p, partNumber: e.target.value.toUpperCase() }))}
                                    />
                                </div>
                                <div>
                                    <label className="form-label text-xs font-bold">Category *</label>
                                    <select
                                        className="form-control"
                                        value={partFormData.category}
                                        onChange={(e) => setPartFormData(p => ({ ...p, category: e.target.value }))}
                                    >
                                        <option value="General">General</option>
                                        <option value="Display">Display</option>
                                        <option value="PCB">PCB / Mainboard</option>
                                        <option value="Casing">Casing & Plastics</option>
                                        <option value="Battery">Battery</option>
                                        <option value="Cables">Cables & Connectors</option>
                                        <option value="Fasteners">Fasteners & Screws</option>
                                        <option value="Packaging">Packaging</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label className="form-label text-xs font-bold">Part Display Name *</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    required
                                    placeholder="e.g. Pax A920 LCD Display Touch Assembly"
                                    value={partFormData.name}
                                    onChange={(e) => setPartFormData(p => ({ ...p, name: e.target.value }))}
                                />
                            </div>

                            <div className="form-row">
                                <div>
                                    <label className="form-label text-xs font-bold">Standard Unit Cost (₹) *</label>
                                    <input
                                        type="number"
                                        className="form-control"
                                        required
                                        min={0}
                                        step="0.01"
                                        value={partFormData.unitCost}
                                        onChange={(e) => setPartFormData(p => ({ ...p, unitCost: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="form-label text-xs font-bold">Min Stock Alert Threshold *</label>
                                    <input
                                        type="number"
                                        className="form-control"
                                        required
                                        min={0}
                                        value={partFormData.minStockLevel}
                                        onChange={(e) => setPartFormData(p => ({ ...p, minStockLevel: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div>
                                    <label className="form-label text-xs font-bold">Preferred Supplier</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="e.g. Foxconn, OEM"
                                        value={partFormData.preferredSupplier}
                                        onChange={(e) => setPartFormData(p => ({ ...p, preferredSupplier: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="form-label text-xs font-bold">Status *</label>
                                    <select
                                        className="form-control"
                                        value={partFormData.status}
                                        onChange={(e) => setPartFormData(p => ({ ...p, status: e.target.value }))}
                                    >
                                        <option value="Active">Active</option>
                                        <option value="Archived">Archived</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginBottom: 0 }}>
                                <label className="form-label text-xs font-bold">Description / Technical Notes</label>
                                <textarea
                                    className="form-control"
                                    rows={2}
                                    placeholder="Component revisions, compatibility, pinout..."
                                    value={partFormData.description}
                                    onChange={(e) => setPartFormData(p => ({ ...p, description: e.target.value }))}
                                />
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setEditingPart(null)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingPart === 'new' ? 'Add Part' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── MODAL: ARCHIVE PART ─── */}
            {archivingPart && (
                <div className="modal-overlay" onClick={() => setArchivingPart(null)}>
                    <div className="card modal-box animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', color: 'var(--error)' }}>
                            <Archive size={24} />
                            <h3 className="font-extrabold text-lg" style={{ margin: 0 }}>
                                Archive Spare Part
                            </h3>
                        </div>

                        <p className="text-muted text-xs mb-3" style={{ lineHeight: 1.6 }}>
                            Are you sure you want to archive <strong>{archivingPart.name}</strong> ({archivingPart.partNumber || archivingPart.id})?
                            Archiving deactivates future part requests while fully protecting and maintaining all historical rework logs.
                        </p>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <label className="form-label text-xs font-bold">Operational Reason *</label>
                            <textarea
                                className="form-control"
                                rows={3}
                                required
                                placeholder="State reason for audit compliance log..."
                                value={partArchiveReason}
                                onChange={(e) => setPartArchiveReason(e.target.value)}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setArchivingPart(null)}>
                                Cancel
                            </button>
                            <button type="button" className="btn btn-error" onClick={handleExecuteArchivePart}>
                                Confirm Archive
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── MODAL: CREATE / EDIT LOCATION ─── */}
            {editingLoc && (
                <div className="modal-overlay" onClick={() => setEditingLoc(null)}>
                    <div className="card modal-box animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <MapPin size={20} color="#ea580c" />
                                <h3 className="font-extrabold text-lg" style={{ margin: 0 }}>
                                    {editingLoc === 'new' ? 'Add Inventory Location' : 'Edit Location'}
                                </h3>
                            </div>
                            <button className="btn-ghost" onClick={() => setEditingLoc(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveLoc}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                <div>
                                    <label className="form-label text-xs font-bold">Location Code / ID *</label>
                                    <input
                                        type="text"
                                        className="form-control font-mono"
                                        required
                                        disabled={editingLoc !== 'new'}
                                        placeholder="e.g. LOC-BIN-12"
                                        value={locFormData.id}
                                        onChange={(e) => setLocFormData(p => ({ ...p, id: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="form-label text-xs font-bold">Location Type *</label>
                                    <select
                                        className="form-control"
                                        value={locFormData.type}
                                        onChange={(e) => setLocFormData(p => ({ ...p, type: e.target.value }))}
                                    >
                                        <option value="WAREHOUSE">WAREHOUSE</option>
                                        <option value="SHOP_FLOOR">SHOP FLOOR</option>
                                        <option value="HOLD_RETURN">HOLD / RETURN</option>
                                        <option value="SCRAP_BIN">SCRAP BIN</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginBottom: '0.75rem' }}>
                                <label className="form-label text-xs font-bold">Location Name *</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    required
                                    placeholder="e.g. Main Store Rack 3 Shelf B"
                                    value={locFormData.name}
                                    onChange={(e) => setLocFormData(p => ({ ...p, name: e.target.value }))}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                <div>
                                    <label className="form-label text-xs font-bold">Capacity (Units)</label>
                                    <input
                                        type="number"
                                        className="form-control"
                                        min={1}
                                        value={locFormData.capacity}
                                        onChange={(e) => setLocFormData(p => ({ ...p, capacity: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="form-label text-xs font-bold">Status *</label>
                                    <select
                                        className="form-control"
                                        value={locFormData.status}
                                        onChange={(e) => setLocFormData(p => ({ ...p, status: e.target.value }))}
                                    >
                                        <option value="Active">Active</option>
                                        <option value="Archived">Archived</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginBottom: '1.25rem' }}>
                                <label className="form-label text-xs font-bold">Description</label>
                                <textarea
                                    className="form-control"
                                    rows={2}
                                    placeholder="Location accessibility, security zone..."
                                    value={locFormData.description}
                                    onChange={(e) => setLocFormData(p => ({ ...p, description: e.target.value }))}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setEditingLoc(null)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingLoc === 'new' ? 'Add Location' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── MODAL: ARCHIVE LOCATION ─── */}
            {archivingLoc && (
                <div className="modal-overlay" onClick={() => setArchivingLoc(null)}>
                    <div className="card modal-box animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', color: 'var(--error)' }}>
                            <Archive size={24} />
                            <h3 className="font-extrabold text-lg" style={{ margin: 0 }}>
                                Archive Location
                            </h3>
                        </div>

                        <p className="text-muted text-xs mb-3" style={{ lineHeight: 1.6 }}>
                            Are you sure you want to archive <strong>{archivingLoc.name}</strong>?
                            Archiving deactivates this bin for future inwards while preserving all historical movement logs.
                        </p>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <label className="form-label text-xs font-bold">Operational Reason *</label>
                            <textarea
                                className="form-control"
                                rows={3}
                                required
                                placeholder="State reason for audit log..."
                                value={locArchiveReason}
                                onChange={(e) => setLocArchiveReason(e.target.value)}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setArchivingLoc(null)}>
                                Cancel
                            </button>
                            <button type="button" className="btn btn-error" onClick={handleExecuteArchiveLoc}>
                                Confirm Archive
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BaanMasterStudio;
