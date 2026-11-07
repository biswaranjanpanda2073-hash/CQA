/**
 * CQA MES - Universal Formatting Utilities (en-IN)
 * Single source of truth for Indian manufacturing localization:
 * - Date: DD/MM/YYYY
 * - Time: 24h / 12h consistent
 * - Numbers: en-IN thousands grouping (lakh/crore standard)
 * - System Action Codes: human-readable descriptions
 */

export const formatDate = (dateInput) => {
    if (!dateInput) return '—';
    try {
        const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
        if (isNaN(d.getTime())) return String(dateInput);
        return d.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch {
        return String(dateInput);
    }
};

export const formatDateTime = (dateInput) => {
    if (!dateInput) return '—';
    try {
        const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
        if (isNaN(d.getTime())) return String(dateInput);
        return d.toLocaleString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    } catch {
        return String(dateInput);
    }
};

export const formatTime = (dateInput) => {
    if (!dateInput) return '—';
    try {
        const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
        if (isNaN(d.getTime())) return String(dateInput);
        return d.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    } catch {
        return String(dateInput);
    }
};

export const formatNumber = (num) => {
    if (num === null || num === undefined || isNaN(Number(num))) return '0';
    return Number(num).toLocaleString('en-IN');
};

export const formatPercent = (val, decimals = 1) => {
    if (val === null || val === undefined || isNaN(Number(val))) return '0%';
    return Number(val).toFixed(decimals) + '%';
};

export const SYSTEM_ACTION_LABELS = {
    SERIAL_STATUS_OVERRIDE: 'Status Override',
    SERIAL_MOVEMENT_OVERRIDE: 'Movement Override',
    SERIAL_RESET: 'Serial Reset',
    UNIT_UNHOLD: 'Unit Unhold',
    CONFIG_BOOTSTRAP: 'Config Bootstrap',
    BOM_HEADER_CREATED: 'BOM Header Created',
    BOM_REVISION_PUBLISHED: 'BOM Revision Published',
    BOM_REVISION_ARCHIVED: 'BOM Revision Archived',
    PROJECT_CREATED: 'Project Created',
    PROJECT_UPDATED: 'Project Updated',
    STATION_CREATED: 'Station Created',
    STATION_UPDATED: 'Station Updated',
    ROLE_UPSERTED: 'Role Updated',
    USER_UPSERTED: 'User Updated',
    USER_DEACTIVATED: 'User Deactivated',
    BAAN_BATCH_CONSUMED: 'BAAN Batch Consumed',
    BAAN_PART_CREATED: 'BAAN Part Created',
    DATA_PURGED: 'Data Purged',
    SYSTEM_NAMES_UPDATED: 'System Names Updated',
    MAINTENANCE_MODE_TOGGLED: 'Maintenance Mode Toggled',
    ADMIN_REROUTE: 'Admin Reroute',
    ADMIN_RETURN: 'Admin Return',
    ADMIN_TERMINAL_MOVEMENT: 'Terminal Movement',
    ADMIN_MOVEMENT_REVERSAL: 'Movement Reversal'
};

export const formatActionCode = (code = '') => {
    if (!code) return '—';
    if (SYSTEM_ACTION_LABELS[code]) return SYSTEM_ACTION_LABELS[code];
    return String(code).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
};

