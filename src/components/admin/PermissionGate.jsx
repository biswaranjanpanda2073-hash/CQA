import React from 'react';
import { hasPermission, hasAnyPermission } from '../../utils/rbacEngine';
import { useCQA } from '../../hooks/useCQA';

/**
 * Declarative component for RBAC authorization.
 * Renders children only if user possesses the specified permission(s).
 */
export const PermissionGate = ({
    user,
    permission,
    requireAll = false,
    fallback = null,
    children
}) => {
    const { customRoles } = useCQA() || {};

    if (!user) return fallback;
    if (user.role === 'Super Admin') return children;

    if (Array.isArray(permission)) {
        const permitted = requireAll
            ? permission.every(p => hasPermission(user, p, customRoles))
            : hasAnyPermission(user, permission, customRoles);
        return permitted ? children : fallback;
    }

    const permitted = hasPermission(user, permission, customRoles);
    return permitted ? children : fallback;
};

export default PermissionGate;
