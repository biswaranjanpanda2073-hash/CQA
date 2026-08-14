import React, { useState } from 'react';
import {
    LayoutDashboard,
    ClipboardList,
    FileSearch,
    Settings,
    ShieldCheck,
    Wrench,
    LogOut,
    User,
    X,
    ChevronDown,
    Factory,
    Database
} from 'lucide-react';

const Sidebar = ({ activeSection, setActiveSection, onLogout, user, isOpen, setOpen }) => {
    const [settingsOpen, setSettingsOpen] = useState(['users', 'maintenance'].includes(activeSection));

    const mainItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'operation', label: 'Operation', icon: ClipboardList },
        { id: 'info', label: 'Info Centre', icon: FileSearch },
        { id: 'baan', label: 'BAAN', icon: Database },
    ];

    const settingsSubItems = [
        { id: 'users', label: 'User Control', icon: ShieldCheck },
        { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    ];

    const isSettingsActive = ['users', 'maintenance'].includes(activeSection);

    const handleNav = (id) => {
        if (id === 'info') {
            window.open(`${window.location.origin}${window.location.pathname}?section=info`, '_blank');
            return;
        }
        setActiveSection(id);
        setOpen(false);
    };

    return (
        <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
            {/* Brand Header */}
            <div className="sidebar-header">
                <div className="flex-center" style={{
                    width: 38, height: 38,
                    background: 'var(--primary)',
                    color: 'white',
                    borderRadius: 'var(--radius-md)',
                    flexShrink: 0
                }}>
                    <Factory size={18} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                    <span className="font-extrabold" style={{
                        fontSize: '0.9375rem',
                        color: 'var(--text-main)',
                        letterSpacing: '-0.3px'
                    }}>CQA MES</span>
                    <span className="text-xs" style={{
                        color: 'var(--text-muted)',
                        fontSize: '0.625rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em'
                    }}>Manufacturing System</span>
                </div>
                <button
                    className="btn-ghost"
                    onClick={() => setOpen(false)}
                    style={{ display: 'none' }}
                    id="sidebar-close-desktop"
                >
                    <X size={18} />
                </button>
                {/* Mobile close */}
                <button
                    className="btn-ghost show-mobile-only"
                    onClick={() => setOpen(false)}
                    style={{
                        padding: '0.4rem',
                        borderRadius: 'var(--radius-sm)',
                        flexShrink: 0
                    }}
                >
                    <X size={18} />
                </button>
            </div>

            {/* User Profile Block */}
            <div style={{ padding: '0.75rem' }}>
                <div
                    className="card clickable"
                    style={{
                        padding: '0.65rem 0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                    }}
                    onClick={() => handleNav('profile')}
                >
                    <div className="flex-center" style={{
                        width: 34, height: 34,
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--primary-alpha)',
                        flexShrink: 0
                    }}>
                        <User size={16} color="var(--primary)" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                        <span className="font-bold truncate" style={{ fontSize: '0.8125rem' }}>{user?.name || 'Operator'}</span>
                        <span className="text-xs uppercase" style={{
                            color: 'var(--primary)',
                            fontSize: '0.5625rem',
                            fontWeight: 700,
                            letterSpacing: '0.04em'
                        }}>{user?.role}</span>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="sidebar-nav">
                <div className="text-xs uppercase" style={{
                    color: 'var(--text-muted)',
                    padding: '0.75rem 0.85rem 0.5rem',
                    fontWeight: 600,
                    fontSize: '0.625rem',
                    letterSpacing: '0.06em'
                }}>Main</div>
                {mainItems.map(item => (
                    <button
                        key={item.id}
                        className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
                        onClick={() => handleNav(item.id)}
                    >
                        <item.icon size={18} />
                        <span>{item.label}</span>
                    </button>
                ))}

                {user?.role === 'Admin' && (
                    <>
                        <div className="text-xs uppercase" style={{
                            color: 'var(--text-muted)',
                            padding: '1.25rem 0.85rem 0.5rem',
                            fontWeight: 600,
                            fontSize: '0.625rem',
                            letterSpacing: '0.06em'
                        }}>Governance</div>
                        <button
                            className={`nav-item ${isSettingsActive ? 'active' : ''}`}
                            onClick={() => setSettingsOpen(!settingsOpen)}
                        >
                            <Settings size={18} />
                            <span>Settings</span>
                            <ChevronDown
                                size={14}
                                style={{
                                    marginLeft: 'auto',
                                    transform: settingsOpen ? 'rotate(180deg)' : 'none',
                                    transition: 'var(--transition)'
                                }}
                            />
                        </button>

                        <div style={{
                            display: settingsOpen ? 'flex' : 'none',
                            flexDirection: 'column',
                            gap: 2,
                            paddingLeft: '1.25rem',
                            marginLeft: '1rem',
                            borderLeft: '1px solid var(--border)',
                        }}>
                            {settingsSubItems.map(item => (
                                <button
                                    key={item.id}
                                    className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
                                    onClick={() => handleNav(item.id)}
                                    style={{ fontSize: '0.8125rem', padding: '0.55rem 0.75rem' }}
                                >
                                    <item.icon size={16} />
                                    <span>{item.label}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </nav>

            {/* Footer */}
            <div style={{
                padding: '0.75rem',
                borderTop: '1px solid var(--border)',
                marginTop: 'auto'
            }}>
                <button
                    className="btn btn-secondary"
                    style={{
                        width: '100%',
                        justifyContent: 'flex-start',
                        color: 'var(--error)',
                        fontSize: '0.8125rem'
                    }}
                    onClick={() => {
                        if (window.confirm('End current session?')) onLogout();
                    }}
                >
                    <LogOut size={16} />
                    <span className="font-semibold">Sign Out</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
