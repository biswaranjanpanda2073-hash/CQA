import React, { useState } from 'react';
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
import { auth, signOut } from '../firebase';

const UserControl = ({ user }) => {
    const { requestPasswordReset, getAuditLogs, getDisplayName, changeOwnPassword, authenticateUser } = useCQA();

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

    const [showChangePw, setShowChangePw] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pwLoading, setPwLoading] = useState(false);
    const [pwMessage, setPwMessage] = useState({ text: '', type: '' });
    const handleChangePassword = async (e) => {
        e.preventDefault();
        setPwMessage({ text: '', type: '' });
        if (!currentPassword) {
            setPwMessage({ text: 'Please enter your current password.', type: 'error' });
            return;
        }
        if (newPassword.length < 8) {
            setPwMessage({ text: 'New password must be at least 8 characters long.', type: 'error' });
            return;
        }
        if (newPassword !== confirmPassword) {
            setPwMessage({ text: 'New passwords do not match.', type: 'error' });
            return;
        }

        setPwLoading(true);
        try {
            if (changeOwnPassword) {
                await changeOwnPassword(currentPassword, newPassword);

                // Silently re-authenticate to renew session and refresh claims
                let reauthSuccess = false;
                try {
                    const reauth = await authenticateUser(user.id, newPassword);
                    if (reauth && reauth.success) {
                        reauthSuccess = true;
                    }
                } catch (reauthErr) {
                    console.warn('[Auth] Silent reauth error:', reauthErr);
                }

                if (reauthSuccess) {
                    setPwMessage({ text: 'Password changed successfully! Session renewed.', type: 'success' });
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setTimeout(() => setShowChangePw(false), 2000);
                } else {
                    alert('Password changed successfully! Please log in with your new password.');
                    await signOut(auth);
                }
            } else {
                setPwMessage({ text: 'Password change service unavailable.', type: 'error' });
            }
        } catch (err) {
            setPwMessage({ text: err.message || 'Failed to change password. Please verify current password.', type: 'error' });
        } finally {
            setPwLoading(false);
        }
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

                {/* Actions & Change Password */}
                <div className="card" style={{ gridColumn: '1 / -1' }}>
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Activity size={16} color="var(--warning)" />
                            <span className="text-sm font-bold">Account Security & Actions</span>
                        </div>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: showChangePw ? '1.5rem' : 0 }}>
                            <button className="btn btn-primary" onClick={() => setShowChangePw(!showChangePw)}>
                                <Key size={16} />
                                {showChangePw ? 'Hide Password Form' : 'Change Password'}
                            </button>
                            <button className="btn btn-secondary" onClick={handleResetPassword}>
                                <Lock size={16} />
                                Request Admin Password Reset
                            </button>
                            <button className="btn btn-secondary" onClick={handleDownloadLogs}>
                                <Download size={16} />
                                Download Audit Logs
                            </button>
                        </div>

                        {showChangePw && (
                            <form onSubmit={handleChangePassword} style={{
                                maxWidth: 440,
                                padding: '1.25rem',
                                background: 'var(--bg-input)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-light)',
                                marginTop: '1rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1rem'
                            }}>
                                <h3 className="font-bold text-sm" style={{ margin: 0 }}>Change Your Password</h3>
                                
                                {pwMessage.text && (
                                    <div style={{
                                        padding: '0.65rem 0.85rem',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        background: pwMessage.type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)',
                                        color: pwMessage.type === 'success' ? 'var(--success)' : 'var(--error)'
                                    }}>
                                        {pwMessage.text}
                                    </div>
                                )}

                                <div className="input-field">
                                    <label>Current Password</label>
                                    <input
                                        type="password"
                                        required
                                        placeholder="Enter current password"
                                        value={currentPassword}
                                        onChange={e => setCurrentPassword(e.target.value)}
                                    />
                                </div>

                                <div className="input-field">
                                    <label>New Password (min 8 chars)</label>
                                    <input
                                        type="password"
                                        required
                                        placeholder="Enter new password (min 8 characters)"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                    />
                                </div>

                                <div className="input-field">
                                    <label>Confirm New Password</label>
                                    <input
                                        type="password"
                                        required
                                        placeholder="Confirm new password"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                    <button type="submit" className="btn btn-primary" disabled={pwLoading}>
                                        {pwLoading ? 'Updating...' : 'Update Password'}
                                    </button>
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowChangePw(false)}>
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserControl;
