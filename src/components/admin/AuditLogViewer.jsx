import React, { useState, useEffect, useMemo } from 'react';
import {
    History,
    Search,
    Filter,
    RefreshCw,
    Download,
    Eye,
    Shield,
    Calendar,
    User,
    CheckCircle2,
    XCircle,
    ArrowRight,
    SlidersHorizontal,
    FileText,
    Database,
    Tag,
    X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { fetchAuditLogs } from '../../utils/auditLogger';

export const AuditLogViewer = ({ _user, _initialProject = null } = {}) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [entityFilter, setEntityFilter] = useState('ALL');
    const [selectedLog, setSelectedLog] = useState(null);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const list = await fetchAuditLogs({ maxCount: 200 });
            setLogs(list);
        } catch (err) {
            console.error('Error loading audit logs:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLogs();
    }, []);

    const filteredLogs = useMemo(() => {
        return logs.filter(l => {
            const matchesEntity = entityFilter === 'ALL' || l.entity === entityFilter;
            const term = searchTerm.trim().toLowerCase();
            const matchesSearch = !term ||
                (l.actorName && l.actorName.toLowerCase().includes(term)) ||
                (l.actorId && l.actorId.toLowerCase().includes(term)) ||
                (l.action && l.action.toLowerCase().includes(term)) ||
                (l.entityId && l.entityId.toLowerCase().includes(term)) ||
                (l.reason && l.reason.toLowerCase().includes(term)) ||
                (l.remarks && l.remarks.toLowerCase().includes(term));

            return matchesEntity && matchesSearch;
        });
    }, [logs, entityFilter, searchTerm]);

    const handleExport = () => {
        if (filteredLogs.length === 0) return;
        const exportData = filteredLogs.map(l => ({
            'Log ID': l.id,
            'Timestamp': l.timestamp,
            'Actor ID': l.actorId,
            'Actor Name': l.actorName,
            'Role': l.actorRole,
            'Action': l.action,
            'Entity': l.entity,
            'Entity ID': l.entityId,
            'Project': l.project || 'Global',
            'Reason': l.reason,
            'Remarks': l.remarks
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Audit Trail');
        XLSX.writeFile(wb, `CQA_Audit_Logs_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const getActionBadgeColor = (action = '') => {
        if (action.includes('CREATED') || action.includes('PUBLISHED')) return 'var(--success)';
        if (action.includes('ARCHIVED') || action.includes('DEACTIVATED') || action.includes('PURGED')) return 'var(--error)';
        if (action.includes('TOGGLED') || action.includes('RESET')) return 'var(--warning)';
        return 'var(--primary)';
    };

    return (
        <div className="animate-fade-in">
            {/* Header / Filter Toolbar */}
            <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: 280, alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                placeholder="Search audit trail by actor, action, ID, reason..."
                                style={{ paddingLeft: '2.25rem', height: 40, width: '100%' }}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select
                            value={entityFilter}
                            onChange={e => setEntityFilter(e.target.value)}
                            style={{ height: 40, padding: '0 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}
                        >
                            <option value="ALL">All Entities</option>
                            <option value="project">Projects</option>
                            <option value="station">Stations</option>
                            <option value="workflow">Workflows</option>
                            <option value="checkpoint">Checkpoints</option>
                            <option value="baan_part">BAAN Parts</option>
                            <option value="baan_location">BAAN Locations</option>
                            <option value="user">Users</option>
                            <option value="role">Roles</option>
                            <option value="system">System Settings</option>
                            <option value="device">Devices / Serials</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary" onClick={loadLogs} disabled={loading} style={{ height: 40, padding: '0 1rem' }}>
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                            <span>Refresh</span>
                        </button>
                        <button className="btn btn-secondary" onClick={handleExport} disabled={filteredLogs.length === 0} style={{ height: 40, padding: '0 1rem' }}>
                            <Download size={15} />
                            <span>Export Excel</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Audit Table */}
            <div className="table-to-cards">
                <div className="table-container card">
                    <table>
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Actor</th>
                                <th>Action</th>
                                <th>Entity & ID</th>
                                <th>Project</th>
                                <th>Reason & Remarks</th>
                                <th style={{ textAlign: 'right' }}>Inspection</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLogs.map(log => (
                                <tr key={log.id}>
                                    <td data-label="Timestamp">
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span className="text-mono text-xs font-bold">{new Date(log.timestamp).toLocaleDateString()}</span>
                                            <span className="text-muted text-xs">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                        </div>
                                    </td>
                                    <td data-label="Actor">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <div className="flex-center" style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--primary-alpha)', color: 'var(--primary)', fontSize: 11, fontWeight: 800 }}>
                                                {(log.actorName || 'A')[0]}
                                            </div>
                                            <div>
                                                <span className="font-bold text-xs block">{log.actorName}</span>
                                                <span className="text-xs text-muted font-semibold">{log.actorRole}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td data-label="Action">
                                        <span style={{
                                            display: 'inline-block',
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            border: `1px solid ${getActionBadgeColor(log.action)}`,
                                            color: getActionBadgeColor(log.action),
                                            background: `${getActionBadgeColor(log.action)}12`
                                        }}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td data-label="Entity">
                                        <span className="text-xs font-bold uppercase text-muted block">{log.entity}</span>
                                        <span className="text-mono font-bold text-xs">{log.entityId}</span>
                                    </td>
                                    <td data-label="Project">
                                        <span className="text-xs font-semibold">{log.project || 'Global'}</span>
                                    </td>
                                    <td data-label="Reason">
                                        <div style={{ maxWidth: 260 }}>
                                            <span className="text-xs font-bold block truncate">{log.reason || '—'}</span>
                                            {log.remarks && <span className="text-xs text-muted truncate block">{log.remarks}</span>}
                                        </div>
                                    </td>
                                    <td data-label="Inspection" style={{ textAlign: 'right' }}>
                                        <button
                                            className="btn-ghost"
                                            style={{ padding: '4px 8px' }}
                                            onClick={() => setSelectedLog(log)}
                                            title="View Snapshot & Diff"
                                        >
                                            <Eye size={15} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredLogs.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '3rem' }}>
                                        <History size={36} color="var(--text-muted)" style={{ margin: '0 auto 0.75rem' }} />
                                        <p className="text-muted font-bold text-sm">No audit logs matching current filter.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Audit Log Detail Modal */}
            {selectedLog && (
                <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
                    <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
                        <div className="card-header" style={{ padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Shield size={18} color="var(--primary)" />
                                <h3 className="font-bold text-sm" style={{ margin: 0 }}>Audit Entry: {selectedLog.id}</h3>
                            </div>
                            <button className="btn-ghost" onClick={() => setSelectedLog(null)} style={{ padding: 4 }}>
                                <X size={16} />
                            </button>
                        </div>

                        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="grid grid-2 gap-3" style={{ background: 'var(--bg-input)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                                <div>
                                    <span className="text-xs text-muted uppercase font-bold block">Timestamp</span>
                                    <span className="text-xs font-bold text-mono">{selectedLog.timestamp}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-muted uppercase font-bold block">Actor</span>
                                    <span className="text-xs font-bold">{selectedLog.actorName} ({selectedLog.actorRole})</span>
                                </div>
                                <div>
                                    <span className="text-xs text-muted uppercase font-bold block">Action</span>
                                    <span className="text-xs font-bold" style={{ color: getActionBadgeColor(selectedLog.action) }}>{selectedLog.action}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-muted uppercase font-bold block">Entity & ID</span>
                                    <span className="text-xs font-bold">{selectedLog.entity}: {selectedLog.entityId}</span>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-muted uppercase font-bold block mb-1">Reason & Remarks</label>
                                <div style={{ padding: '0.75rem', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                                    <p className="text-xs font-bold mb-1">{selectedLog.reason || 'No specific reason given'}</p>
                                    <p className="text-xs text-muted">{selectedLog.remarks || 'No additional remarks'}</p>
                                </div>
                            </div>

                            {/* State Snapshot Diffs */}
                            <div className="grid grid-2 gap-3">
                                <div>
                                    <label className="text-xs text-muted uppercase font-bold block mb-1">Previous State</label>
                                    <pre style={{
                                        maxHeight: 180, overflowY: 'auto', padding: '0.75rem', background: 'var(--bg-input)',
                                        borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '11px', fontFamily: 'monospace'
                                    }}>
                                        {selectedLog.previousValue ? JSON.stringify(selectedLog.previousValue, null, 2) : 'None (Created / Initial)'}
                                    </pre>
                                </div>
                                <div>
                                    <label className="text-xs text-muted uppercase font-bold block mb-1">New State</label>
                                    <pre style={{
                                        maxHeight: 180, overflowY: 'auto', padding: '0.75rem', background: 'var(--bg-input)',
                                        borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '11px', fontFamily: 'monospace'
                                    }}>
                                        {selectedLog.newValue ? JSON.stringify(selectedLog.newValue, null, 2) : 'None'}
                                    </pre>
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setSelectedLog(null)} style={{ height: 38, padding: '0 1.25rem' }}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AuditLogViewer;
