import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
    LayoutDashboard,
    MapPin,
    Package,
    PlusCircle,
    Plus,
    X,
    ClipboardList,
    Send,
    History,
    FileBarChart,
    Search,
    AlertTriangle,
    CheckCircle2,
    ArrowRight,
    TrendingUp,
    RotateCcw,
    Clock,
    User,
    ShieldCheck,
    ChevronRight,
    Loader2,
    Database,
    Tag,
    Calendar,
    ArrowUpRight,
    ArrowDownRight,
    Filter,
    Minus,
    Printer,
    DollarSign,
    Layers,
    FileSpreadsheet,
    AlertCircle,
    Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCQA } from '../hooks/useCQA';
import BaanBulkInward from './BaanBulkInward';

// ─── Sub-Components ───

const BaanDashboard = ({ onNavigate }) => {
    const { store } = useCQA();
    const baan = store.baan;

    const stats = useMemo(() => {
        const totalParts = Object.keys(baan.parts || {}).length;
        let totalStockUnits = 0;
        let totalStockValue = 0;
        let lowStockCount = 0;

        // Group stock by part to compare with minimumStockLevel accurately
        const partStockMap = {};
        Object.values(baan.batches || {}).forEach(b => {
            const qty = Number(b.quantityAvailable) || 0;
            const cost = Number(b.perUnitCost) || 0;
            totalStockUnits += qty;
            totalStockValue += qty * cost;
            partStockMap[b.partNumber] = (partStockMap[b.partNumber] || 0) + qty;
        });

        Object.keys(baan.parts || {}).forEach(pn => {
            const min = Number(baan.parts[pn]?.minimumStockLevel) || 10;
            const currentStock = partStockMap[pn] || 0;
            if (currentStock <= min) {
                lowStockCount++;
            }
        });

        const pendingReq = Object.values(baan.partRequests || {}).filter(r => r.status === 'Requested').length;

        const today = new Date().toISOString().split('T')[0];
        const issuedToday = Object.values(baan.partIssuance || {}).filter(i => i.issuedAt && i.issuedAt.startsWith(today)).length;

        return { totalParts, totalStockUnits, totalStockValue, lowStock: lowStockCount, pendingReq, issuedToday };
    }, [baan]);

    const [searchTerm, setSearchTerm] = useState('');
    const [searchLocation, setSearchLocation] = useState('ALL');

    const locationsList = useMemo(() => {
        return Object.values(baan.locations || {});
    }, [baan.locations]);

    const searchResults = useMemo(() => {
        if (!searchTerm && searchLocation === 'ALL') return [];
        const term = searchTerm.trim().toUpperCase();
        return Object.values(baan.batches || {})
            .filter(b => {
                const matchesTerm = !term || (b.partNumber && b.partNumber.includes(term)) || (b.partName && b.partName.toUpperCase().includes(term));
                const matchesLoc = searchLocation === 'ALL' || b.location === searchLocation;
                return matchesTerm && matchesLoc;
            })
            .sort((a, b) => new Date(a.inwardDate) - new Date(b.inwardDate));
    }, [searchTerm, searchLocation, baan.batches]);

    const pendingRequests = useMemo(() => {
        return Object.values(baan.partRequests || {})
            .filter(r => r.status === 'Requested')
            .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))
            .slice(0, 5);
    }, [baan.partRequests]);

    const lowStockItems = useMemo(() => {
        const snapshot = {};
        Object.values(baan.batches || {}).forEach(b => {
            if (!snapshot[b.partNumber]) {
                snapshot[b.partNumber] = {
                    partNumber: b.partNumber,
                    partName: b.partName,
                    location: b.location,
                    stock: 0,
                    minStock: Number(baan.parts?.[b.partNumber]?.minimumStockLevel || 10)
                };
            }
            snapshot[b.partNumber].stock += Number(b.quantityAvailable);
        });
        return Object.values(snapshot).filter(p => p.stock <= p.minStock).slice(0, 5);
    }, [baan.batches, baan.parts]);

    const inventorySnapshot = useMemo(() => {
        const snapshot = {};
        Object.values(baan.batches || {}).forEach(b => {
            if (!snapshot[b.partNumber]) {
                snapshot[b.partNumber] = {
                    partNumber: b.partNumber,
                    partName: b.partName,
                    location: b.location,
                    stock: 0,
                    minStock: Number(baan.parts?.[b.partNumber]?.minimumStockLevel || 10)
                };
            }
            snapshot[b.partNumber].stock += Number(b.quantityAvailable);
        });
        return Object.values(snapshot).slice(0, 8);
    }, [baan.batches, baan.parts]);

    return (
        <div className="animate-fade-in">
            {/* KPI Cards Row */}
            <div className="baan-kpi-grid">
                <div className="baan-kpi-card" onClick={() => onNavigate('inventory')}>
                    <div>
                        <div className="baan-kpi-label">Total Unique Parts</div>
                        <div className="baan-kpi-value">{stats.totalParts}</div>
                        <div className="text-xs text-muted" style={{ marginTop: '0.25rem' }}>{stats.totalStockUnits.toLocaleString()} total units</div>
                    </div>
                    <div className="baan-kpi-icon-box" style={{ background: 'var(--baan-accent-alpha)', color: 'var(--baan-accent)' }}>
                        <Package size={22} />
                    </div>
                </div>

                <div className="baan-kpi-card" onClick={() => onNavigate('inventory')}>
                    <div>
                        <div className="baan-kpi-label">Low Stock Alerts</div>
                        <div className="baan-kpi-value" style={{ color: stats.lowStock > 0 ? 'var(--baan-danger)' : 'var(--baan-text-primary)' }}>
                            {stats.lowStock}
                        </div>
                        <div className="text-xs text-muted" style={{ marginTop: '0.25rem' }}>Below reorder point</div>
                    </div>
                    <div className="baan-kpi-icon-box" style={{ background: stats.lowStock > 0 ? 'var(--baan-danger-bg)' : 'var(--baan-surface-muted)', color: stats.lowStock > 0 ? 'var(--baan-danger)' : 'var(--baan-text-muted)' }}>
                        <AlertTriangle size={22} />
                    </div>
                </div>

                <div className="baan-kpi-card" onClick={() => onNavigate('issuance')}>
                    <div>
                        <div className="baan-kpi-label">Pending Requests</div>
                        <div className="baan-kpi-value" style={{ color: stats.pendingReq > 0 ? 'var(--baan-warning)' : 'var(--baan-text-primary)' }}>
                            {stats.pendingReq}
                        </div>
                        <div className="text-xs text-muted" style={{ marginTop: '0.25rem' }}>Awaiting store issuance</div>
                    </div>
                    <div className="baan-kpi-icon-box" style={{ background: 'var(--baan-warning-bg)', color: 'var(--baan-warning)' }}>
                        <ClipboardList size={22} />
                    </div>
                </div>

                <div className="baan-kpi-card" onClick={() => onNavigate('issuance_history')}>
                    <div>
                        <div className="baan-kpi-label">Issued Today</div>
                        <div className="baan-kpi-value" style={{ color: 'var(--baan-success)' }}>
                            {stats.issuedToday}
                        </div>
                        <div className="text-xs text-muted" style={{ marginTop: '0.25rem' }}>Material movements</div>
                    </div>
                    <div className="baan-kpi-icon-box" style={{ background: 'var(--baan-success-bg)', color: 'var(--baan-success)' }}>
                        <Send size={22} />
                    </div>
                </div>

                <div className="baan-kpi-card" onClick={() => onNavigate('analytics')}>
                    <div>
                        <div className="baan-kpi-label">Inventory Valuation</div>
                        <div className="baan-kpi-value" style={{ fontSize: '1.25rem' }}>
                            ₹{stats.totalStockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-xs text-muted" style={{ marginTop: '0.25rem' }}>Total batch asset value</div>
                    </div>
                    <div className="baan-kpi-icon-box" style={{ background: 'var(--baan-info-bg)', color: 'var(--baan-info)' }}>
                        <DollarSign size={22} />
                    </div>
                </div>
            </div>

            {/* Quick Part Search with Location Filter */}
            <div className="baan-card">
                <div className="baan-card-body" style={{ padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--baan-text-muted)' }} />
                            <input
                                type="text"
                                placeholder="Search by Part Number or Name..."
                                className="font-bold text-mono"
                                style={{
                                    width: '100%',
                                    height: 44,
                                    paddingLeft: '2.85rem',
                                    paddingRight: '1rem',
                                    background: 'var(--baan-surface-muted)',
                                    border: '1px solid var(--baan-border)',
                                    borderRadius: 'var(--baan-radius-sm)',
                                    color: 'var(--baan-text-primary)'
                                }}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select
                            style={{
                                height: 44,
                                padding: '0 1rem',
                                background: 'var(--baan-surface-muted)',
                                border: '1px solid var(--baan-border)',
                                borderRadius: 'var(--baan-radius-sm)',
                                color: 'var(--baan-text-primary)',
                                fontWeight: 600,
                                fontSize: '0.8125rem'
                            }}
                            value={searchLocation}
                            onChange={e => setSearchLocation(e.target.value)}
                        >
                            <option value="ALL">All Locations</option>
                            {locationsList.map(loc => (
                                <option key={loc.id} value={loc.name}>{loc.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Live Search Results */}
                    {searchResults.length > 0 && (
                        <div className="baan-table-wrapper" style={{ marginTop: '1rem', maxHeight: '280px', overflowY: 'auto' }}>
                            <table className="baan-table">
                                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                    <tr>
                                        <th>Part Number</th>
                                        <th>Part Name</th>
                                        <th>Location</th>
                                        <th>Batch Number</th>
                                        <th className="num-col">Available Stock</th>
                                        <th className="num-col">PPU (₹)</th>
                                        <th>Batch Age</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {searchResults.map(b => (
                                        <tr key={b.id}>
                                            <td className="text-mono font-bold" style={{ color: 'var(--baan-accent)' }}>{b.partNumber}</td>
                                            <td className="font-semibold">{b.partName}</td>
                                            <td><span className="baan-badge neutral">📍 {b.location}</span></td>
                                            <td className="text-mono text-xs">{b.batchNumber || b.id}</td>
                                            <td className="num-col">
                                                <span className={`font-bold ${b.quantityAvailable < 10 ? 'text-error' : ''}`}>
                                                    {b.quantityAvailable}
                                                </span>
                                            </td>
                                            <td className="num-col">₹{Number(b.perUnitCost || 0).toFixed(2)}</td>
                                            <td className="text-xs text-muted">
                                                <div className="flex-center gap-1" style={{ justifyContent: 'flex-start' }}>
                                                    <Clock size={12} />
                                                    {Math.floor((new Date() - new Date(b.inwardDate)) / (1000 * 60 * 60 * 24))} Days
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Operational Action Panels */}
            <div className="grid md-grid-2 gap-4">
                {/* Left Panel: Attention Required (Low Stock) */}
                <div className="baan-card">
                    <div className="baan-card-header">
                        <div className="baan-card-title">
                            <AlertTriangle size={16} style={{ color: stats.lowStock > 0 ? 'var(--baan-danger)' : 'var(--baan-warning)' }} />
                            Attention Required — Low Stock ({lowStockItems.length})
                        </div>
                        <button className="baan-btn secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => onNavigate('inventory')}>
                            View Inventory
                        </button>
                    </div>
                    <div className="baan-table-wrapper" style={{ border: 'none' }}>
                        <table className="baan-table">
                            <thead>
                                <tr>
                                    <th>Part Number</th>
                                    <th>Part Name</th>
                                    <th>Location</th>
                                    <th className="num-col">Current</th>
                                    <th className="num-col">Min</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lowStockItems.map(item => (
                                    <tr key={item.partNumber}>
                                        <td className="text-mono font-bold text-xs" style={{ color: 'var(--baan-accent)' }}>{item.partNumber}</td>
                                        <td className="text-xs font-semibold">{item.partName}</td>
                                        <td><span className="baan-badge neutral" style={{ fontSize: '0.65rem' }}>{item.location}</span></td>
                                        <td className="num-col font-bold text-xs" style={{ color: 'var(--baan-danger)' }}>{item.stock}</td>
                                        <td className="num-col text-xs text-muted">{item.minStock}</td>
                                        <td>
                                            <span className="baan-badge danger">Low Stock</span>
                                        </td>
                                    </tr>
                                ))}
                                {lowStockItems.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="text-center text-muted py-6" style={{ textAlign: 'center' }}>
                                            <CheckCircle2 size={24} style={{ color: 'var(--baan-success)', margin: '0 auto 0.5rem' }} />
                                            <div>All inventory levels are healthy!</div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Panel: Pending Request Queue */}
                <div className="baan-card">
                    <div className="baan-card-header">
                        <div className="baan-card-title">
                            <ClipboardList size={16} style={{ color: 'var(--baan-warning)' }} />
                            Store Issue Queue ({pendingRequests.length})
                        </div>
                        <button className="baan-btn secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => onNavigate('issuance')}>
                            Open Issuance
                        </button>
                    </div>
                    <div className="baan-table-wrapper" style={{ border: 'none' }}>
                        <table className="baan-table">
                            <thead>
                                <tr>
                                    <th>Request ID</th>
                                    <th>Part</th>
                                    <th className="num-col">Qty</th>
                                    <th>Requested By</th>
                                    <th style={{ textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingRequests.map(r => (
                                    <tr key={r.id}>
                                        <td className="text-mono font-bold text-xs">{r.id}</td>
                                        <td className="text-xs font-semibold">
                                            {r.parts?.length > 0
                                                ? `${r.parts[0].partNumber}${r.parts.length > 1 ? ` +${r.parts.length - 1}` : ''}`
                                                : r.partNo || r.partNumber || '—'}
                                        </td>
                                        <td className="num-col text-xs font-bold">
                                            {r.parts?.reduce((a, b) => a + Number(b.quantityRequested), 0) || r.requestedQty || 0}
                                        </td>
                                        <td className="text-xs text-muted">{r.requestedBy}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button 
                                                className="baan-btn primary" 
                                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }} 
                                                onClick={() => onNavigate('issuance', { requestId: r.id })}
                                            >
                                                Issue
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {pendingRequests.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="text-center text-muted py-6" style={{ textAlign: 'center' }}>
                                            <CheckCircle2 size={24} style={{ color: 'var(--baan-success)', margin: '0 auto 0.5rem' }} />
                                            <div>No pending part requests</div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

const BaanLocations = () => {
    const { store, createBaanLocation } = useCQA();
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', code: '', description: '' });

    const locations = Object.values(store.baan?.locations || {});

    // Compute parts and total units per location
    const locationStats = useMemo(() => {
        const stats = {};
        Object.values(store.baan?.batches || {}).forEach(b => {
            if (!b.location) return;
            if (!stats[b.location]) {
                stats[b.location] = { uniqueParts: new Set(), totalUnits: 0 };
            }
            stats[b.location].uniqueParts.add(b.partNumber);
            stats[b.location].totalUnits += Number(b.quantityAvailable || 0);
        });
        return stats;
    }, [store.baan?.batches]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const user = JSON.parse(localStorage.getItem('cqa_user') || '{}');
            await createBaanLocation({ 
                ...formData, 
                createdBy: user.name || user.id || 'System' 
            });
            setFormData({ name: '', code: '', description: '' });
            setShowForm(false);
        } catch (error) {
            console.error("Error creating location:", error);
            alert("Failed to save location. Check your connection or try again.");
        }
    };

    return (
        <div className="animate-fade-in">
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
                <div>
                    <h2 className="baan-title" style={{ fontSize: '1.25rem' }}>Warehouse & Rack Locations</h2>
                    <p className="baan-subtitle">Organize and track part bin storage across your production facility</p>
                </div>
                <button className="baan-btn primary" onClick={() => setShowForm(!showForm)}>
                    {showForm ? <><X size={15} /> Close Form</> : <><PlusCircle size={15} /> Add New Location</>}
                </button>
            </div>

            {showForm && (
                <div className="baan-card animate-fade-in">
                    <div className="baan-card-header">
                        <div className="baan-card-title">
                            <PlusCircle size={16} style={{ color: 'var(--baan-accent)' }} /> Add Storage Location
                        </div>
                    </div>
                    <form className="baan-card-body" onSubmit={handleSubmit}>
                        <div className="grid md-grid-3 gap-4">
                            <div className="baan-input-group">
                                <label>Location Name *</label>
                                <input required placeholder="e.g. Rack A - Top Bin" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div className="baan-input-group">
                                <label>Location Code *</label>
                                <input required placeholder="e.g. R-A-01" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })} />
                            </div>
                            <div className="baan-input-group">
                                <label>Description (Optional)</label>
                                <input placeholder="e.g. SMD components storage" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                            </div>
                        </div>
                        <div className="flex-end" style={{ marginTop: '1rem' }}>
                            <button type="submit" className="baan-btn primary">
                                <CheckCircle2 size={15} /> Save Location
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="baan-table-wrapper">
                <table className="baan-table">
                    <thead>
                        <tr>
                            <th>Location Name</th>
                            <th>Code</th>
                            <th>Description</th>
                            <th className="num-col">Stored Parts</th>
                            <th className="num-col">Total Units</th>
                            <th>Created By</th>
                            <th>Created Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {locations.map(loc => {
                            const stat = locationStats[loc.name] || { uniqueParts: new Set(), totalUnits: 0 };
                            return (
                                <tr key={loc.id}>
                                    <td className="font-bold">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <MapPin size={14} style={{ color: 'var(--baan-accent)' }} />
                                            {loc.name}
                                        </div>
                                    </td>
                                    <td><span className="baan-badge neutral text-mono">{loc.code}</span></td>
                                    <td className="text-muted">{loc.description || '—'}</td>
                                    <td className="num-col font-bold">{stat.uniqueParts.size} SKUs</td>
                                    <td className="num-col font-bold" style={{ color: 'var(--baan-accent)' }}>{stat.totalUnits.toLocaleString()}</td>
                                    <td className="text-xs text-muted">{loc.createdBy}</td>
                                    <td className="text-xs text-muted">{loc.createdAt ? new Date(loc.createdAt).toLocaleDateString() : '—'}</td>
                                </tr>
                            );
                        })}
                        {locations.length === 0 && (
                            <tr>
                                <td colSpan="7" className="text-center text-muted py-6" style={{ textAlign: 'center' }}>
                                    No warehouse locations configured yet. Click "Add New Location" to create one.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const BaanInward = () => {
    const [activeTab, setActiveTab] = useState('manual');

    return (
        <div className="animate-fade-in">
            {/* Sub-tab switcher */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <button 
                    className={`baan-btn ${activeTab === 'manual' ? 'primary' : 'secondary'}`}
                    onClick={() => setActiveTab('manual')}
                >
                    <PlusCircle size={15} /> Manual Single Entry
                </button>
                <button 
                    className={`baan-btn ${activeTab === 'bulk' ? 'primary' : 'secondary'}`}
                    onClick={() => setActiveTab('bulk')}
                >
                    <FileSpreadsheet size={15} /> Bulk Upload (Excel / CSV)
                </button>
            </div>

            {activeTab === 'manual' && <BaanManualInward />}
            {activeTab === 'bulk' && <BaanBulkInward />}
        </div>
    );
};

const BaanManualInward = () => {
    const { store, inwardBaanParts } = useCQA();
    const [formData, setFormData] = useState({
        partNumber: '',
        partName: '',
        location: '',
        batchId: '',
        quantity: '',
        reference: '',
        remarks: '',
        perUnitCost: '',
        uom: 'Nos',
        mpn: '',
        invoiceOrDcNumber: '',
        minimumStockLevel: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [statusBanner, setStatusBanner] = useState(null);

    const locations = Object.values(store.baan?.locations || {});

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setStatusBanner(null);
        try {
            const user = JSON.parse(localStorage.getItem('cqa_user') || '{}');
            const res = await inwardBaanParts(formData, user);
            if (res.success) {
                setFormData({ 
                    partNumber: '', 
                    partName: '', 
                    location: '', 
                    batchId: '', 
                    quantity: '', 
                    reference: '', 
                    remarks: '', 
                    perUnitCost: '', 
                    uom: 'Nos', 
                    mpn: '', 
                    invoiceOrDcNumber: '', 
                    minimumStockLevel: '' 
                });
                setStatusBanner({ type: 'success', message: `Stock inwarded successfully! Batch allocated to ${formData.partNumber || 'inventory'}.` });
                setTimeout(() => setStatusBanner(null), 6000);
            } else {
                setStatusBanner({ type: 'error', message: res.message || 'Failed to inward parts.' });
            }
        } catch (err) {
            console.error(err);
            setStatusBanner({ type: 'error', message: 'A network error occurred while submitting stock entry.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="animate-fade-in">
            <div className="flex-between" style={{ marginBottom: '0.875rem' }}>
                <div>
                    <h2 className="baan-title" style={{ fontSize: '1.25rem' }}>Manual Stock Entry</h2>
                    <p className="baan-subtitle">Direct GRN / Vendor shipment inward with batch and FIFO tracking</p>
                </div>
            </div>

            {statusBanner && (
                <div className="baan-card" style={{ 
                    padding: '0.75rem 1rem', 
                    marginBottom: '0.875rem',
                    borderLeft: `4px solid ${statusBanner.type === 'error' ? 'var(--baan-danger)' : 'var(--baan-success)'}`,
                    background: statusBanner.type === 'error' ? 'var(--baan-danger-bg)' : 'var(--baan-success-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                }}>
                    {statusBanner.type === 'error' ? <AlertCircle size={18} style={{ color: 'var(--baan-danger)' }} /> : <CheckCircle2 size={18} style={{ color: 'var(--baan-success)' }} />}
                    <span className="text-sm font-bold">{statusBanner.message}</span>
                </div>
            )}

            <form onSubmit={handleSubmit}>
                {/* Section A: Part & Storage Information */}
                <div className="baan-form-section">
                    <div className="baan-form-section-title">
                        <Package size={14} /> Part & Storage Information
                    </div>
                    {/* Row 1: Part No, Part Name, MPN */}
                    <div className="baan-row-3" style={{ marginBottom: '0.65rem' }}>
                        <div className="baan-input-group">
                            <label>Internal Part Number *</label>
                            <input required placeholder="e.g. PN-001" value={formData.partNumber} onChange={e => setFormData({ ...formData, partNumber: e.target.value.toUpperCase() })} />
                        </div>
                        <div className="baan-input-group">
                            <label>Part Name / Description *</label>
                            <input required placeholder="e.g. Lithium Battery 5000mAh" value={formData.partName} onChange={e => setFormData({ ...formData, partName: e.target.value })} />
                        </div>
                        <div className="baan-input-group">
                            <label>Manufacturer Part Number (MPN)</label>
                            <input placeholder="e.g. LITH-500-MAX" value={formData.mpn} onChange={e => setFormData({ ...formData, mpn: e.target.value })} />
                        </div>
                    </div>

                    {/* Row 2: Location, Quantity, UOM, Batch ID */}
                    <div className="baan-row-4">
                        <div className="baan-input-group">
                            <label>Storage Location *</label>
                            <select required value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })}>
                                <option value="">-- Select Storage Location --</option>
                                {locations.map(loc => <option key={loc.id} value={loc.name}>{loc.name}</option>)}
                            </select>
                        </div>
                        <div className="baan-input-group">
                            <label>Quantity Added *</label>
                            <input required type="number" min="1" placeholder="0" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: e.target.value })} />
                        </div>
                        <div className="baan-input-group">
                            <label>Unit of Measure (UOM) *</label>
                            <select required value={formData.uom} onChange={e => setFormData({ ...formData, uom: e.target.value })}>
                                <option value="Nos">Nos</option>
                                <option value="Pcs">Pcs</option>
                                <option value="Box">Box</option>
                                <option value="Pack">Pack</option>
                                <option value="Set">Set</option>
                                <option value="Roll">Roll</option>
                                <option value="Meter">Meter</option>
                                <option value="Gram">Gram</option>
                                <option value="Kg">Kg</option>
                                <option value="Liter">Liter</option>
                            </select>
                        </div>
                        <div className="baan-input-group">
                            <label>Batch ID (Auto-generated if blank)</label>
                            <input placeholder="Vendor Lot / GRN ID" value={formData.batchId} onChange={e => setFormData({ ...formData, batchId: e.target.value })} />
                        </div>
                    </div>
                </div>

                {/* Section B: Commercial & Document Details */}
                <div className="baan-form-section">
                    <div className="baan-form-section-title">
                        <DollarSign size={14} /> Commercial & Document Details
                    </div>
                    <div className="baan-row-3">
                        <div className="baan-input-group">
                            <label>Per Unit Cost (₹) *</label>
                            <input required type="number" min="0" step="0.01" placeholder="0.00" value={formData.perUnitCost} onChange={e => setFormData({ ...formData, perUnitCost: e.target.value })} />
                        </div>
                        <div className="baan-input-group">
                            <label>Invoice / DC Number *</label>
                            <input required placeholder="INV-2026-0145" value={formData.invoiceOrDcNumber} onChange={e => setFormData({ ...formData, invoiceOrDcNumber: e.target.value })} />
                        </div>
                        <div className="baan-input-group">
                            <label>Reference (Vendor / PO Number)</label>
                            <input placeholder="e.g. PO-88992" value={formData.reference} onChange={e => setFormData({ ...formData, reference: e.target.value })} />
                        </div>
                    </div>
                </div>

                {/* Section C: Inventory Control & Remarks */}
                <div className="baan-form-section">
                    <div className="baan-form-section-title">
                        <ShieldCheck size={14} /> Inventory Control & Remarks
                    </div>
                    <div className="baan-row-2">
                        <div className="baan-input-group">
                            <label>Minimum Stock Level (Alert Threshold) *</label>
                            <input required type="number" min="0" placeholder="e.g. 10" value={formData.minimumStockLevel} onChange={e => setFormData({ ...formData, minimumStockLevel: e.target.value })} />
                        </div>
                        <div className="baan-input-group">
                            <label>Remarks / Notes</label>
                            <input placeholder="Inspection notes or vendor quality remarks..." value={formData.remarks} onChange={e => setFormData({ ...formData, remarks: e.target.value })} />
                        </div>
                    </div>
                </div>

                <div className="baan-flex-end" style={{ marginTop: '0.875rem' }}>
                    <button type="submit" className="baan-btn primary" disabled={isSubmitting} style={{ height: 42, padding: '0 1.75rem', fontSize: '0.875rem' }}>
                        {isSubmitting ? <><Loader2 size={15} className="animate-spin" /> Inwarding...</> : <><PlusCircle size={15} /> Complete Stock Entry</>}
                    </button>
                </div>
            </form>
        </div>
    );
};

const BaanRequest = () => {
    const { store, requestBaanPart } = useCQA();
    const [partNumber, setPartNumber] = useState('');
    const [requiredQty, setRequiredQty] = useState(1);
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);

    const availableParts = useMemo(() => 
        Object.values(store.baan.parts || {}).sort((a,b) => a.id.localeCompare(b.id)), 
    [store.baan.parts]);

    const partName = store.baan.parts?.[partNumber]?.name || '';
    
    const availableQty = useMemo(() => {
        if (!partNumber) return 0;
        return Object.values(store.baan.batches || {})
            .filter(b => b.partNumber === partNumber)
            .reduce((acc, b) => acc + (Number(b.quantityAvailable) || 0), 0);
    }, [partNumber, store.baan.batches]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage(null);
        
        if (!partNumber) {
            setErrorMessage('Please select a Part Number.');
            return;
        }
        
        if (requiredQty <= 0) {
            setErrorMessage('Required Quantity must be at least 1.');
            return;
        }

        if (requiredQty > availableQty) {
            setErrorMessage(`Insufficient Stock! Available: ${availableQty} units. Request blocked.`);
            return;
        }

        setIsSubmitting(true);
        setStatusMessage(null);

        try {
            const user = JSON.parse(localStorage.getItem('cqa_user') || '{}');
            const requestData = {
                partNo: partNumber,
                partName: partName,
                requestedQty: requiredQty
            };
            const res = await requestBaanPart(requestData, user);
            
            if (res.success) {
                setPartNumber('');
                setRequiredQty(1);
                setStatusMessage(`Request submitted successfully! Generated Request ID: ${res.requestId}`);
                setTimeout(() => setStatusMessage(null), 8000);
            } else {
                setErrorMessage(res.message || 'Failed to submit request.');
            }
        } catch (error) {
            console.error(error);
            setErrorMessage('A network error occurred.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '720px', margin: '0 auto' }}>
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
                <div>
                    <h2 className="baan-title" style={{ fontSize: '1.25rem' }}>Material Part Request</h2>
                    <p className="baan-subtitle">Create material requisition for repair or rework stations</p>
                </div>
            </div>

            {statusMessage && (
                <div className="baan-card" style={{ 
                    padding: '0.875rem 1.25rem', 
                    marginBottom: '1.25rem',
                    borderLeft: '4px solid var(--baan-success)',
                    background: 'var(--baan-success-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                }}>
                    <CheckCircle2 size={20} style={{ color: 'var(--baan-success)' }} />
                    <span className="text-sm font-bold">{statusMessage}</span>
                </div>
            )}
            
            {errorMessage && (
                <div className="baan-card" style={{ 
                    padding: '0.875rem 1.25rem', 
                    marginBottom: '1.25rem',
                    borderLeft: '4px solid var(--baan-danger)',
                    background: 'var(--baan-danger-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                }}>
                    <AlertTriangle size={20} style={{ color: 'var(--baan-danger)' }} />
                    <span className="text-sm font-bold">{errorMessage}</span>
                </div>
            )}

            <div className="baan-card">
                <div className="baan-card-header">
                    <div className="baan-card-title">
                        <Send size={16} style={{ color: 'var(--baan-accent)' }} /> Requisition Form
                    </div>
                </div>
                <form className="baan-card-body" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="baan-input-group">
                        <label>Select Part Number *</label>
                        <select 
                            value={partNumber}
                            onChange={(e) => setPartNumber(e.target.value)}
                            required
                        >
                            <option value="">-- Choose Component SKU --</option>
                            {availableParts.map(part => (
                                <option key={part.id} value={part.id}>{part.id} — {part.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid md-grid-2 gap-4">
                        <div className="baan-input-group">
                            <label>Part Description</label>
                            <input 
                                type="text" 
                                value={partName || 'Auto-populated on selection'}
                                readOnly
                            />
                        </div>

                        <div className="baan-input-group">
                            <label>Available Stock Balance</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input 
                                    type="text" 
                                    className="font-bold text-mono"
                                    value={partNumber ? `${availableQty} Units` : '—'}
                                    readOnly
                                />
                                {partNumber && (
                                    <span className={`baan-badge ${availableQty > 0 ? 'success' : 'danger'}`}>
                                        {availableQty > 0 ? 'In Stock' : 'Out of Stock'}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="baan-input-group">
                        <label>Required Quantity *</label>
                        <input 
                            type="number" 
                            min="1"
                            max={availableQty || undefined}
                            value={requiredQty}
                            onChange={(e) => setRequiredQty(parseInt(e.target.value) || 0)}
                            required
                        />
                    </div>

                    <div className="flex-end" style={{ marginTop: '0.5rem' }}>
                        <button 
                            type="submit" 
                            className="baan-btn primary"
                            disabled={isSubmitting || !partNumber || availableQty === 0}
                            style={{ height: 46, padding: '0 2rem' }}
                        >
                            {isSubmitting ? (
                                <><Loader2 className="animate-spin" size={16} /> Submitting...</>
                            ) : (
                                <><Send size={16} /> Submit Material Request</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const BaanDcPreview = ({ request, onClose }) => {
    const { store } = useCQA();
    const handlePrint = () => window.print();

    if (!request) return null;

    // Calculate PPU from batches (estimate based on FIFO or current stock)
    const batches = Object.values(store.baan?.batches || {}).filter(b => b.partNumber === (request.partNo || request.partNumber));
    const ppu = batches.length > 0 ? (batches.reduce((sum, b) => sum + (Number(b.perUnitCost) || 0), 0) / batches.length) : 0;
    const totalAmount = ppu * Number(request.requestedQty || request.quantityRequested || 1);

    return (
        <div className="baan-drawer-overlay" style={{ justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
            <div className="baan-card animate-fade-in" style={{ width: '100%', maxWidth: '820px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', margin: 0 }}>
                {/* Header Actions (Excluded from print) */}
                <div className="no-print baan-card-header" style={{ flexShrink: 0 }}>
                    <div className="baan-card-title">
                        <Printer size={16} style={{ color: 'var(--baan-accent)' }} /> Delivery Challan / Picklist Preview
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={handlePrint} className="baan-btn primary">
                            <Printer size={15} /> Print / Save PDF
                        </button>
                        <button onClick={onClose} className="baan-btn secondary">
                            <X size={15} /> Close
                        </button>
                    </div>
                </div>

                {/* Printable Document Area — Strictly White Background for Physical Output */}
                <div className="printable-dc" style={{ flex: 1, overflowY: 'auto', padding: '40px', background: '#ffffff', color: '#000000', fontFamily: 'Arial, sans-serif' }}>
                    <div style={{ textAlign: 'center', marginBottom: '24px', borderBottom: '2px solid #000000', paddingBottom: '16px' }}>
                        <h1 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: '800', color: '#000000' }}>Tohands Pvt. Ltd.</h1>
                        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', color: '#000000' }}>
                            Delivery Challan / Material Picklist
                        </h2>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', fontSize: '13px', color: '#000000' }}>
                        <div>
                            <p style={{ margin: '0 0 6px 0' }}><strong>Request ID:</strong> {request.id}</p>
                            <p style={{ margin: '0 0 6px 0' }}><strong>Request Date:</strong> {request.requestedAt ? new Date(request.requestedAt).toLocaleDateString() : '—'}</p>
                            <p style={{ margin: 0 }}><strong>Requested By:</strong> {request.requestedBy || 'Store User'}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <p style={{ margin: '0 0 6px 0' }}><strong>Document Date:</strong> {new Date().toLocaleDateString()}</p>
                            <p style={{ margin: '0 0 6px 0' }}><strong>Issue Date:</strong> {request.issuedAt ? new Date(request.issuedAt).toLocaleDateString() : 'Pending'}</p>
                            <p style={{ margin: 0 }}><strong>Issued By:</strong> {request.issuedBy || 'Store Controller'}</p>
                        </div>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px', fontSize: '13px', color: '#000000' }}>
                        <thead>
                            <tr style={{ background: '#f3f4f6' }}>
                                <th style={{ border: '1px solid #000000', padding: '8px', textAlign: 'center', width: '50px' }}>SL</th>
                                <th style={{ border: '1px solid #000000', padding: '8px', textAlign: 'left' }}>Part Number</th>
                                <th style={{ border: '1px solid #000000', padding: '8px', textAlign: 'left' }}>Part Description</th>
                                <th style={{ border: '1px solid #000000', padding: '8px', textAlign: 'center' }}>Quantity</th>
                                <th style={{ border: '1px solid #000000', padding: '8px', textAlign: 'right' }}>PPU (₹)</th>
                                <th style={{ border: '1px solid #000000', padding: '8px', textAlign: 'right' }}>Total (₹)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ border: '1px solid #000000', padding: '8px', textAlign: 'center' }}>1</td>
                                <td style={{ border: '1px solid #000000', padding: '8px', fontFamily: 'monospace', fontWeight: 'bold' }}>{request.partNo || request.partNumber}</td>
                                <td style={{ border: '1px solid #000000', padding: '8px' }}>{request.partName || 'Standard component'}</td>
                                <td style={{ border: '1px solid #000000', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{request.requestedQty || request.quantityRequested}</td>
                                <td style={{ border: '1px solid #000000', padding: '8px', textAlign: 'right' }}>{ppu.toFixed(2)}</td>
                                <td style={{ border: '1px solid #000000', padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{totalAmount.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '50px', paddingTop: '15px' }}>
                        <div style={{ textAlign: 'center', width: '180px' }}>
                            <div style={{ borderBottom: '1px solid #000000', height: '35px', marginBottom: '6px' }}></div>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold' }}>Store Executive Sign</p>
                        </div>
                        <div style={{ textAlign: 'center', width: '180px' }}>
                            <div style={{ borderBottom: '1px solid #000000', height: '35px', marginBottom: '6px' }}></div>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold' }}>Receiver Signature</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const BaanIssuance = () => {
    const { store, issueBaanParts, manualCloseBaanRequest } = useCQA();
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [previewDc, setPreviewDc] = useState(null);
    
    const pendingRequests = useMemo(() => {
        return Object.values(store.baan?.partRequests || {})
            .filter(r => r.status === 'Requested')
            .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
    }, [store.baan?.partRequests]);

    const issuedRequests = useMemo(() => {
        return Object.values(store.baan?.partRequests || {})
            .filter(r => r.status === 'Issued')
            .sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));
    }, [store.baan?.partRequests]);

    const user = JSON.parse(localStorage.getItem('cqa_user') || '{}');
    const isAdmin = user?.role === 'Admin' || user?.role === 'Supervisor';

    const handleIssue = async (request) => {
        if (!window.confirm(`Issue ${request.requestedQty} of ${request.partNo || request.partNumber}? This will deduct inventory immediately.`)) return;
        
        setIsProcessing(true);
        try {
            const res = await issueBaanParts(request.id, user);
            if (res.success) {
                alert(`Successfully issued ${request.requestedQty} x ${request.partNo || request.partNumber}`);
            } else {
                alert(`Failed to issue: ${res.message}`);
            }
        } catch (error) {
            console.error(error);
            alert('An error occurred during issuance.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleManualClose = async (request) => {
        if (!window.confirm(`Force close request ${request.id}? Remaining qty (${request.remainingQty}) will not be consumed.`)) return;
        
        setIsProcessing(true);
        try {
            const res = await manualCloseBaanRequest(request.id, user);
            if (res.success) {
                alert(`Request ${request.id} forcefully closed.`);
            } else {
                alert(`Failed to close request: ${res.message}`);
            }
        } catch (error) {
            console.error(error);
            alert('An error occurred.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="animate-fade-in">
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
                <div>
                    <h2 className="baan-title" style={{ fontSize: '1.25rem' }}>Store Part Issuance & Picklist</h2>
                    <p className="baan-subtitle">Dispatch requested parts using automated FIFO batch allocation</p>
                </div>
            </div>

            {/* Pending Requests Queue */}
            <div className="baan-card">
                <div className="baan-card-header">
                    <div className="baan-card-title">
                        <ClipboardList size={16} style={{ color: 'var(--baan-warning)' }} /> 
                        Pending Requisition Queue ({pendingRequests.length})
                    </div>
                </div>
                <div className="baan-table-wrapper" style={{ border: 'none' }}>
                    <table className="baan-table">
                        <thead>
                            <tr>
                                <th>Request ID</th>
                                <th>Part Number</th>
                                <th>Part Description</th>
                                <th className="num-col">Qty</th>
                                <th>Requested By</th>
                                <th>Request Date</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pendingRequests.map(r => (
                                <tr key={r.id}>
                                    <td className="text-mono font-bold">{r.id}</td>
                                    <td className="text-mono font-bold" style={{ color: 'var(--baan-accent)' }}>{r.partNo || r.partNumber}</td>
                                    <td className="font-semibold">{r.partName}</td>
                                    <td className="num-col font-bold">{r.requestedQty || r.quantityRequested}</td>
                                    <td><span className="baan-badge neutral">👤 {r.requestedBy}</span></td>
                                    <td className="text-xs text-muted">{r.requestedAt ? new Date(r.requestedAt).toLocaleString() : '—'}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                            <button 
                                                onClick={() => setPreviewDc(r)}
                                                className="baan-btn secondary"
                                                style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                                            >
                                                <Printer size={13} /> DC
                                            </button>
                                            <button 
                                                onClick={() => handleIssue(r)}
                                                disabled={isProcessing}
                                                className="baan-btn primary"
                                                style={{ padding: '0.3rem 0.85rem', fontSize: '0.75rem' }}
                                            >
                                                <CheckCircle2 size={13} /> Issue Parts
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {pendingRequests.length === 0 && (
                                <tr>
                                    <td colSpan="7" className="text-center text-muted py-6" style={{ textAlign: 'center' }}>
                                        No pending requests waiting for store issuance.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Active Issued Requests Queue (Admin & Supervisor controls) */}
            {isAdmin && (
                <div className="baan-card" style={{ marginTop: '1.5rem' }}>
                    <div className="baan-card-header">
                        <div className="baan-card-title">
                            <Layers size={16} style={{ color: 'var(--baan-info)' }} />
                            Active Issued Requests ({issuedRequests.length})
                        </div>
                    </div>
                    <div className="baan-table-wrapper" style={{ border: 'none' }}>
                        <table className="baan-table">
                            <thead>
                                <tr>
                                    <th>Request ID</th>
                                    <th>Part Number</th>
                                    <th className="num-col">Total Issued</th>
                                    <th className="num-col">Remaining</th>
                                    <th>Issued At</th>
                                    <th>Issued By</th>
                                    <th style={{ textAlign: 'right' }}>Admin Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {issuedRequests.map(r => (
                                    <tr key={r.id}>
                                        <td className="text-mono font-bold">{r.id}</td>
                                        <td className="text-mono font-bold" style={{ color: 'var(--baan-accent)' }}>{r.partNo || r.partNumber}</td>
                                        <td className="num-col font-bold">{r.requestedQty || r.quantityRequested}</td>
                                        <td className="num-col font-bold" style={{ color: 'var(--baan-danger)' }}>{r.remainingQty}</td>
                                        <td className="text-xs text-muted">{r.issuedAt ? new Date(r.issuedAt).toLocaleString() : '—'}</td>
                                        <td className="text-xs text-muted">{r.issuedBy || '—'}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                                <button 
                                                    onClick={() => setPreviewDc(r)}
                                                    className="baan-btn secondary"
                                                    style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                                                >
                                                    <Printer size={13} /> DC
                                                </button>
                                                <button 
                                                    onClick={() => handleManualClose(r)}
                                                    disabled={isProcessing}
                                                    className="baan-btn danger"
                                                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                                                >
                                                    Mark Consumed
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {issuedRequests.length === 0 && (
                                    <tr>
                                        <td colSpan="7" className="text-center text-muted py-6" style={{ textAlign: 'center' }}>
                                            No active issued requests requiring manual action.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {previewDc && <BaanDcPreview request={previewDc} onClose={() => setPreviewDc(null)} />}
        </div>
    );
};

const BaanInventory = () => {
    const { store } = useCQA();
    const baan = store.baan || {};

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLocation, setSelectedLocation] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [selectedPartDetails, setSelectedPartDetails] = useState(null);

    const locationsList = useMemo(() => {
        return Object.values(baan.locations || {});
    }, [baan.locations]);

    const inventory = useMemo(() => {
        const parts = {};
        Object.values(baan.batches || {}).forEach(b => {
            if (!parts[b.partNumber]) {
                parts[b.partNumber] = {
                    partNumber: b.partNumber,
                    partName: b.partName,
                    location: b.location,
                    totalStock: 0,
                    totalValue: 0,
                    oldestBatchDate: b.inwardDate,
                    batches: [],
                    minimumStockLevel: Number(baan.parts?.[b.partNumber]?.minimumStockLevel || 10)
                };
            }
            const qty = Number(b.quantityAvailable) || 0;
            const cost = Number(b.perUnitCost) || 0;
            parts[b.partNumber].totalStock += qty;
            parts[b.partNumber].totalValue += (qty * cost);
            parts[b.partNumber].batches.push(b);
            if (new Date(b.inwardDate) < new Date(parts[b.partNumber].oldestBatchDate)) {
                parts[b.partNumber].oldestBatchDate = b.inwardDate;
            }
        });
        return Object.values(parts);
    }, [baan.batches, baan.parts]);

    // Live KPI summaries
    const kpiSummary = useMemo(() => {
        let totalUnits = 0;
        let totalVal = 0;
        let lowCount = 0;
        inventory.forEach(p => {
            totalUnits += p.totalStock;
            totalVal += p.totalValue;
            if (p.totalStock <= p.minimumStockLevel) {
                lowCount++;
            }
        });
        return {
            totalSkus: inventory.length,
            totalUnits,
            lowCount,
            totalVal
        };
    }, [inventory]);

    const filteredInventory = useMemo(() => {
        return inventory.filter(p => {
            const matchesSearch = !searchTerm || p.partNumber.includes(searchTerm.toUpperCase()) || p.partName.toUpperCase().includes(searchTerm.toUpperCase());
            const matchesLoc = selectedLocation === 'ALL' || p.location === selectedLocation;
            
            const isCritical = p.totalStock <= (p.minimumStockLevel / 2);
            const isLow = p.totalStock <= p.minimumStockLevel;
            const status = isCritical ? 'CRITICAL' : isLow ? 'LOW' : 'HEALTHY';
            const matchesStatus = statusFilter === 'ALL' || statusFilter === status;

            return matchesSearch && matchesLoc && matchesStatus;
        });
    }, [inventory, searchTerm, selectedLocation, statusFilter]);

    const handleResetFilters = () => {
        setSearchTerm('');
        setSelectedLocation('ALL');
        setStatusFilter('ALL');
    };

    const hasActiveFilters = searchTerm !== '' || selectedLocation !== 'ALL' || statusFilter !== 'ALL';

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex-between" style={{ marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                    <h2 className="baan-title" style={{ fontSize: '1.25rem' }}>Inventory Stock & Batch Control</h2>
                    <p className="baan-subtitle">Real-time batch valuation, FIFO tracking, and reorder point monitoring</p>
                </div>
            </div>

            {/* Section A: Compact Single-Row KPI Summary Bar */}
            <div className="baan-kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem', marginBottom: '0.75rem' }}>
                <div className="baan-kpi-card" style={{ padding: '0.65rem 1rem', cursor: 'default' }}>
                    <div>
                        <div className="baan-kpi-label" style={{ fontSize: '0.625rem' }}>Total SKUs</div>
                        <div className="baan-kpi-value" style={{ fontSize: '1.25rem' }}>{kpiSummary.totalSkus}</div>
                    </div>
                    <div className="baan-kpi-icon-box" style={{ width: 34, height: 34, background: 'var(--baan-accent-alpha)', color: 'var(--baan-accent)' }}>
                        <Package size={17} />
                    </div>
                </div>

                <div className="baan-kpi-card" style={{ padding: '0.65rem 1rem', cursor: 'default' }}>
                    <div>
                        <div className="baan-kpi-label" style={{ fontSize: '0.625rem' }}>Total Units</div>
                        <div className="baan-kpi-value" style={{ fontSize: '1.25rem' }}>{kpiSummary.totalUnits.toLocaleString()}</div>
                    </div>
                    <div className="baan-kpi-icon-box" style={{ width: 34, height: 34, background: 'var(--baan-surface-muted)', color: 'var(--baan-text-secondary)' }}>
                        <Layers size={17} />
                    </div>
                </div>

                <div 
                    className="baan-kpi-card" 
                    style={{ padding: '0.65rem 1rem', cursor: 'pointer' }}
                    onClick={() => setStatusFilter(statusFilter === 'LOW' ? 'ALL' : 'LOW')}
                    title="Click to filter low stock SKUs"
                >
                    <div>
                        <div className="baan-kpi-label" style={{ fontSize: '0.625rem' }}>Low Stock SKUs</div>
                        <div className="baan-kpi-value" style={{ fontSize: '1.25rem', color: kpiSummary.lowCount > 0 ? 'var(--baan-danger)' : 'inherit' }}>
                            {kpiSummary.lowCount}
                        </div>
                    </div>
                    <div className="baan-kpi-icon-box" style={{ width: 34, height: 34, background: kpiSummary.lowCount > 0 ? 'var(--baan-danger-bg)' : 'var(--baan-surface-muted)', color: kpiSummary.lowCount > 0 ? 'var(--baan-danger)' : 'var(--baan-text-muted)' }}>
                        <AlertTriangle size={17} />
                    </div>
                </div>

                <div className="baan-kpi-card" style={{ padding: '0.65rem 1rem', cursor: 'default' }}>
                    <div>
                        <div className="baan-kpi-label" style={{ fontSize: '0.625rem' }}>Inventory Value</div>
                        <div className="baan-kpi-value" style={{ fontSize: '1.15rem' }}>₹{kpiSummary.totalVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                    </div>
                    <div className="baan-kpi-icon-box" style={{ width: 34, height: 34, background: 'var(--baan-info-bg)', color: 'var(--baan-info)' }}>
                        <DollarSign size={17} />
                    </div>
                </div>
            </div>

            {/* Section B: Compact Low Stock Alert Strip */}
            {kpiSummary.lowCount > 0 && (
                <div style={{ 
                    padding: '0.4rem 0.85rem', 
                    marginBottom: '0.65rem',
                    borderRadius: 'var(--baan-radius-sm)',
                    border: '1px solid rgba(220, 38, 38, 0.3)',
                    background: 'var(--baan-danger-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <AlertTriangle size={15} style={{ color: 'var(--baan-danger)', flexShrink: 0 }} /> 
                        <span className="text-xs font-bold" style={{ color: 'var(--baan-text-primary)' }}>
                            Low Stock Alert: <span style={{ color: 'var(--baan-danger)' }}>{kpiSummary.lowCount} SKU(s)</span> are currently below minimum threshold!
                        </span>
                    </div>
                    <button 
                        className="baan-btn danger" 
                        style={{ padding: '0.2rem 0.55rem', fontSize: '0.7rem' }}
                        onClick={() => setStatusFilter(statusFilter === 'LOW' ? 'ALL' : 'LOW')}
                    >
                        {statusFilter === 'LOW' ? 'Show All' : 'View Low Stock'}
                    </button>
                </div>
            )}

            {/* Section C: Single-Row Horizontal Search + Filter Toolbar */}
            <div className="baan-card" style={{ marginBottom: '0.75rem' }}>
                <div className="baan-card-body" style={{ padding: '0.45rem 0.65rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                            <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--baan-text-muted)' }} />
                            <input
                                type="text"
                                placeholder="Search Part Number or Description..."
                                style={{
                                    width: '100%',
                                    height: 34,
                                    paddingLeft: '2.25rem',
                                    paddingRight: '0.65rem',
                                    background: 'var(--baan-surface-muted)',
                                    border: '1px solid var(--baan-border)',
                                    borderRadius: 'var(--baan-radius-sm)',
                                    color: 'var(--baan-text-primary)',
                                    fontSize: '0.8125rem'
                                }}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <select
                            style={{
                                width: 170,
                                height: 34,
                                padding: '0 0.65rem',
                                background: 'var(--baan-surface-muted)',
                                border: '1px solid var(--baan-border)',
                                borderRadius: 'var(--baan-radius-sm)',
                                color: 'var(--baan-text-primary)',
                                fontWeight: 600,
                                fontSize: '0.8125rem'
                            }}
                            value={selectedLocation}
                            onChange={e => setSelectedLocation(e.target.value)}
                        >
                            <option value="ALL">All Locations</option>
                            {locationsList.map(loc => (
                                <option key={loc.id} value={loc.name}>{loc.name}</option>
                            ))}
                        </select>

                        <select
                            style={{
                                width: 150,
                                height: 34,
                                padding: '0 0.65rem',
                                background: 'var(--baan-surface-muted)',
                                border: '1px solid var(--baan-border)',
                                borderRadius: 'var(--baan-radius-sm)',
                                color: 'var(--baan-text-primary)',
                                fontWeight: 600,
                                fontSize: '0.8125rem'
                            }}
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                        >
                            <option value="ALL">All Statuses</option>
                            <option value="HEALTHY">Healthy Stock</option>
                            <option value="LOW">Low Stock</option>
                            <option value="CRITICAL">Critical Stock</option>
                        </select>

                        {hasActiveFilters && (
                            <button 
                                className="baan-btn secondary" 
                                style={{ height: 34, padding: '0 0.65rem', fontSize: '0.75rem' }}
                                onClick={handleResetFilters}
                                title="Reset filters"
                            >
                                <X size={13} /> Reset
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Section D: High-Priority Inventory Table */}
            <div className="baan-table-wrapper">
                <table className="baan-table">
                    <thead>
                        <tr>
                            <th>Part Number</th>
                            <th>Part Description</th>
                            <th>Location</th>
                            <th className="num-col">Available Stock</th>
                            <th className="num-col">Min Stock</th>
                            <th className="num-col">Est. Valuation</th>
                            <th>Batches & Oldest</th>
                            <th>Stock Health</th>
                            <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredInventory.map(p => {
                            const age = Math.floor((new Date() - new Date(p.oldestBatchDate)) / (1000 * 60 * 60 * 24));
                            const isCritical = p.totalStock <= (p.minimumStockLevel / 2);
                            const isLow = p.totalStock <= p.minimumStockLevel;

                            return (
                                <tr key={p.partNumber}>
                                    <td className="text-mono font-bold" style={{ color: 'var(--baan-accent)' }}>{p.partNumber}</td>
                                    <td className="font-semibold">{p.partName}</td>
                                    <td><span className="baan-badge neutral">📍 {p.location}</span></td>
                                    <td className="num-col font-extrabold" style={{ fontSize: '0.9375rem', color: isCritical ? 'var(--baan-danger)' : (isLow ? 'var(--baan-warning)' : 'inherit') }}>
                                        {p.totalStock}
                                    </td>
                                    <td className="num-col text-muted">{p.minimumStockLevel}</td>
                                    <td className="num-col font-bold">₹{p.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                    <td>
                                        <div className="font-bold text-xs">{p.batches.length} Batches</div>
                                        <div className="text-muted text-xs">Oldest: {age}d</div>
                                    </td>
                                    <td>
                                        <span className={`baan-badge ${isCritical ? 'danger' : (isLow ? 'warning' : 'success')}`}>
                                            {isCritical ? 'Critical' : (isLow ? 'Low' : 'Healthy')}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button 
                                            className="baan-btn secondary"
                                            style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }}
                                            onClick={() => setSelectedPartDetails(p)}
                                        >
                                            View Batches
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredInventory.length === 0 && (
                            <tr>
                                <td colSpan="9" className="text-center text-muted py-8" style={{ textAlign: 'center' }}>
                                    No matching inventory records found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Section F: Batch Details Drawer / Modal */}
            {selectedPartDetails && (
                <div className="baan-drawer-overlay" onClick={() => setSelectedPartDetails(null)}>
                    <div className="baan-drawer animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="baan-drawer-header">
                            <div>
                                <h3 className="baan-card-title" style={{ fontSize: '1.125rem' }}>
                                    <Package size={18} style={{ color: 'var(--baan-accent)' }} />
                                    {selectedPartDetails.partNumber}
                                </h3>
                                <p className="baan-subtitle">{selectedPartDetails.partName}</p>
                            </div>
                            <button className="baan-btn secondary" onClick={() => setSelectedPartDetails(null)}>
                                <X size={16} />
                            </button>
                        </div>
                        <div className="baan-drawer-body">
                            <div className="baan-kpi-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '1.25rem' }}>
                                <div className="baan-card" style={{ padding: '0.875rem 1rem', margin: 0 }}>
                                    <div className="baan-kpi-label">Total Available</div>
                                    <div className="baan-kpi-value" style={{ fontSize: '1.35rem' }}>{selectedPartDetails.totalStock} Units</div>
                                </div>
                                <div className="baan-card" style={{ padding: '0.875rem 1rem', margin: 0 }}>
                                    <div className="baan-kpi-label">Stock Value</div>
                                    <div className="baan-kpi-value" style={{ fontSize: '1.35rem' }}>₹{selectedPartDetails.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                                </div>
                            </div>

                            <h4 className="font-bold text-sm" style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Clock size={15} style={{ color: 'var(--baan-accent)' }} /> Batch-Wise Stock Breakdown (FIFO Order)
                            </h4>

                            <div className="baan-table-wrapper">
                                <table className="baan-table">
                                    <thead>
                                        <tr>
                                            <th>Batch ID / No</th>
                                            <th>Inward Date</th>
                                            <th className="num-col">Available</th>
                                            <th className="num-col">PPU (₹)</th>
                                            <th>FIFO Priority</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedPartDetails.batches
                                            .sort((a, b) => new Date(a.inwardDate) - new Date(b.inwardDate))
                                            .map((batch, idx) => (
                                                <tr key={batch.id}>
                                                    <td className="text-mono font-bold text-xs">{batch.batchNumber || batch.id}</td>
                                                    <td className="text-xs text-muted">{new Date(batch.inwardDate).toLocaleDateString()}</td>
                                                    <td className="num-col font-bold">{batch.quantityAvailable}</td>
                                                    <td className="num-col">₹{Number(batch.perUnitCost || 0).toFixed(2)}</td>
                                                    <td>
                                                        {idx === 0 ? (
                                                            <span className="baan-badge success">Priority 1 (Next)</span>
                                                        ) : (
                                                            <span className="baan-badge neutral">Priority {idx + 1}</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const BaanReverseInventory = () => {
    const { store, returnBaanParts } = useCQA();
    const [selectedRequestId, setSelectedRequestId] = useState('');
    const [consumedQty, setConsumedQty] = useState(0);
    const [returnQty, setReturnQty] = useState(0);
    const [reason, setReason] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const activeRequests = useMemo(() => {
        return Object.values(store.baan?.partRequests || {})
            .filter(r => r.status === 'Issued' || (r.status === 'Consumption Completed' && r.remainingQty > 0))
            .filter(r => Number(r.requestedQty || r.quantityRequested || 0) - Number(r.consumedQty || 0) - Number(r.returnedQty || 0) > 0)
            .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
    }, [store.baan?.partRequests]);

    const selectedRequest = store.baan?.partRequests?.[selectedRequestId];
    
    useEffect(() => {
        if (selectedRequest) {
            setConsumedQty(Number(selectedRequest.consumedQty || 0));
        } else {
            setConsumedQty(0);
            setReturnQty(0);
        }
    }, [selectedRequest]);

    const requestedTotal = selectedRequest ? Number(selectedRequest.requestedQty || selectedRequest.quantityRequested || 0) : 0;
    const returnedTotal = selectedRequest ? Number(selectedRequest.returnedQty || 0) : 0;
    const remainingReturnableQty = selectedRequest 
        ? Math.max(0, requestedTotal - Number(consumedQty) - returnedTotal)
        : 0;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (returnQty > remainingReturnableQty) {
            alert('Return quantity exceeds available balance');
            return;
        }
        
        const user = JSON.parse(localStorage.getItem('cqa_user') || '{}');
        setIsProcessing(true);
        const res = await returnBaanParts(selectedRequestId, Number(returnQty), Number(consumedQty), reason, user);
        
        if (res.success) {
            alert('Reverse inventory processed successfully. Stock has been credited back.');
            setSelectedRequestId('');
            setReturnQty(0);
            setReason('');
        } else {
            alert(res.message || 'Failed to process return');
        }
        setIsProcessing(false);
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '780px', margin: '0 auto' }}>
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
                <div>
                    <h2 className="baan-title" style={{ fontSize: '1.25rem' }}>Reverse Inventory & Returns</h2>
                    <p className="baan-subtitle">Return unused parts from rework stations directly back to warehouse inventory</p>
                </div>
            </div>

            <form className="baan-card" onSubmit={handleSubmit}>
                <div className="baan-card-header">
                    <div className="baan-card-title">
                        <RotateCcw size={16} style={{ color: 'var(--baan-accent)' }} /> Return Processing Workflow
                    </div>
                </div>
                <div className="baan-card-body">
                    <div className="baan-form-section">
                        <div className="baan-form-section-title">
                            <ClipboardList size={14} /> Step 1: Select Active Requisition
                        </div>
                        <div className="baan-input-group">
                            <label>Active Request ID *</label>
                            <select required value={selectedRequestId} onChange={e => setSelectedRequestId(e.target.value)}>
                                <option value="">-- Choose Requisition Document --</option>
                                {activeRequests.map(r => {
                                    const total = Number(r.requestedQty || r.quantityRequested || 0);
                                    const maxRet = Math.max(0, total - Number(r.consumedQty || 0) - Number(r.returnedQty || 0));
                                    return (
                                        <option key={r.id} value={r.id}>
                                            {r.id} — {r.partNo || r.partNumber} (Max Returnable: {maxRet} units)
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                    </div>

                    {selectedRequest && (
                        <div className="animate-fade-in">
                            <div className="baan-form-section">
                                <div className="baan-form-section-title">
                                    <Package size={14} /> Step 2: Part & Balance Inspection
                                </div>
                                <div className="grid md-grid-3 gap-3">
                                    <div className="baan-input-group">
                                        <label>Part Number</label>
                                        <input readOnly className="font-bold text-mono" value={selectedRequest.partNo || selectedRequest.partNumber} />
                                    </div>
                                    <div className="baan-input-group">
                                        <label>Total Issued Qty</label>
                                        <input readOnly value={requestedTotal} />
                                    </div>
                                    <div className="baan-input-group">
                                        <label>Returnable Balance</label>
                                        <input readOnly className="font-bold text-mono" style={{ color: 'var(--baan-accent)' }} value={remainingReturnableQty} />
                                    </div>
                                </div>
                            </div>

                            <div className="baan-form-section">
                                <div className="baan-form-section-title">
                                    <RotateCcw size={14} /> Step 3: Return Quantity & Reason
                                </div>
                                <div className="grid md-grid-2 gap-3" style={{ marginBottom: '0.75rem' }}>
                                    <div className="baan-input-group">
                                        <label>Recorded Consumed Qty</label>
                                        <input required type="number" min="0" max={requestedTotal} value={consumedQty} onChange={e => setConsumedQty(Number(e.target.value))} />
                                        <span className="text-xs text-muted">Adjust consumed count if needed</span>
                                    </div>
                                    <div className="baan-input-group">
                                        <label>Return to Stock Qty *</label>
                                        <input required type="number" min="1" max={remainingReturnableQty} value={returnQty} onChange={e => setReturnQty(Number(e.target.value))} />
                                        <span className="text-xs text-muted">Units physically restored to store</span>
                                    </div>
                                </div>

                                <div className="baan-input-group">
                                    <label>Reason for Return *</label>
                                    <textarea required rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. PCB replaced successfully with 1 unit; remaining unused parts returned..." />
                                </div>
                            </div>
                            
                            <div className="flex-end" style={{ marginTop: '1rem' }}>
                                <button type="submit" className="baan-btn primary" disabled={isProcessing || returnQty <= 0} style={{ height: 46, padding: '0 2rem' }}>
                                    {isProcessing ? <><Loader2 size={16} className="animate-spin" /> Processing Return...</> : <><RotateCcw size={16} /> Confirm Return to Stock</>}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </form>
        </div>
    );
};

const BaanAnalytics = () => {
    const { store } = useCQA();
    const baan = store.baan || {};

    const stats = useMemo(() => {
        let totalUnits = 0;
        let totalVal = 0;
        Object.values(baan.batches || {}).forEach(b => {
            const q = Number(b.quantityAvailable) || 0;
            const c = Number(b.perUnitCost) || 0;
            totalUnits += q;
            totalVal += (q * c);
        });
        const totalIssued = Object.values(baan.partIssuance || {}).reduce((acc, i) => acc + (Number(i.quantity) || 0), 0);
        return { totalUnits, totalVal, totalIssued };
    }, [baan]);

    const consumptionByIssue = useMemo(() => {
        const counts = {};
        Object.values(baan.partRequests || {})
            .filter(r => ['Issued', 'Consumed'].includes(r.status))
            .forEach(r => {
                const cat = r.issueCategory || 'General Rework';
                counts[cat] = (counts[cat] || 0) + 1;
            });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [baan.partRequests]);

    const mostUsedParts = useMemo(() => {
        const counts = {};
        Object.values(baan.partIssuance || {}).forEach(i => {
            const pn = i.partNumber || 'Unknown';
            counts[pn] = (counts[pn] || 0) + Number(i.quantity || 0);
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    }, [baan.partIssuance]);

    const handleExport = (type) => {
        let data = [];
        let filename = `BAAN_${type}_Export_${new Date().toISOString().split('T')[0]}`;
        
        if (type === 'Inventory') {
            const inventoryMap = {};
            Object.values(baan.batches || {}).forEach(b => {
                if (!inventoryMap[b.partNumber]) {
                    inventoryMap[b.partNumber] = {
                        'Part Number': b.partNumber,
                        'Part Name': b.partName,
                        'Location': b.location,
                        'Total Stock': 0,
                        'Min Stock Level': baan.parts?.[b.partNumber]?.minimumStockLevel || 10,
                        'UOM': baan.parts?.[b.partNumber]?.uom || 'Nos',
                        'MPN': baan.parts?.[b.partNumber]?.mpn || '',
                        'Avg Per Unit Cost': 0,
                        'Total Value': 0,
                        'Batch Count': 0
                    };
                }
                const p = inventoryMap[b.partNumber];
                p['Total Stock'] += Number(b.quantityAvailable);
                p['Total Value'] += (Number(b.quantityAvailable) * Number(b.perUnitCost || 0));
                p['Batch Count'] += 1;
            });
            Object.values(inventoryMap).forEach(p => {
                p['Avg Per Unit Cost'] = p['Total Stock'] > 0 ? (p['Total Value'] / p['Total Stock']).toFixed(2) : 0;
            });
            data = Object.values(inventoryMap);
        } else if (type === 'Movements') {
            data = Object.values(baan.inventoryMovements || {}).map(m => ({
                'Date': new Date(m.timestamp).toLocaleString(),
                'Movement Type': m.movementType || m.type,
                'Part Number': m.partNumber || m.partNo,
                'Quantity': m.quantity || m.qtyAdded || m.qtyReturned || 0,
                'Per Unit Cost': m.perUnitCost || '',
                'Invoice/DC Number': m.invoiceOrDcNumber || '',
                'Request ID': m.requestId || '',
                'Device SN': m.deviceSn || '',
                'Reason / Remarks': m.reason || m.returnReason || '',
                'User': m.user || m.uploadedBy || m.returnedBy || ''
            })).sort((a, b) => new Date(b.Date) - new Date(a.Date));
        } else if (type === 'Requests') {
            data = Object.values(baan.partRequests || {}).map(r => ({
                'Request ID': r.id,
                'Date': new Date(r.requestedAt).toLocaleString(),
                'Part Number': r.partNo || r.partNumber,
                'Part Name': r.partName,
                'Requested Qty': r.requestedQty || r.quantityRequested,
                'Consumed Qty': r.consumedQty || 0,
                'Returned Qty': r.returnedQty || 0,
                'Remaining Qty': r.remainingQty,
                'Status': r.status,
                'Requested By': r.requestedBy,
                'Issued At': r.issuedAt ? new Date(r.issuedAt).toLocaleString() : '',
                'Issued By': r.issuedBy || ''
            })).sort((a, b) => new Date(b.Date) - new Date(a.Date));
        }

        if (data.length === 0) {
            alert('No data available to export.');
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, type);
        XLSX.writeFile(workbook, `${filename}.xlsx`);
    };

    return (
        <div className="animate-fade-in">
            <div className="flex-between" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                    <h2 className="baan-title" style={{ fontSize: '1.25rem' }}>BAAN Analytics & Excel Exports</h2>
                    <p className="baan-subtitle">Material consumption trends, part turnover, and data exports</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button className="baan-btn secondary" onClick={() => handleExport('Inventory')}>
                        <FileSpreadsheet size={15} /> Export Inventory (.xlsx)
                    </button>
                    <button className="baan-btn secondary" onClick={() => handleExport('Movements')}>
                        <FileSpreadsheet size={15} /> Export Movements (.xlsx)
                    </button>
                    <button className="baan-btn secondary" onClick={() => handleExport('Requests')}>
                        <FileSpreadsheet size={15} /> Export Requests (.xlsx)
                    </button>
                </div>
            </div>

            {/* Quick KPI Overview */}
            <div className="baan-kpi-grid">
                <div className="baan-kpi-card" style={{ cursor: 'default' }}>
                    <div>
                        <div className="baan-kpi-label">Total Inventory Valuation</div>
                        <div className="baan-kpi-value">₹{stats.totalVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                    </div>
                    <div className="baan-kpi-icon-box" style={{ background: 'var(--baan-info-bg)', color: 'var(--baan-info)' }}>
                        <DollarSign size={20} />
                    </div>
                </div>
                <div className="baan-kpi-card" style={{ cursor: 'default' }}>
                    <div>
                        <div className="baan-kpi-label">Total Stocked Units</div>
                        <div className="baan-kpi-value">{stats.totalUnits.toLocaleString()}</div>
                    </div>
                    <div className="baan-kpi-icon-box" style={{ background: 'var(--baan-accent-alpha)', color: 'var(--baan-accent)' }}>
                        <Package size={20} />
                    </div>
                </div>
                <div className="baan-kpi-card" style={{ cursor: 'default' }}>
                    <div>
                        <div className="baan-kpi-label">Total Lifetime Issued Units</div>
                        <div className="baan-kpi-value">{stats.totalIssued.toLocaleString()}</div>
                    </div>
                    <div className="baan-kpi-icon-box" style={{ background: 'var(--baan-success-bg)', color: 'var(--baan-success)' }}>
                        <Send size={20} />
                    </div>
                </div>
            </div>

            <div className="grid md-grid-2 gap-6">
                <div className="baan-card">
                    <div className="baan-card-header">
                        <div className="baan-card-title">
                            <Layers size={16} style={{ color: 'var(--baan-accent)' }} /> Parts Consumption per Issue Category
                        </div>
                    </div>
                    <div className="baan-card-body">
                        {consumptionByIssue.map(([cat, count]) => (
                            <div key={cat} style={{ marginBottom: '1rem' }}>
                                <div className="flex-between" style={{ marginBottom: '0.25rem' }}>
                                    <span className="text-xs font-bold uppercase">{cat}</span>
                                    <span className="text-xs font-bold">{count} requisition(s)</span>
                                </div>
                                <div style={{ height: 8, background: 'var(--baan-surface-muted)', borderRadius: 4, overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${(count / (consumptionByIssue[0]?.[1] || 1)) * 100}%`,
                                        background: 'var(--baan-accent)'
                                    }} />
                                </div>
                            </div>
                        ))}
                        {consumptionByIssue.length === 0 && (
                            <p className="text-muted text-sm text-center py-4">No categorical consumption data recorded yet.</p>
                        )}
                    </div>
                </div>

                <div className="baan-card">
                    <div className="baan-card-header">
                        <div className="baan-card-title">
                            <TrendingUp size={16} style={{ color: 'var(--baan-success)' }} /> Top 10 Most Consumed Part SKUs
                        </div>
                    </div>
                    <div className="baan-card-body">
                        {mostUsedParts.map(([pn, qty]) => (
                            <div key={pn} style={{ marginBottom: '1rem' }}>
                                <div className="flex-between" style={{ marginBottom: '0.25rem' }}>
                                    <span className="text-xs font-bold text-mono" style={{ color: 'var(--baan-accent)' }}>{pn}</span>
                                    <span className="text-xs font-bold">{qty} units</span>
                                </div>
                                <div style={{ height: 8, background: 'var(--baan-surface-muted)', borderRadius: 4, overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${(qty / (mostUsedParts[0]?.[1] || 1)) * 100}%`,
                                        background: 'var(--baan-success)'
                                    }} />
                                </div>
                            </div>
                        ))}
                        {mostUsedParts.length === 0 && (
                            <p className="text-muted text-sm text-center py-4">No part issuance activity recorded yet.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const BaanRequestHistory = () => {
    const { store } = useCQA();
    const requests = Object.values(store.baan?.partRequests || {}).sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

    return (
        <div className="animate-fade-in">
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
                <div>
                    <h2 className="baan-title" style={{ fontSize: '1.25rem' }}>Material Request Audit History</h2>
                    <p className="baan-subtitle">Complete log of all part requisitions and fulfillment statuses</p>
                </div>
            </div>
            <div className="baan-table-wrapper">
                <table className="baan-table">
                    <thead>
                        <tr>
                            <th>Request ID</th>
                            <th>Request Date</th>
                            <th>Part Number</th>
                            <th>Part Description</th>
                            <th className="num-col">Requested Qty</th>
                            <th className="num-col">Consumed</th>
                            <th className="num-col">Returned</th>
                            <th>Status</th>
                            <th>Requested By</th>
                        </tr>
                    </thead>
                    <tbody>
                        {requests.map(r => (
                            <tr key={r.id}>
                                <td className="font-bold text-mono">{r.id}</td>
                                <td className="text-xs text-muted">{r.requestedAt ? new Date(r.requestedAt).toLocaleString() : '—'}</td>
                                <td className="font-bold text-mono" style={{ color: 'var(--baan-accent)' }}>{r.partNo || r.partNumber}</td>
                                <td className="font-semibold">{r.partName}</td>
                                <td className="num-col font-bold">{r.requestedQty || r.quantityRequested}</td>
                                <td className="num-col">{r.consumedQty || 0}</td>
                                <td className="num-col">{r.returnedQty || 0}</td>
                                <td>
                                    <span className={`baan-badge ${r.status === 'Issued' ? 'warning' : r.status === 'Consumed' ? 'success' : 'neutral'}`}>
                                        {r.status}
                                    </span>
                                </td>
                                <td className="text-xs text-muted">{r.requestedBy}</td>
                            </tr>
                        ))}
                        {requests.length === 0 && (
                            <tr>
                                <td colSpan="9" className="text-center text-muted py-6" style={{ textAlign: 'center' }}>
                                    No part request records found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const BaanIssuanceHistory = () => {
    const { store } = useCQA();
    const history = Object.values(store.baan?.partIssuance || {}).sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));

    return (
        <div className="animate-fade-in">
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
                <div>
                    <h2 className="baan-title" style={{ fontSize: '1.25rem' }}>Material Issuance Logs</h2>
                    <p className="baan-subtitle">Audited record of parts dispatched to stations and technicians</p>
                </div>
            </div>
            <div className="baan-table-wrapper">
                <table className="baan-table">
                    <thead>
                        <tr>
                            <th>Issued At</th>
                            <th>Device SN</th>
                            <th>Part Number</th>
                            <th>Batch ID</th>
                            <th className="num-col">Quantity</th>
                            <th>Issued By</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.map(h => (
                            <tr key={h.id}>
                                <td className="text-xs text-muted">{h.issuedAt ? new Date(h.issuedAt).toLocaleString() : '—'}</td>
                                <td className="font-bold text-mono">{h.deviceSn || '—'}</td>
                                <td className="text-mono font-bold" style={{ color: 'var(--baan-accent)' }}>{h.partNumber}</td>
                                <td className="text-xs text-mono">{h.batchId}</td>
                                <td className="num-col font-bold">{h.quantity}</td>
                                <td><span className="baan-badge neutral">👤 {h.issuedBy}</span></td>
                            </tr>
                        ))}
                        {history.length === 0 && (
                            <tr>
                                <td colSpan="6" className="text-center text-muted py-6" style={{ textAlign: 'center' }}>
                                    No material issuance records logged yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ─── Main BaanModule Component ───

const BaanModule = ({ user }) => {
    const [view, setView] = useState('dashboard');
    const [viewProps, setViewProps] = useState({});
    const { syncBaanData } = useCQA();

    useEffect(() => {
        const unsubscribe = syncBaanData();
        return () => unsubscribe();
    }, [syncBaanData]);

    const navigate = (to, props = {}) => {
        setView(to);
        setViewProps(props);
    };

    const renderView = () => {
        switch (view) {
            case 'dashboard': return <BaanDashboard onNavigate={navigate} />;
            case 'locations': return <BaanLocations />;
            case 'inventory': return <BaanInventory />;
            case 'inward': return <BaanInward />;
            case 'request': return <BaanRequest />;
            case 'request_history': return <BaanRequestHistory />;
            case 'issuance': return <BaanIssuance initialRequestId={viewProps.requestId} />;
            case 'issuance_history': return <BaanIssuanceHistory />;
            case 'reverse': return <BaanReverseInventory />;
            case 'analytics': return <BaanAnalytics />;
            default: return <BaanDashboard onNavigate={navigate} />;
        }
    };

    // Grouped visual navigation clusters
    const navClusters = [
        {
            category: 'Overview',
            items: [
                { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }
            ]
        },
        {
            category: 'Inventory',
            items: [
                { id: 'inventory', label: 'Inventory Stock', icon: Package },
                { id: 'locations', label: 'Locations', icon: MapPin, role: ['Store Operator', 'Admin', 'Supervisor', 'Store Manager', 'Store Executive', 'Inventory Controller'] },
                { id: 'inward', label: 'Inward Parts', icon: PlusCircle, role: ['Store Operator', 'Admin', 'Store Manager', 'Store Executive', 'Inventory Controller'] },
                { id: 'reverse', label: 'Reverse / Returns', icon: RotateCcw, role: ['Store Operator', 'Admin', 'Supervisor', 'Store Manager', 'Store Executive'] }
            ]
        },
        {
            category: 'Material Flow',
            items: [
                { id: 'request', label: 'Request Part', icon: Send },
                { id: 'issuance', label: 'Store Issuance', icon: ClipboardList, role: ['Store Operator', 'Admin', 'Supervisor', 'Store Manager', 'Store Executive'] },
                { id: 'issuance_history', label: 'Issuance Logs', icon: History, role: ['Store Operator', 'Admin', 'Supervisor', 'Store Manager', 'Store Executive'] }
            ]
        },
        {
            category: 'Reports',
            items: [
                { id: 'analytics', label: 'Analytics & Export', icon: FileBarChart, role: ['Supervisor', 'Admin', 'Store Manager', 'Inventory Controller', 'Production Manager'] }
            ]
        }
    ];

    return (
        <div className="baan-module animate-fade-in">
            {/* Header */}
            <div className="baan-header">
                <div>
                    <h1 className="baan-title">BAAN Inventory & Material Control</h1>
                    <p className="baan-subtitle">Enterprise warehouse operations, FIFO batch valuation & station material dispatch</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="baan-badge neutral">
                        <User size={12} /> {user?.role || 'User'}
                    </span>
                    <span className="baan-badge success">
                        <ShieldCheck size={12} /> Live Sync
                    </span>
                </div>
            </div>

            {/* Grouped Navigation Bar */}
            <div className="baan-nav-group-container">
                {navClusters.map((cluster, cIdx) => {
                    const availableItems = cluster.items.filter(item => {
                        if (!item.role) return true;
                        return item.role.includes(user?.role);
                    });

                    if (availableItems.length === 0) return null;

                    return (
                        <React.Fragment key={cluster.category}>
                            {cIdx > 0 && <div className="baan-nav-divider" />}
                            <div className="baan-nav-cluster">
                                <span className="baan-nav-cluster-label">{cluster.category}</span>
                                {availableItems.map(item => (
                                    <button
                                        key={item.id}
                                        className={`baan-nav-btn ${view === item.id ? 'active' : ''}`}
                                        onClick={() => navigate(item.id)}
                                    >
                                        <item.icon size={14} />
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Main Active Screen */}
            <main>
                {renderView()}
            </main>
        </div>
    );
};

export default BaanModule;
