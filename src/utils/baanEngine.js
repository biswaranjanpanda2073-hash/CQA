/**
 * CQA MES — BAAN Master Data & Inventory Engine
 * Pure business logic for part normalization, validation,
 * warehouse locations, and stock health deficit calculations.
 */

export const BAAN_PART_CATEGORIES = [
    'General',
    'Display',
    'PCB',
    'Casing',
    'Battery',
    'Cables',
    'Fasteners',
    'Packaging',
    'IC / Semiconductor'
];

export const WAREHOUSE_LOCATION_TYPES = [
    'WAREHOUSE',
    'SHOP_FLOOR',
    'HOLD_RETURN',
    'SCRAP_BIN'
];

/**
 * Normalizes raw part numbers to standardized uppercase hyphenated format
 */
export const normalizeBaanPartNumber = (raw) => {
    if (!raw) return '';
    return String(raw).trim().toUpperCase().replace(/[\/\s_]+/g, '-');
};

/**
 * Validates a BAAN part definition record
 */
export const validatePartRecord = (part) => {
    if (!part) return { isValid: false, message: 'Part record is empty' };

    const pn = normalizeBaanPartNumber(part.partNumber || part.id);
    if (!pn || pn.length < 2) {
        return { isValid: false, message: 'Part number must be at least 2 characters' };
    }

    if (!part.category && !part.name && !part.description) {
        return { isValid: false, message: 'Part name/description is required' };
    }

    const unitCost = Number(part.unitCost);
    if (isNaN(unitCost) || unitCost < 0) {
        return { isValid: false, message: 'Unit cost must be a non-negative number' };
    }

    const minStock = Number(part.minStockLevel || part.minStock || 0);
    if (isNaN(minStock) || minStock < 0) {
        return { isValid: false, message: 'Minimum stock level must be a non-negative number' };
    }

    return {
        isValid: true,
        sanitized: {
            partNumber: pn,
            name: String(part.name || part.description || pn).trim(),
            category: part.category || 'General',
            unitCost,
            minStockLevel: minStock,
            status: part.status || 'Active'
        }
    };
};

/**
 * Computes available stock, threshold deficits, and health status
 */
export const calculateStockHealth = (part, batches = []) => {
    let totalAvailable = 0;

    if (Array.isArray(batches) && batches.length > 0) {
        totalAvailable = batches
            .filter(b => normalizeBaanPartNumber(b.partNumber) === normalizeBaanPartNumber(part.partNumber || part.id))
            .reduce((sum, b) => sum + (Number(b.quantityAvailable || b.quantity || 0)), 0);
    } else if (part && part.currentStock !== undefined) {
        totalAvailable = Number(part.currentStock) || 0;
    }

    const minThreshold = Number(part.minStockLevel || part.minStock || 10);
    const isLowStock = totalAvailable <= minThreshold;
    const deficit = Math.max(0, minThreshold - totalAvailable);

    return {
        totalAvailable,
        minThreshold,
        isLowStock,
        deficit,
        status: isLowStock ? 'LOW' : 'HEALTHY'
    };
};
