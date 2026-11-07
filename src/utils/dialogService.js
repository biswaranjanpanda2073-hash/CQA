/**
 * CQA MES - Universal Non-Blocking Dialog & Feedback Service
 * Replaces native window.alert, window.confirm, and window.prompt with accessible,
 * scanner- and keyboard-friendly custom modals and toasts.
 */

let activeDialogResolver = null;
let activeToastHandler = null;

// Listeners registered by GlobalDialogContainer
export const registerDialogHandler = (handler) => {
    activeDialogResolver = handler;
};

export const registerToastHandler = (handler) => {
    activeToastHandler = handler;
};

/**
 * Non-blocking alert dialog replacement.
 * @param {string|object} messageOrOptions
 * @param {string} [title]
 * @returns {Promise<boolean>}
 */
export const showAlert = (messageOrOptions, title = 'System Notification') => {
    const opts = typeof messageOrOptions === 'object' && messageOrOptions !== null
        ? messageOrOptions
        : { message: String(messageOrOptions ?? ''), title };

    if (activeDialogResolver) {
        return activeDialogResolver({
            type: 'alert',
            title: opts.title || 'System Notification',
            message: opts.message || '',
            confirmText: opts.confirmText || 'OK',
            danger: opts.danger || false
        });
    }

    // Fallback if container not yet mounted
    return Promise.resolve(true);
};

/**
 * Non-blocking confirm dialog replacement.
 * @param {string|object} messageOrOptions
 * @returns {Promise<boolean>}
 */
export const showConfirm = (messageOrOptions) => {
    const opts = typeof messageOrOptions === 'object' && messageOrOptions !== null
        ? messageOrOptions
        : { message: String(messageOrOptions ?? ''), title: 'Please Confirm' };

    if (activeDialogResolver) {
        return activeDialogResolver({
            type: 'confirm',
            title: opts.title || 'Please Confirm',
            message: opts.message || '',
            confirmText: opts.confirmText || 'Confirm',
            cancelText: opts.cancelText || 'Cancel',
            danger: opts.danger || false
        });
    }

    return Promise.resolve(false);
};

/**
 * Non-blocking input prompt dialog replacement.
 * @param {string|object} messageOrOptions
 * @param {string} [defaultValue]
 * @returns {Promise<string|null>}
 */
export const showPrompt = (messageOrOptions, defaultValue = '') => {
    const opts = typeof messageOrOptions === 'object' && messageOrOptions !== null
        ? messageOrOptions
        : { message: String(messageOrOptions ?? ''), defaultValue, title: 'Input Required' };

    if (activeDialogResolver) {
        return activeDialogResolver({
            type: 'prompt',
            title: opts.title || 'Input Required',
            message: opts.message || '',
            placeholder: opts.placeholder || 'Enter value...',
            defaultValue: opts.defaultValue || '',
            confirmText: opts.confirmText || 'Submit',
            cancelText: opts.cancelText || 'Cancel'
        });
    }

    return Promise.resolve(null);
};

/**
 * Toast notification for non-blocking status feedback.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} [type]
 * @param {number} [durationMs]
 */
export const showToast = (message, type = 'info', durationMs = 3500) => {
    if (activeToastHandler) {
        activeToastHandler({ message, type, durationMs });
    }
};

/**
 * Global install into window object to catch legacy/direct calls safely.
 */
export const installGlobalDialogInterceptors = () => {
    if (typeof window !== 'undefined') {
        window.cqaAlert = showAlert;
        window.cqaConfirm = showConfirm;
        window.cqaPrompt = showPrompt;
        window.cqaToast = showToast;
        // Non-blocking fallback for native calls
        window.alert = (msg) => showAlert(msg);
    }
};
