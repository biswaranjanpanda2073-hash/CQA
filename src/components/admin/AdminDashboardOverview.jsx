import React, { useState, useEffect } from 'react';
import {
    LayoutDashboard,
    Layers,
    Shield,
    Database,
    Zap,
    Users,
    Activity,
    Sliders,
    Power,
    RefreshCw,
    CheckCircle2,
    AlertTriangle,
    ArrowRight,
    History,
    FileCheck,
    Cpu,
    GitBranch,
    ShieldAlert
} from 'lucide-react';
import { db, doc, getDoc, setDoc, onSnapshot, collection, getCountFromServer } from '../../firebase';
import { bootstrapConfiguration, checkConfigStatus } from '../../utils/configBootstrap';
import { logAdminAction, AUDIT_ACTIONS } from '../../utils/auditLogger';
import { hasPermission, PERMISSIONS } from '../../utils/rbacEngine';

export const AdminDashboardOverview = ({ user, onNavigate }) => {
    const isSuperAdmin = user?.role === 'Super Admin';
    const [configGov, setConfigGov] = useState({ isBootstrapped: false, dynamicConfigEnabled: false });
    const [counts, setCounts] = useState({ projects: 4, stations: 26, users: 0, audits: 0 });
    const [recentAudits, setRecentAudits] = useState([]);
    const [isBootstrapping, setIsBootstrapping] = useState(false);
    const [isTogglingConfig, setIsTogglingConfig] = useState(false);
    const [bootstrapReport, setBootstrapReport] = useState(null);

    // Sync config status
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'settings', 'config_governance'), (snap) => {
            if (snap.exists()) {
                setConfigGov(snap.data());
            }
        });
        return () => unsub();
    }, []);

    // Sync counts & recent audit logs
    useEffect(() => {
        const fetchStats = async () => {
            try {
                const [uCountSnap, pSnap, sSnap, aSnap] = await Promise.all([
                    getCountFromServer(collection(db, 'users')).catch(() => ({ data: () => ({ count: 0 }) })),
                    getCountFromServer(collection(db, 'projects')).catch(() => ({ data: () => ({ count: 4 }) })),
                    getCountFromServer(collection(db, 'stations_master')).catch(() => ({ data: () => ({ count: 26 }) })),
                    getCountFromServer(collection(db, 'audit_logs')).catch(() => ({ data: () => ({ count: 0 }) }))
                ]);

                setCounts({
                    users: uCountSnap.data().count,
                    projects: Math.max(4, pSnap.data().count),
                    stations: Math.max(26, sSnap.data().count),
                    audits: aSnap.data().count
                });
            } catch (e) {
                console.warn('Error fetching counts:', e);
            }
        };

        fetchStats();

        // Listen to last 5 audits
        const unsubAudit = onSnapshot(collection(db, 'audit_logs'), (snap) => {
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            setRecentAudits(list.slice(0, 5));
        });

        return () => unsubAudit();
    }, []);

    // Super Admin: Toggle dynamic config vs hardcoded dual-read fallback
    const handleToggleDynamicConfig = async () => {
        if (!isSuperAdmin) {
            alert('SECURITY RESTRICTION: Only Super Admin can toggle runtime configuration mode.');
            return;
        }

        const nextState = !configGov.dynamicConfigEnabled;
        const confirmMsg = nextState
            ? 'ENABLE DYNAMIC FIRESTORE CONFIGURATION?\n\nThe application runtime will read workflows and stations dynamically from Firestore. Hardcoded defaults will serve as automatic secondary fallback.'
            : 'DISABLE DYNAMIC CONFIGURATION (ROLLBACK TO HARDCODED FALLBACK)?\n\nThe application runtime will prioritize verified hardcoded JavaScript configurations.';

        if (!window.confirm(confirmMsg)) return;

        setIsTogglingConfig(true);
        try {
            const govRef = doc(db, 'settings', 'config_governance');
            const updatePayload = {
                dynamicConfigEnabled: nextState,
                toggledAt: new Date().toISOString(),
                toggledBy: user?.name || user?.id || 'Super Admin'
            };

            await setDoc(govRef, updatePayload, { merge: true });

            await logAdminAction({
                actor: user,
                action: AUDIT_ACTIONS.CONFIG_MODE_TOGGLED,
                entity: 'system',
                entityId: 'config_governance',
                previousValue: { dynamicConfigEnabled: configGov.dynamicConfigEnabled },
                newValue: { dynamicConfigEnabled: nextState },
                reason: `Runtime Configuration Mode switched to ${nextState ? 'DYNAMIC_FIRESTORE' : 'HARDCODED_FALLBACK'}`
            });
        } catch (err) {
            console.error('Error toggling config mode:', err);
            alert('Failed to update config mode: ' + err.message);
        } finally {
            setIsTogglingConfig(false);
        }
    };

    // One-click Bootstrap Seeder
    const handleTriggerBootstrap = async (force = false) => {
        if (!isSuperAdmin && user?.role !== 'Admin') {
            alert('Unauthorized: Admin access required to run configuration seeder.');
            return;
        }

        if (force && !window.confirm('FORCE RE-SEED? This will re-synchronize Firestore configuration documents with default hardcoded schemas. Existing production records will not be harmed.')) {
            return;
        }

        setIsBootstrapping(true);
        setBootstrapReport(null);
        try {
            const res = await bootstrapConfiguration(user, { force });
            if (res.success) {
                setBootstrapReport(res.summary);
            } else {
                alert('Bootstrap encountered errors: ' + res.error);
            }
        } catch (err) {
            alert('Bootstrap failed: ' + err.message);
        } finally {
            setIsBootstrapping(false);
        }
    };

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Top Operational Status Banner */}
            <div className="card" style={{
                padding: '1.5rem 2rem',
                borderRadius: 'var(--radius-xl)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                            <span style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: configGov.dynamicConfigEnabled ? 'var(--success)' : 'var(--warning)',
                                display: 'inline-block',
                                boxShadow: `0 0 10px ${configGov.dynamicConfigEnabled ? 'var(--success)' : 'var(--warning)'}`
                            }} />
                            <h2 className="font-extrabold" style={{ fontSize: '1.35rem', margin: 0 }}>
                                Runtime Engine: {configGov.dynamicConfigEnabled ? 'Dynamic Metadata-Driven' : 'Verified Hardcoded Fallback'}
                            </h2>
                            <span className={`status-pill ${configGov.dynamicConfigEnabled ? 'success' : 'warning'}`}>
                                {configGov.dynamicConfigEnabled ? 'ACTIVE (LIVE)' : 'SAFE FALLBACK'}
                            </span>
                        </div>
                        <p className="text-xs text-muted" style={{ maxWidth: 640, lineHeight: 1.6 }}>
                            {configGov.dynamicConfigEnabled
                                ? 'Production terminals dynamically consume workflows, stations, and checkpoints from Firestore with automatic local fallback.'
                                : 'Production runs on verified hardcoded logic. Dynamic configurations can be safely edited, validated, and tested prior to activation.'}
                        </p>
                    </div>

                    {/* Super Admin Control Actions */}
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        {isSuperAdmin && (
                            <button
                                type="button"
                                className={`btn ${configGov.dynamicConfigEnabled ? 'btn-secondary' : 'btn-primary'}`}
                                onClick={handleToggleDynamicConfig}
                                disabled={isTogglingConfig}
                                style={{ height: 42, padding: '0 1.25rem', fontSize: '0.8125rem', fontWeight: 700 }}
                            >
                                <Power size={15} />
                                <span>{configGov.dynamicConfigEnabled ? 'Rollback to Fallback' : 'Activate Dynamic Config'}</span>
                            </button>
                        )}

                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleTriggerBootstrap(false)}
                            disabled={isBootstrapping}
                            style={{ height: 42, padding: '0 1.25rem', fontSize: '0.8125rem', fontWeight: 600 }}
                            title="Seed missing configurations to Firestore safely"
                        >
                            <RefreshCw size={15} className={isBootstrapping ? 'animate-spin' : ''} />
                            <span>{isBootstrapping ? 'Seeding...' : 'Run Config Seeder'}</span>
                        </button>
                    </div>
                </div>

                {bootstrapReport && (
                    <div className="animate-fade-in" style={{
                        marginTop: '1.25rem',
                        padding: '1rem',
                        background: 'var(--success-bg)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(22, 163, 74, 0.25)',
                        fontSize: '0.8125rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontWeight: 800, marginBottom: '0.4rem' }}>
                            <CheckCircle2 size={16} />
                            <span>Configuration Seeder Completed Successfully:</span>
                        </div>
                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', color: 'var(--text-main)', fontWeight: 600 }}>
                            <span>Projects: {bootstrapReport.projectsCreated} created</span>
                            <span>Workflows: {bootstrapReport.workflowsCreated} created</span>
                            <span>Checkpoints: {bootstrapReport.checkpointsCreated} created</span>
                            <span>Roles: {bootstrapReport.rolesCreated} created</span>
                            <span style={{ color: 'var(--text-muted)' }}>Skipped: {bootstrapReport.skippedExisting} already existed</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Quick Metrics Strip */}
            <div className="metric-strip" style={{ marginBottom: 0 }}>
                <div className="metric-item clickable" onClick={() => onNavigate('projects')}>
                    <div className="metric-number" style={{ color: 'var(--primary)' }}>{counts.projects}</div>
                    <div className="metric-label">Production Projects</div>
                </div>
                <div className="metric-item clickable" onClick={() => onNavigate('stations')}>
                    <div className="metric-number" style={{ color: 'var(--info)' }}>{counts.stations}</div>
                    <div className="metric-label">Registered Stations</div>
                </div>
                <div className="metric-item clickable" onClick={() => onNavigate('rbac')}>
                    <div className="metric-number" style={{ color: 'var(--warning)' }}>{counts.users}</div>
                    <div className="metric-label">User Accounts</div>
                </div>
                <div className="metric-item clickable" onClick={() => onNavigate('audit')}>
                    <div className="metric-number" style={{ color: 'var(--success)' }}>{counts.audits}</div>
                    <div className="metric-label">Audit Log Entries</div>
                </div>
            </div>

            {/* Hub Navigation Tiles */}
            <div className="grid md-grid-3 gap-4">
                <div className="card clickable hover-lift p-5" onClick={() => onNavigate('projects')}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div className="flex-center" style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'var(--primary-alpha)', color: 'var(--primary)' }}>
                            <Layers size={22} />
                        </div>
                        <ArrowRight size={16} color="var(--text-muted)" />
                    </div>
                    <h3 className="font-extrabold text-base mb-1">Project Studio</h3>
                    <p className="text-xs text-muted">Create projects, configure stations, serial rules, and workflows.</p>
                </div>

                <div className="card clickable hover-lift p-5" onClick={() => onNavigate('stations')}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div className="flex-center" style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'rgba(8, 145, 178, 0.12)', color: '#0891b2' }}>
                            <Cpu size={22} />
                        </div>
                        <ArrowRight size={16} color="var(--text-muted)" />
                    </div>
                    <h3 className="font-extrabold text-base mb-1">Station Master</h3>
                    <p className="text-xs text-muted">Global physical and logical station definitions and terminal types.</p>
                </div>

                <div className="card clickable hover-lift p-5" onClick={() => onNavigate('rbac')}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div className="flex-center" style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'rgba(124, 58, 237, 0.12)', color: '#7c3aed' }}>
                            <Shield size={22} />
                        </div>
                        <ArrowRight size={16} color="var(--text-muted)" />
                    </div>
                    <h3 className="font-extrabold text-base mb-1">RBAC & Governance</h3>
                    <p className="text-xs text-muted">Manage user roles, granular permission matrices, and reset tickets.</p>
                </div>

                <div className="card clickable hover-lift p-5" onClick={() => onNavigate('unit-config')}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div className="flex-center" style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'rgba(217, 119, 6, 0.12)', color: '#d97706' }}>
                            <GitBranch size={22} />
                        </div>
                        <ArrowRight size={16} color="var(--text-muted)" />
                    </div>
                    <h3 className="font-extrabold text-base mb-1">Serial & Device Governance</h3>
                    <p className="text-xs text-muted">Controlled administrative movement wizard, hold/unhold, and history reversal.</p>
                </div>

                <div className="card clickable hover-lift p-5" onClick={() => onNavigate('audit')}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div className="flex-center" style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'rgba(22, 163, 74, 0.12)', color: '#16a34a' }}>
                            <History size={22} />
                        </div>
                        <ArrowRight size={16} color="var(--text-muted)" />
                    </div>
                    <h3 className="font-extrabold text-base mb-1">Compliance & Audit Trail</h3>
                    <p className="text-xs text-muted">Immutable ledger of all administrative overrides, logins, and configurations.</p>
                </div>

                <div className="card clickable hover-lift p-5" onClick={() => onNavigate('maintenance')}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div className="flex-center" style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'rgba(220, 38, 38, 0.12)', color: '#dc2626' }}>
                            <Sliders size={22} />
                        </div>
                        <ArrowRight size={16} color="var(--text-muted)" />
                    </div>
                    <h3 className="font-extrabold text-base mb-1">Maintenance & Safeguards</h3>
                    <p className="text-xs text-muted">Emergency maintenance locks, nomenclature display mappings, and purge safety.</p>
                </div>
            </div>

            {/* Recent Audit Trail Preview */}
            <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <History size={18} color="var(--primary)" />
                        <h3 className="font-bold text-sm" style={{ margin: 0 }}>Recent Administrative Activity</h3>
                    </div>
                    <button className="btn btn-ghost text-xs font-bold" onClick={() => onNavigate('audit')}>
                        View Full Ledger <ArrowRight size={12} />
                    </button>
                </div>

                {recentAudits.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                        No recent administrative activity recorded.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {recentAudits.map(l => (
                            <div key={l.id} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.65rem 0.85rem',
                                background: 'var(--bg-input)',
                                borderRadius: 'var(--radius-md)',
                                fontSize: '0.8125rem'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: 4, background: 'var(--primary-alpha)', color: 'var(--primary)', fontWeight: 800 }}>
                                        {l.action}
                                    </span>
                                    <span className="font-bold">{l.actorName}</span>
                                    <span className="text-muted text-xs truncate" style={{ maxWidth: 350 }}>{l.reason || l.entityId}</span>
                                </div>
                                <span className="text-muted text-xs font-mono">{new Date(l.timestamp).toLocaleTimeString()}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminDashboardOverview;
