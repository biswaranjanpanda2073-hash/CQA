import React, { useState } from 'react';
import { Lock, ShieldAlert, CheckCircle2, AlertCircle } from 'lucide-react';
import { useCQA } from '../hooks/useCQA';

export default function ForceChangePassword({ user, onPasswordChanged, onLogout }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const { changeOwnPassword, authenticateUser } = useCQA();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!currentPassword) {
            setError('Please enter your current password.');
            return;
        }

        if (newPassword.length < 8) {
            setError('New password must be at least 8 characters long.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('New passwords do not match.');
            return;
        }

        if (newPassword === currentPassword) {
            setError('New password must be different from your current password.');
            return;
        }

        setLoading(true);
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
                    setSuccess(true);
                    setTimeout(() => {
                        if (onPasswordChanged) onPasswordChanged();
                    }, 1200);
                } else {
                    alert('Password successfully updated! Please log in with your new password.');
                    if (onLogout) onLogout();
                }
            } else {
                setError('Password update service is unavailable.');
            }
        } catch (err) {
            console.error('Password change error:', err);
            setError(err.message || 'Failed to update password. Please verify your current password.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-center" style={{
            minHeight: '100vh',
            background: 'var(--bg-main)',
            padding: '2rem'
        }}>
            <div className="card animate-fade-in" style={{
                maxWidth: 460,
                width: '100%',
                padding: '2.5rem 2rem',
                boxShadow: '0 20px 40px rgba(0,0,0,0.15)'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                    <div className="flex-center" style={{
                        width: 64,
                        height: 64,
                        borderRadius: '50%',
                        background: 'rgba(239, 68, 68, 0.12)',
                        color: 'var(--error, #ef4444)',
                        margin: '0 auto 1rem'
                    }}>
                        <ShieldAlert size={32} />
                    </div>
                    <h1 className="font-extrabold" style={{ fontSize: '1.375rem', marginBottom: '0.5rem' }}>
                        Password Update Required
                    </h1>
                    <p className="text-muted font-medium text-sm" style={{ lineHeight: 1.6 }}>
                        Hello <strong style={{ color: 'var(--text-main)' }}>{user?.name || user?.id}</strong>. For your security, all user credentials must be updated before accessing CQA MES.
                    </p>
                </div>

                {error && (
                    <div style={{
                        padding: '0.75rem 1rem',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: 'var(--radius)',
                        color: 'var(--error, #ef4444)',
                        fontSize: '0.875rem',
                        marginBottom: '1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}>
                        <AlertCircle size={16} style={{ flexShrink: 0 }} />
                        <span>{error}</span>
                    </div>
                )}

                {success ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '2rem 1rem',
                        background: 'rgba(16, 185, 129, 0.1)',
                        borderRadius: 'var(--radius)',
                        color: 'var(--success, #10b981)'
                    }}>
                        <CheckCircle2 size={40} style={{ margin: '0 auto 0.75rem' }} />
                        <h3 className="font-bold">Password Successfully Updated!</h3>
                        <p className="text-xs text-muted" style={{ marginTop: '0.25rem' }}>Redirecting to your workspace...</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label className="text-xs font-bold uppercase text-muted" style={{ display: 'block', marginBottom: '0.35rem' }}>
                                Current Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="password"
                                    required
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    placeholder="Enter current password"
                                    style={{ paddingLeft: '2.25rem', width: '100%', minHeight: 42 }}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase text-muted" style={{ display: 'block', marginBottom: '0.35rem' }}>
                                New Password (min. 8 characters)
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="password"
                                    required
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Enter new secure password"
                                    style={{ paddingLeft: '2.25rem', width: '100%', minHeight: 42 }}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase text-muted" style={{ display: 'block', marginBottom: '0.35rem' }}>
                                Confirm New Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="password"
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm new secure password"
                                    style={{ paddingLeft: '2.25rem', width: '100%', minHeight: 42 }}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={loading}
                            style={{ minHeight: 44, width: '100%', marginTop: '0.5rem', fontWeight: 'bold' }}
                        >
                            {loading ? 'Securing Account...' : 'Set New Password & Continue'}
                        </button>

                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onLogout}
                            style={{ minHeight: 38, width: '100%', fontSize: '0.875rem' }}
                        >
                            Sign Out
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
