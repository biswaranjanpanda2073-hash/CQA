import React from 'react';
import {
    User,
    ShieldCheck,
    Calendar,
    Lock,
    Download,
    Key,
    Clock,
    Activity
} from 'lucide-react';
import { useCQA } from '../hooks/useCQA';

const UserControl = ({ user }) => {
    const { requestPasswordReset, getAuditLogs, getDisplayName } = useCQA();

    const roleColor = user?.role === 'Admin' ? 'admin' : user?.role === 'Supervisor' ? 'supervisor' : 'operator';

    const handleResetPassword = () => {
        if (window.confirm('Submit a password reset request?')) {
            requestPasswordReset(user.id);
            alert('Reset request submitted. Admin will process it.');
        }
    };

    const handleDownloadLogs = () => {
        const logs = getAuditLogs(user.id);
        if (logs && logs.length > 0) {
            const csvHeader = 'Timestamp,Action,Details\n';
            const csvRows = logs.map(l => `"${l.timestamp}","${l.action}","${l.details || ''}"`).join('\n');
            const blob = new Blob([csvHeader + csvRows], { type: 'text/csv' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `AuditLog-${user.id}.csv`;
            link.click();
        } else {
            alert('No audit logs available for your account.');
        }
    };

    const getPermissionsList = () => {
        if (!user?.stations || user.stations.includes('ALL — Unrestricted Access')) {
            return ['Full System Access — All stations and projects'];
        }
        return user.stations;
    };

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h1 className="page-title">My Profile</h1>
                <p className="page-subtitle">Account details, permissions, and activity</p>
            </div>

            <div className="grid md-grid-2 gap-4">
                {/* Identity Card */}
                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <User size={16} color="var(--primary)" />
                            <span className="text-sm font-bold">Identity</span>
                        </div>
                        <span className={`status-pill ${roleColor}`}>{user?.role}</span>
                    </div>
                    <div className="card-body">
                        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                            <div className="flex-center" style={{
                                width: 72, height: 72,
                                borderRadius: '50%',
                                background: 'var(--primary-alpha)',
                                margin: '0 auto 1rem',
                            }}>
                                <User size={32} color="var(--primary)" />
                            </div>
                            <h2 className="font-extrabold" style={{ fontSize: '1.375rem', marginBottom: '0.25rem' }}>{user?.name}</h2>
                            <p className="text-mono text-sm font-semibold text-muted">{user?.id}</p>
                        </div>

                        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                                <span className="text-xs font-bold uppercase text-muted">Role</span>
                                <span className="font-bold text-sm">{user?.role}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                                <span className="text-xs font-bold uppercase text-muted">Status</span>
                                <span className="status-pill success">Active</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                                <span className="text-xs font-bold uppercase text-muted">Session</span>
                                <span className="text-xs text-mono font-semibold text-muted">{new Date().toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Permissions Card */}
                <div className="card">
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ShieldCheck size={16} color="var(--info)" />
                            <span className="text-sm font-bold">Access Permissions</span>
                        </div>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {getPermissionsList().map((perm, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    padding: '0.75rem',
                                    background: 'var(--bg-input)',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border-light)',
                                }}>
                                    <Key size={14} color="var(--primary)" style={{ flexShrink: 0 }} />
                                    <span className="font-semibold text-sm">{perm}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="card" style={{ gridColumn: '1 / -1' }}>
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Activity size={16} color="var(--warning)" />
                            <span className="text-sm font-bold">Account Actions</span>
                        </div>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <button className="btn btn-secondary" onClick={handleResetPassword}>
                                <Lock size={16} />
                                Request Password Reset
                            </button>
                            <button className="btn btn-secondary" onClick={handleDownloadLogs}>
                                <Download size={16} />
                                Download Audit Logs
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserControl;
