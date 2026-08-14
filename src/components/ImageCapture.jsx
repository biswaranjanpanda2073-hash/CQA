import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, RefreshCw, Check, Loader2, Image as ImageIcon } from 'lucide-react';

const ImageCapture = ({ onCapture, onClose, title = "Capture Proof" }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [capturedImage, setCapturedImage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const startCamera = async () => {
        setLoading(true);
        setError(null);
        try {
            const constraints = {
                video: {
                    facingMode: 'environment', // Use back camera on mobile
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };
            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            if (videoRef.current) {
                videoRef.current.srcObject = newStream;
            }
            setStream(newStream);
            setLoading(false);
        } catch (err) {
            console.error("Camera access error:", err);
            setError("Unable to access camera. Please check permissions.");
            setLoading(false);
        }
    };

    useEffect(() => {
        startCamera();
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        // Set canvas size to match video dimensions
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Compress and Convert to Blob/DataURL
        // Aggressive Compression: 800px max width to ensure <100KB size
        const MAX_WIDTH = 800;
        let targetWidth = canvas.width;
        let targetHeight = canvas.height;

        if (targetWidth > MAX_WIDTH) {
            targetHeight = (MAX_WIDTH / targetWidth) * targetHeight;
            targetWidth = MAX_WIDTH;
        }

        const resizeCanvas = document.createElement('canvas');
        resizeCanvas.width = targetWidth;
        resizeCanvas.height = targetHeight;
        const resizeCtx = resizeCanvas.getContext('2d');
        resizeCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);

        // Quality 0.6 for aggressive compression
        const dataUrl = resizeCanvas.toDataURL('image/jpeg', 0.6);
        setCapturedImage(dataUrl);

        // Stop camera tracks once captured
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const handleConfirm = () => {
        if (capturedImage) {
            onCapture(capturedImage);
            onClose();
        }
    };

    const handleRetry = () => {
        setCapturedImage(null);
        startCamera();
    };

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
                            background: 'var(--primary-alpha)',
                            color: 'var(--primary)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Camera size={18} />
                        </div>
                        <h3 className="font-extrabold" style={{ fontSize: '1.1rem' }}>{title}</h3>
                    </div>
                    <button className="btn-icon" onClick={onClose} style={{ color: 'var(--text-muted)' }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '4/3',
                    background: '#000',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    border: '1px solid var(--border)'
                }}>
                    {loading && (
                        <div className="flex-center flex-col gap-2" style={{ height: '100%', color: '#fff' }}>
                            <Loader2 className="animate-spin" size={32} />
                            <span className="text-sm font-semibold">Initializing Camera...</span>
                        </div>
                    )}

                    {error && (
                        <div className="flex-center flex-col gap-4 text-center p-6" style={{ height: '100%', color: '#fff' }}>
                            <ImageIcon size={48} opacity={0.3} />
                            <p className="text-sm font-medium">{error}</p>
                            <button className="btn btn-primary" onClick={startCamera}>
                                Retry Access
                            </button>
                        </div>
                    )}

                    {!capturedImage ? (
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                display: (loading || error) ? 'none' : 'block'
                            }}
                        />
                    ) : (
                        <img
                            src={capturedImage}
                            alt="Captured"
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover'
                            }}
                        />
                    )}
                </div>

                <div style={{ marginTop: '1.5rem' }}>
                    {!capturedImage ? (
                        <button
                            className="btn btn-primary"
                            style={{ width: '100%', height: 56, fontSize: '1rem' }}
                            onClick={capturePhoto}
                            disabled={loading || error}
                        >
                            <Camera size={20} /> Capture Photo
                        </button>
                    ) : (
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                className="btn btn-secondary"
                                style={{ flex: 1, height: 56 }}
                                onClick={handleRetry}
                            >
                                <RefreshCw size={18} /> Retake
                            </button>
                            <button
                                className="btn btn-primary"
                                style={{ flex: 1, height: 56 }}
                                onClick={handleConfirm}
                            >
                                <Check size={18} /> Confirm & Attach
                            </button>
                        </div>
                    )}
                </div>

                <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
        </div>
    );
};

export default ImageCapture;
