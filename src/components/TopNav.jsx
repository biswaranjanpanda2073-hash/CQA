import React, { useState, useEffect, useRef } from 'react';
import {
    Sun,
    Moon,
    ChevronDown,
    User,
    Clock,
    Menu,
    Factory,
    Wifi,
    WifiOff,
    Bell,
    ChevronRight
} from 'lucide-react';

const TopNav = ({ theme, toggleTheme, activeSection, user, onSectionChange, toggleSidebar }) => {
    const [time, setTime] = useState(new Date());
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const profileRef = useRef(null);

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        const handleClick = (e) => {
            if (profileRef.current && !profileRef.current.contains(e.target)) {
                setShowProfileMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const sectionLabels = {
        dashboard: 'Dashboard',
        operation: 'Operation',
        info: 'Info Centre',
        profile: 'Profile',
        users: 'User Control',
        maintenance: 'Maintenance'
    };

    const formatTime = (d) => d.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });

    const formatDate = (d) => d.toLocaleDateString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short'
    });

    return (
        <nav className="top-nav">
            {/* Left Section */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button className="nav-trigger" onClick={toggleSidebar} aria-label="Toggle Menu">
                    <Menu size={20} />
                </button>

                {/* System Name on mobile */}
                <div className="show-mobile-only" style={{ alignItems: 'center', gap: '0.4rem' }}>
                    <Factory size={16} color="var(--primary)" />
                    <span className="font-bold" style={{ fontSize: '0.9375rem' }}>CQA</span>
                </div>

                {/* Breadcrumb */}
                <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ChevronRight size={14} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                    <span className="text-xs font-bold uppercase" style={{
                        color: 'var(--primary)',
                        letterSpacing: '0.04em'
                    }}>
                        {sectionLabels[activeSection] || 'Dashboard'}
                    </span>
                </div>

                {/* Firebase Status */}
                <div className="hide-mobile" style={{ marginLeft: '1rem' }}>
                    <div className="status-indicator" style={{
                        padding: '0.3rem 0.6rem',
                        background: isOnline ? 'var(--success-bg)' : 'var(--error-bg)',
                        borderRadius: 'var(--radius-full)',
                    }}>
                        <div className={`status-dot ${isOnline ? 'online' : 'offline'}`}></div>
                        <span style={{ color: isOnline ? 'var(--success)' : 'var(--error)' }}>
                            {isOnline ? 'Connected' : 'Offline'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Right Section */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {/* Date/Time Capsule */}
                <div className="hide-mobile" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.4rem 1rem',
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-full)',
                    border: '1px solid var(--border-light)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Clock size={13} color="var(--text-muted)" />
                        <span className="text-mono text-sm font-semibold" style={{ fontSize: '0.8125rem' }}>
                            {formatTime(time)}
                        </span>
                    </div>
                    <div style={{ width: 1, height: 14, background: 'var(--border)' }}></div>
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                        {formatDate(time)}
                    </span>
                </div>

                {/* Theme Toggle */}
                <button
                    className="btn-ghost"
                    style={{
                        width: 38, height: 38,
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-light)',
                        padding: 0,
                    }}
                    onClick={toggleTheme}
                    title="Toggle appearance"
                >
                    {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                </button>

                {/* Profile Menu */}
                <div ref={profileRef} style={{ position: 'relative' }}>
                    <button
                        className="btn-ghost"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.35rem 0.5rem',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-light)',
                        }}
                        onClick={() => setShowProfileMenu(!showProfileMenu)}
                    >
                        <div className="flex-center" style={{
                            width: 28, height: 28,
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--primary-alpha)',
                        }}>
                            <User size={14} color="var(--primary)" />
                        </div>
                        <span className="hide-mobile font-semibold" style={{ fontSize: '0.8125rem' }}>
                            {user?.name?.split(' ')[0] || 'User'}
                        </span>
                        <ChevronDown size={14} className="hide-mobile" style={{ color: 'var(--text-muted)' }} />
                    </button>

                    {showProfileMenu && (
                        <div className="card animate-fade-in" style={{
                            position: 'absolute',
                            top: 'calc(100% + 0.5rem)',
                            right: 0,
                            minWidth: 200,
                            zIndex: 200,
                            padding: '0.5rem',
                        }}>
                            <div style={{
                                padding: '0.75rem',
                                borderBottom: '1px solid var(--border-light)',
                                marginBottom: '0.25rem'
                            }}>
                                <div className="font-bold" style={{ fontSize: '0.875rem' }}>{user?.name}</div>
                                <div className="text-xs" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{user?.id}</div>
                                <span className={`status-pill ${user?.role?.toLowerCase()}`} style={{ marginTop: '0.35rem' }}>
                                    {user?.role}
                                </span>
                            </div>
                            <button
                                className="nav-item"
                                style={{ fontSize: '0.8125rem', width: '100%' }}
                                onClick={() => { onSectionChange('profile'); setShowProfileMenu(false); }}
                            >
                                <User size={14} />
                                <span>View Profile</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default TopNav;
