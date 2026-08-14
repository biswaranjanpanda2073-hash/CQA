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
    Minus
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useCQA } from '../hooks/useCQA';
import BaanBulkInward from './BaanBulkInward';


// ─── Sub-Components ───

const BaanDashboard = ({ onNavigate }) => {
    const { store } = useCQA();
    const baan = store.baan;

    const stats = useMemo(() => {
        const totalParts = Object.keys(baan.parts).length;
        const lowStock = Object.values(baan.batches).filter(b => b.quantityAvailable < 10).length;
        const pendingReq = Object.values(baan.partRequests).filter(r => r.status === 'Requested').length;

        const today = new Date().toISOString().split('T')[0];
        const issuedToday = Object.values(baan.partIssuance).filter(i => i.issuedAt.startsWith(today)).length;

        return { totalParts, lowStock, pendingReq, issuedToday };
    }, [baan]);

    const [searchTerm, setSearchTerm] = useState('');
    const searchResults = useMemo(() => {
        if (!searchTerm) return [];
        const term = searchTerm.toUpperCase();
        return Object.values(baan.batches)
            .filter(b => b.partNumber.includes(term))
            .sort((a, b) => new Date(a.inwardDate) - new Date(b.inwardDate));
    }, [searchTerm, baan.batches]);

    const pendingRequests = useMemo(() => {
        return Object.values(baan.partRequests)
            .filter(r => r.status === 'Requested')
            .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))
            .slice(0, 5);
    }, [baan.partRequests]);

    const inventorySnapshot = useMemo(() => {
        // Group by part number
        const snapshot = {};
        Object.values(baan.batches).forEach(b => {
            if (!snapshot[b.partNumber]) {
                snapshot[b.partNumber] = {
                    partNumber: b.partNumber,
                    location: b.location,
                    stock: 0
                };
            }
            snapshot[b.partNumber].stock += Number(b.quantityAvailable);
        });
        return Object.values(snapshot).slice(0, 10);
    }, [baan.batches]);

    return (
        <div className="animate-fade-in">
            {/* KPI Cards */}
            <div className="grid md-grid-4 gap-4" style={{ marginBottom: '1.5rem' }}>
                <div className="card clickable" onClick={() => onNavigate('inventory')}>
                    <div className="card-body flex-between">
                        <div>
                            <p className="text-xs font-bold uppercase text-muted">Total Parts</p>
                            <h2 className="font-extrabold" style={{ fontSize: '1.5rem' }}>{stats.totalParts}</h2>
                        </div>
                        <div className="flex-center" style={{ width: 40, height: 40, background: 'var(--primary-alpha)', color: 'var(--primary)', borderRadius: 'var(--radius-md)' }}>
                            <Package size={20} />
                        </div>
                    </div>
                </div>
                <div className="card clickable" onClick={() => onNavigate('inventory')}>
                    <div className="card-body flex-between">
                        <div>
                            <p className="text-xs font-bold uppercase text-muted">Low Stock</p>
                            <h2 className="font-extrabold" style={{ fontSize: '1.5rem', color: stats.lowStock > 0 ? 'var(--error)' : 'inherit' }}>{stats.lowStock}</h2>
                        </div>
                        <div className="flex-center" style={{ width: 40, height: 40, background: 'var(--error-bg)', color: 'var(--error)', borderRadius: 'var(--radius-md)' }}>
                            <AlertTriangle size={20} />
                        </div>
                    </div>
                </div>
                <div className="card clickable" onClick={() => onNavigate('issuance')}>
                    <div className="card-body flex-between">
                        <div>
                            <p className="text-xs font-bold uppercase text-muted">Pending Requests</p>
                            <h2 className="font-extrabold" style={{ fontSize: '1.5rem', color: stats.pendingReq > 0 ? 'var(--warning)' : 'inherit' }}>{stats.pendingReq}</h2>
                        </div>
                        <div className="flex-center" style={{ width: 40, height: 40, background: 'var(--warning-bg)', color: 'var(--warning)', borderRadius: 'var(--radius-md)' }}>
                            <ClipboardList size={20} />
                        </div>
                    </div>
                </div>
                <div className="card clickable" onClick={() => onNavigate('issuance_history')}>
                    <div className="card-body flex-between">
                        <div>
                            <p className="text-xs font-bold uppercase text-muted">Issued Today</p>
                            <h2 className="font-extrabold" style={{ fontSize: '1.5rem' }}>{stats.issuedToday}</h2>
                        </div>
                        <div className="flex-center" style={{ width: 40, height: 40, background: 'var(--success-bg)', color: 'var(--success)', borderRadius: 'var(--radius-md)' }}>
                            <Send size={20} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Part Search */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-body">
                    <div style={{ position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Search by Internal Part Number..."
                            className="font-bold text-mono"
                            style={{ width: '100%', height: 50, paddingLeft: '3rem' }}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {searchResults.length > 0 && (
                        <div className="table-container" style={{ marginTop: '1rem' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Part Number</th>
                                        <th>Part Name</th>
                                        <th>Location</th>
                                        <th>Available</th>
                                        <th>Oldest Batch</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {searchResults.map(b => (
                                        <tr key={b.id}>
                                            <td className="text-mono font-bold">{b.partNumber}</td>
                                            <td className="font-semibold">{b.partName}</td>
                                            <td><span className="status-pill info">{b.location}</span></td>
                                            <td><span className={`font-bold ${b.quantityAvailable < 10 ? 'text-error' : ''}`}>{b.quantityAvailable}</span></td>
                                            <td className="text-xs">
                                                <div className="flex-center gap-1">
                                                    <Clock size={10} />
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

            {/* Operational Panels */}
            <div className="grid md-grid-2 gap-4">
                {/* Left Panel: Pending Requests */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="text-sm font-bold">Pending Requests</h3>
                        <button className="btn-ghost" onClick={() => onNavigate('issuance')}>View All</button>
                    </div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>SN</th>
                                    <th>Part</th>
                                    <th>Qty</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingRequests.map(r => (
                                    <tr key={r.id}>
                                        <td className="text-xs text-mono">{r.id.split('-')[1]}</td>
                                        <td className="text-xs text-mono font-bold">{r.deviceSn}</td>
                                        <td className="text-xs font-semibold">
                                            {r.parts?.length > 0
                                                ? `${r.parts[0].partNumber}${r.parts.length > 1 ? ` +${r.parts.length - 1}` : ''}`
                                                : r.partNumber || '—'}
                                        </td>
                                        <td className="text-xs font-bold">{r.parts?.reduce((a, b) => a + Number(b.quantityRequested), 0) || r.quantityRequested || 0}</td>
                                        <td>
                                            <button className="btn btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.65rem' }} onClick={() => onNavigate('issuance', { requestId: r.id })}>
                                                Assign
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {pendingRequests.length === 0 && (
                                    <tr><td colSpan="5" className="text-center text-muted py-4">No pending requests</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Panel: Inventory Snapshot */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="text-sm font-bold">Inventory Snapshot</h3>
                        <button className="btn-ghost" onClick={() => onNavigate('inventory')}>Full Inventory</button>
                    </div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Part</th>
                                    <th>Location</th>
                                    <th>Stock</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inventorySnapshot.map(p => (
                                    <tr key={p.partNumber}>
                                        <td className="text-xs text-mono font-bold">{p.partNumber}</td>
                                        <td><span className="status-pill info" style={{ fontSize: '0.6rem' }}>{p.location}</span></td>
                                        <td className="text-xs font-bold">{p.stock}</td>
                                        <td>
                                            <div className={`status-dot ${p.stock < 10 ? (p.stock < 5 ? 'error' : 'warning') : 'online'}`} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

const BaanLocations = () => {
    const { store, createBaanLocation, updateBaanLocation } = useCQA();
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', code: '', description: '' });

    const locations = Object.values(store.baan.locations);

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
            <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
                <h2 className="font-bold">Location Management</h2>
                <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                    {showForm ? 'Close' : <><PlusCircle size={16} /> Add Location</>}
                </button>
            </div>

            {showForm && (
                <div className="card animate-fade-in" style={{ marginBottom: '1.5rem' }}>
                    <form className="card-body grid md-grid-3 gap-4" onSubmit={handleSubmit}>
                        <div className="input-field">
                            <label>Location Name</label>
                            <input required placeholder="e.g. Rack A" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                        </div>
                        <div className="input-field">
                            <label>Location Code</label>
                            <input required placeholder="e.g. R-A" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} />
                        </div>
                        <div className="input-field">
                            <label>Description</label>
                            <input placeholder="Optional details..." value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                        </div>
                        <div className="md-col-span-3 flex-end">
                            <button type="submit" className="btn btn-primary">Save Location</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="table-container card">
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Code</th>
                            <th>Description</th>
                            <th>Created By</th>
                            <th>Created Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {locations.map(loc => (
                            <tr key={loc.id}>
                                <td className="font-bold">{loc.name}</td>
                                <td><span className="status-pill info">{loc.code}</span></td>
                                <td>{loc.description || '—'}</td>
                                <td>{loc.createdBy}</td>
                                <td>{new Date(loc.createdAt).toLocaleDateString()}</td>
                            </tr>
                        ))}
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
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border)' }}>
                <button 
                    className={`btn-ghost ${activeTab === 'manual' ? 'active' : ''}`}
                    style={{ borderBottom: activeTab === 'manual' ? '2px solid var(--primary)' : 'none', paddingBottom: '0.5rem', borderRadius: 0 }}
                    onClick={() => setActiveTab('manual')}
                >
                    Manual Inward
                </button>
                <button 
                    className={`btn-ghost ${activeTab === 'bulk' ? 'active' : ''}`}
                    style={{ borderBottom: activeTab === 'bulk' ? '2px solid var(--primary)' : 'none', paddingBottom: '0.5rem', borderRadius: 0 }}
                    onClick={() => setActiveTab('bulk')}
                >
                    Bulk Inward Upload
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

    const locations = Object.values(store.baan.locations);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const user = JSON.parse(localStorage.getItem('cqa_user') || '{}');
        const res = await inwardBaanParts(formData, user);
        if (res.success) {
            setFormData({ partNumber: '', partName: '', location: '', batchId: '', quantity: '', reference: '', remarks: '', perUnitCost: '', uom: 'Nos', mpn: '', invoiceOrDcNumber: '', minimumStockLevel: '' });
            alert('Parts inwarded successfully!');
        } else {
            alert(res.message);
        }
    };

    return (
        <div className="animate-fade-in">
            <h2 className="font-bold" style={{ marginBottom: '1.5rem' }}>Manual Inward (Stock Entry)</h2>
            <form className="card" onSubmit={handleSubmit}>
                <div className="card-body grid md-grid-2 gap-4">
                    <div className="input-field">
                        <label>Internal Part Number</label>
                        <input required placeholder="PN-001" value={formData.partNumber} onChange={e => setFormData({ ...formData, partNumber: e.target.value.toUpperCase() })} />
                    </div>
                    <div className="input-field">
                        <label>Part Name</label>
                        <input required placeholder="e.g. USB Charging Port" value={formData.partName} onChange={e => setFormData({ ...formData, partName: e.target.value })} />
                    </div>
                    <div className="input-field">
                        <label>Location</label>
                        <select required value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })}>
                            <option value="">Select Location...</option>
                            {locations.map(loc => <option key={loc.id} value={loc.name}>{loc.name}</option>)}
                        </select>
                    </div>
                    <div className="input-field">
                        <label>Batch ID (Optional - Auto-generated if empty)</label>
                        <input placeholder="Vendor Lot / GRN" value={formData.batchId} onChange={e => setFormData({ ...formData, batchId: e.target.value })} />
                    </div>
                    <div className="input-field">
                        <label>Quantity Added</label>
                        <input required type="number" min="1" placeholder="0" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: e.target.value })} />
                    </div>
                    <div className="input-field">
                        <label>Per Unit Cost (₹)</label>
                        <input required type="number" min="0" step="0.01" placeholder="0.00" value={formData.perUnitCost} onChange={e => setFormData({ ...formData, perUnitCost: e.target.value })} />
                    </div>
                    <div className="input-field">
                        <label>UOM</label>
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
                    <div className="input-field">
                        <label>Invoice / DC Number</label>
                        <input required placeholder="INV-2026-0145" value={formData.invoiceOrDcNumber} onChange={e => setFormData({ ...formData, invoiceOrDcNumber: e.target.value })} />
                    </div>
                    <div className="input-field">
                        <label>MPN (Optional)</label>
                        <input placeholder="Manufacturer Part No" value={formData.mpn} onChange={e => setFormData({ ...formData, mpn: e.target.value })} />
                    </div>
                    <div className="input-field">
                        <label>Minimum Stock Level</label>
                        <input required type="number" min="0" placeholder="0" value={formData.minimumStockLevel} onChange={e => setFormData({ ...formData, minimumStockLevel: e.target.value })} />
                    </div>
                    <div className="input-field">
                        <label>Reference (Vendor / GRN)</label>
                        <input placeholder="Reference info..." value={formData.reference} onChange={e => setFormData({ ...formData, reference: e.target.value })} />
                    </div>
                    <div className="input-field md-col-span-2">
                        <label>Remarks</label>
                        <textarea rows={2} value={formData.remarks} onChange={e => setFormData({ ...formData, remarks: e.target.value })} />
                    </div>
                    <div className="md-col-span-2 flex-end">
                        <button type="submit" className="btn btn-primary" style={{ height: 50, padding: '0 2rem' }}>
                            <PlusCircle size={18} /> Complete Stock Entry
                        </button>
                    </div>
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
            setErrorMessage('Insufficient Stock. Request creation blocked.');
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
                setStatusMessage(`Success! Request ID: ${res.requestId} generated.`);
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
        <div className="animate-fade-in" style={{ paddingBottom: '60px' }}>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#1a202c', margin: '0 0 8px 0' }}>Request Part</h1>
                <p style={{ fontSize: '15px', color: '#718096', margin: 0 }}>Create a new request for part issuance.</p>
            </div>

            {statusMessage && (
                <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f0fff4', color: '#2f855a', padding: '16px 20px', borderRadius: '8px', border: '1px solid #c6f6d5', marginBottom: '24px', fontWeight: '600' }}>
                    <CheckCircle2 size={20} style={{ marginRight: '8px' }} /> {statusMessage}
                </div>
            )}
            
            {errorMessage && (
                <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#fff5f5', color: '#c53030', padding: '16px 20px', borderRadius: '8px', border: '1px solid #fed7d7', marginBottom: '24px', fontWeight: '600' }}>
                    <AlertTriangle size={20} style={{ marginRight: '8px' }} /> {errorMessage}
                </div>
            )}

            <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)', border: '1px solid #e2e8f0', padding: '24px', maxWidth: '600px' }}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#4a5568', marginBottom: '6px' }}>Part Number <span style={{ color: '#e53e3e' }}>*</span></label>
                        <select 
                            style={{ width: '100%', padding: '10px 14px', fontSize: '14px', border: '1px solid #cbd5e0', borderRadius: '6px' }}
                            value={partNumber}
                            onChange={(e) => setPartNumber(e.target.value)}
                            required
                        >
                            <option value="">-- Select Part --</option>
                            {availableParts.map(part => (
                                <option key={part.id} value={part.id}>{part.id} - {part.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#4a5568', marginBottom: '6px' }}>Part Name</label>
                        <input 
                            type="text" 
                            style={{ width: '100%', padding: '10px 14px', fontSize: '14px', border: '1px solid #cbd5e0', borderRadius: '6px', backgroundColor: '#f7fafc', color: '#718096' }}
                            value={partName}
                            readOnly
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#4a5568', marginBottom: '6px' }}>Available Qty / In Stock</label>
                        <input 
                            type="text" 
                            style={{ width: '100%', padding: '10px 14px', fontSize: '14px', border: '1px solid #cbd5e0', borderRadius: '6px', backgroundColor: '#f7fafc', color: '#718096', fontWeight: 'bold' }}
                            value={availableQty}
                            readOnly
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#4a5568', marginBottom: '6px' }}>Required Qty <span style={{ color: '#e53e3e' }}>*</span></label>
                        <input 
                            type="number" 
                            min="1"
                            style={{ width: '100%', padding: '10px 14px', fontSize: '14px', border: '1px solid #cbd5e0', borderRadius: '6px' }}
                            value={requiredQty}
                            onChange={(e) => setRequiredQty(parseInt(e.target.value) || 0)}
                            required
                        />
                    </div>

                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        style={{
                            marginTop: '10px',
                            padding: '12px 24px',
                            backgroundColor: 'var(--primary)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            fontWeight: '600',
                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        {isSubmitting ? <><Loader2 className="animate-spin" size={16} /> Processing...</> : <><Send size={16} /> Request</>}
                    </button>
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
    const batches = Object.values(store.baan.batches).filter(b => b.partNumber === request.partNo);
    const ppu = batches.length > 0 ? (batches.reduce((sum, b) => sum + (Number(b.perUnitCost) || 0), 0) / batches.length) : 0;
    const totalAmount = ppu * Number(request.requestedQty);

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '8px', width: '100%', maxWidth: '800px', height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                
                {/* Header Actions (No Print context) */}
                <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>DC / Picklist Preview</h3>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={handlePrint} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                            Print / Download PDF
                        </button>
                        <button onClick={onClose} className="btn btn-secondary">Close</button>
                    </div>
                </div>

                {/* Printable Area */}
                <div className="printable-dc" style={{ flex: 1, overflowY: 'auto', padding: '40px', backgroundColor: '#fff', color: '#000' }}>
                    <style>{`
                        @media print {
                            body * { visibility: hidden; }
                            .printable-dc, .printable-dc * { visibility: visible; }
                            .printable-dc { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
                            .no-print { display: none !important; }
                            @page { margin: 15mm; size: A4 portrait; }
                        }
                    `}</style>

                    <div style={{ textAlign: 'center', marginBottom: '30px', borderBottom: '2px solid #000', paddingBottom: '20px' }}>
                        <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '800' }}>Tohands Pvt. Ltd.</h1>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px' }}>Delivery Challan / Picklist</h2>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px', fontSize: '14px' }}>
                        <div>
                            <p style={{ margin: '0 0 8px 0' }}><strong>Request ID:</strong> {request.id}</p>
                            <p style={{ margin: '0 0 8px 0' }}><strong>Request Date:</strong> {new Date(request.requestedAt).toLocaleDateString()}</p>
                            <p style={{ margin: '0' }}><strong>Requested By:</strong> {request.requestedBy}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <p style={{ margin: '0 0 8px 0' }}><strong>Document Date:</strong> {new Date().toLocaleDateString()}</p>
                            <p style={{ margin: '0 0 8px 0' }}><strong>Issue Date:</strong> {request.issuedAt ? new Date(request.issuedAt).toLocaleDateString() : 'Pending'}</p>
                            <p style={{ margin: '0' }}><strong>Issued By:</strong> {request.issuedBy || '-'}</p>
                        </div>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px', fontSize: '14px' }}>
                        <thead>
                            <tr>
                                <th style={{ border: '1px solid #000', padding: '10px', textAlign: 'center', backgroundColor: '#f3f4f6' }}>SL No</th>
                                <th style={{ border: '1px solid #000', padding: '10px', textAlign: 'left', backgroundColor: '#f3f4f6' }}>Part Number</th>
                                <th style={{ border: '1px solid #000', padding: '10px', textAlign: 'left', backgroundColor: '#f3f4f6' }}>Part Description</th>
                                <th style={{ border: '1px solid #000', padding: '10px', textAlign: 'center', backgroundColor: '#f3f4f6' }}>Quantity</th>
                                <th style={{ border: '1px solid #000', padding: '10px', textAlign: 'right', backgroundColor: '#f3f4f6' }}>PPU (₹)</th>
                                <th style={{ border: '1px solid #000', padding: '10px', textAlign: 'right', backgroundColor: '#f3f4f6' }}>Total Amount (₹)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ border: '1px solid #000', padding: '10px', textAlign: 'center' }}>1</td>
                                <td style={{ border: '1px solid #000', padding: '10px', fontFamily: 'monospace', fontWeight: 'bold' }}>{request.partNo}</td>
                                <td style={{ border: '1px solid #000', padding: '10px' }}>{request.partName}</td>
                                <td style={{ border: '1px solid #000', padding: '10px', textAlign: 'center' }}>{request.requestedQty}</td>
                                <td style={{ border: '1px solid #000', padding: '10px', textAlign: 'right' }}>{ppu.toFixed(2)}</td>
                                <td style={{ border: '1px solid #000', padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>{totalAmount.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '60px', paddingTop: '20px' }}>
                        <div style={{ textAlign: 'center', width: '200px' }}>
                            <div style={{ borderBottom: '1px solid #000', height: '40px', marginBottom: '8px' }}></div>
                            <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Issued By Signature</p>
                        </div>
                        <div style={{ textAlign: 'center', width: '200px' }}>
                            <div style={{ borderBottom: '1px solid #000', height: '40px', marginBottom: '8px' }}></div>
                            <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Received By Signature</p>
                        </div>
                    </div>
                    
                    <div style={{ marginTop: '40px', fontSize: '12px', color: '#4a5568' }}>
                        <strong>Remarks/Notes:</strong> _________________________________________________________________________
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
        return Object.values(store.baan.partRequests || {})
            .filter(r => r.status === 'Requested')
            .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
    }, [store.baan.partRequests]);

    const issuedRequests = useMemo(() => {
        return Object.values(store.baan.partRequests || {})
            .filter(r => r.status === 'Issued')
            .sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));
    }, [store.baan.partRequests]);

    const user = JSON.parse(localStorage.getItem('cqa_user') || '{}');
    const isAdmin = user?.role === 'Admin' || user?.role === 'Supervisor';

    const handleIssue = async (request) => {
        if (!window.confirm(`Issue ${request.requestedQty} of ${request.partNo}? This will deduct inventory immediately.`)) return;
        
        setIsProcessing(true);
        try {
            const res = await issueBaanParts(request.id, user);
            if (res.success) {
                alert(`Successfully issued ${request.requestedQty} x ${request.partNo}`);
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
        <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
            <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#1a202c', margin: '0 0 8px 0' }}>Issuance Management</h2>
                <p style={{ fontSize: '15px', color: '#718096', margin: 0 }}>Review and issue pending part requests.</p>
            </div>

            <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)', border: '1px solid #e2e8f0', padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1a202c', marginBottom: '16px' }}>Pending Requests ({pendingRequests.length})</h3>
                {pendingRequests.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f7fafc', borderRadius: '8px', color: '#718096' }}>
                        No pending requests.
                    </div>
                ) : (
                    <div className="table-container">
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f7fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                                    <th style={{ padding: '12px 16px', color: '#4a5568', fontSize: '13px', textTransform: 'uppercase' }}>Request ID</th>
                                    <th style={{ padding: '12px 16px', color: '#4a5568', fontSize: '13px', textTransform: 'uppercase' }}>Part No</th>
                                    <th style={{ padding: '12px 16px', color: '#4a5568', fontSize: '13px', textTransform: 'uppercase' }}>Part Name</th>
                                    <th style={{ padding: '12px 16px', color: '#4a5568', fontSize: '13px', textTransform: 'uppercase' }}>Qty</th>
                                    <th style={{ padding: '12px 16px', color: '#4a5568', fontSize: '13px', textTransform: 'uppercase' }}>Requested By</th>
                                    <th style={{ padding: '12px 16px', color: '#4a5568', fontSize: '13px', textTransform: 'uppercase', textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingRequests.map(r => (
                                    <tr key={r.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                                        <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '600', color: '#2d3748' }}>{r.id}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '14px', fontFamily: 'monospace', color: 'var(--primary)' }}>{r.partNo}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '14px', color: '#4a5568' }}>{r.partName}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 'bold' }}>{r.requestedQty}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#718096' }}>{r.requestedBy}</td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button 
                                                onClick={() => setPreviewDc(r)}
                                                style={{ padding: '6px 12px', backgroundColor: '#edf2f7', color: '#4a5568', border: '1px solid #cbd5e0', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                                            >
                                                Preview DC
                                            </button>
                                            <button 
                                                onClick={() => handleIssue(r)}
                                                disabled={isProcessing}
                                                style={{ padding: '6px 16px', backgroundColor: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '4px', cursor: isProcessing ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}
                                            >
                                                Issue
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {previewDc && <BaanDcPreview request={previewDc} onClose={() => setPreviewDc(null)} />}

            {isAdmin && (
                <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)', border: '1px solid #e2e8f0', padding: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1a202c', marginBottom: '16px' }}>Active Issued Requests ({issuedRequests.length})</h3>
                    {issuedRequests.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f7fafc', borderRadius: '8px', color: '#718096' }}>
                            No active issued requests.
                        </div>
                    ) : (
                        <div className="table-container">
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f7fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                                        <th style={{ padding: '12px 16px', color: '#4a5568', fontSize: '13px', textTransform: 'uppercase' }}>Request ID</th>
                                        <th style={{ padding: '12px 16px', color: '#4a5568', fontSize: '13px', textTransform: 'uppercase' }}>Part No</th>
                                        <th style={{ padding: '12px 16px', color: '#4a5568', fontSize: '13px', textTransform: 'uppercase' }}>Total Qty</th>
                                        <th style={{ padding: '12px 16px', color: '#4a5568', fontSize: '13px', textTransform: 'uppercase' }}>Remaining</th>
                                        <th style={{ padding: '12px 16px', color: '#4a5568', fontSize: '13px', textTransform: 'uppercase', textAlign: 'right' }}>Admin Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {issuedRequests.map(r => (
                                        <tr key={r.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                                            <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '600', color: '#2d3748' }}>{r.id}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '14px', fontFamily: 'monospace', color: 'var(--primary)' }}>{r.partNo}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '14px' }}>{r.requestedQty}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 'bold', color: '#e53e3e' }}>{r.remainingQty}</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button 
                                                    onClick={() => setPreviewDc(r)}
                                                    style={{ padding: '6px 12px', backgroundColor: '#edf2f7', color: '#4a5568', border: '1px solid #cbd5e0', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                                                >
                                                    Preview DC
                                                </button>
                                                <button 
                                                    onClick={() => handleManualClose(r)}
                                                    disabled={isProcessing}
                                                    style={{ padding: '6px 12px', backgroundColor: '#e53e3e', color: '#fff', border: 'none', borderRadius: '4px', cursor: isProcessing ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '600' }}
                                                >
                                                    Mark Consumed
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const BaanInventory = () => {
    const { store } = useCQA();
    const baan = store.baan;

    const inventory = useMemo(() => {
        const parts = {};
        Object.values(baan.batches).forEach(b => {
            if (!parts[b.partNumber]) {
                parts[b.partNumber] = {
                    partNumber: b.partNumber,
                    partName: b.partName,
                    location: b.location,
                    totalStock: 0,
                    oldestBatchDate: b.inwardDate,
                    batches: [],
                    minimumStockLevel: Number(baan.parts?.[b.partNumber]?.minimumStockLevel || 10)
                };
            }
            parts[b.partNumber].totalStock += Number(b.quantityAvailable);
            parts[b.partNumber].batches.push(b);
            if (new Date(b.inwardDate) < new Date(parts[b.partNumber].oldestBatchDate)) {
                parts[b.partNumber].oldestBatchDate = b.inwardDate;
            }
        });
        return Object.values(parts);
    }, [baan.batches, baan.parts]);

    const lowStockCount = inventory.filter(p => p.totalStock <= p.minimumStockLevel).length;

    return (
        <div className="animate-fade-in">
            <h2 className="font-bold" style={{ marginBottom: '1.5rem' }}>Current Inventory</h2>
            
            {lowStockCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#fff5f5', color: '#c53030', padding: '16px 20px', borderRadius: '8px', border: '1px solid #fed7d7', marginBottom: '24px', fontWeight: '600' }}>
                    <AlertTriangle size={20} style={{ marginRight: '8px' }} /> 
                    Warning: {lowStockCount} part(s) are below their minimum stock level!
                </div>
            )}

            <div className="table-container card">
                <table>
                    <thead>
                        <tr>
                            <th>Part Number</th>
                            <th>Part Name</th>
                            <th>Location</th>
                            <th>Total Stock</th>
                            <th>Min Stock</th>
                            <th>Batches</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {inventory.map(p => {
                            const age = Math.floor((new Date() - new Date(p.oldestBatchDate)) / (1000 * 60 * 60 * 24));
                            const isCritical = p.totalStock <= (p.minimumStockLevel / 2);
                            const isLow = p.totalStock <= p.minimumStockLevel;

                            return (
                                <tr key={p.partNumber} style={{ backgroundColor: isCritical ? '#fff5f5' : (isLow ? '#fffff0' : 'inherit') }}>
                                    <td className="text-mono font-extrabold">{p.partNumber}</td>
                                    <td className="font-semibold">{p.partName}</td>
                                    <td><span className="status-pill info">{p.location}</span></td>
                                    <td className="font-bold" style={{ color: isCritical ? '#c53030' : (isLow ? '#b7791f' : 'inherit') }}>{p.totalStock}</td>
                                    <td className="text-muted">{p.minimumStockLevel}</td>
                                    <td className="text-xs">
                                        <div className="font-bold">{p.batches.length} Batches</div>
                                        <div className="text-muted">Oldest: {age} days</div>
                                    </td>
                                    <td>
                                        <span className={`status-pill ${isCritical ? 'error' : (isLow ? 'warning' : 'success')}`}>
                                            {isCritical ? 'Critical' : (isLow ? 'Low' : 'Healthy')}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
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
        return Object.values(store.baan.partRequests || {})
            .filter(r => r.status === 'Issued' || (r.status === 'Consumption Completed' && r.remainingQty > 0))
            .filter(r => Number(r.requestedQty) - Number(r.consumedQty || 0) - Number(r.returnedQty || 0) > 0)
            .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
    }, [store.baan.partRequests]);

    const selectedRequest = store.baan.partRequests[selectedRequestId];
    
    useEffect(() => {
        if (selectedRequest) {
            setConsumedQty(Number(selectedRequest.consumedQty || 0));
        } else {
            setConsumedQty(0);
            setReturnQty(0);
        }
    }, [selectedRequest]);

    const remainingReturnableQty = selectedRequest 
        ? Number(selectedRequest.requestedQty) - Number(consumedQty) - Number(selectedRequest.returnedQty || 0)
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
            alert('Reverse inventory processed successfully');
            setSelectedRequestId('');
            setReturnQty(0);
            setReason('');
        } else {
            alert(res.message || 'Failed to process return');
        }
        setIsProcessing(false);
    };

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
            <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#1a202c', margin: '0 0 8px 0' }}>Reverse Inventory / Return Parts</h2>
                <p style={{ fontSize: '15px', color: '#718096', margin: 0 }}>Manage unused issued parts returned back to store.</p>
            </div>

            <form className="card" onSubmit={handleSubmit}>
                <div className="card-body grid md-grid-2 gap-4">
                    <div className="input-field md-col-span-2">
                        <label>Request ID</label>
                        <select required value={selectedRequestId} onChange={e => setSelectedRequestId(e.target.value)}>
                            <option value="">-- Select Active Request --</option>
                            {activeRequests.map(r => (
                                <option key={r.id} value={r.id}>{r.id} - {r.partNo} (Max Returnable: {Number(r.requestedQty) - Number(r.consumedQty || 0) - Number(r.returnedQty || 0)})</option>
                            ))}
                        </select>
                    </div>

                    {selectedRequest && (
                        <>
                            <div className="input-field">
                                <label>Part Number</label>
                                <input readOnly value={selectedRequest.partNo} style={{ backgroundColor: '#f7fafc', color: '#718096' }} />
                            </div>
                            <div className="input-field">
                                <label>Part Name</label>
                                <input readOnly value={selectedRequest.partName} style={{ backgroundColor: '#f7fafc', color: '#718096' }} />
                            </div>
                            <div className="input-field">
                                <label>Issued Qty</label>
                                <input readOnly value={selectedRequest.requestedQty} style={{ backgroundColor: '#f7fafc', color: '#718096' }} />
                            </div>
                            <div className="input-field">
                                <label>Consumed Qty</label>
                                <input required type="number" min="0" max={selectedRequest.requestedQty} value={consumedQty} onChange={e => setConsumedQty(Number(e.target.value))} />
                                <p style={{ fontSize: '12px', color: '#718096', margin: '4px 0 0 0' }}>Edit this value to adjust recorded consumption.</p>
                            </div>
                            <div className="input-field">
                                <label>Remaining Returnable Qty</label>
                                <input readOnly value={remainingReturnableQty} style={{ backgroundColor: '#f7fafc', color: '#718096' }} />
                            </div>
                            <div className="input-field">
                                <label>Return Qty</label>
                                <input required type="number" min="1" max={remainingReturnableQty} value={returnQty} onChange={e => setReturnQty(Number(e.target.value))} />
                            </div>
                            <div className="input-field md-col-span-2">
                                <label>Return Reason</label>
                                <textarea required rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Parts not needed for rework..."></textarea>
                            </div>
                            
                            <div className="md-col-span-2 flex-end">
                                <button type="submit" className="btn btn-primary" disabled={isProcessing} style={{ height: 50, padding: '0 2rem' }}>
                                    {isProcessing ? 'Processing...' : 'Confirm Return'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </form>
        </div>
    );
};

const BaanAnalytics = () => {
    const { store } = useCQA();
    const baan = store.baan;

    const consumptionByIssue = useMemo(() => {
        const counts = {};
        Object.values(baan.partRequests)
            .filter(r => ['Issued', 'Consumed'].includes(r.status))
            .forEach(r => {
                counts[r.issueCategory] = (counts[r.issueCategory] || 0) + 1;
            });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [baan.partRequests]);

    const mostUsedParts = useMemo(() => {
        const counts = {};
        Object.values(baan.partIssuance || {}).forEach(i => {
            counts[i.partNumber] = (counts[i.partNumber] || 0) + Number(i.quantity);
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    }, [baan.partIssuance]);

    const handleExport = (type) => {
        let data = [];
        let filename = `BAAN_${type}_Export_${new Date().toISOString().split('T')[0]}`;
        
        if (type === 'Inventory') {
            const inventoryMap = {};
            Object.values(baan.batches).forEach(b => {
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
                'Part Number': r.partNo,
                'Part Name': r.partName,
                'Requested Qty': r.requestedQty,
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
            <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
                <h2 className="font-bold">BAAN Analytics & Reports</h2>
                <div className="flex-center gap-2">
                    <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }} onClick={() => handleExport('Inventory')}>
                        Export Inventory
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }} onClick={() => handleExport('Movements')}>
                        Export Movements
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }} onClick={() => handleExport('Requests')}>
                        Export Requests
                    </button>
                </div>
            </div>
            <div className="grid md-grid-2 gap-6">
                <div className="card">
                    <div className="card-header"><h3 className="text-sm font-bold">Parts Consumption per Issue Type</h3></div>
                    <div className="card-body">
                        {consumptionByIssue.map(([cat, count]) => (
                            <div key={cat} style={{ marginBottom: '1rem' }}>
                                <div className="flex-between mb-1">
                                    <span className="text-xs font-bold uppercase">{cat}</span>
                                    <span className="text-xs font-bold">{count} repairs</span>
                                </div>
                                <div style={{ height: 8, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${(count / consumptionByIssue[0][1]) * 100}%`,
                                        background: 'var(--primary)'
                                    }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="card">
                    <div className="card-header"><h3 className="text-sm font-bold">Top 10 Most Used Parts</h3></div>
                    <div className="card-body">
                        {mostUsedParts.map(([pn, qty]) => (
                            <div key={pn} style={{ marginBottom: '1rem' }}>
                                <div className="flex-between mb-1">
                                    <span className="text-xs font-bold text-mono">{pn}</span>
                                    <span className="text-xs font-bold">{qty} units</span>
                                </div>
                                <div style={{ height: 8, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${(qty / mostUsedParts[0][1]) * 100}%`,
                                        background: 'var(--success)'
                                    }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Main BaanModule ───

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

    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'locations', label: 'Locations', icon: MapPin, role: ['Store Operator', 'Admin', 'Supervisor'] },
        { id: 'inventory', label: 'Inventory', icon: Package },
        { id: 'inward', label: 'Inward Parts', icon: PlusCircle, role: ['Store Operator', 'Admin'] },
        { id: 'request', label: 'Request Part', icon: Send, role: ['Rework Operator', 'Admin', 'Supervisor'] },
        { id: 'issuance', label: 'Issuance', icon: ClipboardList, role: ['Store Operator', 'Admin', 'Supervisor'] },
        { id: 'reverse', label: 'Reverse Inventory', icon: RotateCcw, role: ['Store Operator', 'Admin', 'Supervisor'] },
        { id: 'analytics', label: 'Analytics', icon: FileBarChart, role: ['Supervisor', 'Admin'] },
    ];

    const filteredMenu = menuItems.filter(item => {
        if (!item.role) return true;
        return item.role.includes(user.role);
    });

    return (
        <div className="animate-fade-in">
            <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                <div className="flex-between">
                    <div>
                        <h1 className="page-title">BAAN Inventory Module</h1>
                        <p className="page-subtitle">Parts management, FIFO issuance & repair tracking</p>
                    </div>
                    <div className="flex-center gap-2">
                        <span className="status-pill info">
                            <User size={12} /> {user.role}
                        </span>
                    </div>
                </div>
            </div>

            <div className="tab-switcher" style={{ marginBottom: '2rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                {filteredMenu.map(item => (
                    <button
                        key={item.id}
                        className={`tab-item ${view === item.id ? 'active' : ''}`}
                        onClick={() => navigate(item.id)}
                    >
                        <item.icon size={14} style={{ marginRight: '0.5rem' }} />
                        {item.label}
                    </button>
                ))}
            </div>

            <main>
                {renderView()}
            </main>
        </div>
    );
};

// Placeholder components for History views
const BaanRequestHistory = () => (
    <div className="card py-10 text-center opacity-50">
        <History size={48} style={{ margin: '0 auto 1rem' }} />
        <h3>Request History View</h3>
        <p>Implementation pending data population</p>
    </div>
);

const BaanIssuanceHistory = () => {
    const { store } = useCQA();
    const history = Object.values(store.baan.partIssuance).sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));

    return (
        <div className="animate-fade-in">
            <h2 className="font-bold" style={{ marginBottom: '1.5rem' }}>Issuance History</h2>
            <div className="table-container card">
                <table>
                    <thead>
                        <tr>
                            <th>Issued At</th>
                            <th>Device SN</th>
                            <th>Part Number</th>
                            <th>Batch</th>
                            <th>Qty</th>
                            <th>Issued By</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.map(h => (
                            <tr key={h.id}>
                                <td>{new Date(h.issuedAt).toLocaleString()}</td>
                                <td className="font-bold">{h.deviceSn}</td>
                                <td className="text-mono">{h.partNumber}</td>
                                <td className="text-xs">{h.batchId}</td>
                                <td className="font-bold">{h.quantity}</td>
                                <td>{h.issuedBy}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default BaanModule;
