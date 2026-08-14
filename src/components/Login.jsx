import React, { useState } from 'react';
import { LogIn, Loader2, AlertTriangle, Lock, Factory, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useCQA } from '../hooks/useCQA';

const Login = ({ onLogin }) => {
    const { authenticateUser } = useCQA();
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!userId.trim() || !password.trim()) {
            setError('All fields are required');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const cleanId = userId.trim();
            const result = await authenticateUser(cleanId, password.trim());
            if (result.success) {
                onLogin(result.user);
            } else {
                setError(result.message || 'Authentication failed');
            }
        } catch (err) {
            setError('Connection error. Please retry.');
        }
        setLoading(false);
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            minWidth: '100vw',
            background: 'var(--bg-main)',
            fontFamily: 'var(--font-sans)',
            padding: '1rem',
        }}>
            <div className="animate-fade-in" style={{
                width: '100%',
                maxWidth: 420,
            }}>
                {/* Brand Section */}
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <div className="flex-center" style={{
                        width: 64, height: 64,
                        background: 'var(--primary)',
                        color: 'white',
                        borderRadius: 'var(--radius-lg)',
                        margin: '0 auto 1.25rem',
                        boxShadow: '0 8px 32px rgba(22, 101, 52, 0.25)',
                    }}>
                        <Factory size={28} />
                    </div>
                    <h1 className="font-extrabold" style={{
                        fontSize: '1.75rem',
                        color: 'var(--text-main)',
                        letterSpacing: '-0.5px',
                    }}>CQA MES</h1>
                    <p className="text-muted font-semibold" style={{
                        fontSize: '0.8125rem',
                        marginTop: '0.35rem',
                    }}>Critical Quality Assurance System</p>
                </div>

                {/* Login Card */}
                <div className="card" style={{
                    padding: '2rem',
                    borderRadius: 'var(--radius-xl)',
                    boxShadow: 'var(--shadow-lg)',
                }}>
                    <div style={{ marginBottom: '1.75rem' }}>
                        <h2 className="font-extrabold" style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Welcome Back</h2>
                        <p className="text-muted text-sm font-semibold">Sign in to continue</p>
                    </div>

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div className="input-field">
                            <label>Employee ID</label>
                            <input
                                type="text"
                                placeholder="Enter your ID..."
                                value={userId}
                                onChange={e => { setUserId(e.target.value); setError(''); }}
                                className="text-mono font-bold"
                                style={{ height: 52, fontSize: '1rem', letterSpacing: '0.02em' }}
                                autoFocus
                            />
                        </div>

                        <div className="input-field">
                            <label>Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Enter password..."
                                    value={password}
                                    onChange={e => { setPassword(e.target.value); setError(''); }}
                                    style={{ height: 52, fontSize: '1rem', paddingRight: '3rem' }}
                                />
                                <button
                                    type="button"
                                    className="btn-ghost"
                                    style={{
                                        position: 'absolute',
                                        right: '0.5rem',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        padding: '0.35rem'
                                    }}
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="animate-fade-in" style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.65rem',
                                padding: '0.85rem 1rem',
                                background: 'var(--error-bg)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid rgba(220,38,38,0.15)',
                                color: 'var(--error)',
                            }}>
                                <AlertTriangle size={16} />
                                <span className="text-sm font-bold">{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={loading}
                            style={{
                                width: '100%',
                                height: 52,
                                fontSize: '1rem',
                                marginTop: '0.5rem',
                            }}
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={20} className="animate-spin" />
                                    Authenticating...
                                </>
                            ) : (
                                <>
                                    <LogIn size={20} />
                                    Sign In
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Security Notice */}
                <div className="flex-center" style={{
                    gap: '0.4rem',
                    marginTop: '1.5rem',
                    opacity: 0.5,
                }}>
                    <ShieldCheck size={13} />
                    <span className="text-xs font-semibold text-muted">Secured System • Authorized Access Only</span>
                </div>
            </div>
        </div>
    );
};

export default Login;
