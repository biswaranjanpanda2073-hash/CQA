import React, { useEffect } from 'react';
import { Html5QrcodeScanner } from "html5-qrcode";
import { X, Camera } from 'lucide-react';

const QRScanner = ({ onScan, onClose }) => {
    useEffect(() => {
        const scanner = new Html5QrcodeScanner("reader", {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        });

        const onScanSuccess = (decodedText) => {
            onScan(decodedText);
            scanner.clear();
            onClose();
        };

        const onScanError = (err) => {
            // Silence noise
        };

        scanner.render(onScanSuccess, onScanError);

        return () => {
            scanner.clear().catch(e => console.warn("Scanner clear failed", e));
        };
    }, [onScan, onClose]);

    return (
        <div className="modal-overlay" style={{ zIndex: 3000 }}>
            <div className="card" style={{
                maxWidth: 500,
                width: '100%',
                padding: '1.5rem',
                position: 'relative'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '1.5rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            width: 32,
                            height: 32,
                            background: 'var(--primary-bg)',
                            color: 'var(--primary)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Camera size={18} />
                        </div>
                        <h3 className="font-extrabold" style={{ fontSize: '1.1rem' }}>Scan Barcode / QR</h3>
                    </div>
                    <button className="btn-icon" onClick={onClose} style={{ color: 'var(--text-muted)' }}>
                        <X size={20} />
                    </button>
                </div>

                <div id="reader" style={{
                    width: '100%',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    background: '#f8fafc',
                    border: '1px solid var(--border)'
                }}></div>

                <p className="text-muted text-xs font-semibold" style={{
                    textAlign: 'center',
                    marginTop: '1rem'
                }}>
                    Align the code within the frame to scan automatically.
                </p>
            </div>
        </div>
    );
};

export default QRScanner;
