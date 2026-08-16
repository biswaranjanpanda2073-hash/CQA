import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Upload, AlertCircle, CheckCircle2, AlertTriangle, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useCQA } from '../hooks/useCQA';

const VALID_UOMS = ['Nos', 'Pcs', 'Box', 'Pack', 'Set', 'Roll', 'Meter', 'Gram', 'Kg', 'Liter'];

const BaanBulkInward = () => {
    const { store, bulkInwardBaanParts } = useCQA();
    const [file, setFile] = useState(null);
    const [previewData, setPreviewData] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [uploadStatus, setUploadStatus] = useState(null);
    const [uploadSummary, setUploadSummary] = useState(null);

    const locations = Object.values(store.baan?.locations || {});
    const existingParts = Object.values(store.baan?.batches || {}).reduce((acc, batch) => {
        if (batch.partNumber) acc[batch.partNumber] = true;
        return acc;
    }, {});

    const downloadTemplate = () => {
        const templateData = [
            {
                'Part Number': 'BAT-001',
                'Part Name': 'Lithium Battery 5000mAh',
                'Quantity': 100,
                'Per Unit Cost': 150.50,
                'UOM': 'Nos',
                'Invoice/DC Number': 'INV-998822',
                'Minimum Stock Level': 20,
                'MPN': 'LITH-500',
                'Batch Number': 'B-202305-01',
                'Location Selection': locations[0]?.name || 'Store A',
                'Remarks': 'Sample entry'
            }
        ];

        const ws = XLSX.utils.json_to_sheet(templateData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Template');
        XLSX.writeFile(wb, 'Bulk_Inward_Template.xlsx');
    };

    const handleFileUpload = (e) => {
        const uploadedFile = e.target.files[0];
        if (!uploadedFile) return;
        setFile(uploadedFile);
        setUploadStatus(null);
        setUploadSummary(null);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);
                validateData(data);
            } catch (err) {
                console.error(err);
                setUploadStatus({ type: 'error', message: 'Failed to parse file. Please upload a valid Excel or CSV file.' });
                setPreviewData([]);
            }
        };
        reader.readAsBinaryString(uploadedFile);
    };

    const validateData = (data) => {
        if (!data || data.length === 0) {
            setUploadStatus({ type: 'error', message: 'File is empty or invalid format.' });
            setPreviewData([]);
            return;
        }

        const locationPartMap = new Set();
        const partLocationsCount = {};
        
        data.forEach(row => {
            const pNo = String(row['Part Number'] || '').trim().toUpperCase();
            if (pNo) {
                partLocationsCount[pNo] = (partLocationsCount[pNo] || 0) + 1;
            }
        });

        const validated = data.map((row, index) => {
            const partNo = String(row['Part Number'] || '').trim().toUpperCase();
            const partName = String(row['Part Name'] || '').trim();
            const qty = Number(row['Quantity']);
            const cost = Number(row['Per Unit Cost']);
            const uom = String(row['UOM'] || '').trim();
            const invoice = String(row['Invoice/DC Number'] || '').trim();
            const minStock = Number(row['Minimum Stock Level']);
            const location = String(row['Location Selection'] || row['Location'] || '').trim();
            const batchNumber = String(row['Batch Number'] || '').trim();

            const errors = [];
            const warnings = [];
            const infoNotes = [];

            if (!partNo) errors.push('Part Number is missing.');
            if (!partName) errors.push('Part Name is missing.');
            if (!qty || isNaN(qty) || qty <= 0) errors.push('Quantity must be > 0.');
            if (isNaN(cost) || cost < 0) errors.push('Per Unit Cost must be >= 0.');
            if (!VALID_UOMS.includes(uom)) errors.push(`Invalid UOM. Allowed: ${VALID_UOMS.join(', ')}.`);
            if (!invoice) errors.push('Invoice/DC Number is missing.');
            if (isNaN(minStock) || minStock < 0) errors.push('Minimum Stock Level must be >= 0.');
            if (!location) errors.push('Location is missing.');

            // Multi-location vs Duplicate Check
            if (partNo && location) {
                const locKey = `${partNo}::${location}::${batchNumber}`;
                if (locationPartMap.has(locKey)) {
                    warnings.push('Duplicate row for exact same SKU, location and batch.');
                }
                locationPartMap.add(locKey);

                if (partLocationsCount[partNo] > 1) {
                    infoNotes.push(`Multi-location distribution (${location})`);
                } else if (existingParts[partNo]) {
                    infoNotes.push('Existing SKU in master (stock addition)');
                }
            }

            let status = 'Valid';
            if (errors.length > 0) status = 'Error';
            else if (warnings.length > 0) status = 'Warning';

            return {
                rowNumber: index + 1,
                partNo,
                partName,
                qty,
                cost,
                uom,
                invoice,
                minStock,
                location,
                mpn: String(row['MPN'] || '').trim(),
                batchNumber,
                remarks: String(row['Remarks'] || '').trim(),
                status,
                messages: [...errors, ...warnings, ...infoNotes]
            };
        });

        setPreviewData(validated);
    };

    const handleConfirmUpload = async () => {
        const validRows = previewData.filter(r => r.status !== 'Error');
        if (validRows.length === 0) {
            setUploadStatus({ type: 'error', message: 'No valid rows to process.' });
            return;
        }

        setIsProcessing(true);
        setUploadStatus(null);
        setUploadSummary(null);

        try {
            const user = JSON.parse(localStorage.getItem('cqa_user') || '{}');
            const res = await bulkInwardBaanParts(validRows, user);
            
            if (res.success) {
                setUploadSummary({
                    total: previewData.length,
                    success: res.successfulRows,
                    failed: previewData.length - res.successfulRows,
                    existingUpdated: res.existingPartsUpdated,
                    newCreated: res.newPartsCreated
                });
                setUploadStatus({ type: 'success', message: 'Bulk upload completed successfully!' });
                setFile(null);
                setPreviewData([]);
                document.getElementById('bulk-upload-input').value = '';
            } else {
                setUploadStatus({ type: 'error', message: res.message || 'Bulk upload failed.' });
            }
        } catch (error) {
            console.error(error);
            setUploadStatus({ type: 'error', message: 'An unexpected error occurred during upload.' });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="animate-fade-in">
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
                <div>
                    <h2 className="baan-title" style={{ fontSize: '1.25rem' }}>Bulk Inward Stock Import</h2>
                    <p className="baan-subtitle">Fast batch inward via Excel (.xlsx) or CSV template with automated FIFO verification</p>
                </div>
            </div>

            {/* 3-Step Guided Workflow Cards */}
            <div className="baan-wizard-steps">
                {/* Step 1: Download Template */}
                <div className={`baan-wizard-step-card ${!file && previewData.length === 0 ? 'active' : ''}`}>
                    <div className="baan-wizard-step-num">1</div>
                    <h4 className="font-bold text-sm" style={{ color: 'var(--baan-text-primary)', marginBottom: '0.35rem' }}>Download Template</h4>
                    <p className="text-xs text-muted" style={{ marginBottom: '1rem', lineHeight: '1.4' }}>
                        Get the pre-formatted Excel template with required fields (Part No, Name, Qty, PPU, UOM, DC #, Location Selection).
                    </p>
                    <button className="baan-btn secondary" onClick={downloadTemplate} style={{ width: '100%' }}>
                        <FileSpreadsheet size={15} /> Download Template (.xlsx)
                    </button>
                </div>

                {/* Step 2: Upload File */}
                <div className={`baan-wizard-step-card ${file ? 'active' : ''}`}>
                    <div className="baan-wizard-step-num">2</div>
                    <h4 className="font-bold text-sm" style={{ color: 'var(--baan-text-primary)', marginBottom: '0.35rem' }}>Upload Filled File</h4>
                    <p className="text-xs text-muted" style={{ marginBottom: '1rem', lineHeight: '1.4' }}>
                        Upload your completed spreadsheet. System parses and validates all batch and location records automatically.
                    </p>
                    <input 
                        type="file" 
                        id="bulk-upload-input" 
                        accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                    />
                    <button 
                        className="baan-btn primary" 
                        onClick={() => document.getElementById('bulk-upload-input').click()}
                        style={{ width: '100%' }}
                    >
                        <Upload size={15} /> {file ? 'Change File' : 'Select Spreadsheet'}
                    </button>
                    {file && (
                        <div className="text-xs font-bold text-mono truncate" style={{ marginTop: '0.5rem', color: 'var(--baan-accent)', textAlign: 'center' }}>
                            📄 {file.name}
                        </div>
                    )}
                </div>

                {/* Step 3: Validate & Import */}
                <div className={`baan-wizard-step-card ${previewData.length > 0 ? 'active' : ''}`}>
                    <div className="baan-wizard-step-num">3</div>
                    <h4 className="font-bold text-sm" style={{ color: 'var(--baan-text-primary)', marginBottom: '0.35rem' }}>Review & Confirm</h4>
                    <p className="text-xs text-muted" style={{ marginBottom: '1rem', lineHeight: '1.4' }}>
                        Inspect parsed rows, verify validation status and location tagging, then commit batches into inventory.
                    </p>
                    <button 
                        className="baan-btn primary" 
                        onClick={handleConfirmUpload}
                        disabled={isProcessing || previewData.filter(r => r.status !== 'Error').length === 0}
                        style={{ width: '100%' }}
                    >
                        {isProcessing ? (
                            <><Loader2 size={15} className="animate-spin" /> Processing...</>
                        ) : (
                            <><CheckCircle2 size={15} /> Confirm Inward ({previewData.filter(r => r.status !== 'Error').length})</>
                        )}
                    </button>
                </div>
            </div>

            {/* Status Alert Banner */}
            {uploadStatus && (
                <div className="baan-card" style={{ 
                    padding: '0.875rem 1.25rem', 
                    marginBottom: '1.25rem',
                    borderLeft: `4px solid ${uploadStatus.type === 'error' ? 'var(--baan-danger)' : 'var(--baan-success)'}`,
                    background: uploadStatus.type === 'error' ? 'var(--baan-danger-bg)' : 'var(--baan-success-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                }}>
                    {uploadStatus.type === 'error' ? (
                        <AlertCircle size={20} style={{ color: 'var(--baan-danger)', flexShrink: 0 }} />
                    ) : (
                        <CheckCircle2 size={20} style={{ color: 'var(--baan-success)', flexShrink: 0 }} />
                    )}
                    <span className="text-sm font-bold" style={{ color: 'var(--baan-text-primary)' }}>{uploadStatus.message}</span>
                </div>
            )}

            {/* Upload Summary Metrics */}
            {uploadSummary && (
                <div className="baan-kpi-grid" style={{ marginBottom: '1.25rem' }}>
                    <div className="baan-kpi-card" style={{ cursor: 'default' }}>
                        <div>
                            <div className="baan-kpi-label">Total Rows</div>
                            <div className="baan-kpi-value">{uploadSummary.total}</div>
                        </div>
                        <div className="baan-kpi-icon-box" style={{ background: 'var(--baan-surface-muted)', color: 'var(--baan-text-secondary)' }}>
                            <FileSpreadsheet size={20} />
                        </div>
                    </div>
                    <div className="baan-kpi-card" style={{ cursor: 'default' }}>
                        <div>
                            <div className="baan-kpi-label">Successfully Inwarded</div>
                            <div className="baan-kpi-value" style={{ color: 'var(--baan-success)' }}>{uploadSummary.success}</div>
                        </div>
                        <div className="baan-kpi-icon-box" style={{ background: 'var(--baan-success-bg)', color: 'var(--baan-success)' }}>
                            <CheckCircle2 size={20} />
                        </div>
                    </div>
                    <div className="baan-kpi-card" style={{ cursor: 'default' }}>
                        <div>
                            <div className="baan-kpi-label">Failed (Errors)</div>
                            <div className="baan-kpi-value" style={{ color: uploadSummary.failed > 0 ? 'var(--baan-danger)' : 'var(--baan-text-primary)' }}>
                                {uploadSummary.failed}
                            </div>
                        </div>
                        <div className="baan-kpi-icon-box" style={{ background: 'var(--baan-danger-bg)', color: 'var(--baan-danger)' }}>
                            <AlertCircle size={20} />
                        </div>
                    </div>
                    <div className="baan-kpi-card" style={{ cursor: 'default' }}>
                        <div>
                            <div className="baan-kpi-label">Parts Processed</div>
                            <div className="baan-kpi-value">{uploadSummary.existingUpdated + uploadSummary.newCreated}</div>
                        </div>
                        <div className="baan-kpi-icon-box" style={{ background: 'var(--baan-info-bg)', color: 'var(--baan-info)' }}>
                            <Upload size={20} />
                        </div>
                    </div>
                </div>
            )}

            {/* Preview Table */}
            {previewData.length > 0 && (
                <div className="baan-card">
                    <div className="baan-card-header">
                        <div className="baan-card-title">
                            <FileSpreadsheet size={16} style={{ color: 'var(--baan-accent)' }} />
                            Upload Preview & FIFO Verification ({previewData.length} rows)
                        </div>
                        <button 
                            className="baan-btn primary" 
                            onClick={handleConfirmUpload}
                            disabled={isProcessing || previewData.filter(r => r.status !== 'Error').length === 0}
                        >
                            {isProcessing ? (
                                <><Loader2 size={15} className="animate-spin" /> Processing...</>
                            ) : (
                                <><CheckCircle2 size={15} /> Confirm Inward ({previewData.filter(r => r.status !== 'Error').length})</>
                            )}
                        </button>
                    </div>
                    <div className="baan-table-wrapper" style={{ maxHeight: '420px', overflowY: 'auto', border: 'none' }}>
                        <table className="baan-table">
                            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                                <tr>
                                    <th style={{ width: 60 }}>Row</th>
                                    <th>Part Number</th>
                                    <th>Part Name</th>
                                    <th className="num-col">Quantity</th>
                                    <th className="num-col">PPU (₹)</th>
                                    <th>Location</th>
                                    <th>Status</th>
                                    <th>Validation Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {previewData.map((row, idx) => (
                                    <tr key={idx} style={{ 
                                        backgroundColor: row.status === 'Error' 
                                            ? 'var(--baan-danger-bg)' 
                                            : row.status === 'Warning' 
                                                ? 'var(--baan-warning-bg)' 
                                                : 'inherit' 
                                    }}>
                                        <td className="text-mono font-bold">{row.rowNumber}</td>
                                        <td className="font-bold text-mono" style={{ color: 'var(--baan-accent)' }}>{row.partNo}</td>
                                        <td className="font-semibold">{row.partName}</td>
                                        <td className="num-col font-bold">{row.qty} <span className="text-xs text-muted">{row.uom}</span></td>
                                        <td className="num-col">₹{row.cost.toFixed(2)}</td>
                                        <td>
                                            <span className="baan-badge neutral">📍 {row.location}</span>
                                        </td>
                                        <td>
                                            {row.status === 'Error' && (
                                                <span className="baan-badge danger"><AlertCircle size={11}/> Error</span>
                                            )}
                                            {row.status === 'Warning' && (
                                                <span className="baan-badge warning"><AlertTriangle size={11}/> Warning</span>
                                            )}
                                            {row.status === 'Valid' && (
                                                <span className="baan-badge success"><CheckCircle2 size={11}/> Valid</span>
                                            )}
                                        </td>
                                        <td className="text-xs text-muted">{row.messages.join(' | ') || 'Ready for stock inward'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BaanBulkInward;
