/**
 * CQA MES — Immutable Administrative Audit Logger
 * Records all configuration, master data, user, and device governance events
 * into the Firestore 'audit_logs' collection.
 */

import { db, doc, setDoc, collection, query, orderBy, limit, getDocs, where } from '../firebase.js';

export const AUDIT_ACTIONS = {
    // Project
    PROJECT_CREATED: 'PROJECT_CREATED',
    PROJECT_UPDATED: 'PROJECT_UPDATED',
    PROJECT_DEACTIVATED: 'PROJECT_DEACTIVATED',
    PROJECT_ARCHIVED: 'PROJECT_ARCHIVED',
    PROJECT_CLONED: 'PROJECT_CLONED',

    // Station
    STATION_CREATED: 'STATION_CREATED',
    STATION_UPDATED: 'STATION_UPDATED',
    STATION_ARCHIVED: 'STATION_ARCHIVED',

    // Workflow
    WORKFLOW_DRAFT_SAVED: 'WORKFLOW_DRAFT_SAVED',
    WORKFLOW_PUBLISHED: 'WORKFLOW_PUBLISHED',
    WORKFLOW_ROLLBACK: 'WORKFLOW_ROLLBACK',

    // Checkpoint
    CHECKPOINT_CREATED: 'CHECKPOINT_CREATED',
    CHECKPOINT_UPDATED: 'CHECKPOINT_UPDATED',
    CHECKPOINT_PUBLISHED: 'CHECKPOINT_PUBLISHED',

    // BAAN Master
    BAAN_PART_CREATED: 'BAAN_PART_CREATED',
    BAAN_PART_UPDATED: 'BAAN_PART_UPDATED',
    BAAN_PART_ARCHIVED: 'BAAN_PART_ARCHIVED',
    BAAN_LOCATION_CREATED: 'BAAN_LOCATION_CREATED',
    BAAN_LOCATION_UPDATED: 'BAAN_LOCATION_UPDATED',
    BAAN_LOCATION_ARCHIVED: 'BAAN_LOCATION_ARCHIVED',

    // Users & Roles
    USER_CREATED: 'USER_CREATED',
    USER_UPDATED: 'USER_UPDATED',
    USER_DEACTIVATED: 'USER_DEACTIVATED',
    USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
    ROLE_PERMISSIONS_UPDATED: 'ROLE_PERMISSIONS_UPDATED',
    ROLE_UPDATED: 'ROLE_UPDATED',

    // System
    CONFIG_MODE_TOGGLED: 'CONFIG_MODE_TOGGLED', // Dynamic vs Fallback toggle
    MAINTENANCE_TOGGLED: 'MAINTENANCE_TOGGLED',
    DATA_PURGED: 'DATA_PURGED',

    // Serial & Device
    SERIAL_MOVEMENT_OVERRIDE: 'SERIAL_MOVEMENT_OVERRIDE',
    SERIAL_MOVED: 'SERIAL_MOVED',
    SERIAL_MOVEMENT_REVERSED: 'SERIAL_MOVEMENT_REVERSED',
    SERIAL_HOLD: 'SERIAL_HOLD',
    SERIAL_UNHOLD: 'SERIAL_UNHOLD',
    SERIAL_REOPENED: 'SERIAL_REOPENED',
    SERIAL_MAPPING_CORRECTED: 'SERIAL_MAPPING_CORRECTED',
};

/**
 * Generates an immutable, chronological audit document ID.
 */
export const generateAuditId = () => {
    const d = new Date();
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = d.toISOString().slice(11, 19).replace(/:/g, '');
    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `AUD-${dateStr}-${timeStr}-${rand}`;
};

/**
 * Logs an administrative operation to Firestore.
 */
export const logAdminAction = async ({
    actor, // User object: { id, name, role }
    action, // One of AUDIT_ACTIONS
    entity, // 'project' | 'station' | 'workflow' | 'checkpoint' | 'user' | 'role' | 'baan_part' | 'baan_location' | 'system' | 'device'
    entityId,
    project = null,
    previousValue = null,
    newValue = null,
    reason = '',
    remarks = '',
    status = 'SUCCESS'
}) => {
    try {
        const auditId = generateAuditId();
        const timestamp = new Date().toISOString();

        const auditEntry = {
            id: auditId,
            timestamp,
            actorId: actor?.id || actor?.uid || 'UNKNOWN',
            actorName: actor?.name || actor?.id || 'System Administrator',
            actorRole: actor?.role || 'Admin',
            action,
            entity,
            entityId: String(entityId || 'N/A'),
            project: project || null,
            previousValue: previousValue ? JSON.parse(JSON.stringify(previousValue)) : null,
            newValue: newValue ? JSON.parse(JSON.stringify(newValue)) : null,
            reason: reason || 'Administrative modification',
            remarks: remarks || '',
            status
        };

        const auditRef = doc(db, 'audit_logs', auditId);
        await setDoc(auditRef, auditEntry);
        return { success: true, auditId };
    } catch (err) {
        console.error('Failed to record administrative audit log:', err);
        // Fail-safe: do not crash the app, but return error
        return { success: false, error: err.message };
    }
};

/**
 * Fetches recent audit logs with optional filtering.
 */
export const fetchAuditLogs = async ({ entity = null, entityId = null, project = null, maxCount = 100 } = {}) => {
    try {
        const auditCol = collection(db, 'audit_logs');
        let q = query(auditCol, orderBy('timestamp', 'desc'), limit(maxCount));

        if (entity && !entityId) {
            q = query(auditCol, where('entity', '==', entity), orderBy('timestamp', 'desc'), limit(maxCount));
        }

        const snap = await getDocs(q);
        const logs = [];
        snap.forEach(d => {
            const data = d.data();
            // Client-side filtering for combined query limits
            if (project && data.project && data.project !== project) return;
            if (entityId && data.entityId !== String(entityId)) return;
            logs.push({ id: d.id, ...data });
        });

        return logs;
    } catch (err) {
        console.error('Error fetching audit logs:', err);
        return [];
    }
};
