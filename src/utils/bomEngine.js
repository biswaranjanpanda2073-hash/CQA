/**
 * CQA MES — Centralized Bill of Materials (BOM) & Material Requirements Planning (MRP) Engine
 * 
 * Provides:
 * 1. Intelligent spreadsheet parsing (.xlsx, .xls, .csv) with dynamic alias mapping and title-row detection.
 * 2. BOM schema validation, duplicate detection, and sanitization.
 * 3. Seed data definitions for Calculator V5 (48 items from Tohands R-BOM V5).
 * 4. Internal BAAN Inventory linking and stock availability matching.
 * 5. Material Requirements Planning (MRP) calculation engine (target batch shortage analysis).
 * 6. Export tools (Excel/CSV BOM export, MRP report export, template download).
 */

import * as XLSX from 'xlsx';

// ═══════════════════════════════════════════════════════════════
// DEFAULT PRODUCT VARIANTS
// ═══════════════════════════════════════════════════════════════
export const DEFAULT_BOM_VARIANTS = [
    {
        id: 'CALC_V5',
        name: 'Calculator V5 (Standard)',
        category: 'CALCULATOR',
        defaultActiveRevision: 'REV-01',
        description: 'Tohands Calculator V5 with dual display, Keypad PCB, 4000mAh battery pack, and protective packaging.'
    },
    {
        id: 'CALC_V4',
        name: 'Calculator V4 (Legacy)',
        category: 'CALCULATOR',
        defaultActiveRevision: 'REV-01',
        description: 'Previous generation calculator architecture.'
    },
    {
        id: 'CALC_V5_GSM',
        name: 'Calculator V5 (4G / GSM)',
        category: 'CALCULATOR',
        defaultActiveRevision: 'REV-01',
        description: 'Cellular connected variant with Quectel antenna and SIM card slot.'
    },
    {
        id: 'CALC_V5_WIFI',
        name: 'Calculator V5 (Wi-Fi Edition)',
        category: 'CALCULATOR',
        defaultActiveRevision: 'REV-01',
        description: 'Wi-Fi enabled smart calculator variant.'
    }
];

// ═══════════════════════════════════════════════════════════════
// STANDARD BOM COMPONENT CATEGORIES & STATION AFFINITY
// ═══════════════════════════════════════════════════════════════
export const BOM_CATEGORIES = [
    'Mechanical',
    'Electronic Components',
    'Labels & Stickers',
    'Packaging'
];

export const CATEGORY_STATION_MAP = {
    'Mechanical': ['ASSEMBLY', 'HARDWARE QC / DEBUG'],
    'Electronic Components': ['HARDWARE QC / DEBUG', 'HARDWARE REWORK', 'ASSEMBLY'],
    'Labels & Stickers': ['ASSEMBLY', 'PACKING & CLEANING'],
    'Packaging': ['PACKING & CLEANING']
};

// ═══════════════════════════════════════════════════════════════
// CANONICAL COLUMN ALIASES FOR INTELLIGENT SPREADSHEET PARSING
// ═══════════════════════════════════════════════════════════════
const COLUMN_ALIASES = {
    itemNo: ['item no', 'item no.', 'item', 'item_no', 'sl no', 'sl. no', 'slno', 'sr no', 'sr. no', 'no', 'no.'],
    partNumber: ['part number', 'part no', 'part no.', 'partno', 'part_number', 'part_no', 'item code', 'component code', 'pn', 'mpn'],
    partName: ['part name', 'component name', 'item name', 'name', 'title'],
    partDescription: ['part description', 'description', 'desc', 'item description', 'specification', 'details', 'specs'],
    category: ['category / type', 'category/type', 'category', 'type', 'group', 'component type', 'part type', 'class'],
    quantityRequired: ['quantity required', 'qty required', 'quantity', 'qty', 'required qty', 'req qty', 'pcs', 'count', 'units'],
    referenceFigures: ['reference figures', 'reference', 'ref', 'ref figures', 'drawing ref', 'notes', 'remarks']
};

/**
 * Normalize category string (e.g. "Mechanical " -> "Mechanical")
 */
export const normalizeCategory = (rawCat) => {
    if (!rawCat) return 'Mechanical';
    const clean = String(rawCat).trim();
    const lower = clean.toLowerCase();
    if (lower.includes('elec')) return 'Electronic Components';
    if (lower.includes('label') || lower.includes('sticker')) return 'Labels & Stickers';
    if (lower.includes('pack')) return 'Packaging';
    if (lower.includes('mech')) return 'Mechanical';
    return clean;
};

/**
 * Detect station tags based on category or part description
 */
export const inferStationTags = (category, partName = '', partDesc = '') => {
    const norm = normalizeCategory(category);
    const tags = new Set(CATEGORY_STATION_MAP[norm] || ['ASSEMBLY']);
    const combined = `${partName} ${partDesc}`.toLowerCase();

    if (combined.includes('pcb') || combined.includes('battery') || combined.includes('lcd') || combined.includes('speaker')) {
        tags.add('HARDWARE QC / DEBUG');
        tags.add('HARDWARE REWORK');
    }
    if (combined.includes('screw') || combined.includes('panel') || combined.includes('button')) {
        tags.add('ASSEMBLY');
    }
    if (combined.includes('sticker') || combined.includes('sleeve') || combined.includes('manual') || combined.includes('box') || combined.includes('esd')) {
        tags.add('PACKING & CLEANING');
    }
    return Array.from(tags);
};

// ═══════════════════════════════════════════════════════════════
// SPREADSHEET PARSER (.xlsx, .xls, .csv)
// ═══════════════════════════════════════════════════════════════

/**
 * Parses raw file buffer/content into structured, validated BOM items.
 * Robust against title rows (e.g. "R-BOM V5"), trailing blank columns/rows,
 * mixed casing, and whitespace.
 * 
 * @param {ArrayBuffer|string} fileData - The raw file contents
 * @param {Object} options - Parser options
 * @returns {Promise<{ success: boolean, items: Array, summary: Object, errors: Array, detectedTitle: string }>}
 */
export const parseBomSpreadsheet = async (fileData, options = {}) => {
    try {
        const workbook = XLSX.read(fileData, { type: typeof fileData === 'string' ? 'string' : 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            return { success: false, items: [], errors: ['Spreadsheet is empty: no sheets found.'], summary: {} };
        }

        const worksheet = workbook.Sheets[sheetName];
        // Convert to array-of-arrays to safely scan for title rows vs header rows
        const rawGrid = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!rawGrid || rawGrid.length === 0) {
            return { success: false, items: [], errors: ['No data rows found in spreadsheet.'], summary: {} };
        }

        let detectedTitle = '';
        let headerRowIndex = -1;
        let columnMapping = {};

        // Scan the first 10 rows to locate the header row
        for (let r = 0; r < Math.min(rawGrid.length, 10); r++) {
            const row = rawGrid[r];
            if (!Array.isArray(row)) continue;

            const nonEmpties = row.map(c => String(c).trim()).filter(Boolean);
            if (nonEmpties.length === 0) continue;

            // Check if this looks like a title row (e.g. single entry "R-BOM V5")
            if (nonEmpties.length === 1 || (nonEmpties.length <= 2 && nonEmpties[0].toLowerCase().includes('bom'))) {
                detectedTitle = nonEmpties[0];
                continue;
            }

            // Test if this row contains essential BOM headers
            const rowMapping = {};
            row.forEach((colVal, colIdx) => {
                const cleanHeader = String(colVal).toLowerCase().trim().replace(/[\r\n]+/g, ' ');
                if (!cleanHeader) return;

                for (const [canonicalKey, aliases] of Object.entries(COLUMN_ALIASES)) {
                    if (rowMapping[canonicalKey] === undefined && aliases.some(alias => cleanHeader === alias || cleanHeader.startsWith(alias))) {
                        rowMapping[canonicalKey] = colIdx;
                        break;
                    }
                }
            });

            // If we matched both 'partNumber' or 'partName' and 'quantityRequired'
            if ((rowMapping.partNumber !== undefined || rowMapping.partName !== undefined) && rowMapping.quantityRequired !== undefined) {
                headerRowIndex = r;
                columnMapping = rowMapping;
                break;
            }
        }

        if (headerRowIndex === -1) {
            return {
                success: false,
                items: [],
                errors: [
                    'Could not detect standard BOM headers in uploaded file.',
                    'Required columns: "Part Number" (or "Item Code"), "Part Name", "Quantity Required".'
                ],
                summary: {}
            };
        }

        // Parse data rows starting after headerRowIndex
        const parsedItems = [];
        const errors = [];
        const warnings = [];
        const seenPartNumbers = new Set();
        let fallbackItemNo = 1;

        for (let r = headerRowIndex + 1; r < rawGrid.length; r++) {
            const row = rawGrid[r];
            if (!Array.isArray(row)) continue;

            const getCol = (key) => {
                const idx = columnMapping[key];
                if (idx === undefined || idx < 0 || idx >= row.length) return '';
                return String(row[idx] ?? '').trim();
            };

            const rawPartNo = getCol('partNumber');
            const rawPartName = getCol('partName');
            const rawDesc = getCol('partDescription');
            const rawCat = getCol('category');
            const rawQty = getCol('quantityRequired');
            const rawRef = getCol('referenceFigures');

            // Skip completely empty rows
            if (!rawPartNo && !rawPartName && !rawQty && !rawDesc) {
                continue;
            }

            // Row-level validation
            const rowNum = r + 1;
            if (!rawPartNo) {
                errors.push(`Row ${rowNum}: Missing Part Number for component "${rawPartName || 'Unnamed'}".`);
                continue;
            }

            const cleanPartNo = rawPartNo.trim().toUpperCase();
            if (seenPartNumbers.has(cleanPartNo)) {
                warnings.push(`Row ${rowNum}: Repeated Part Number "${cleanPartNo}" detected across BOM sub-assemblies.`);
            }
            seenPartNumbers.add(cleanPartNo);

            const numQty = Number(rawQty);
            if (isNaN(numQty) || numQty <= 0) {
                errors.push(`Row ${rowNum} (${cleanPartNo}): Invalid Quantity Required "${rawQty}". Must be positive number.`);
            }

            const rawItemNo = getCol('itemNo');
            const itemNo = rawItemNo && !isNaN(Number(rawItemNo)) ? Number(rawItemNo) : fallbackItemNo;
            fallbackItemNo++;

            const category = normalizeCategory(rawCat);
            const stationTags = inferStationTags(category, rawPartName, rawDesc);

            parsedItems.push({
                itemNo,
                partNumber: cleanPartNo,
                partName: rawPartName || cleanPartNo,
                partDescription: rawDesc || '',
                category,
                quantityRequired: isNaN(numQty) || numQty <= 0 ? 1 : Math.round(numQty),
                uom: 'Nos',
                stationTags,
                referenceFigures: rawRef || '',
                isCritical: ['Main PCB', 'Keypad PCB', '4.58 Inch LCD Display Panel', 'Battery'].some(crit => 
                    (rawPartName || '').toLowerCase().includes(crit.toLowerCase()) || 
                    (cleanPartNo || '').toLowerCase().includes(crit.toLowerCase())
                ),
                subAssembly: (rawDesc.includes('SUB001') || rawPartName.includes('Top Panel Sub')) 
                    ? 'Top Panel Sub Assemble' 
                    : (rawDesc.includes('SUB002') || rawPartName.includes('Bottom Panel Sub'))
                    ? 'Bottom Panel Sub Assemble'
                    : category === 'Packaging' ? 'Packaging' : 'Base Unit'
            });
        }

        if (parsedItems.length === 0) {
            return {
                success: false,
                items: [],
                errors: ['No valid component rows could be extracted from the file.'],
                warnings: [],
                summary: {}
            };
        }

        // Compute summary metrics
        const categoryCounts = parsedItems.reduce((acc, it) => {
            acc[it.category] = (acc[it.category] || 0) + 1;
            return acc;
        }, {});

        const totalUnitComponents = parsedItems.reduce((sum, it) => sum + it.quantityRequired, 0);

        return {
            success: errors.length === 0,
            hasWarnings: warnings.length > 0,
            items: parsedItems,
            detectedTitle: detectedTitle || sheetName,
            errors,
            warnings,
            summary: {
                totalLineItems: parsedItems.length,
                totalUnitComponents,
                categoryCounts,
                criticalComponentsCount: parsedItems.filter(i => i.isCritical).length
            }
        };
    } catch (err) {
        console.error('Error parsing BOM spreadsheet:', err);
        return {
            success: false,
            items: [],
            errors: [`Failed to parse spreadsheet file: ${err.message}`],
            summary: {}
        };
    }
};

// ═══════════════════════════════════════════════════════════════
// SEED BOM DATA FOR CALCULATOR V5 (48 ITEMS FROM R-BOM V5)
// ═══════════════════════════════════════════════════════════════
export const SEED_CALCULATOR_V5_BOM = [
    { itemNo: 1,  partNumber: 'TOHBMK006_T1', partName: 'Top Panel', partDescription: 'TOHAV5_001_Top Panel', category: 'Mechanical', quantityRequired: 1, uom: 'Nos', subAssembly: 'Top Panel Sub Assemble' },
    { itemNo: 2,  partNumber: 'TOHBMK006_T2', partName: 'Keypad PCB', partDescription: 'TOHAV5 Keypad PCB', category: 'Electronic Components', quantityRequired: 1, uom: 'Nos', subAssembly: 'Top Panel Sub Assemble', isCritical: true },
    { itemNo: 3,  partNumber: 'TOHBMK006_T3', partName: 'Display Cover Rib', partDescription: 'TOHAV5_004_Display Cover Rib', category: 'Mechanical', quantityRequired: 1, uom: 'Nos', subAssembly: 'Top Panel Sub Assemble' },
    { itemNo: 4,  partNumber: 'TOHBMK006_T4', partName: 'Top Production Sticker', partDescription: 'SUB001_Top Panel Sub Assemble Production Sticker', category: 'Labels & Stickers', quantityRequired: 1, uom: 'Nos', subAssembly: 'Top Panel Sub Assemble' },
    { itemNo: 5,  partNumber: 'TOHBMK006_T5', partName: 'Light Pipe', partDescription: 'TOHAV5_010_Light Pipe', category: 'Mechanical', quantityRequired: 1, uom: 'Nos', subAssembly: 'Top Panel Sub Assemble' },
    { itemNo: 6,  partNumber: 'TOHBMK006_T6', partName: 'Large Green Plastic Button', partDescription: 'TOHAV5_006_Large Green (1 No ) Plastic Button', category: 'Mechanical', quantityRequired: 1, uom: 'Nos', subAssembly: 'Top Panel Sub Assemble' },
    { itemNo: 7,  partNumber: 'TOHBMK006_T7', partName: 'Black Buttons', partDescription: 'TOHAV5_005_Medium Buttons( 20 No) & Large Buttons( 2 No ) - Plastic Button', category: 'Mechanical', quantityRequired: 1, uom: 'Nos', subAssembly: 'Top Panel Sub Assemble' },
    { itemNo: 8,  partNumber: 'TOHBMK006_T8', partName: 'Sml Buttons & Rubber Sleeve', partDescription: 'TOHAV5_007_Sml Buttons & Rubber Sleeve Rev 01_ 05.10.2024', category: 'Mechanical', quantityRequired: 1, uom: 'Nos', subAssembly: 'Top Panel Sub Assemble' },
    { itemNo: 9,  partNumber: 'TOHBMK006_T9', partName: 'Keypad PCB Screws', partDescription: 'Phillips Round Head Screws M2 X 6 mm_Keypad PCB', category: 'Mechanical', quantityRequired: 4, uom: 'Nos', subAssembly: 'Top Panel Sub Assemble' },
    { itemNo: 10, partNumber: 'TOHBMK007_B1', partName: 'Bottom Panel', partDescription: 'TOHAV5_002_Bottom Panel_Rev 01', category: 'Mechanical', quantityRequired: 1, uom: 'Nos', subAssembly: 'Bottom Panel Sub Assemble' },
    { itemNo: 11, partNumber: 'TOHBMK007_B2', partName: 'Speaker Cover', partDescription: 'TOHAV5_009 Speaker Cover', category: 'Mechanical', quantityRequired: 1, uom: 'Nos', subAssembly: 'Bottom Panel Sub Assemble' },
    { itemNo: 12, partNumber: 'TOHBMK007_B3', partName: 'Speaker', partDescription: 'OWS-203657TA-8 Speaker', category: 'Electronic Components', quantityRequired: 1, uom: 'Nos', subAssembly: 'Bottom Panel Sub Assemble', isCritical: true },
    { itemNo: 13, partNumber: 'TOHBMK007_B4', partName: 'Speaker Mesh', partDescription: 'Speaker Mesh Cloth', category: 'Mechanical', quantityRequired: 1, uom: 'Nos', subAssembly: 'Bottom Panel Sub Assemble' },
    { itemNo: 14, partNumber: 'TOHBMK007_B5', partName: 'Speaker Cap', partDescription: 'TOHAV5_008 Speaker Cap', category: 'Mechanical', quantityRequired: 1, uom: 'Nos', subAssembly: 'Bottom Panel Sub Assemble' },
    { itemNo: 15, partNumber: 'TOHBMK007_B6', partName: 'Rubber Feet', partDescription: 'TOHAV5_013_ Rubber Feet', category: 'Mechanical', quantityRequired: 2, uom: 'Nos', subAssembly: 'Bottom Panel Sub Assemble' },
    { itemNo: 16, partNumber: 'TOHBMK007_B7', partName: 'Speaker Production Sticker', partDescription: 'TOHAV5_Speaker Sub Assembly Production Sticker', category: 'Labels & Stickers', quantityRequired: 1, uom: 'Nos', subAssembly: 'Bottom Panel Sub Assemble' },
    { itemNo: 17, partNumber: 'TOHBMK007_B8', partName: 'Speaker Compartment Screws', partDescription: 'Phillips Rounded Head Thread- Forming Screws M2 X 6mm_ Speaker Compartment', category: 'Mechanical', quantityRequired: 2, uom: 'Nos', subAssembly: 'Bottom Panel Sub Assemble' },
    { itemNo: 18, partNumber: 'TOHBMK006_H1', partName: 'Top Panel Sub Assemble', partDescription: 'TOHAV5_SUB001_Top Panel Sub Assemble', category: 'Mechanical', quantityRequired: 1, uom: 'Nos', subAssembly: 'Top Panel Sub Assemble' },
    { itemNo: 19, partNumber: 'TOHBMK007_H2', partName: 'Bottom Panel Sub Assemble', partDescription: 'TOHAV5_SUB002_Bottom Panel Sub Assemble', category: 'Mechanical', quantityRequired: 1, uom: 'Nos', subAssembly: 'Bottom Panel Sub Assemble' },
    { itemNo: 20, partNumber: 'TOHAV4_H3',    partName: 'O Ring', partDescription: 'TOHAV5_012 Battery Compartment O Ring', category: 'Mechanical', quantityRequired: 1, uom: 'Nos', subAssembly: 'Base Unit' },
    { itemNo: 21, partNumber: 'TOHAV4_H4',    partName: 'Battery Cover', partDescription: 'TOHAV5_003_Battery Cover Rev 01', category: 'Mechanical', quantityRequired: 1, uom: 'Nos', subAssembly: 'Base Unit' },
    { itemNo: 22, partNumber: 'TOHBMK004_H6', partName: 'Protective Case', partDescription: 'TOHAV5_Protective Case - Packaging', category: 'Mechanical', quantityRequired: 1, uom: 'Nos', subAssembly: 'Packaging' },
    { itemNo: 23, partNumber: 'TOHCNK013_H7', partName: '3M Tap', partDescription: 'TOHAV5 Battery 0.3mm_3M Tap', category: 'Electronic Components', quantityRequired: 1, uom: 'Nos', subAssembly: 'Base Unit' },
    { itemNo: 24, partNumber: 'TOHCEK004_H8', partName: '4.58 Inch LCD Display Panel', partDescription: 'TOHAV5_4.58 Inch TFT LCD Display & Display Cover', category: 'Electronic Components', quantityRequired: 1, uom: 'Nos', subAssembly: 'Base Unit', isCritical: true },
    { itemNo: 25, partNumber: 'TOHAV4_H9',    partName: 'Main PCB', partDescription: 'TOHAV5_MainPCB_12012024', category: 'Electronic Components', quantityRequired: 1, uom: 'Nos', subAssembly: 'Base Unit', isCritical: true },
    { itemNo: 26, partNumber: 'TOHAV4_H10',   partName: 'Quectel Antena', partDescription: 'Quectel_YF0022_ANT_S1', category: 'Electronic Components', quantityRequired: 1, uom: 'Nos', subAssembly: 'Base Unit' },
    { itemNo: 27, partNumber: 'TOHBMK001_H11', partName: 'Main PCB Screws', partDescription: 'Phillips_Thread-Forming Screw_ M2 X 6mm_ Main PCB Screws', category: 'Mechanical', quantityRequired: 4, uom: 'Nos', subAssembly: 'Base Unit' },
    { itemNo: 28, partNumber: 'TOHBMK003_H12', partName: 'Main Assembly Screws', partDescription: 'Black-Oxide_Phillips Head Thread- Forming Screws M2 X 8mm_ Top & Bottom', category: 'Mechanical', quantityRequired: 7, uom: 'Nos', subAssembly: 'Base Unit' },
    { itemNo: 29, partNumber: 'TOHBMK002_H13', partName: 'Battery Cover Screws', partDescription: 'Black-Oxide_Stainless Steel Phillips Flat Head Screws M2 X 4mm CSK _Battery Cover', category: 'Mechanical', quantityRequired: 2, uom: 'Nos', subAssembly: 'Base Unit' },
    { itemNo: 30, partNumber: 'TOHAV4_H14',   partName: 'Bottom Production Stickers', partDescription: 'SUB002_Bottom Panel Sub Assemble Production Sticker', category: 'Labels & Stickers', quantityRequired: 1, uom: 'Nos', subAssembly: 'Bottom Panel Sub Assemble' },
    { itemNo: 31, partNumber: 'TOHCNK001_H15', partName: 'Device Serial Number Sticker', partDescription: 'TOHAV5_Device Serial Number Sticker', category: 'Labels & Stickers', quantityRequired: 1, uom: 'Nos', subAssembly: 'Packaging' },
    { itemNo: 32, partNumber: 'TOHCEK003_H16', partName: 'Battery', partDescription: '1c Charge, 2C discharge, 1S2P Cell Pack - (Capacity 4000mAh) Without BMS', category: 'Electronic Components', quantityRequired: 1, uom: 'Nos', subAssembly: 'Base Unit', isCritical: true },
    { itemNo: 33, partNumber: 'TOHCNK014',    partName: 'Charging Cable', partDescription: 'Type C Charging Cable', category: 'Electronic Components', quantityRequired: 1, uom: 'Nos', subAssembly: 'Packaging' },
    { itemNo: 34, partNumber: 'TOHBEK105',    partName: 'Coin Cell', partDescription: 'CR2032 Coin cell', category: 'Electronic Components', quantityRequired: 1, uom: 'Nos', subAssembly: 'Base Unit' },
    { itemNo: 35, partNumber: 'TOHCNK016',    partName: 'Packaging Box Sticker', partDescription: 'Packaging Mfg Sticker', category: 'Labels & Stickers', quantityRequired: 1, uom: 'Nos', subAssembly: 'Packaging' },
    { itemNo: 36, partNumber: 'TOHPKK003',    partName: 'Seal Sticker', partDescription: 'Package Circular Seal Sticker', category: 'Labels & Stickers', quantityRequired: 1, uom: 'Nos', subAssembly: 'Packaging' },
    { itemNo: 37, partNumber: 'TOHCNK015',    partName: 'User Manual', partDescription: 'User Manual-Tohands', category: 'Packaging', quantityRequired: 1, uom: 'Nos', subAssembly: 'Packaging' },
    { itemNo: 38, partNumber: 'TOHPKK001',    partName: 'Packaging Box', partDescription: 'Packaging Box', category: 'Packaging', quantityRequired: 1, uom: 'Nos', subAssembly: 'Packaging' },
    { itemNo: 39, partNumber: 'TOHPKK002',    partName: 'Device Sleeve', partDescription: 'Device Sleeve With Logo', category: 'Packaging', quantityRequired: 1, uom: 'Nos', subAssembly: 'Packaging' },
    { itemNo: 40, partNumber: 'TOHCNK017',    partName: 'Wrapping Cover', partDescription: 'Wrapping Cover', category: 'Packaging', quantityRequired: 1, uom: 'Nos', subAssembly: 'Packaging' },
    { itemNo: 41, partNumber: 'TOHPKK005',    partName: 'Packaging Sleeve', partDescription: 'Packing Sleeve_Green & White', category: 'Packaging', quantityRequired: 1, uom: 'Nos', subAssembly: 'Packaging' },
    { itemNo: 42, partNumber: 'TOHBMK008',    partName: 'Insert 1', partDescription: 'Packing Box Insert 1', category: 'Packaging', quantityRequired: 1, uom: 'Nos', subAssembly: 'Packaging' },
    { itemNo: 43, partNumber: 'TOHBMK009',    partName: 'Insert 2', partDescription: 'Packing Box Insert 2', category: 'Packaging', quantityRequired: 1, uom: 'Nos', subAssembly: 'Packaging' },
    { itemNo: 44, partNumber: 'TOHBMK010',    partName: 'Sim Card', partDescription: 'Sim Card For Tohands', category: 'Packaging', quantityRequired: 1, uom: 'Nos', subAssembly: 'Packaging' },
    { itemNo: 45, partNumber: 'TOHBMK011',    partName: 'Charging Adaptor', partDescription: 'Charging Adaptor for Tohands', category: 'Electronic Components', quantityRequired: 1, uom: 'Nos', subAssembly: 'Packaging' },
    { itemNo: 46, partNumber: 'TOHPKK004',    partName: 'ESD Bag (200 x 250mm)', partDescription: 'ESD Safe Antistatic Ping Bag (200mm x 250mm)', category: 'Packaging', quantityRequired: 1, uom: 'Nos', subAssembly: 'Packaging' },
    { itemNo: 47, partNumber: 'TOHPKK005',    partName: 'ESD Bag (120 x 150mm)', partDescription: 'ESD Safe Antistatic Ping Bag (120mm x 150mm)', category: 'Packaging', quantityRequired: 1, uom: 'Nos', subAssembly: 'Packaging' },
    { itemNo: 48, partNumber: 'TOCNK001',     partName: 'Branding Sticker', partDescription: 'Tohands Branding Sticker', category: 'Packaging', quantityRequired: 1, uom: 'Nos', subAssembly: 'Packaging' }
].map(item => ({
    ...item,
    stationTags: inferStationTags(item.category, item.partName, item.partDescription)
}));

// ═══════════════════════════════════════════════════════════════
// OPTION B: INTERNAL BAAN INVENTORY LINKING & MRP CALCULATION
// ═══════════════════════════════════════════════════════════════

/**
 * Calculates stock availability and Material Requirements Planning (MRP)
 * for a planned production batch size.
 * 
 * @param {Array} bomItems - List of BOM component items
 * @param {number} targetBatchSize - Target build quantity (e.g. 100, 500)
 * @param {Object} baanParts - store.baan.parts lookup dictionary
 * @param {Object} baanBatches - store.baan.batches lookup dictionary
 * @returns {Object} Full MRP analysis with stock status, shortages, and metrics
 */
export const calculateBomMrp = (bomItems = [], targetBatchSize = 100, baanParts = {}, baanBatches = {}) => {
    const validBatchSize = Math.max(1, Number(targetBatchSize) || 1);
    const batchList = Object.values(baanBatches || {});

    // Compute stock availability per part number from active batches
    const stockMap = {};
    batchList.forEach(batch => {
        if (!batch.partNumber) return;
        const pn = String(batch.partNumber).toUpperCase().trim();
        const avail = Math.max(0, Number(batch.quantityAvailable) || 0);
        stockMap[pn] = (stockMap[pn] || 0) + avail;
    });

    let totalShortageLines = 0;
    let criticalShortageCount = 0;
    let unmappedPartCount = 0;
    let totalRequiredUnits = 0;

    const analysisRows = bomItems.map(item => {
        const pn = String(item.partNumber).toUpperCase().trim();
        const requiredTotal = (Number(item.quantityRequired) || 1) * validBatchSize;
        totalRequiredUnits += requiredTotal;

        const baanPart = baanParts[pn] || baanParts[item.partNumber] || null;
        const currentStock = stockMap[pn] !== undefined ? stockMap[pn] : (stockMap[item.partNumber] || 0);
        const isBaanLinked = Boolean(baanPart);

        if (!isBaanLinked) {
            unmappedPartCount++;
        }

        let status = 'SUFFICIENT'; // 'SUFFICIENT' | 'PARTIAL_SHORTAGE' | 'CRITICAL_SHORTAGE' | 'UNMAPPED'
        let deficit = 0;

        if (!isBaanLinked) {
            status = 'UNMAPPED';
            deficit = requiredTotal;
            totalShortageLines++;
        } else if (currentStock === 0) {
            status = 'CRITICAL_SHORTAGE';
            deficit = requiredTotal;
            totalShortageLines++;
            criticalShortageCount++;
        } else if (currentStock < requiredTotal) {
            status = 'PARTIAL_SHORTAGE';
            deficit = requiredTotal - currentStock;
            totalShortageLines++;
        }

        const coveragePercent = currentStock > 0 ? Math.min(100, Math.round((currentStock / requiredTotal) * 100)) : 0;

        return {
            ...item,
            requiredTotal,
            currentStock,
            deficit,
            isBaanLinked,
            baanPartName: baanPart?.name || item.partName,
            status,
            coveragePercent
        };
    });

    const stockHealthPercent = analysisRows.length > 0 
        ? Math.round(((analysisRows.length - totalShortageLines) / analysisRows.length) * 100) 
        : 100;

    return {
        targetBatchSize: validBatchSize,
        totalBomItems: analysisRows.length,
        totalRequiredUnits,
        totalShortageLines,
        criticalShortageCount,
        unmappedPartCount,
        stockHealthPercent,
        rows: analysisRows,
        shortageRows: analysisRows.filter(r => r.deficit > 0)
    };
};

// ═══════════════════════════════════════════════════════════════
// EXPORT & TEMPLATE UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Downloads a pre-formatted BOM Excel template for offline population.
 */
export const downloadBomTemplate = (variantName = 'Calculator V5') => {
    const templateData = [
        {
            'Item No.': 1,
            'Part Number': 'TOHBMK006_T1',
            'Part Name': 'Top Panel',
            'Part Description': 'TOHAV5_001_Top Panel',
            'Category / Type': 'Mechanical',
            'Quantity Required': 1,
            'Reference Figures': 'SUB001_Top'
        },
        {
            'Item No.': 2,
            'Part Number': 'TOHBMK006_T2',
            'Part Name': 'Keypad PCB',
            'Part Description': 'TOHAV5 Keypad PCB',
            'Category / Type': 'Electronic Components',
            'Quantity Required': 1,
            'Reference Figures': 'Rev 01'
        },
        {
            'Item No.': 3,
            'Part Number': 'TOHBMK006_T9',
            'Part Name': 'Keypad PCB Screws',
            'Part Description': 'Phillips Round Head Screws M2 X 6 mm',
            'Category / Type': 'Mechanical',
            'Quantity Required': 4,
            'Reference Figures': 'Torque 0.15Nm'
        },
        {
            'Item No.': 4,
            'Part Number': 'TOHCNK001_H15',
            'Part Name': 'Device Serial Number Sticker',
            'Part Description': 'Device Serial Number Barcode Label',
            'Category / Type': 'Labels & Stickers',
            'Quantity Required': 1,
            'Reference Figures': 'Label 40x15mm'
        },
        {
            'Item No.': 5,
            'Part Number': 'TOHPKK001',
            'Part Name': 'Packaging Box',
            'Part Description': 'Retail Master Box',
            'Category / Type': 'Packaging',
            'Quantity Required': 1,
            'Reference Figures': 'Carton 350GSM'
        }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BOM_Template');
    XLSX.writeFile(wb, `CQA_MES_BOM_Template_${variantName.replace(/\s+/g, '_')}.xlsx`);
};

/**
 * Exports the active or selected BOM items to an Excel or CSV file.
 */
export const exportBomToSpreadsheet = (bomItems = [], variantName = 'Calculator_V5', revision = 'REV-01', format = 'xlsx') => {
    const exportData = bomItems.map(item => ({
        'Item No.': item.itemNo,
        'Part Number': item.partNumber,
        'Part Name': item.partName,
        'Part Description': item.partDescription || '',
        'Category / Type': item.category,
        'Quantity Required': item.quantityRequired,
        'Sub Assembly': item.subAssembly || '',
        'UOM': item.uom || 'Nos',
        'Station Affinity': (item.stationTags || []).join(', '),
        'Critical Component': item.isCritical ? 'YES' : 'NO',
        'Reference Figures': item.referenceFigures || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${variantName}_${revision}`.slice(0, 31));

    const filename = `CQA_BOM_${variantName}_${revision}_${new Date().toISOString().slice(0, 10)}.${format}`;
    XLSX.writeFile(wb, filename, { bookType: format === 'csv' ? 'csv' : 'xlsx' });
};

/**
 * Exports Material Requirements Planning (MRP) analysis report to Excel.
 */
export const exportMrpReport = (mrpResult, variantName = 'Calculator V5', revision = 'REV-01') => {
    if (!mrpResult || !mrpResult.rows) return;

    const data = mrpResult.rows.map(r => ({
        'Item No.': r.itemNo,
        'Part Number': r.partNumber,
        'Part Name': r.partName,
        'Category': r.category,
        'Qty Per Unit': r.quantityRequired,
        'Target Batch Size': mrpResult.targetBatchSize,
        'Total Required Qty': r.requiredTotal,
        'Current BAAN Stock': r.currentStock,
        'Shortage Deficit': r.deficit,
        'Coverage %': `${r.coveragePercent}%`,
        'Stock Status': r.status.replace(/_/g, ' '),
        'BAAN Catalog Match': r.isBaanLinked ? 'LINKED' : 'NOT FOUND IN BAAN'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MRP_Planning_Report');
    XLSX.writeFile(wb, `CQA_MRP_${variantName.replace(/\s+/g, '_')}_${mrpResult.targetBatchSize}Units_${new Date().toISOString().slice(0, 10)}.xlsx`);
};
