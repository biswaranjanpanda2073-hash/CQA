import React, { useState, useEffect, useMemo } from 'react';
import {
    Shield,
    ShieldCheck,
    Lock,
    Key,
    UserCheck,
    Users,
    Save,
    RefreshCw,
    Check,
    X,
    AlertTriangle,
    Info
} from 'lucide-react';
import { db, doc, setDoc, onSnapshot, collection } from '../../firebase';
import { PERMISSIONS, ALL_PERMISSIONS, DEFAULT_ROLES, hasPermission } from '../../utils/rbacEngine';
import { logAdminAction, AUDIT_ACTIONS } from '../../utils/auditLogger';

const PERMISSION_GROUPS = [
    {
        title: 'Project Governance',
        keys: [
            PERMISSIONS.PROJECT_VIEW,
            PERMISSIONS.PROJECT_CREATE,
            PERMISSIONS.PROJECT_EDIT,
            PERMISSIONS.PROJECT_ARCHIVE,
            PERMISSIONS.PROJECT_PUBLISH
        ]
    },
    {
        title: 'Station Master',
        keys: [
            PERMISSIONS.STATION_VIEW,
            PERMISSIONS.STATION_CREATE,
            PERMISSIONS.STATION_EDIT,
            PERMISSIONS.STATION_ARCHIVE
        ]
    },
    {
        title: 'Workflow Studio',
        keys: [
            PERMISSIONS.WORKFLOW_VIEW,
            PERMISSIONS.WORKFLOW_EDIT,
            PERMISSIONS.WORKFLOW_PUBLISH
        ]
    },
    {
        title: 'Checkpoints & Tests',
        keys: [
            PERMISSIONS.CHECKPOINT_VIEW,
            PERMISSIONS.CHECKPOINT_CREATE,
            PERMISSIONS.CHECKPOINT_EDIT,
            PERMISSIONS.CHECKPOINT_PUBLISH
        ]
    },
    {
        title: 'Serial & Device Governance',
        keys: [
            PERMISSIONS.SERIAL_VIEW,
            PERMISSIONS.SERIAL_MOVE,
            PERMISSIONS.SERIAL_MAPPING_CORRECT,
            PERMISSIONS.SERIAL_HOLD_UNHOLD,
            PERMISSIONS.SERIAL_REOPEN,
            PERMISSIONS.SERIAL_SCRAP_REVIEW
        ]
    },
    {
        title: 'BAAN Master Data',
        keys: [
            PERMISSIONS.BAAN_PART_VIEW,
            PERMISSIONS.BAAN_PART_CREATE,
            PERMISSIONS.BAAN_PART_EDIT,
            PERMISSIONS.BAAN_PART_ARCHIVE,
            PERMISSIONS.BAAN_LOCATION_VIEW,
            PERMISSIONS.BAAN_LOCATION_CREATE,
            PERMISSIONS.BAAN_LOCATION_EDIT,
            PERMISSIONS.BAAN_LOCATION_ARCHIVE
        ]
    },
    {
        title: 'Users & Roles',
        keys: [
            PERMISSIONS.USER_VIEW,
            PERMISSIONS.USER_MANAGE,
            PERMISSIONS.USER_PASSWORD_RESET,
            PERMISSIONS.ROLE_VIEW,
            PERMISSIONS.ROLE_MANAGE
        ]
    },
    {
        title: 'System & Security',
        keys: [
            PERMISSIONS.SYSTEM_MAINTENANCE,
            PERMISSIONS.SYSTEM_PURGE,
            PERMISSIONS.SYSTEM_CONFIG_TOGGLE,
            PERMISSIONS.AUDIT_READ
        ]
    }
];

export const RbacManager = ({ user }) => {
    const isSuperAdmin = user?.role === 'Super Admin';
    const canManageRoles = isSuperAdmin || hasPermission(user, PERMISSIONS.ROLE_MANAGE);

    const [rolesMap, setRolesMap] = useState({});
    const [selectedRole, setSelectedRole] = useState('Admin');
    const [editedPermissions, setEditedPermissions] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);

    // Sync roles from Firestore
    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'roles'), (snap) => {
            const data = {};
            snap.forEach(d => {
                data[d.id] = { id: d.id, ...d.data() };
            });
            // Merge with defaults if Firestore is missing any
            const merged = { ...DEFAULT_ROLES };
            Object.keys(data).forEach(k => {
                merged[k] = { ...merged[k], ...data[k] };
            });
            setRolesMap(merged);
        });

        return () => unsub();
    }, []);

    // Set active permissions when selected role changes
    useEffect(() => {
        if (rolesMap[selectedRole]) {
            setEditedPermissions(rolesMap[selectedRole].permissions || []);
        } else if (DEFAULT_ROLES[selectedRole]) {
            setEditedPermissions(DEFAULT_ROLES[selectedRole].permissions || []);
        }
    }, [selectedRole, rolesMap]);

    const activeRoleData = rolesMap[selectedRole] || DEFAULT_ROLES[selectedRole] || { name: selectedRole, permissions: [] };

    const handleTogglePermission = (permKey) => {
        if (!canManageRoles || selectedRole === 'Super Admin') return;

        setEditedPermissions(prev => {
            if (prev.includes(permKey)) {
                return prev.filter(k => k !== permKey);
            } else {
                return [...prev, permKey];
            }
        });
    };

    const handleSaveRolePermissions = async () => {
        if (!canManageRoles) {
            alert('Unauthorized: Only Super Admin can modify system role permissions.');
            return;
        }

        if (selectedRole === 'Super Admin') {
            alert('Super Admin permissions are immutable (wildcard *).');
            return;
        }

        setIsSaving(true);
        setSaveMessage(null);
        try {
            const previousPerms = rolesMap[selectedRole]?.permissions || [];
            const roleDocRef = doc(db, 'roles', selectedRole);
            const updatedRole = {
                id: selectedRole,
                name: selectedRole,
                description: activeRoleData.description || `${selectedRole} operational profile`,
                permissions: editedPermissions,
                updatedAt: new Date().toISOString(),
                updatedBy: user?.name || user?.id || 'Admin'
            };

            await setDoc(roleDocRef, updatedRole, { merge: true });

            await logAdminAction({
                actor: user,
                action: AUDIT_ACTIONS.ROLE_PERMISSIONS_UPDATED,
                entity: 'role',
                entityId: selectedRole,
                previousValue: previousPerms,
                newValue: editedPermissions,
                reason: `Permission matrix update for ${selectedRole}`
            });

            setSaveMessage({ type: 'success', text: `Permissions for ${selectedRole} updated successfully.` });
            setTimeout(() => setSaveMessage(null), 4000);
        } catch (err) {
            console.error('Error saving role permissions:', err);
            setSaveMessage({ type: 'error', text: `Failed to save: ${err.message}` });
        } finally {
            setIsSaving(false);
        }
    };

    const isDirty = useMemo(() => {
        const original = rolesMap[selectedRole]?.permissions || DEFAULT_ROLES[selectedRole]?.permissions || [];
        if (original.length !== editedPermissions.length) return true;
        return !original.every(p => editedPermissions.includes(p));
    }, [rolesMap, selectedRole, editedPermissions]);

    return (
        <div className="animate-fade-in">
            <div className="grid md-grid-3 gap-5" style={{ alignItems: 'flex-start' }}>
                {/* Roles Selector Column */}
                <div className="card" style={{ padding: '1rem' }}>
                    <div className="card-header" style={{ paddingBottom: '0.75rem', marginBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ShieldCheck size={18} color="var(--primary)" />
                            <h3 className="font-bold text-sm" style={{ margin: 0 }}>System Roles</h3>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {Object.keys(DEFAULT_ROLES).map(rName => {
                            const isSelected = selectedRole === rName;
                            const rData = rolesMap[rName] || DEFAULT_ROLES[rName];
                            const permCount = rData.permissions?.includes('*') ? 'All (*)' : `${rData.permissions?.length || 0} perms`;

                            return (
                                <button
                                    key={rName}
                                    type="button"
                                    onClick={() => setSelectedRole(rName)}
                                    className={`nav-item ${isSelected ? 'active' : ''}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.65rem 0.85rem',
                                        borderRadius: 'var(--radius-md)',
                                        fontSize: '0.8125rem'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Shield size={14} color={isSelected ? 'var(--primary)' : 'var(--text-muted)'} />
                                        <span className="font-bold">{rName}</span>
                                    </div>
                                    <span style={{
                                        fontSize: '10px',
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                        background: isSelected ? 'var(--primary-alpha)' : 'var(--bg-input)',
                                        color: isSelected ? 'var(--primary)' : 'var(--text-muted)',
                                        fontWeight: 700
                                    }}>
                                        {permCount}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Permissions Matrix Column */}
                <div className="card" style={{ gridColumn: 'span 2', padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <h3 className="font-extrabold" style={{ fontSize: '1.15rem', margin: 0 }}>
                                    Role Permissions: <span style={{ color: 'var(--primary)' }}>{selectedRole}</span>
                                </h3>
                                {selectedRole === 'Super Admin' && (
                                    <span className="risk-badge high">Wildcard (*) Protected</span>
                                )}
                            </div>
                            <p className="text-xs text-muted" style={{ marginTop: 4, maxWidth: 500 }}>
                                {activeRoleData.description || 'Configurable role permissions across all MES modules.'}
                            </p>
                        </div>

                        {selectedRole !== 'Super Admin' && canManageRoles && (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSaveRolePermissions}
                                    disabled={!isDirty || isSaving}
                                    style={{ height: 38, padding: '0 1.25rem', fontSize: '0.8125rem', fontWeight: 700 }}
                                >
                                    <Save size={15} />
                                    <span>{isSaving ? 'Saving...' : 'Save Matrix'}</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {saveMessage && (
                        <div style={{
                            padding: '0.75rem 1rem',
                            borderRadius: 'var(--radius-md)',
                            marginBottom: '1rem',
                            background: saveMessage.type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)',
                            color: saveMessage.type === 'success' ? 'var(--success)' : 'var(--error)',
                            fontSize: '0.8125rem',
                            fontWeight: 700
                        }}>
                            {saveMessage.text}
                        </div>
                    )}

                    {!canManageRoles && (
                        <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Info size={16} color="var(--text-muted)" />
                            <span className="text-xs text-muted font-semibold">View-only mode: Only Super Admin can modify system role permissions.</span>
                        </div>
                    )}

                    {/* Permission Groups */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {PERMISSION_GROUPS.map(group => {
                            const hasWildcard = editedPermissions.includes('*');
                            return (
                                <div key={group.title} style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                                    <div style={{
                                        background: 'var(--bg-input)',
                                        padding: '0.6rem 1rem',
                                        fontSize: '0.75rem',
                                        fontWeight: 800,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        color: 'var(--text-muted)',
                                        borderBottom: '1px solid var(--border-light)'
                                    }}>
                                        {group.title}
                                    </div>
                                    <div style={{ padding: '0.75rem 1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem' }}>
                                        {group.keys.map(key => {
                                            const isChecked = hasWildcard || editedPermissions.includes(key);
                                            const isSuperAdminRole = selectedRole === 'Super Admin';

                                            return (
                                                <label
                                                    key={key}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.6rem',
                                                        fontSize: '0.8125rem',
                                                        fontWeight: 600,
                                                        color: isChecked ? 'var(--text-main)' : 'var(--text-muted)',
                                                        cursor: (isSuperAdminRole || !canManageRoles) ? 'default' : 'pointer',
                                                        padding: '0.35rem 0.5rem',
                                                        borderRadius: 'var(--radius-sm)',
                                                        background: isChecked ? 'var(--primary-alpha)' : 'transparent',
                                                        transition: 'background 0.15s'
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        disabled={isSuperAdminRole || !canManageRoles}
                                                        onChange={() => handleTogglePermission(key)}
                                                        style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
                                                    />
                                                    <span className="text-mono" style={{ fontSize: '11px' }}>{key}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RbacManager;
