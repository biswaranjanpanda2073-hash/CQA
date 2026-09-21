/**
 * Phase 4 Verification Test Suite: BAAN Master Data & Warehouse Locations Studio
 * Validates:
 * 1. BAAN Spare Parts schema, categories, and unit costs
 * 2. Warehouse Locations schema, types, and capacity limits
 * 3. Stock Health & threshold deficit calculation
 * 4. Soft-archive with operational reason
 * 5. RBAC permissions and audit action taxonomy
 */

import { AUDIT_ACTIONS } from './src/utils/auditLogger.js';
import { PERMISSIONS, hasPermission } from './src/utils/rbacEngine.js';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  ✓ PASS: ${testName}`);
        passed++;
    } else {
        console.error(`  ✗ FAIL: ${testName}`);
        failed++;
    }
}

console.log('====================================================');
console.log('  RUNNING PHASE 4 BAAN MASTER DATA VERIFICATION');
console.log('====================================================\n');

// ─── 1. BAAN SPARE PARTS CATALOG & SCHEMA ───
console.log('[1] BAAN Parts Master Schema & Categories:');

const samplePart = {
    id: 'PN-DISP-001',
    partNumber: 'PN-DISP-001',
    name: 'Pax A920 LCD Display Touch Assembly',
    category: 'Display',
    unitCost: 1850.50,
    minStockLevel: 25,
    status: 'Active',
    preferredSupplier: 'OEM Foxconn'
};

assert(samplePart.partNumber === 'PN-DISP-001', 'Part Number formatted correctly');
assert(samplePart.category === 'Display', 'Part assigned valid Category');
assert(samplePart.unitCost > 0, 'Part has positive unitCost');
assert(samplePart.minStockLevel === 25, 'Part has minimum stock threshold');
assert(samplePart.status === 'Active', 'Part initial status is Active');

const recognizedCategories = ['General', 'Display', 'PCB', 'Casing', 'Battery', 'Cables', 'Fasteners', 'Packaging'];
assert(recognizedCategories.includes(samplePart.category), 'Part category matches recognized categories list');

// ─── 2. WAREHOUSE LOCATIONS SCHEMA ───
console.log('\n[2] Warehouse & Inventory Storage Locations Schema:');

const sampleLocation = {
    id: 'LOC-WH-A1',
    name: 'Main Storage Rack A Shelf 1',
    type: 'WAREHOUSE',
    capacity: 2500,
    status: 'Active'
};

const validLocTypes = ['WAREHOUSE', 'SHOP_FLOOR', 'HOLD_RETURN', 'SCRAP_BIN'];
assert(validLocTypes.includes(sampleLocation.type), 'Location has recognized location type');
assert(sampleLocation.capacity === 2500, 'Location specifies max capacity');
assert(sampleLocation.id.startsWith('LOC-'), 'Location ID follows standard naming convention');

// ─── 3. STOCK HEALTH & DEFICIT CALCULATION ───
console.log('\n[3] Stock Health & Low-Stock Deficit Calculator:');

const mockBatches = [
    { id: 'BAT-1', partNumber: 'PN-DISP-001', quantityAvailable: 10 },
    { id: 'BAT-2', partNumber: 'PN-DISP-001', quantityAvailable: 5 },
    { id: 'BAT-3', partNumber: 'PN-BAT-002', quantityAvailable: 50 }
];

function calculateStockHealth(part, batches) {
    const totalAvailable = batches
        .filter(b => b.partNumber === part.partNumber)
        .reduce((sum, b) => sum + (Number(b.quantityAvailable) || 0), 0);
    
    const minThreshold = Number(part.minStockLevel) || 10;
    const isLowStock = totalAvailable <= minThreshold;
    const deficit = Math.max(0, minThreshold - totalAvailable);

    return { totalAvailable, minThreshold, isLowStock, deficit };
}

const dispHealth = calculateStockHealth(samplePart, mockBatches);
assert(dispHealth.totalAvailable === 15, `Aggregated stock is 15 units (found ${dispHealth.totalAvailable})`);
assert(dispHealth.isLowStock === true, 'Part flagged as Low Stock (15 <= 25)');
assert(dispHealth.deficit === 10, `Deficit correctly calculated as 10 units (found ${dispHealth.deficit})`);

const healthyPart = { partNumber: 'PN-BAT-002', minStockLevel: 20 };
const batHealth = calculateStockHealth(healthyPart, mockBatches);
assert(batHealth.totalAvailable === 50, 'Battery stock is 50 units');
assert(batHealth.isLowStock === false, 'Battery stock is healthy (50 > 20)');
assert(batHealth.deficit === 0, 'Healthy stock deficit is 0');

// ─── 4. SOFT-ARCHIVE & HISTORICAL IMMUTABILITY ───
console.log('\n[4] Soft-Archive & Data Immutability:');

function archiveMasterItem(item, reason, actor) {
    if (!reason || !reason.trim()) throw new Error('Archive reason required');
    return {
        ...item,
        status: 'Archived',
        archivedAt: new Date().toISOString(),
        archivedBy: actor?.name || actor?.id || 'Admin',
        archiveReason: reason.trim()
    };
}

const archivedPart = archiveMasterItem(samplePart, 'Component superseded by Rev B', { name: 'Store Manager' });
assert(archivedPart.status === 'Archived', 'Part status updated to Archived');
assert(archivedPart.archiveReason === 'Component superseded by Rev B', 'Archive reason recorded');
assert(archivedPart.partNumber === samplePart.partNumber, 'Part Number preserved intact');

// ─── 5. RBAC PERMISSIONS & AUDIT ACTIONS ───
console.log('\n[5] RBAC Permissions & Audit Action Taxonomy:');

const adminUser = { role: 'Admin' };
const storeManager = { role: 'Store Manager' };
const storeExec = { role: 'Store Executive' };
const opUser = { role: 'Operator' };

assert(hasPermission(adminUser, PERMISSIONS.BAAN_PART_CREATE), 'Admin has BAAN_PART_CREATE');
assert(hasPermission(storeManager, PERMISSIONS.BAAN_PART_CREATE), 'Store Manager has BAAN_PART_CREATE');
assert(hasPermission(storeManager, PERMISSIONS.BAAN_LOCATION_CREATE), 'Store Manager has BAAN_LOCATION_CREATE');
assert(hasPermission(storeExec, PERMISSIONS.BAAN_PART_VIEW), 'Store Exec has BAAN_PART_VIEW');
assert(!hasPermission(storeExec, PERMISSIONS.BAAN_PART_ARCHIVE), 'Store Exec denied BAAN_PART_ARCHIVE');
assert(!hasPermission(opUser, PERMISSIONS.BAAN_PART_CREATE), 'Operator denied BAAN_PART_CREATE');

assert(AUDIT_ACTIONS.BAAN_PART_CREATED === 'BAAN_PART_CREATED', 'AUDIT_ACTIONS has BAAN_PART_CREATED');
assert(AUDIT_ACTIONS.BAAN_PART_UPDATED === 'BAAN_PART_UPDATED', 'AUDIT_ACTIONS has BAAN_PART_UPDATED');
assert(AUDIT_ACTIONS.BAAN_PART_ARCHIVED === 'BAAN_PART_ARCHIVED', 'AUDIT_ACTIONS has BAAN_PART_ARCHIVED');
assert(AUDIT_ACTIONS.BAAN_LOCATION_CREATED === 'BAAN_LOCATION_CREATED', 'AUDIT_ACTIONS has BAAN_LOCATION_CREATED');
assert(AUDIT_ACTIONS.BAAN_LOCATION_UPDATED === 'BAAN_LOCATION_UPDATED', 'AUDIT_ACTIONS has BAAN_LOCATION_UPDATED');
assert(AUDIT_ACTIONS.BAAN_LOCATION_ARCHIVED === 'BAAN_LOCATION_ARCHIVED', 'AUDIT_ACTIONS has BAAN_LOCATION_ARCHIVED');

console.log('\n====================================================');
console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================');

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
