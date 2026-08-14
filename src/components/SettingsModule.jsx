import React, { useState, useMemo } from 'react';
import {
    Users,
    Search,
    Plus,
    Edit3,
    Trash2,
    ShieldCheck,
    Shield,
    UserPlus,
    Key,
    HelpCircle,
    AlertTriangle,
    Wrench,
    Database,
    RefreshCw,
    Lock,
    Loader2,
    CheckCircle2,
    XCircle,
    Activity,
    Clock,
    Settings,
    ChevronDown,
    ChevronRight,
    FileText,
    Copy,
    Eye,
    EyeOff,
    Power,
    Zap,
    Unlock
} from 'lucide-react';
import { useCQA } from '../hooks/useCQA';

/* ═══════════════════════════════════
   USER CONTROL (Admin)
═══════════════════════════════════ */

const USER_ROLES = [
    "Operator",
    "Line Leader",
    "Supervisor",
    "Production Supervisor",
    "Production Manager",
    "IQC Inspector",
    "IPQC Inspector",
    "FQC Inspector",
    "CQA Engineer",
    "Repair Technician",
    "Repair Engineer",
    "Test Engineer",
    "Store Executive",
    "Store Manager",
    "Inventory Controller",
    "Process Engineer",
    "Maintenance Engineer",
    "Planning Coordinator",
    "Admin",
    "Super Admin"
];

export const UserControlSection = ({ user }) => {
    const {
        store,
        createUser,
        updateUser,
        deleteUser,
        resetUserPassword,
        updateTicketStatus,
        getDisplayName,
    } = useCQA();

    const [searchTerm, setSearchTerm] = useState('');
    const [showAddUser, setShowAddUser] = useState(false);
    const [editUser, setEditUser] = useState(null);
    const [showPasswords, setShowPasswords] = useState({});
    const [newUser, setNewUser] = useState({ id: '', name: '', password: '', role: 'Operator', stations: [] });
    const [activeTab, setActiveTab] = useState('users');

    const [localUsers, setLocalUsers] = useState({});
    const [localTickets, setLocalTickets] = useState({});

    React.useEffect(() => {
        let unsubUsers, unsubTickets;
        const init = async () => {
            const { collection, onSnapshot, db } = await import('../firebase');
            unsubUsers = onSnapshot(collection(db, 'users'), snap => {
                const uMap = {};
                snap.forEach(d => { uMap[d.id] = { id: d.id, ...d.data() }; });
                setLocalUsers(uMap);
            });
            unsubTickets = onSnapshot(collection(db, 'tickets'), snap => {
                const tMap = {};
                snap.forEach(d => { tMap[d.id] = { id: d.id, ...d.data() }; });
                setLocalTickets(tMap);
            });
        };
        init();
        return () => {
            if (unsubUsers) unsubUsers();
            if (unsubTickets) unsubTickets();
        };
    }, []);

    const users = Object.values(localUsers);
    const tickets = Object.values(localTickets);

    const filteredUsers = useMemo(() => {
        if (!searchTerm) return users;
        const term = searchTerm.toLowerCase();
        return users.filter(u =>
            u.id.toLowerCase().includes(term) ||
            u.name.toLowerCase().includes(term) ||
            u.role.toLowerCase().includes(term)
        );
    }, [users, searchTerm]);

    // Summary metrics
    const adminCount = users.filter(u => u.role === 'Admin').length;
    const supervisorCount = users.filter(u => u.role === 'Supervisor').length;
    const operatorCount = users.filter(u => u.role === 'Operator').length;
    const pendingTickets = tickets.filter(t => t.status === 'Pending').length;

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            await createUser(newUser);
            setShowAddUser(false);
            setNewUser({ id: '', name: '', password: '', role: 'Operator', stations: [] });
        } catch (err) {
            alert(err.message);
        }
    };

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        try {
            await updateUser(editUser.oldId, editUser);
            setEditUser(null);
        } catch (err) {
            alert(err.message);
        }
    };


    const handleDeleteUser = (uid) => {
        if (window.confirm(`Permanently remove user ${uid}?`)) {
            deleteUser(uid);
        }
    };

    const handleResolveTicket = async (ticketId, approved) => {
        if (!approved) {
            if (window.confirm('Reject this password reset request?')) {
                await updateTicketStatus(ticketId, 'Rejected');
            }
            return;
        }

        const newPw = window.prompt('Enter new password for user (Leave blank for auto-gen):');
        if (newPw === null) return; // Cancelled

        const finalPw = newPw.trim() || 'CQA' + Math.floor(Math.random() * 9000 + 1000);

        if (window.confirm(`Assign password "${finalPw}" and approve request?`)) {
            await resetUserPassword(ticketId, finalPw);
            await updateTicketStatus(ticketId, 'Approved');
            alert(`Password updated to: ${finalPw}`);
        }
    };


    const allStationOptions = [
        'ALL — Unrestricted Access',
        'Device > RECEIVING', 'Device > INSPECTION', 'Device > DEBUG',
        'Device > REWORK', 'Device > FINAL QC', 'Device > PACKING',
        'Device > MOVE TO FG', 'Device > SCRAP REVIEW',
        'Peripherals > RECEIVING', 'Peripherals > QC',
        'Peripherals > MOVE TO FG', 'Peripherals > REJECTION REVIEW',
        'Inward QC > RECEIVING', 'Inward QC > IQC',
        'Inward QC > MOVE TO FG', 'Inward QC > REJECTION',
    ];

    const toggleStation = (setter, current, station) => {
        if (station === 'ALL — Unrestricted Access') {
            setter(prev => ({ ...prev, stations: current.includes(station) ? [] : [station] }));
        } else {
            setter(prev => ({
                ...prev,
                stations: current.filter(s => s !== 'ALL — Unrestricted Access')
                    .includes(station)
                    ? current.filter(s => s !== station)
                    : [...current.filter(s => s !== 'ALL — Unrestricted Access'), station]
            }));
        }
    };

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h1 className="page-title">User Governance</h1>
                <p className="page-subtitle">Manage workforce accounts, permissions, and support tickets</p>
            </div>

            {/* Summary Metrics */}
            <div className="metric-strip">
                <div className="metric-item">
                    <div className="metric-number">{users.length}</div>
                    <div className="metric-label">Total Users</div>
                </div>
                <div className="metric-item">
                    <div className="metric-number" style={{ color: 'var(--primary)' }}>{adminCount}</div>
                    <div className="metric-label">Admins</div>
                </div>
                <div className="metric-item">
                    <div className="metric-number" style={{ color: 'var(--info)' }}>{supervisorCount}</div>
                    <div className="metric-label">Supervisors</div>
                </div>
                <div className="metric-item">
                    <div className="metric-number" style={{ color: 'var(--warning)' }}>{pendingTickets}</div>
                    <div className="metric-label">Pending Tickets</div>
                </div>
            </div>

            {/* Tab Switcher */}
            <div className="tab-switcher" style={{ marginBottom: '1.5rem', maxWidth: 300 }}>
                <button className={`tab-item ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>Users</button>
                <button className={`tab-item ${activeTab === 'tickets' ? 'active' : ''}`} onClick={() => setActiveTab('tickets')}>
                    Tickets {pendingTickets > 0 && <span style={{ marginLeft: 4, color: 'var(--warning)' }}>({pendingTickets})</span>}
                </button>
            </div>

            {activeTab === 'users' && (
                <>
                    {/* Toolbar */}
                    <div className="card" style={{ padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                <input
                                    placeholder="Search users..."
                                    style={{ paddingLeft: '2.25rem', minHeight: 40 }}
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <button className="btn btn-primary" onClick={() => setShowAddUser(!showAddUser)}>
                                <UserPlus size={16} />
                                <span className="hide-mobile">Add User</span>
                            </button>
                        </div>
                    </div>
                    {/* Add User Form */}
                    {showAddUser && (
                        <form className="card animate-fade-in" onSubmit={handleCreateUser} style={{ marginBottom: '1rem' }}>
                            <div className="card-header">
                                <span className="text-sm font-bold">Create New User</span>
                                <button type="button" className="btn-ghost" onClick={() => setShowAddUser(false)} style={{ padding: '0.35rem' }}>
                                    <XCircle size={18} />
                                </button>
                            </div>
                            <div className="card-body">
                                <div className="grid md-grid-2 md-grid-3 gap-4" style={{ marginBottom: '1rem' }}>
                                    <div className="input-field">
                                        <label>User ID</label>
                                        <input required placeholder="e.g. OP001" value={newUser.id} onChange={e => setNewUser({ ...newUser, id: e.target.value })} />
                                    </div>
                                    <div className="input-field">
                                        <label>Full Name</label>
                                        <input required placeholder="e.g. John Doe" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} />
                                    </div>
                                    <div className="input-field">
                                        <label>Password</label>
                                        <input required type="password" placeholder="Set initial password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
                                    </div>
                                    <div className="input-field">
                                        <label>Role</label>
                                        <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                                            {USER_ROLES.map(role => (
                                                <option key={role} value={role}>{role}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="input-field" style={{ marginBottom: '1rem' }}>
                                    <label>Station Access</label>
                                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                        {allStationOptions.map(s => (
                                            <button
                                                key={s}
                                                type="button"
                                                className={`filter-chip ${newUser.stations.includes(s) ? 'active' : ''}`}
                                                onClick={() => toggleStation(setNewUser, newUser.stations, s)}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button type="submit" className="btn btn-primary">
                                    <Plus size={16} /> Create User
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Edit User Form */}

                    {editUser && (
                        <form className="card animate-fade-in" onSubmit={handleUpdateUser} style={{ marginBottom: '1rem', borderLeft: '4px solid var(--primary)' }}>
                            <div className="card-header">
                                <span className="text-sm font-bold">Edit User: {editUser.oldId}</span>
                                <button type="button" className="btn-ghost" onClick={() => setEditUser(null)} style={{ padding: '0.35rem' }}>
                                    <XCircle size={18} />
                                </button>
                            </div>
                            <div className="card-body">
                                <div className="grid md-grid-2 md-grid-3 gap-4" style={{ marginBottom: '1rem' }}>
                                    <div className="input-field">
                                        <label>User ID</label>
                                        <input required value={editUser.id} onChange={e => setEditUser({ ...editUser, id: e.target.value })} />
                                    </div>
                                    <div className="input-field">
                                        <label>Full Name</label>
                                        <input required value={editUser.name} onChange={e => setEditUser({ ...editUser, name: e.target.value })} />
                                    </div>
                                    <div className="input-field">
                                        <label>Password</label>
                                        <input required value={editUser.password} onChange={e => setEditUser({ ...editUser, password: e.target.value })} />
                                    </div>
                                    <div className="input-field">
                                        <label>Role</label>
                                        <select value={editUser.role} onChange={e => setEditUser({ ...editUser, role: e.target.value })}>
                                            {USER_ROLES.map(role => (
                                                <option key={role} value={role}>{role}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="input-field" style={{ marginBottom: '1rem' }}>
                                    <label>Station Access</label>
                                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                        {allStationOptions.map(s => (
                                            <button
                                                key={s}
                                                type="button"
                                                className={`filter-chip ${editUser.stations.includes(s) ? 'active' : ''}`}
                                                onClick={() => toggleStation(setEditUser, editUser.stations, s)}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button type="submit" className="btn btn-primary">
                                        Update User
                                    </button>
                                    <button type="button" className="btn btn-secondary" onClick={() => setEditUser(null)}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </form>
                    )}


                    {/* Users Table */}
                    <div className="table-to-cards">
                        <div className="table-container card">
                            <table>
                                <thead>
                                    <tr>
                                        <th>User ID</th>
                                        <th>Name</th>
                                        <th>Role</th>
                                        <th>Stations</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map(u => (
                                        <tr key={u.id}>
                                            <td data-label="User ID"><span className="text-mono font-bold text-sm">{u.id}</span></td>
                                            <td data-label="Name"><span className="font-semibold">{u.name}</span></td>
                                            <td data-label="Role"><span className={`status-pill ${u.role.toLowerCase()}`}>{u.role}</span></td>
                                            <td data-label="Stations">
                                                <span className="text-xs text-muted truncate" style={{ maxWidth: 200, display: 'block' }}>
                                                    {(u.stations || []).slice(0, 2).join(', ')}{(u.stations?.length > 2) ? ` +${u.stations.length - 2}` : ''}
                                                </span>
                                            </td>
                                            <td data-label="Actions" style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                                                    <button
                                                        className="btn-ghost"
                                                        title="Edit User"
                                                        style={{ padding: '0.35rem' }}
                                                        onClick={() => {
                                                            setEditUser({ ...u, oldId: u.id });
                                                            setShowAddUser(false);
                                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                                        }}
                                                    >
                                                        <Edit3 size={14} />
                                                    </button>
                                                    <button
                                                        className="btn-ghost"
                                                        title="Toggle password visibility"
                                                        style={{ padding: '0.35rem' }}
                                                        onClick={() => setShowPasswords(prev => ({ ...prev, [u.id]: !prev[u.id] }))}
                                                    >
                                                        {showPasswords[u.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    </button>
                                                    <button className="btn-ghost" title="Delete" style={{ padding: '0.35rem', color: 'var(--error)' }} onClick={() => handleDeleteUser(u.id)} disabled={u.id === user.id}>
                                                        <Trash2 size={14} />
                                                    </button>

                                                </div>
                                                {showPasswords[u.id] && (
                                                    <div className="text-mono text-xs" style={{
                                                        marginTop: '0.25rem',
                                                        padding: '0.25rem 0.5rem',
                                                        background: 'var(--bg-input)',
                                                        borderRadius: 'var(--radius-sm)',
                                                        border: '1px solid var(--border)'
                                                    }}>
                                                        {u.password || '•••••'}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredUsers.length === 0 && (
                                        <tr><td colSpan="5">
                                            <div className="empty-state" style={{ padding: '2rem' }}>
                                                <p className="text-sm text-muted">No users found</p>
                                            </div>
                                        </td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'tickets' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {tickets.length === 0 && (
                        <div className="empty-state card" style={{ padding: '3rem' }}>
                            <div className="empty-state-icon"><HelpCircle size={28} /></div>
                            <h3>No Support Tickets</h3>
                            <p>Password reset and access requests will appear here</p>
                        </div>
                    )}
                    {tickets.map(t => (
                        <div key={t.id} className="card animate-fade-in" style={{
                            borderLeft: `4px solid ${t.status === 'Pending' ? 'var(--warning)' : t.status === 'Approved' ? 'var(--success)' : 'var(--error)'}`
                        }}>
                            <div className="card-header">
                                <div>
                                    <span className="font-bold" style={{ fontSize: '0.9375rem' }}>Password Reset — <span className="text-mono">{t.userId}</span></span>
                                    <div className="text-xs text-muted" style={{ marginTop: 2 }}>{t.requestedAt}</div>
                                </div>
                                <span className={`status-pill ${t.status === 'Pending' ? 'warning' : t.status === 'Approved' ? 'success' : 'error'}`}>{t.status}</span>
                            </div>
                            {t.status === 'Pending' && (
                                <div className="card-footer">
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button className="btn btn-primary" onClick={() => handleResolveTicket(t.id, true)}>
                                            <CheckCircle2 size={16} /> Approve
                                        </button>
                                        <button className="btn btn-secondary" style={{ color: 'var(--error)' }} onClick={() => handleResolveTicket(t.id, false)}>
                                            <XCircle size={16} /> Reject
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

/* ═══════════════════════════════════
   MAINTENANCE SECTION (Admin)
═══════════════════════════════════ */
export const MaintenanceSection = ({ user }) => {
    const {
        store,
        toggleMaintenanceMode,
        purgeData,
        updateSystemNames,
        getDisplayName,
        systemNames
    } = useCQA();


    const [purgeTarget, setPurgeTarget] = useState('');
    const [purgeFilters, setPurgeFilters] = useState({ project: '', station: '', serial: '' });
    const [isProcessing, setIsProcessing] = useState(false);
    const [confirmModal, setConfirmModal] = useState(null);
    const [activeMaintenanceTab, setActiveMaintenanceTab] = useState('controls');
    const [editNames, setEditNames] = useState({ ...systemNames });
    const [recordCount, setRecordCount] = useState('...');

    React.useEffect(() => {
        const fetchCount = async () => {
            try {
                const { collection, getCountFromServer, db } = await import('../firebase');
                const snap = await getCountFromServer(collection(db, 'devices'));
                setRecordCount(snap.data().count);
            } catch (e) {
                setRecordCount('Unknown');
            }
        };
        fetchCount();
    }, []);

    const isMaintenanceMode = store.settings?.maintenanceMode || false;

    const handleAction = async (action) => {
        setIsProcessing(true);
        try {
            switch (action) {
                case 'maintenance':
                    await toggleMaintenanceMode(!isMaintenanceMode);
                    break;
                case 'purge':
                    const hasFilters = purgeFilters.project || purgeFilters.station || purgeFilters.serial;
                    const filters = hasFilters ? purgeFilters : purgeTarget;

                    if (!filters) {
                        alert('Select a purge category or specific filters (Project/Station/Serial).');
                        setIsProcessing(false);
                        return;
                    }

                    if (window.confirm("ARE YOU SURE? This will permanently delete matching records.")) {
                        const result = await purgeData(filters);
                        alert(`Purge complete: ${result.count} records deleted.`);
                        setPurgeFilters({ project: '', station: '', serial: '' });
                        setPurgeTarget('');
                    }
                    break;
                case 'save_names':
                    await updateSystemNames(editNames);
                    alert('System nomenclature updated successfully.');
                    break;
            }
        } catch (err) {
            alert('Operation failed: ' + err.message);
        }
        setIsProcessing(false);
        setConfirmModal(null);
    };

    const handleNameChange = (type, key, value) => {
        setEditNames(prev => ({
            ...prev,
            [type]: { ...prev[type], [key]: value }
        }));
    };


    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h1 className="page-title">System Administration</h1>
                <p className="page-subtitle">Maintenance, nomenclature configuration, and infrastructure controls</p>
            </div>

            {/* Sub-tab Switcher */}
            <div className="tab-switcher" style={{ marginBottom: '1.5rem', maxWidth: 400 }}>
                <button className={`tab-item ${activeMaintenanceTab === 'controls' ? 'active' : ''}`} onClick={() => setActiveMaintenanceTab('controls')}>System Controls</button>
                <button className={`tab-item ${activeMaintenanceTab === 'nomenclature' ? 'active' : ''}`} onClick={() => setActiveMaintenanceTab('nomenclature')}>Nomenclature Mapping</button>
            </div>

            {activeMaintenanceTab === 'controls' && (
                <div className="control-grid">
                    {/* Maintenance Mode */}
                    <div className={`control-card ${isMaintenanceMode ? 'active' : ''}`}
                        onClick={() => setConfirmModal('maintenance')}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className="flex-center" style={{
                                width: 44, height: 44,
                                borderRadius: 'var(--radius-md)',
                                background: isMaintenanceMode ? 'var(--warning-bg)' : 'var(--bg-input)',
                            }}>
                                <Power size={22} color={isMaintenanceMode ? 'var(--warning)' : 'var(--text-muted)'} />
                            </div>
                            <span className={`risk-badge ${isMaintenanceMode ? 'high' : 'low'}`}>
                                {isMaintenanceMode ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                        </div>
                        <div>
                            <h3 className="font-bold" style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>Maintenance Mode</h3>
                            <p className="text-xs text-muted" style={{ lineHeight: 1.5 }}>Lock all operator terminals. Admin access only.</p>
                        </div>
                        <span className="risk-badge medium">Medium Risk</span>
                    </div>

                    {/* Data Purge */}
                    <div className="control-card" onClick={() => setConfirmModal('purge')}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className="flex-center" style={{
                                width: 44, height: 44,
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--error-bg)',
                            }}>
                                <Database size={22} color="var(--error)" />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-bold" style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>Data Purge</h3>
                            <p className="text-xs text-muted" style={{ lineHeight: 1.5 }}>Remove completed or obsolete records from the system.</p>
                        </div>
                        <span className="risk-badge critical">Critical Risk</span>
                    </div>

                    {/* System Info */}
                    <div className="control-card" style={{ cursor: 'default' }}>
                        <div className="flex-center" style={{
                            width: 44, height: 44,
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--primary-alpha)',
                        }}>
                            <Settings size={22} color="var(--primary)" />
                        </div>
                        <div>
                            <h3 className="font-bold" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>System Status</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span className="text-xs text-muted font-bold uppercase">Version</span>
                                    <span className="text-xs text-mono font-bold">3.1.0</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span className="text-xs text-muted font-bold uppercase">Users</span>
                                    <span className="text-xs font-bold">{Object.keys(store.users || {}).length}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span className="text-xs text-muted font-bold uppercase">Records</span>
                                    <span className="text-xs font-bold">{recordCount}</span>
                                </div>
                            </div>
                        </div>
                        <span className="risk-badge low">Info Only</span>
                    </div>
                </div>
            )}

            {activeMaintenanceTab === 'nomenclature' && (
                <div className="animate-fade-in">
                    <div className="card" style={{ marginBottom: '1.5rem' }}>
                        <div className="card-header">
                            <div>
                                <h3 className="font-bold" style={{ fontSize: '1rem' }}>Project Display Names</h3>
                                <p className="text-xs text-muted">Customize how production lines are named across the UI</p>
                            </div>
                        </div>
                        <div className="card-body">
                            <div className="grid md-grid-2 md-grid-3 gap-4">
                                {Object.keys(editNames.projects || {}).map(key => (
                                    <div key={key} className="input-field">
                                        <label>{key} (Original)</label>
                                        <input
                                            value={editNames.projects[key] || ''}
                                            onChange={e => handleNameChange('projects', key, e.target.value)}
                                            placeholder={`Rename ${key}...`}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="card" style={{ marginBottom: '1.5rem' }}>
                        <div className="card-header">
                            <div>
                                <h3 className="font-bold" style={{ fontSize: '1rem' }}>Station Display Names</h3>
                                <p className="text-xs text-muted">Customize functional names for production terminals</p>
                            </div>
                        </div>
                        <div className="card-body">
                            <div className="grid md-grid-2 md-grid-3 gap-4">
                                {[
                                    'RECEIVING', 'INSPECTION', 'DEBUG', 'REWORK',
                                    'FINAL QC', 'PACKING', 'MOVE TO FG', 'SCRAP REVIEW',
                                    'QC', 'IQC', 'REJECTION REVIEW', 'REJECTION'
                                ].map(key => (
                                    <div key={key} className="input-field">
                                        <label>{key}</label>
                                        <input
                                            value={editNames.stations?.[key] || ''}
                                            onChange={e => handleNameChange('stations', key, e.target.value)}
                                            placeholder={key}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-primary" onClick={() => handleAction('save_names')} disabled={isProcessing}>
                            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                            Save All Changes
                        </button>
                        <button className="btn btn-secondary" onClick={() => setEditNames({ ...systemNames })}>
                            Reset to Default
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Confirmation Modal ─── */}
            {confirmModal && (
                <div className="modal-overlay" onClick={() => setConfirmModal(null)}>
                    <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                        <div className="card-header" style={{ padding: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div className="flex-center" style={{
                                    width: 40, height: 40,
                                    borderRadius: 'var(--radius-md)',
                                    background: confirmModal === 'purge' ? 'var(--error-bg)' : confirmModal === 'maintenance' ? 'var(--warning-bg)' : 'var(--info-bg)',
                                }}>
                                    {confirmModal === 'purge' && <Database size={20} color="var(--error)" />}
                                    {confirmModal === 'maintenance' && <Power size={20} color="var(--warning)" />}
                                </div>
                                <div>
                                    <h3 className="font-bold" style={{ fontSize: '1.125rem' }}>
                                        {confirmModal === 'maintenance' && (isMaintenanceMode ? 'Disable Maintenance Mode' : 'Enable Maintenance Mode')}
                                        {confirmModal === 'purge' && 'Purge Data'}
                                    </h3>
                                    <p className="text-xs text-muted" style={{ marginTop: 2 }}>This action requires confirmation.</p>
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '1.5rem' }}>
                            {confirmModal === 'purge' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div className="input-field">
                                        <label>Purge by Category</label>
                                        <select value={purgeTarget} onChange={e => {
                                            setPurgeTarget(e.target.value);
                                            if (e.target.value) setPurgeFilters({ project: '', station: '', serial: '' });
                                        }}>
                                            <option value="">Select category...</option>
                                            <option value="completed">Completed Records</option>
                                            <option value="scrap">Scrap / Rejected Records</option>
                                            <option value="all">All Records</option>
                                        </select>
                                    </div>

                                    <div style={{ padding: '0.75rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                                        <p className="text-xs font-bold text-muted mb-3" style={{ marginBottom: '0.75rem' }}>FILTERED DELETE (Overrides Category)</p>
                                        <div className="grid gap-3">
                                            <div className="input-field">
                                                <label>Project</label>
                                                <select
                                                    value={purgeFilters.project}
                                                    onChange={e => {
                                                        setPurgeFilters({ ...purgeFilters, project: e.target.value });
                                                        setPurgeTarget('');
                                                    }}
                                                >
                                                    <option value="">Any Project</option>
                                                    {Object.keys(systemNames.projects || {}).map(p => (
                                                        <option key={p} value={p}>{getDisplayName('projects', p)}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="input-field">
                                                <label>Station Name</label>
                                                <input
                                                    placeholder="e.g. RECEIVING"
                                                    value={purgeFilters.station}
                                                    onChange={e => {
                                                        setPurgeFilters({ ...purgeFilters, station: e.target.value.toUpperCase() });
                                                        setPurgeTarget('');
                                                    }}
                                                />
                                            </div>
                                            <div className="input-field">
                                                <label>Serial Number</label>
                                                <input
                                                    placeholder="Direct SN delete..."
                                                    value={purgeFilters.serial}
                                                    onChange={e => {
                                                        setPurgeFilters({ ...purgeFilters, serial: e.target.value.toUpperCase().replace(/\//g, '-') });
                                                        setPurgeTarget('');
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div style={{
                                padding: '1rem',
                                background: confirmModal === 'purge' ? 'var(--error-bg)' : 'var(--warning-bg)',
                                borderRadius: 'var(--radius-md)',
                                marginBottom: '1.5rem',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <AlertTriangle size={16} color={confirmModal === 'purge' ? 'var(--error)' : 'var(--warning)'} />
                                    <span className="text-sm font-bold" style={{ color: confirmModal === 'purge' ? 'var(--error)' : 'var(--warning)' }}>
                                        {confirmModal === 'purge' ? 'This action is irreversible.' : 'Proceed with caution.'}
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    className={`btn ${confirmModal === 'purge' ? 'btn-danger' : 'btn-primary'}`}
                                    style={{ flex: 1, height: 48 }}
                                    onClick={() => handleAction(confirmModal)}
                                    disabled={isProcessing}
                                >
                                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                    Confirm
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    style={{ flex: 1, height: 48 }}
                                    onClick={() => setConfirmModal(null)}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

