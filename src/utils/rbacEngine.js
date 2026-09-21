/**
 * CQA MES — Role-Based Access Control (RBAC) Engine
 * Granular permission keys, default system roles, and authorization helpers.
 */

export const PERMISSIONS = {
    // Project Governance
    PROJECT_VIEW: 'project.view',
    PROJECT_CREATE: 'project.create',
    PROJECT_EDIT: 'project.edit',
    PROJECT_ARCHIVE: 'project.archive',
    PROJECT_PUBLISH: 'project.publish',

    // Station Master
    STATION_VIEW: 'station.view',
    STATION_CREATE: 'station.create',
    STATION_EDIT: 'station.edit',
    STATION_ARCHIVE: 'station.archive',

    // Workflow Studio
    WORKFLOW_VIEW: 'workflow.view',
    WORKFLOW_EDIT: 'workflow.edit',
    WORKFLOW_PUBLISH: 'workflow.publish',

    // Checkpoints & Quality Criteria
    CHECKPOINT_VIEW: 'checkpoint.view',
    CHECKPOINT_CREATE: 'checkpoint.create',
    CHECKPOINT_EDIT: 'checkpoint.edit',
    CHECKPOINT_PUBLISH: 'checkpoint.publish',

    // Serial & Device Governance
    SERIAL_VIEW: 'serial.view',
    SERIAL_SCAN: 'serial.scan',
    SERIAL_MOVE: 'serial.move',
    SERIAL_MAPPING_CORRECT: 'serial.mapping.correct',
    SERIAL_HOLD_UNHOLD: 'serial.hold_unhold',
    SERIAL_REOPEN: 'serial.reopen',
    SERIAL_SCRAP_REVIEW: 'serial.scrap.review',

    // BAAN Master Data
    BAAN_PART_VIEW: 'baan.part.view',
    BAAN_PART_CREATE: 'baan.part.create',
    BAAN_PART_EDIT: 'baan.part.edit',
    BAAN_PART_ARCHIVE: 'baan.part.archive',
    BAAN_LOCATION_VIEW: 'baan.location.view',
    BAAN_LOCATION_CREATE: 'baan.location.create',
    BAAN_LOCATION_EDIT: 'baan.location.edit',
    BAAN_LOCATION_ARCHIVE: 'baan.location.archive',

    // Users & Roles
    USER_VIEW: 'user.view',
    USER_MANAGE: 'user.manage',
    USER_CREATE: 'user.manage', // Alias for USER_MANAGE
    USER_PASSWORD_RESET: 'user.password_reset',
    ROLE_VIEW: 'role.view',
    ROLE_MANAGE: 'role.manage',

    // System & Compliance
    SYSTEM_MAINTENANCE: 'system.maintenance',
    SYSTEM_PURGE: 'system.purge',
    SYSTEM_CONFIG_TOGGLE: 'system.config.toggle', // Super Admin only: toggle dynamic config vs hardcoded fallback
    CONFIG_TOGGLE_DYNAMIC: 'system.config.toggle', // Alias for SYSTEM_CONFIG_TOGGLE
    AUDIT_READ: 'audit.read',
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const DEFAULT_ROLES = {
    'Super Admin': {
        id: 'Super Admin',
        name: 'Super Admin',
        description: 'Complete unrestricted access across all system parameters, data governance, security, and overrides.',
        isSystem: true,
        permissions: ['*'] // Wildcard gives all permissions
    },
    'Admin': {
        id: 'Admin',
        name: 'Admin',
        description: 'Operations, quality configurations, user administration, and master data management.',
        isSystem: true,
        permissions: [
            PERMISSIONS.PROJECT_VIEW, PERMISSIONS.PROJECT_CREATE, PERMISSIONS.PROJECT_EDIT, PERMISSIONS.PROJECT_ARCHIVE, PERMISSIONS.PROJECT_PUBLISH,
            PERMISSIONS.STATION_VIEW, PERMISSIONS.STATION_CREATE, PERMISSIONS.STATION_EDIT, PERMISSIONS.STATION_ARCHIVE,
            PERMISSIONS.WORKFLOW_VIEW, PERMISSIONS.WORKFLOW_EDIT, PERMISSIONS.WORKFLOW_PUBLISH,
            PERMISSIONS.CHECKPOINT_VIEW, PERMISSIONS.CHECKPOINT_CREATE, PERMISSIONS.CHECKPOINT_EDIT, PERMISSIONS.CHECKPOINT_PUBLISH,
            PERMISSIONS.SERIAL_VIEW, PERMISSIONS.SERIAL_MOVE, PERMISSIONS.SERIAL_MAPPING_CORRECT, PERMISSIONS.SERIAL_HOLD_UNHOLD, PERMISSIONS.SERIAL_SCRAP_REVIEW,
            PERMISSIONS.BAAN_PART_VIEW, PERMISSIONS.BAAN_PART_CREATE, PERMISSIONS.BAAN_PART_EDIT, PERMISSIONS.BAAN_PART_ARCHIVE,
            PERMISSIONS.BAAN_LOCATION_VIEW, PERMISSIONS.BAAN_LOCATION_CREATE, PERMISSIONS.BAAN_LOCATION_EDIT, PERMISSIONS.BAAN_LOCATION_ARCHIVE,
            PERMISSIONS.USER_VIEW, PERMISSIONS.USER_MANAGE, PERMISSIONS.USER_PASSWORD_RESET,
            PERMISSIONS.ROLE_VIEW,
            PERMISSIONS.SYSTEM_MAINTENANCE,
            PERMISSIONS.AUDIT_READ
        ]
    },
    'Project Admin': {
        id: 'Project Admin',
        name: 'Project Admin',
        description: 'Administration of designated project workflows, checklists, and station mappings.',
        isSystem: true,
        permissions: [
            PERMISSIONS.PROJECT_VIEW, PERMISSIONS.PROJECT_EDIT,
            PERMISSIONS.STATION_VIEW,
            PERMISSIONS.WORKFLOW_VIEW, PERMISSIONS.WORKFLOW_EDIT,
            PERMISSIONS.CHECKPOINT_VIEW, PERMISSIONS.CHECKPOINT_CREATE, PERMISSIONS.CHECKPOINT_EDIT,
            PERMISSIONS.SERIAL_VIEW, PERMISSIONS.SERIAL_MOVE, PERMISSIONS.SERIAL_HOLD_UNHOLD,
            PERMISSIONS.AUDIT_READ
        ]
    },
    'Supervisor': {
        id: 'Supervisor',
        name: 'Supervisor',
        description: 'Production line management, hold resolution, and queue monitoring.',
        isSystem: true,
        permissions: [
            PERMISSIONS.PROJECT_VIEW,
            PERMISSIONS.STATION_VIEW,
            PERMISSIONS.SERIAL_VIEW, PERMISSIONS.SERIAL_HOLD_UNHOLD, PERMISSIONS.SERIAL_MOVE,
            PERMISSIONS.BAAN_PART_VIEW, PERMISSIONS.BAAN_LOCATION_VIEW,
            PERMISSIONS.AUDIT_READ
        ]
    },
    'Production Supervisor': {
        id: 'Production Supervisor',
        name: 'Production Supervisor',
        description: 'Line supervisor with operational monitoring and hold authorization.',
        isSystem: true,
        permissions: [
            PERMISSIONS.PROJECT_VIEW, PERMISSIONS.STATION_VIEW,
            PERMISSIONS.SERIAL_VIEW, PERMISSIONS.SERIAL_HOLD_UNHOLD,
            PERMISSIONS.AUDIT_READ
        ]
    },
    'Production Manager': {
        id: 'Production Manager',
        name: 'Production Manager',
        description: 'Overall production oversight and metrics access.',
        isSystem: true,
        permissions: [
            PERMISSIONS.PROJECT_VIEW, PERMISSIONS.STATION_VIEW,
            PERMISSIONS.SERIAL_VIEW, PERMISSIONS.AUDIT_READ
        ]
    },
    'Store Manager': {
        id: 'Store Manager',
        name: 'Store Manager',
        description: 'Full control over warehouse locations, parts master, and inventory batches.',
        isSystem: true,
        permissions: [
            PERMISSIONS.BAAN_PART_VIEW, PERMISSIONS.BAAN_PART_CREATE, PERMISSIONS.BAAN_PART_EDIT, PERMISSIONS.BAAN_PART_ARCHIVE,
            PERMISSIONS.BAAN_LOCATION_VIEW, PERMISSIONS.BAAN_LOCATION_CREATE, PERMISSIONS.BAAN_LOCATION_EDIT, PERMISSIONS.BAAN_LOCATION_ARCHIVE,
            PERMISSIONS.SERIAL_VIEW, PERMISSIONS.AUDIT_READ
        ]
    },
    'Store Executive': {
        id: 'Store Executive',
        name: 'Store Executive',
        description: 'Store operations, inward receiving, and issuance fulfillment.',
        isSystem: true,
        permissions: [
            PERMISSIONS.BAAN_PART_VIEW, PERMISSIONS.BAAN_PART_CREATE, PERMISSIONS.BAAN_PART_EDIT,
            PERMISSIONS.BAAN_LOCATION_VIEW,
            PERMISSIONS.SERIAL_VIEW
        ]
    },
    'Inventory Controller': {
        id: 'Inventory Controller',
        name: 'Inventory Controller',
        description: 'Stock audits, location allocations, and batch reconciliations.',
        isSystem: true,
        permissions: [
            PERMISSIONS.BAAN_PART_VIEW, PERMISSIONS.BAAN_LOCATION_VIEW,
            PERMISSIONS.SERIAL_VIEW, PERMISSIONS.AUDIT_READ
        ]
    },
    'CQA Engineer': {
        id: 'CQA Engineer',
        name: 'CQA Engineer',
        description: 'Quality assurance engineering and quality checklist reviews.',
        isSystem: true,
        permissions: [
            PERMISSIONS.PROJECT_VIEW, PERMISSIONS.STATION_VIEW,
            PERMISSIONS.CHECKPOINT_VIEW, PERMISSIONS.SERIAL_VIEW,
            PERMISSIONS.SERIAL_HOLD_UNHOLD, PERMISSIONS.AUDIT_READ
        ]
    },
    'Repair Engineer': {
        id: 'Repair Engineer',
        name: 'Repair Engineer',
        description: 'Hardware debug, component level diagnosis, and rework execution.',
        isSystem: true,
        permissions: [
            PERMISSIONS.SERIAL_VIEW, PERMISSIONS.BAAN_PART_VIEW
        ]
    },
    'Repair Technician': {
        id: 'Repair Technician',
        name: 'Repair Technician',
        description: 'Rework and component replacement.',
        isSystem: true,
        permissions: [
            PERMISSIONS.SERIAL_VIEW, PERMISSIONS.BAAN_PART_VIEW
        ]
    },
    'Operator': {
        id: 'Operator',
        name: 'Operator',
        description: 'Standard shop floor terminal operator. Limited to station execution and serial validation.',
        isSystem: true,
        permissions: [
            PERMISSIONS.SERIAL_VIEW,
            PERMISSIONS.SERIAL_SCAN
        ]
    }
};

/**
 * Resolves permissions for a given user role or user object.
 * Fallbacks to DEFAULT_ROLES if role is not customized in Firestore.
 */
export const getUserRolePermissions = (roleNameOrUser, customRolesMap = {}) => {
    if (!roleNameOrUser) return [];
    const roleName = typeof roleNameOrUser === 'object' ? roleNameOrUser.role : roleNameOrUser;
    if (!roleName) return [];
    
    // Check custom role from Firestore first
    if (customRolesMap && customRolesMap[roleName] && Array.isArray(customRolesMap[roleName].permissions)) {
        return customRolesMap[roleName].permissions;
    }

    // Fallback to default predefined role
    const def = DEFAULT_ROLES[roleName];
    if (def && Array.isArray(def.permissions)) {
        return def.permissions;
    }

    return [];
};

/**
 * Checks if a user has a specific permission.
 */
export const hasPermission = (user, permissionKey, customRolesMap = {}) => {
    if (!user) return false;
    
    // Super Admin has all permissions unconditionally
    if (user.role === 'Super Admin') return true;

    // Explicit user-level permissions override role if present
    if (Array.isArray(user.permissions) && user.permissions.length > 0) {
        if (user.permissions.includes('*')) return true;
        if (user.permissions.includes(permissionKey)) return true;
    }

    const rolePerms = getUserRolePermissions(user.role, customRolesMap);
    if (rolePerms.includes('*')) return true;
    return rolePerms.includes(permissionKey);
};

/**
 * Checks if a user has ANY of the specified permissions.
 */
export const hasAnyPermission = (user, permissionKeys = [], customRolesMap = {}) => {
    if (!user) return false;
    if (user.role === 'Super Admin') return true;
    return permissionKeys.some(key => hasPermission(user, key, customRolesMap));
};
