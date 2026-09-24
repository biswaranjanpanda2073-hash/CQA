import React, { useState } from 'react';
import {
    LayoutDashboard,
    Layers,
    Cpu,
    Database,
    Shield,
    Users,
    GitBranch,
    History,
    Wrench,
    ShieldAlert,
    Network
} from 'lucide-react';
import { hasPermission, PERMISSIONS } from '../../utils/rbacEngine';
import AdminDashboardOverview from './AdminDashboardOverview';
import RbacManager from './RbacManager';
import AuditLogViewer from './AuditLogViewer';
import ProjectStudio from './ProjectStudio';
import StationStudio from './StationStudio';
import BaanMasterStudio from './BaanMasterStudio';
import SerialGovernanceStudio from './SerialGovernanceStudio';
import WorkflowStudio from './WorkflowStudio';
import { UserControlSection, MaintenanceSection } from '../SettingsModule';

export const AdminLayout = ({ user, initialTab = 'overview', initialSerial = null }) => {
    const isSuperAdmin = user?.role === 'Super Admin';
    const isAdmin = user?.role === 'Admin' || isSuperAdmin;

    const [prevInitialTab, setPrevInitialTab] = useState(initialTab);
    const [activeTab, setActiveTab] = useState(initialTab || 'overview');

    if (initialTab !== prevInitialTab) {
        setPrevInitialTab(initialTab);
        setActiveTab(initialTab || 'overview');
    }

    if (!isAdmin) {
        return (
            <div className="flex-center" style={{ minHeight: '80vh', padding: '2rem' }}>
                <div className="card" style={{ maxWidth: 480, padding: '3rem 2rem', textAlign: 'center' }}>
                    <ShieldAlert size={56} color="var(--error)" style={{ margin: '0 auto 1.25rem' }} />
                    <h2 className="font-extrabold text-xl mb-2" style={{ color: 'var(--error)' }}>
                        Access Restricted
                    </h2>
                    <p className="text-muted text-sm" style={{ lineHeight: 1.6 }}>
                        The centralized <strong>Admin Console</strong> requires Administrator or Super Administrator credentials.
                    </p>
                </div>
            </div>
        );
    }

    const navItems = [
        { id: 'overview', label: 'Console Overview', icon: LayoutDashboard, perm: null },
        { id: 'projects', label: 'Project Studio', icon: Layers, perm: PERMISSIONS.PROJECT_VIEW },
        { id: 'workflows', label: 'Workflow & Routing Studio', icon: Network, perm: PERMISSIONS.WORKFLOW_VIEW },
        { id: 'stations', label: 'Station Master', icon: Cpu, perm: PERMISSIONS.STATION_VIEW },
        { id: 'baan-master', label: 'BAAN Master Studio', icon: Database, perm: PERMISSIONS.BAAN_PART_VIEW },
        { id: 'rbac', label: 'Role & Access (RBAC)', icon: Shield, perm: PERMISSIONS.ROLE_VIEW },
        { id: 'users', label: 'User Governance', icon: Users, perm: PERMISSIONS.USER_VIEW },
        { id: 'unit-config', label: 'Serial & Production Governance', icon: GitBranch, perm: PERMISSIONS.SERIAL_MOVE },
        { id: 'audit', label: 'Compliance & Audit', icon: History, perm: PERMISSIONS.AUDIT_READ },
        { id: 'maintenance', label: 'Maintenance & Nomenclature', icon: Wrench, perm: PERMISSIONS.SYSTEM_MAINTENANCE }
    ];

    const renderActiveTabContent = () => {
        switch (activeTab) {
            case 'overview':
                return <AdminDashboardOverview user={user} onNavigate={setActiveTab} />;
            case 'rbac':
                return <RbacManager user={user} />;
            case 'users':
                return <UserControlSection user={user} />;
            case 'unit-config':
                return <SerialGovernanceStudio user={user} initialSerial={initialSerial} />;
            case 'audit':
                return <AuditLogViewer user={user} />;
            case 'maintenance':
                return <MaintenanceSection user={user} initialTab="controls" />;
            case 'projects':
                return <ProjectStudio user={user} onNavigateToWorkflow={() => setActiveTab('workflows')} />;
            case 'workflows':
                return <WorkflowStudio user={user} />;
            case 'stations':
                return <StationStudio user={user} />;
            case 'baan-master':
                return <BaanMasterStudio user={user} />;
            default:
                return <AdminDashboardOverview user={user} onNavigate={setActiveTab} />;
        }
    };

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '3rem' }}>
            {/* Admin Header Strip */}
            <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    flexWrap: 'wrap', 
                    gap: '1.5rem' 
                }}>
                    <div style={{ flex: '1 1 auto', minWidth: '0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <span className="status-pill info" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '700' }}>
                                CENTRALIZED GOVERNANCE
                            </span>
                            {isSuperAdmin && (
                                <span className="status-pill warning" style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: '700' }}>
                                    SUPER ADMIN PRIVILEGE
                                </span>
                            )}
                        </div>
                        <h1 className="page-title" style={{ fontSize: '1.75rem', letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
                            Admin Console
                        </h1>
                        <p className="page-subtitle" style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                            Configure master data, project workflows, RBAC permissions, and system compliance
                        </p>
                    </div>

                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.75rem',
                        flexShrink: '0'
                    }}>
                        <span className="text-xs font-bold text-muted uppercase" style={{ whiteSpace: 'nowrap' }}>
                            SIGNED IN AS:
                        </span>
                        <span className="font-bold text-xs" style={{ color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                            {user?.name || user?.id}
                        </span>
                        <span className={`status-pill ${isSuperAdmin ? 'warning' : 'primary'}`} style={{ fontSize: '10px', fontWeight: '700' }}>
                            {user?.role?.toUpperCase()}
                        </span>
                    </div>
                </div>
            </div>

            {/* Scrollable Navigation Pill Bar */}
            <div style={{
                display: 'flex',
                gap: '0.5rem',
                overflowX: 'auto',
                overflowY: 'hidden',
                paddingBottom: '0.75rem',
                marginBottom: '1.5rem',
                borderBottom: '1px solid var(--border)',
                scrollbarWidth: 'thin',
                WebkitOverflowScrolling: 'touch'
            }}>
                {navItems.map(item => {
                    const isPermitted = !item.perm || isSuperAdmin || hasPermission(user, item.perm);
                    if (!isPermitted) return null;

                    const isActive = activeTab === item.id;
                    const IconComp = item.icon;

                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setActiveTab(item.id)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                padding: '0.65rem 1.25rem',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid',
                                borderColor: isActive ? 'var(--primary)' : 'var(--border)',
                                background: isActive ? 'var(--primary)' : 'var(--bg-card)',
                                color: isActive ? '#fff' : 'var(--text-main)',
                                fontSize: '0.8125rem',
                                fontWeight: isActive ? 700 : 600,
                                whiteSpace: 'nowrap',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: isActive ? '0 2px 8px rgba(22, 101, 52, 0.25)' : 'var(--shadow-sm)',
                                flexShrink: 0
                            }}
                            onMouseEnter={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background = 'var(--bg-hover)';
                                    e.currentTarget.style.borderColor = 'var(--primary)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background = 'var(--bg-card)';
                                    e.currentTarget.style.borderColor = 'var(--border)';
                                }
                            }}
                        >
                            <IconComp size={16} color={isActive ? '#fff' : 'var(--text-muted)'} strokeWidth={2.5} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Main Content Pane */}
            <main>
                {renderActiveTabContent()}
            </main>
        </div>
    );
};

export default AdminLayout;
