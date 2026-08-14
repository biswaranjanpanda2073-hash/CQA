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

        const partNumSet = new Set();
        const validated = data.map((row, index) => {
            const partNo = String(row['Part Number'] || '').trim().toUpperCase();
            const partName = String(row['Part Name'] || '').trim();
            const qty = Number(row['Quantity']);
            const cost = Number(row['Per Unit Cost']);
            const uom = String(row['UOM'] || '').trim();
            const invoice = String(row['Invoice/DC Number'] || '').trim();
            const minStock = Number(row['Minimum Stock Level']);
            const location = String(row['Location Selection'] || row['Location'] || '').trim();

            const errors = [];
            const warnings = [];

            if (!partNo) errors.push('Part Number is missing.');
            if (!partName) errors.push('Part Name is missing.');
            if (!qty || isNaN(qty) || qty <= 0) errors.push('Quantity must be > 0.');
            if (isNaN(cost) || cost < 0) errors.push('Per Unit Cost must be >= 0.');
            if (!VALID_UOMS.includes(uom)) errors.push(`Invalid UOM. Allowed: ${VALID_UOMS.join(', ')}.`);
            if (!invoice) errors.push('Invoice/DC Number is missing.');
            if (isNaN(minStock) || minStock < 0) errors.push('Minimum Stock Level must be >= 0.');
            if (!location) errors.push('Location is missing.');

            // Duplicate in file check
            if (partNo) {
                if (partNumSet.has(partNo)) {
                    warnings.push('Duplicate Part Number in upload file.');
                }
                partNumSet.add(partNo);
                
                // Existing part check
                if (existingParts[partNo]) {
                    warnings.push('Existing Part Found (Stock will be added).');
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
                batchNumber: String(row['Batch Number'] || '').trim(),
                remarks: String(row['Remarks'] || '').trim(),
                status,
                messages: [...errors, ...warnings]
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
            <h2 className="font-bold" style={{ marginBottom: '1.5rem' }}>Bulk Inward Upload</h2>
            
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-body">
                    <div className="flex-between" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <p className="text-sm text-muted" style={{ marginBottom: '0.5rem' }}>Download the template, fill it out, and upload it back here.</p>
                            <button className="btn btn-secondary" onClick={downloadTemplate}>
                                <FileSpreadsheet size={16} /> Download Template
                            </button>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input 
                                type="file" 
                                id="bulk-upload-input" 
                                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                                style={{ display: 'none' }}
                                onChange={handleFileUpload}
                            />
                            <button className="btn btn-primary" onClick={() => document.getElementById('bulk-upload-input').click()}>
                                <Upload size={16} /> Select File
                            </button>
                            {file && <span className="text-sm font-semibold">{file.name}</span>}
                        </div>
                    </div>
                </div>
            </div>

            {uploadStatus && (
                <div className={`alert alert-${uploadStatus.type}`} style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem', borderRadius: '8px', backgroundColor: uploadStatus.type === 'error' ? 'var(--error-bg)' : 'var(--success-bg)', color: uploadStatus.type === 'error' ? 'var(--error)' : 'var(--success)' }}>
                    {uploadStatus.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
                    <span className="font-semibold">{uploadStatus.message}</span>
                </div>
            )}

            {uploadSummary && (
                <div className="grid md-grid-4 gap-4" style={{ marginBottom: '1.5rem' }}>
                    <div className="card"><div className="card-body"><p className="text-xs text-muted uppercase font-bold">Total Rows</p><h3 className="font-extrabold">{uploadSummary.total}</h3></div></div>
                    <div className="card"><div className="card-body"><p className="text-xs text-muted uppercase font-bold">Successful</p><h3 className="font-extrabold text-success">{uploadSummary.success}</h3></div></div>
                    <div className="card"><div className="card-body"><p className="text-xs text-muted uppercase font-bold">Failed (Errors)</p><h3 className="font-extrabold text-error">{uploadSummary.failed}</h3></div></div>
                    <div className="card"><div className="card-body"><p className="text-xs text-muted uppercase font-bold">Parts Processed</p><h3 className="font-extrabold">{uploadSummary.existingUpdated + uploadSummary.newCreated}</h3></div></div>
                </div>
            )}

            {previewData.length > 0 && (
                <div className="card">
                    <div className="card-header flex-between">
                        <h3 className="text-sm font-bold">Upload Preview ({previewData.length} rows)</h3>
                        <button 
                            className="btn btn-primary" 
                            onClick={handleConfirmUpload}
                            disabled={isProcessing || previewData.filter(r => r.status !== 'Error').length === 0}
                        >
                            {isProcessing ? <><Loader2 size={16} className="spin" /> Processing...</> : <><CheckCircle2 size={16} /> Confirm Upload</>}
                        </button>
                    </div>
                    <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        <table>
                            <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', zIndex: 1 }}>
                                <tr>
                                    <th>Row</th>
                                    <th>Part No</th>
                                    <th>Part Name</th>
                                    <th>Qty</th>
                                    <th>Cost</th>
                                    <th>Location</th>
                                    <th>Status</th>
                                    <th>Message</th>
                                </tr>
                            </thead>
                            <tbody>
                                {previewData.map((row, idx) => (
                                    <tr key={idx} style={{ backgroundColor: row.status === 'Error' ? 'var(--error-bg)' : row.status === 'Warning' ? 'var(--warning-bg)' : 'inherit' }}>
                                        <td>{row.rowNumber}</td>
                                        <td className="font-bold text-mono">{row.partNo}</td>
                                        <td>{row.partName}</td>
                                        <td>{row.qty} {row.uom}</td>
                                        <td>₹{row.cost}</td>
                                        <td>{row.location}</td>
                                        <td>
                                            {row.status === 'Error' && <span className="status-pill error"><AlertCircle size={12}/> Error</span>}
                                            {row.status === 'Warning' && <span className="status-pill warning"><AlertTriangle size={12}/> Warning</span>}
                                            {row.status === 'Valid' && <span className="status-pill success"><CheckCircle2 size={12}/> Valid</span>}
                                        </td>
                                        <td className="text-xs">{row.messages.join(' | ')}</td>
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
