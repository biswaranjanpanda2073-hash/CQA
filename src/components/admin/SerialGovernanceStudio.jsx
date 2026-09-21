import React, { useState, useEffect, useMemo } from 'react';
import {
    Search,
    Scan,
    ShieldAlert,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    FastForward,
    RotateCcw,
    Lock,
    Unlock,
    Activity,
    Layers,
    Clock,
    User,
    Calendar,
    ChevronRight,
    ArrowRight,
    RefreshCw,
    FileSpreadsheet,
    Eye,
    Filter,
    HelpCircle,
    Trash2,
    ShieldCheck,
    Cpu,
    ExternalLink,
    Flag,
    Sparkles
} from 'lucide-react';
import { useCQA } from '../../hooks/useCQA.jsx';
import { db, doc, getDoc, setDoc, updateDoc, writeBatch, collection, query, where, getDocs } from '../../firebase.js';
import { 
    HOLD_TAXONOMY, 
    DISPOSITION_ACTIONS, 
    evaluateLooperRisk, 
    validateHoldRequest, 
    validateReleaseRequest, 
    validateDispositionRequest,
    formatHistoryEvent 
} from '../../utils/governanceEngine.js';
import { logAdminAction, AUDIT_ACTIONS } from '../../utils/auditLogger.js';
import { hasPermission, PERMISSIONS } from '../../utils/rbacEngine.js';
import QRScanner from '../QRScanner.jsx';
import UnitSerialConfig from '../UnitSerialConfig.jsx';

export const SerialGovernanceStudio = ({ user, initialSerial, onNavigateToInfo }) => {
    const { store, getUnitById, getDisplayName } = useCQA();

    // Permissions
    const canMove = hasPermission(user, PERMISSIONS.SERIAL_MOVE);
    const canHold = hasPermission(user, PERMISSIONS.SERIAL_HOLD_UNHOLD);
    const canScrapReview = hasPermission(user, PERMISSIONS.SERIAL_SCRAP_REVIEW);
    const isSuperAdmin = user?.role === 'Super Admin';

    // Top-level Navigation: 'lookup' | 'movement' | 'hold-quarantine' | 'looper-disposition' | 'history'
    const [activeSubTab, setActiveSubTab] = useState('lookup');

    // ─── SERIAL LOOKUP STATE ───
    const [searchQuery, setSearchQuery] = useState(initialSerial || '');
    const [searchedUnit, setSearchedUnit] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [showScanner, setShowScanner] = useState(false);

    // ─── MODAL STATES ───
    // Hold Modal
    const [showHoldModal, setShowHoldModal] = useState(false);
    const [holdTargetSerials, setHoldTargetSerials] = useState([]);
    const [holdCategory, setHoldCategory] = useState('Quality');
    const [holdReason, setHoldReason] = useState('');
    const [holdRemarks, setHoldRemarks] = useState('');
    const [holdSubmitting, setHoldSubmitting] = useState(false);
    const [holdFeedback, setHoldFeedback] = useState(null);

    // Release Hold Modal
    const [showReleaseModal, setShowReleaseModal] = useState(false);
    const [releaseTargetSerials, setReleaseTargetSerials] = useState([]);
    const [releaseReason, setReleaseReason] = useState('');
    const [releaseNotes, setReleaseNotes] = useState('');
    const [releaseSubmitting, setReleaseSubmitting] = useState(false);
    const [releaseFeedback, setReleaseFeedback] = useState(null);

    // Looper Disposition Modal
    const [showDispositionModal, setShowDispositionModal] = useState(false);
    const [dispositionUnit, setDispositionUnit] = useState(null);
    const [dispositionActionId, setDispositionActionId] = useState('MRB_ESCALATION');
    const [dispositionReason, setDispositionReason] = useState('');
    const [dispositionSubmitting, setDispositionSubmitting] = useState(false);
    const [dispositionFeedback, setDispositionFeedback] = useState(null);

    // Looper Threshold
    const [looperThreshold, setLooperThreshold] = useState(2);
    const [looperFilterProject, setLooperFilterProject] = useState('ALL');

    // Hold Filter
    const [holdFilterProject, setHoldFilterProject] = useState('ALL');
    const [holdFilterCategory, setHoldFilterCategory] = useState('ALL');

    // Auto-search if initialSerial provided
    useEffect(() => {
        if (initialSerial) {
            handleSearchSerial(initialSerial);
        }
    }, [initialSerial]);

    // Fast lookup handler
    const handleSearchSerial = async (serialToSearch) => {
        const clean = String(serialToSearch || searchQuery).trim().toUpperCase().replace(/\//g, '-');
        if (!clean) return;

        setIsSearching(true);
        setSearchError('');
        setSearchedUnit(null);

        try {
            const unit = await getUnitById(clean);
            if (unit) {
                setSearchedUnit(unit);
                setSearchQuery(clean);
            } else {
                setSearchError(`Serial Number "${clean}" not found in database.`);
            }
        } catch (e) {
            console.error('Lookup error:', e);
            setSearchError(`Lookup error: ${e.message}`);
        } finally {
            setIsSearching(false);
        }
    };

    // Calculate live overview metrics from store.devices
    const metrics = useMemo(() => {
        const all = Object.values(store?.devices || {});
        let wipCount = 0;
        let holdCount = 0;
        let looperCount = 0;
        let completedCount = 0;
        let scrapCount = 0;

        all.forEach(u => {
            if (u.holdStatus === 'HOLD') holdCount++;
            if (u.status === 'Completed') completedCount++;
            else if (u.status === 'Scrap' || u.status === 'SCRAPPED' || u.status === 'Reject') scrapCount++;
            else wipCount++;

            if ((Number(u.looper) || 1) >= 2) looperCount++;
        });

        return {
            total: all.length,
            wip: wipCount,
            hold: holdCount,
            looper: looperCount,
            completed: completedCount,
            scrap: scrapCount
        };
    }, [store?.devices]);

    // Units on hold list
    const holdUnitsList = useMemo(() => {
        const all = Object.values(store?.devices || {});
        return all.filter(u => {
            if (u.holdStatus !== 'HOLD') return false;
            if (holdFilterProject !== 'ALL' && u.project !== holdFilterProject) return false;
            if (holdFilterCategory !== 'ALL' && u.holdCategory !== holdFilterCategory) return false;
            return true;
        });
    }, [store?.devices, holdFilterProject, holdFilterCategory]);

    // Units in loop list
    const looperUnitsList = useMemo(() => {
        const all = Object.values(store?.devices || {});
        return all
            .filter(u => {
                const count = Number(u.looper) || 1;
                if (count < looperThreshold) return false;
                if (looperFilterProject !== 'ALL' && u.project !== looperFilterProject) return false;
                return true;
            })
            .sort((a, b) => (Number(b.looper) || 1) - (Number(a.looper) || 1));
    }, [store?.devices, looperThreshold, looperFilterProject]);

    // ─── EXECUTE APPLY HOLD ───
    const handleExecuteHold = async () => {
        const validation = validateHoldRequest({
            serials: holdTargetSerials,
            category: holdCategory,
            reason: holdReason,
            remarks: holdRemarks,
            user
        });

        if (!validation.isValid) {
            setHoldFeedback({ type: 'error', message: validation.message });
            return;
        }

        setHoldSubmitting(true);
        setHoldFeedback(null);

        const { serials, category, reason, remarks } = validation.sanitized;
        const timestamp = new Date().toISOString();
        const batch = writeBatch(db);
        let successCount = 0;

        try {
            for (const sn of serials) {
                const devRef = doc(db, 'devices', sn);
                const snap = await getDoc(devRef);
                if (!snap.exists()) continue;

                const fresh = snap.data();
                const historyEntry = {
                    station: `ADMIN HOLD: ${fresh.stationName || 'UNKNOWN'}`,
                    stationId: fresh.currentStation || null,
                    timestamp,
                    result: 'ADMIN_HOLD',
                    operatorId: user.id || user.uid || 'ADMIN',
                    operator: user.name || user.id || 'Admin',
                    operatorRole: user.role || 'Admin',
                    looper: fresh.looper || 1,
                    project: fresh.project || 'Device',
                    details: {
                        holdCategory: category,
                        holdReason: reason,
                        remarks: remarks || '',
                        stationName: fresh.stationName || 'UNKNOWN'
                    }
                };

                const updatedDevice = {
                    ...fresh,
                    holdStatus: 'HOLD',
                    holdCategory: category,
                    holdReason: reason,
                    holdRemarks: remarks || '',
                    holdStation: fresh.stationName || 'UNKNOWN',
                    holdStationId: fresh.currentStation || null,
                    holdTimestamp: timestamp,
                    holdUserId: user.id || user.uid || 'ADMIN',
                    updatedAt: timestamp,
                    history: [...(Array.isArray(fresh.history) ? fresh.history : []), historyEntry]
                };

                batch.set(devRef, JSON.parse(JSON.stringify(updatedDevice)));
                successCount++;
            }

            if (successCount === 0) {
                throw new Error('None of the target serial numbers could be found in the database.');
            }

            await batch.commit();

            // Log to immutable audit_logs
            await logAdminAction({
                actor: user,
                action: AUDIT_ACTIONS.SERIAL_HOLD,
                entity: 'device',
                entityId: serials.join(', '),
                project: searchedUnit?.project || null,
                reason: `[${category}] ${reason}`,
                remarks: remarks || '',
                newValue: { holdStatus: 'HOLD', holdCategory: category, holdReason: reason }
            });

            setHoldFeedback({
                type: 'success',
                message: `Successfully applied ${category} Hold to ${successCount} unit(s).`
            });

            // If searched unit was updated, refresh it
            if (searchedUnit && serials.includes(searchedUnit.id)) {
                handleSearchSerial(searchedUnit.id);
            }

            setTimeout(() => {
                setShowHoldModal(false);
                setHoldFeedback(null);
                setHoldReason('');
                setHoldRemarks('');
            }, 1200);

        } catch (err) {
            console.error('Execute hold error:', err);
            setHoldFeedback({ type: 'error', message: err.message });
        } finally {
            setHoldSubmitting(false);
        }
    };

    // ─── EXECUTE RELEASE HOLD ───
    const handleExecuteRelease = async () => {
        const validation = validateReleaseRequest({
            serials: releaseTargetSerials,
            resolutionReason: releaseReason,
            resolutionNotes: releaseNotes,
            user
        });

        if (!validation.isValid) {
            setReleaseFeedback({ type: 'error', message: validation.message });
            return;
        }

        setReleaseSubmitting(true);
        setReleaseFeedback(null);

        const { serials, resolutionReason, resolutionNotes } = validation.sanitized;
        const timestamp = new Date().toISOString();
        const batch = writeBatch(db);
        let successCount = 0;

        try {
            for (const sn of serials) {
                const devRef = doc(db, 'devices', sn);
                const snap = await getDoc(devRef);
                if (!snap.exists()) continue;

                const fresh = snap.data();
                const historyEntry = {
                    station: `ADMIN UNHOLD: ${fresh.stationName || 'UNKNOWN'}`,
                    stationId: fresh.currentStation || null,
                    timestamp,
                    result: 'ADMIN_UNHOLD',
                    operatorId: user.id || user.uid || 'ADMIN',
                    operator: user.name || user.id || 'Admin',
                    operatorRole: user.role || 'Admin',
                    looper: fresh.looper || 1,
                    project: fresh.project || 'Device',
                    details: {
                        unholdBy: user.name || user.id || 'Admin',
                        resolutionReason,
                        resolutionNotes: resolutionNotes || '',
                        previousHoldCategory: fresh.holdCategory || 'N/A',
                        previousHoldReason: fresh.holdReason || 'N/A'
                    }
                };

                const updatedDevice = {
                    ...fresh,
                    holdStatus: null,
                    holdCategory: null,
                    holdReason: null,
                    holdRemarks: null,
                    holdStation: null,
                    holdStationId: null,
                    holdTimestamp: null,
                    holdUserId: null,
                    updatedAt: timestamp,
                    history: [...(Array.isArray(fresh.history) ? fresh.history : []), historyEntry]
                };

                batch.set(devRef, JSON.parse(JSON.stringify(updatedDevice)));
                successCount++;
            }

            if (successCount === 0) {
                throw new Error('None of the target serial numbers could be found in the database.');
            }

            await batch.commit();

            // Log to immutable audit_logs
            await logAdminAction({
                actor: user,
                action: AUDIT_ACTIONS.SERIAL_UNHOLD,
                entity: 'device',
                entityId: serials.join(', '),
                project: searchedUnit?.project || null,
                reason: resolutionReason,
                remarks: resolutionNotes || '',
                previousValue: { holdStatus: 'HOLD' },
                newValue: { holdStatus: null, unheldAt: timestamp }
            });

            setReleaseFeedback({
                type: 'success',
                message: `Successfully released ${successCount} unit(s) from Hold.`
            });

            // If searched unit was updated, refresh it
            if (searchedUnit && serials.includes(searchedUnit.id)) {
                handleSearchSerial(searchedUnit.id);
            }

            setTimeout(() => {
                setShowReleaseModal(false);
                setReleaseFeedback(null);
                setReleaseReason('');
                setReleaseNotes('');
            }, 1200);

        } catch (err) {
            console.error('Execute release error:', err);
            setReleaseFeedback({ type: 'error', message: err.message });
        } finally {
            setReleaseSubmitting(false);
        }
    };

    // ─── EXECUTE LOOPER DISPOSITION ───
    const handleExecuteDisposition = async () => {
        const validation = validateDispositionRequest({
            actionId: dispositionActionId,
            unit: dispositionUnit,
            reason: dispositionReason,
            user
        });

        if (!validation.isValid) {
            setDispositionFeedback({ type: 'error', message: validation.message });
            return;
        }

        setDispositionSubmitting(true);
        setDispositionFeedback(null);

        const { action, sanitizedReason } = validation;
        const timestamp = new Date().toISOString();
        const devRef = doc(db, 'devices', dispositionUnit.id);

        try {
            const snap = await getDoc(devRef);
            if (!snap.exists()) throw new Error('Target unit not found in database.');
            const fresh = snap.data();

            let newStatus = fresh.status;
            let newCurrentStation = fresh.currentStation;
            let newStationName = fresh.stationName;
            let newLooper = fresh.looper || 1;
            let resultTag = 'ADMIN_DISPOSITION';

            if (action.id === 'SCRAP_REVIEW') {
                newStatus = fresh.project === 'Calculator' ? 'SCRAPPED' : 'Scrap';
                newCurrentStation = 8;
                newStationName = fresh.project === 'Calculator' ? 'SCRAP ANALYSIS' : 'SCRAP REVIEW';
                resultTag = 'ADMIN_SCRAP_DISPOSITION';
            } else if (action.id === 'RESET_LOOPER') {
                newLooper = 1;
                resultTag = 'ADMIN_RESET_LOOPER';
            } else if (action.id === 'RESTART_LINE') {
                newCurrentStation = 1;
                newStationName = 'RECEIVING';
                newStatus = 'Processing';
                newLooper = (fresh.looper || 1) + 1;
                resultTag = 'ADMIN_LINE_RESTART';
            } else if (action.id === 'MRB_ESCALATION') {
                resultTag = 'ADMIN_MRB_ESCALATED';
            }

            const historyEntry = {
                station: `DISPOSITION: ${action.name}`,
                stationId: newCurrentStation,
                timestamp,
                result: resultTag,
                operatorId: user.id || user.uid || 'ADMIN',
                operator: user.name || user.id || 'Admin',
                operatorRole: user.role || 'Admin',
                looper: newLooper,
                project: fresh.project || 'Device',
                details: {
                    dispositionAction: action.id,
                    actionName: action.name,
                    reason: sanitizedReason,
                    previousStation: fresh.stationName,
                    targetStation: newStationName,
                    previousLooper: fresh.looper || 1,
                    newLooper
                }
            };

            const updatedDevice = {
                ...fresh,
                status: newStatus,
                currentStation: newCurrentStation,
                stationName: newStationName,
                looper: newLooper,
                updatedAt: timestamp,
                history: [...(Array.isArray(fresh.history) ? fresh.history : []), historyEntry]
            };

            if (action.id === 'SCRAP_REVIEW') {
                updatedDevice.lockDate = timestamp;
            }

            await setDoc(devRef, JSON.parse(JSON.stringify(updatedDevice)));

            // Log to immutable audit_logs
            await logAdminAction({
                actor: user,
                action: AUDIT_ACTIONS.SERIAL_DISPOSITION || 'SERIAL_DISPOSITION',
                entity: 'device',
                entityId: dispositionUnit.id,
                project: fresh.project || null,
                reason: `${action.name}: ${sanitizedReason}`,
                previousValue: { status: fresh.status, station: fresh.stationName, looper: fresh.looper },
                newValue: { status: newStatus, station: newStationName, looper: newLooper }
            });

            setDispositionFeedback({
                type: 'success',
                message: `Disposition "${action.name}" applied successfully to ${dispositionUnit.id}.`
            });

            if (searchedUnit && searchedUnit.id === dispositionUnit.id) {
                handleSearchSerial(dispositionUnit.id);
            }

            setTimeout(() => {
                setShowDispositionModal(false);
                setDispositionFeedback(null);
                setDispositionReason('');
            }, 1200);

        } catch (err) {
            console.error('Disposition error:', err);
            setDispositionFeedback({ type: 'error', message: err.message });
        } finally {
            setDispositionSubmitting(false);
        }
    };

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '2.5rem' }}>
            {/* Header & Governance Stats Banner */}
            <div className="card mb-4" style={{ padding: '1.25rem 1.5rem', background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <span className="status-pill info" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Production Governance
                            </span>
                            <span className="status-pill secondary" style={{ fontSize: '10px' }}>
                                MES Stage 5
                            </span>
                        </div>
                        <h2 className="font-extrabold text-xl" style={{ margin: 0, letterSpacing: '-0.01em' }}>
                            Serial & Production Governance Studio
                        </h2>
                        <p className="text-muted text-xs" style={{ margin: '0.2rem 0 0 0' }}>
                            Comprehensive serial inspection, forced routing overrides, hold quarantine, looper disposition, and reversible audit history
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            type="button"
                            className="btn btn-secondary text-xs"
                            onClick={() => {
                                if (searchedUnit) handleSearchSerial(searchedUnit.id);
                            }}
                            title="Refresh active view"
                        >
                            <RefreshCw size={13} />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* KPI Metrics Strip */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                    <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        <div className="text-muted text-xs font-semibold uppercase">Active WIP</div>
                        <div className="font-extrabold text-lg" style={{ color: 'var(--primary)', marginTop: '0.2rem' }}>
                            {metrics.wip}
                        </div>
                    </div>

                    <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                        <div className="text-xs font-semibold uppercase" style={{ color: '#f59e0b' }}>On Hold</div>
                        <div className="font-extrabold text-lg" style={{ color: '#f59e0b', marginTop: '0.2rem' }}>
                            {metrics.hold}
                        </div>
                    </div>

                    <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        <div className="text-xs font-semibold uppercase" style={{ color: '#ef4444' }}>Looper Alerts (≥2)</div>
                        <div className="font-extrabold text-lg" style={{ color: '#ef4444', marginTop: '0.2rem' }}>
                            {metrics.looper}
                        </div>
                    </div>

                    <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                        <div className="text-xs font-semibold uppercase" style={{ color: '#10b981' }}>Completed (FG)</div>
                        <div className="font-extrabold text-lg" style={{ color: '#10b981', marginTop: '0.2rem' }}>
                            {metrics.completed}
                        </div>
                    </div>

                    <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(100, 116, 139, 0.06)', border: '1px solid rgba(100, 116, 139, 0.2)' }}>
                        <div className="text-muted text-xs font-semibold uppercase">Scrap / Locked</div>
                        <div className="font-extrabold text-lg" style={{ color: '#94a3b8', marginTop: '0.2rem' }}>
                            {metrics.scrap}
                        </div>
                    </div>
                </div>
            </div>

            {/* Sub-Tab Navigation Bar */}
            <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '2px' }}>
                <button
                    type="button"
                    className={`btn text-xs ${activeSubTab === 'lookup' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setActiveSubTab('lookup')}
                    style={{ borderRadius: '6px 6px 0 0', padding: '0.6rem 1.1rem', fontWeight: 600 }}
                >
                    <Search size={14} style={{ marginRight: '0.4rem' }} />
                    Serial Lookup & Traveler
                </button>

                <button
                    type="button"
                    className={`btn text-xs ${activeSubTab === 'movement' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setActiveSubTab('movement')}
                    style={{ borderRadius: '6px 6px 0 0', padding: '0.6rem 1.1rem', fontWeight: 600 }}
                >
                    <FastForward size={14} style={{ marginRight: '0.4rem' }} />
                    Movement & Override Wizard
                </button>

                <button
                    type="button"
                    className={`btn text-xs ${activeSubTab === 'hold-quarantine' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setActiveSubTab('hold-quarantine')}
                    style={{ borderRadius: '6px 6px 0 0', padding: '0.6rem 1.1rem', fontWeight: 600 }}
                >
                    <Lock size={14} style={{ marginRight: '0.4rem' }} />
                    Hold & Quarantine ({metrics.hold})
                </button>

                <button
                    type="button"
                    className={`btn text-xs ${activeSubTab === 'looper-disposition' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setActiveSubTab('looper-disposition')}
                    style={{ borderRadius: '6px 6px 0 0', padding: '0.6rem 1.1rem', fontWeight: 600 }}
                >
                    <Activity size={14} style={{ marginRight: '0.4rem' }} />
                    Looper & Disposition ({metrics.looper})
                </button>

                <button
                    type="button"
                    className={`btn text-xs ${activeSubTab === 'history' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setActiveSubTab('history')}
                    style={{ borderRadius: '6px 6px 0 0', padding: '0.6rem 1.1rem', fontWeight: 600 }}
                >
                    <RotateCcw size={14} style={{ marginRight: '0.4rem' }} />
                    Audit & Movement History
                </button>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                TAB 1: SERIAL LOOKUP & DIGITAL TRAVELER
               ═══════════════════════════════════════════════════════════════ */}
            {activeSubTab === 'lookup' && (
                <div className="animate-fade-in">
                    {/* Search Bar Strip */}
                    <div className="card mb-4" style={{ padding: '1.25rem' }}>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleSearchSerial(searchQuery);
                            }}
                            style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}
                        >
                            <div style={{ position: 'relative', flex: 1 }}>
                                <Search
                                    size={16}
                                    style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                                />
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Enter or scan Serial Number / Device ID (e.g. L001-A23-001 or CALC-9901)..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                                    style={{ paddingLeft: '2.5rem', fontFamily: 'monospace', fontWeight: 600 }}
                                />
                            </div>

                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setShowScanner(true)}
                                title="Open Camera / QR Scanner"
                            >
                                <Scan size={15} />
                                Scan QR
                            </button>

                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={isSearching || !searchQuery.trim()}
                            >
                                {isSearching ? (
                                    <>
                                        <RefreshCw size={14} className="animate-spin" />
                                        Inspecting...
                                    </>
                                ) : (
                                    <>
                                        <Search size={14} />
                                        Inspect Traveler
                                    </>
                                )}
                            </button>
                        </form>

                        {searchError && (
                            <div className="alert alert-danger mt-3" style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <AlertTriangle size={16} />
                                <span>{searchError}</span>
                            </div>
                        )}
                    </div>

                    {/* Searched Unit Traveler View */}
                    {searchedUnit ? (
                        <div className="animate-fade-in">
                            {/* Hero Unit Card */}
                            <div className="card mb-4" style={{ padding: '1.5rem', borderLeft: `5px solid ${searchedUnit.holdStatus === 'HOLD' ? '#f59e0b' : searchedUnit.status === 'Completed' ? '#10b981' : searchedUnit.status === 'Scrap' ? '#ef4444' : 'var(--primary)'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                                                {searchedUnit.id}
                                            </span>

                                            <span className="status-pill info" style={{ fontSize: '11px', fontWeight: 700 }}>
                                                {searchedUnit.project || 'Device'}
                                            </span>

                                            <span className={`status-pill ${searchedUnit.status === 'Completed' ? 'success' : (searchedUnit.status === 'Scrap' || searchedUnit.status === 'SCRAPPED') ? 'danger' : 'primary'}`} style={{ fontSize: '11px', fontWeight: 700 }}>
                                                {searchedUnit.status}
                                            </span>

                                            {searchedUnit.holdStatus === 'HOLD' && (
                                                <span className="status-pill warning" style={{ fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <Lock size={11} />
                                                    ON HOLD
                                                </span>
                                            )}

                                            {Number(searchedUnit.looper) >= 2 && (
                                                <span className="status-pill danger" style={{ fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <Activity size={11} />
                                                    Looper #{searchedUnit.looper}
                                                </span>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-muted)', fontSize: '12px', flexWrap: 'wrap' }}>
                                            <div>
                                                <span className="font-semibold text-muted uppercase">Current Station: </span>
                                                <strong style={{ color: 'var(--text-main)' }}>
                                                    {searchedUnit.stationName || `Station ${searchedUnit.currentStation}`}
                                                </strong>
                                            </div>

                                            <div>
                                                <span className="font-semibold text-muted uppercase">Model: </span>
                                                <strong style={{ color: 'var(--text-main)' }}>
                                                    {searchedUnit.model || 'Standard'}
                                                </strong>
                                            </div>

                                            <div>
                                                <span className="font-semibold text-muted uppercase">Last Activity: </span>
                                                <strong style={{ color: 'var(--text-main)' }}>
                                                    {searchedUnit.updatedAt ? new Date(searchedUnit.updatedAt).toLocaleString() : 'N/A'}
                                                </strong>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Shortcuts */}
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        {canMove && (
                                            <button
                                                type="button"
                                                className="btn btn-secondary text-xs"
                                                onClick={() => {
                                                    setActiveSubTab('movement');
                                                }}
                                            >
                                                <FastForward size={13} />
                                                Override Station
                                            </button>
                                        )}

                                        {canHold && searchedUnit.holdStatus !== 'HOLD' && (
                                            <button
                                                type="button"
                                                className="btn btn-warning text-xs"
                                                onClick={() => {
                                                    setHoldTargetSerials([searchedUnit.id]);
                                                    setHoldCategory('Quality');
                                                    setHoldReason(HOLD_TAXONOMY['Quality'].reasons[0]);
                                                    setShowHoldModal(true);
                                                }}
                                            >
                                                <Lock size={13} />
                                                Apply Hold
                                            </button>
                                        )}

                                        {canHold && searchedUnit.holdStatus === 'HOLD' && (
                                            <button
                                                type="button"
                                                className="btn btn-primary text-xs"
                                                onClick={() => {
                                                    setReleaseTargetSerials([searchedUnit.id]);
                                                    setReleaseReason('Defect investigated and cleared by QA');
                                                    setShowReleaseModal(true);
                                                }}
                                            >
                                                <Unlock size={13} />
                                                Release Hold
                                            </button>
                                        )}

                                        {canScrapReview && (
                                            <button
                                                type="button"
                                                className="btn btn-secondary text-xs"
                                                onClick={() => {
                                                    setDispositionUnit(searchedUnit);
                                                    setDispositionActionId('MRB_ESCALATION');
                                                    setShowDispositionModal(true);
                                                }}
                                            >
                                                <Flag size={13} />
                                                Disposition
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Active Hold Banner Details */}
                                {searchedUnit.holdStatus === 'HOLD' && (
                                    <div style={{ marginTop: '1.25rem', padding: '1rem', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b', fontWeight: 700, fontSize: '13px', marginBottom: '0.4rem' }}>
                                            <ShieldAlert size={16} />
                                            <span>Unit is Quarantined on Active Hold ({searchedUnit.holdCategory || 'Quality'})</span>
                                        </div>
                                        <div style={{ fontSize: '12px', lineHeight: 1.5 }}>
                                            <div><strong>Reason:</strong> {searchedUnit.holdReason || 'Administrative Hold'}</div>
                                            {searchedUnit.holdRemarks && <div><strong>Notes:</strong> {searchedUnit.holdRemarks}</div>}
                                            <div className="text-muted" style={{ marginTop: '0.3rem', fontSize: '11px' }}>
                                                Held by <strong>{searchedUnit.holdUserId || 'Administrator'}</strong> at <strong>{searchedUnit.holdStation || searchedUnit.stationName}</strong> on {searchedUnit.holdTimestamp ? new Date(searchedUnit.holdTimestamp).toLocaleString() : 'N/A'}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Chronological Station Traveler Timeline */}
                            <div className="card" style={{ padding: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                                    <h3 className="font-bold text-base" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Layers size={18} color="var(--primary)" />
                                        Digital Traveler & Station History
                                    </h3>
                                    <span className="text-muted text-xs">
                                        Total Events: {(searchedUnit.history || []).length}
                                    </span>
                                </div>

                                {(!searchedUnit.history || searchedUnit.history.length === 0) ? (
                                    <div className="text-muted text-center py-4" style={{ fontSize: '13px' }}>
                                        No history records available for this serial number.
                                    </div>
                                ) : (
                                    <div className="timeline-container" style={{ position: 'relative', paddingLeft: '1.5rem', borderLeft: '2px solid rgba(255, 255, 255, 0.1)' }}>
                                        {searchedUnit.history.map((rawEntry, idx) => {
                                            const entry = formatHistoryEvent(rawEntry, idx);
                                            return (
                                                <div
                                                    key={idx}
                                                    style={{
                                                        position: 'relative',
                                                        marginBottom: '1.5rem',
                                                        padding: '1rem',
                                                        borderRadius: '8px',
                                                        background: 'rgba(255, 255, 255, 0.02)',
                                                        border: '1px solid rgba(255, 255, 255, 0.05)'
                                                    }}
                                                >
                                                    {/* Timeline Node Icon */}
                                                    <div
                                                        style={{
                                                            position: 'absolute',
                                                            left: '-2rem',
                                                            top: '1rem',
                                                            width: '18px',
                                                            height: '18px',
                                                            borderRadius: '50%',
                                                            background: entry.eventType === 'PASS' ? '#10b981' : entry.eventType === 'FAIL' ? '#ef4444' : entry.eventType === 'HOLD' ? '#f59e0b' : 'var(--primary)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            border: '2px solid var(--surface)'
                                                        }}
                                                    />

                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                                        <div>
                                                            <strong style={{ fontSize: '14px', letterSpacing: '0.02em' }}>
                                                                {entry.stationName}
                                                            </strong>
                                                            <span className={`status-pill ${entry.badgeClass}`} style={{ fontSize: '10px', marginLeft: '0.5rem', textTransform: 'uppercase' }}>
                                                                {entry.result}
                                                            </span>
                                                        </div>

                                                        <div className="text-muted text-xs" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                            <Clock size={12} />
                                                            {entry.timestamp}
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'flex', gap: '1.25rem', fontSize: '12px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                            <User size={12} />
                                                            <span>Operator: <strong style={{ color: 'var(--text-main)' }}>{entry.operator}</strong></span>
                                                        </div>

                                                        {entry.looper > 1 && (
                                                            <div>
                                                                <span>Iteration: <strong>#{entry.looper}</strong></span>
                                                            </div>
                                                        )}

                                                        {entry.movementId && (
                                                            <div>
                                                                <span>Movement ID: <code style={{ fontSize: '11px' }}>{entry.movementId}</code></span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Custom Event Details / Remarks */}
                                                    {(entry.reason || entry.remarks || entry.details) && (
                                                        <div style={{ marginTop: '0.6rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(0, 0, 0, 0.2)', fontSize: '12px' }}>
                                                            {entry.reason && <div><strong>Reason:</strong> {entry.reason}</div>}
                                                            {entry.remarks && <div><strong>Remarks:</strong> {entry.remarks}</div>}
                                                            {entry.details?.defectCodes && (
                                                                <div><strong>Defects:</strong> {Array.isArray(entry.details.defectCodes) ? entry.details.defectCodes.join(', ') : JSON.stringify(entry.details.defectCodes)}</div>
                                                            )}
                                                            {entry.details?.skippedStations && entry.details.skippedStations.length > 0 && (
                                                                <div style={{ color: '#f59e0b' }}>
                                                                    <strong>Skipped Stations:</strong> {entry.details.skippedStations.join(', ')}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="card text-center" style={{ padding: '3.5rem 2rem', color: 'var(--text-muted)' }}>
                            <Cpu size={48} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                            <h3 className="font-bold text-base mb-1" style={{ color: 'var(--text-main)' }}>
                                No Serial Number Inspected
                            </h3>
                            <p className="text-xs" style={{ maxWidth: 450, margin: '0 auto', lineHeight: 1.6 }}>
                                Scan a barcode/QR code or enter a Serial Number above to inspect its real-time station routing, active hold quarantine status, and full digital genealogy traveler.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                TAB 2: MOVEMENT & OVERRIDE WIZARD
               ═══════════════════════════════════════════════════════════════ */}
            {activeSubTab === 'movement' && (
                <div className="animate-fade-in">
                    <UnitSerialConfig
                        user={user}
                        initialSerial={searchedUnit?.id || searchQuery}
                        onNavigateToInfo={onNavigateToInfo}
                    />
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                TAB 3: HOLD & QUARANTINE MANAGEMENT
               ═══════════════════════════════════════════════════════════════ */}
            {activeSubTab === 'hold-quarantine' && (
                <div className="animate-fade-in">
                    {/* Filter & Action Strip */}
                    <div className="card mb-4" style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '12px' }}>
                                    <Filter size={14} className="text-muted" />
                                    <span className="font-semibold text-muted uppercase">Project:</span>
                                    <select
                                        className="form-control text-xs"
                                        value={holdFilterProject}
                                        onChange={(e) => setHoldFilterProject(e.target.value)}
                                        style={{ padding: '0.3rem 0.6rem', width: 'auto' }}
                                    >
                                        <option value="ALL">All Projects</option>
                                        <option value="Device">Device</option>
                                        <option value="Calculator">Calculator</option>
                                        <option value="Peripherals">Peripherals</option>
                                        <option value="Inward QC">Inward QC</option>
                                    </select>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '12px' }}>
                                    <span className="font-semibold text-muted uppercase">Category:</span>
                                    <select
                                        className="form-control text-xs"
                                        value={holdFilterCategory}
                                        onChange={(e) => setHoldFilterCategory(e.target.value)}
                                        style={{ padding: '0.3rem 0.6rem', width: 'auto' }}
                                    >
                                        <option value="ALL">All Categories</option>
                                        {Object.keys(HOLD_TAXONOMY).map(cat => (
                                            <option key={cat} value={cat}>{HOLD_TAXONOMY[cat].label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {canHold && (
                                <button
                                    type="button"
                                    className="btn btn-warning text-xs"
                                    onClick={() => {
                                        setHoldTargetSerials([]);
                                        setHoldCategory('Quality');
                                        setHoldReason(HOLD_TAXONOMY['Quality'].reasons[0]);
                                        setShowHoldModal(true);
                                    }}
                                >
                                    <Lock size={13} />
                                    Quarantine Serial(s) on Hold
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Hold Table */}
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div className="table-responsive">
                            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Serial Number</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Project</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Station</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Hold Category & Reason</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Held By</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Date & Time</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {holdUnitsList.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '13px' }}>
                                                <ShieldCheck size={36} color="#10b981" style={{ margin: '0 auto 0.75rem', opacity: 0.8 }} />
                                                <div className="font-bold">No Units Currently on Hold</div>
                                                <div className="text-xs">All units are progressing actively through production pipelines.</div>
                                            </td>
                                        </tr>
                                    ) : (
                                        holdUnitsList.map((unit) => (
                                            <tr key={unit.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                                <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700 }}>
                                                    <a
                                                        href="#inspect"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            handleSearchSerial(unit.id);
                                                            setActiveSubTab('lookup');
                                                        }}
                                                        style={{ color: 'var(--primary)', textDecoration: 'none' }}
                                                    >
                                                        {unit.id}
                                                    </a>
                                                </td>

                                                <td style={{ padding: '0.75rem 1rem', fontSize: '12px' }}>
                                                    <span className="status-pill info" style={{ fontSize: '10px' }}>
                                                        {unit.project || 'Device'}
                                                    </span>
                                                </td>

                                                <td style={{ padding: '0.75rem 1rem', fontSize: '12px', fontWeight: 600 }}>
                                                    {unit.holdStation || unit.stationName}
                                                </td>

                                                <td style={{ padding: '0.75rem 1rem', fontSize: '12px' }}>
                                                    <div style={{ fontWeight: 600, color: '#f59e0b' }}>
                                                        {unit.holdCategory || 'Quality Hold'}
                                                    </div>
                                                    <div className="text-muted text-xs">
                                                        {unit.holdReason || 'Pending inspection'}
                                                    </div>
                                                </td>

                                                <td style={{ padding: '0.75rem 1rem', fontSize: '12px', color: 'var(--text-muted)' }}>
                                                    {unit.holdUserId || 'Administrator'}
                                                </td>

                                                <td style={{ padding: '0.75rem 1rem', fontSize: '12px', color: 'var(--text-muted)' }}>
                                                    {unit.holdTimestamp ? new Date(unit.holdTimestamp).toLocaleString() : 'N/A'}
                                                </td>

                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary text-xs"
                                                            onClick={() => {
                                                                handleSearchSerial(unit.id);
                                                                setActiveSubTab('lookup');
                                                            }}
                                                            title="Inspect Traveler"
                                                        >
                                                            <Eye size={12} />
                                                        </button>

                                                        {canHold && (
                                                            <button
                                                                type="button"
                                                                className="btn btn-primary text-xs"
                                                                onClick={() => {
                                                                    setReleaseTargetSerials([unit.id]);
                                                                    setReleaseReason('Cleared by QA investigation');
                                                                    setShowReleaseModal(true);
                                                                }}
                                                                title="Release Hold"
                                                            >
                                                                <Unlock size={12} />
                                                                Release
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                TAB 4: LOOPER & DISPOSITION STUDIO
               ═══════════════════════════════════════════════════════════════ */}
            {activeSubTab === 'looper-disposition' && (
                <div className="animate-fade-in">
                    {/* Threshold Selector & Project Filter */}
                    <div className="card mb-4" style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '12px' }}>
                                    <Activity size={15} color="#ef4444" />
                                    <span className="font-semibold text-muted uppercase">Loop Iteration Threshold:</span>
                                    <select
                                        className="form-control text-xs"
                                        value={looperThreshold}
                                        onChange={(e) => setLooperThreshold(Number(e.target.value))}
                                        style={{ padding: '0.3rem 0.6rem', width: 'auto', fontWeight: 700 }}
                                    >
                                        <option value={2}>Looper ≥ 2 (Multi-cycle Rework)</option>
                                        <option value={3}>Looper ≥ 3 (High Risk Escalation)</option>
                                        <option value={4}>Looper ≥ 4 (Critical Scrap Alert)</option>
                                    </select>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '12px' }}>
                                    <span className="font-semibold text-muted uppercase">Project:</span>
                                    <select
                                        className="form-control text-xs"
                                        value={looperFilterProject}
                                        onChange={(e) => setLooperFilterProject(e.target.value)}
                                        style={{ padding: '0.3rem 0.6rem', width: 'auto' }}
                                    >
                                        <option value="ALL">All Projects</option>
                                        <option value="Device">Device</option>
                                        <option value="Calculator">Calculator</option>
                                        <option value="Peripherals">Peripherals</option>
                                        <option value="Inward QC">Inward QC</option>
                                    </select>
                                </div>
                            </div>

                            <span className="text-muted text-xs">
                                Showing <strong>{looperUnitsList.length}</strong> unit(s) requiring looper review
                            </span>
                        </div>
                    </div>

                    {/* Looper Table */}
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div className="table-responsive">
                            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Serial Number</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Project</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Current Station</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Loop Count</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Risk Assessment</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Status</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Disposition Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {looperUnitsList.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '13px' }}>
                                                <CheckCircle2 size={36} color="#10b981" style={{ margin: '0 auto 0.75rem', opacity: 0.8 }} />
                                                <div className="font-bold">No Looper Alerts Detected</div>
                                                <div className="text-xs">No active units currently exceed the loop count threshold of {looperThreshold}.</div>
                                            </td>
                                        </tr>
                                    ) : (
                                        looperUnitsList.map((unit) => {
                                            const risk = evaluateLooperRisk(unit.looper, looperThreshold);
                                            return (
                                                <tr key={unit.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700 }}>
                                                        <a
                                                            href="#inspect"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                handleSearchSerial(unit.id);
                                                                setActiveSubTab('lookup');
                                                            }}
                                                            style={{ color: 'var(--primary)', textDecoration: 'none' }}
                                                        >
                                                            {unit.id}
                                                        </a>
                                                    </td>

                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '12px' }}>
                                                        <span className="status-pill info" style={{ fontSize: '10px' }}>
                                                            {unit.project || 'Device'}
                                                        </span>
                                                    </td>

                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '12px', fontWeight: 600 }}>
                                                        {unit.stationName}
                                                    </td>

                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '13px', fontWeight: 800 }}>
                                                        <span style={{ color: risk.color }}>
                                                            #{unit.looper || 1}
                                                        </span>
                                                    </td>

                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '12px' }}>
                                                        <span className={`status-pill ${risk.badgeClass}`} style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                                                            {risk.level}
                                                        </span>
                                                    </td>

                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '12px' }}>
                                                        <span className={`status-pill ${unit.status === 'Completed' ? 'success' : (unit.status === 'Scrap' || unit.status === 'SCRAPPED') ? 'danger' : 'primary'}`} style={{ fontSize: '10px' }}>
                                                            {unit.status}
                                                        </span>
                                                    </td>

                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary text-xs"
                                                            onClick={() => {
                                                                setDispositionUnit(unit);
                                                                setDispositionActionId(risk.level === 'CRITICAL' ? 'SCRAP_REVIEW' : 'MRB_ESCALATION');
                                                                setShowDispositionModal(true);
                                                            }}
                                                        >
                                                            <Flag size={12} />
                                                            Review Disposition
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                TAB 5: REVERSIBLE MOVEMENT AUDIT HISTORY
               ═══════════════════════════════════════════════════════════════ */}
            {activeSubTab === 'history' && (
                <div className="animate-fade-in">
                    {/* Embed the battle-tested movement history from UnitSerialConfig in history mode */}
                    <UnitSerialConfig
                        user={user}
                        initialSerial={searchedUnit?.id || searchQuery}
                        onNavigateToInfo={onNavigateToInfo}
                    />
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                MODAL: APPLY HOLD (QUARANTINE)
               ═══════════════════════════════════════════════════════════════ */}
            {showHoldModal && (
                <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                    <div className="card" style={{ maxWidth: 520, width: '100%', padding: '1.75rem', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h3 className="font-extrabold text-lg" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
                                <Lock size={18} />
                                Place Unit(s) on Quarantine Hold
                            </h3>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setShowHoldModal(false)}
                                style={{ padding: '0.25rem 0.5rem' }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Target Serials Input */}
                        <div className="form-group mb-3">
                            <label className="form-label text-xs font-semibold uppercase">Target Serial Number(s):</label>
                            <input
                                type="text"
                                className="form-control font-mono text-xs"
                                placeholder="Enter comma or space separated serials..."
                                value={holdTargetSerials.join(', ')}
                                onChange={(e) => setHoldTargetSerials(e.target.value.split(/[\s,]+/).filter(Boolean))}
                            />
                            <span className="text-muted text-xs" style={{ fontSize: '11px', marginTop: '0.2rem', display: 'block' }}>
                                Targeting {holdTargetSerials.length} unit(s) for immediate quarantine.
                            </span>
                        </div>

                        {/* Category Taxonomy */}
                        <div className="form-group mb-3">
                            <label className="form-label text-xs font-semibold uppercase">Hold Category Taxonomy:</label>
                            <select
                                className="form-control text-xs"
                                value={holdCategory}
                                onChange={(e) => {
                                    const cat = e.target.value;
                                    setHoldCategory(cat);
                                    if (HOLD_TAXONOMY[cat]?.reasons?.length > 0) {
                                        setHoldReason(HOLD_TAXONOMY[cat].reasons[0]);
                                    }
                                }}
                            >
                                {Object.keys(HOLD_TAXONOMY).map(cat => (
                                    <option key={cat} value={cat}>{HOLD_TAXONOMY[cat].label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Standard Reason */}
                        <div className="form-group mb-3">
                            <label className="form-label text-xs font-semibold uppercase">Standard Justification:</label>
                            <select
                                className="form-control text-xs"
                                value={holdReason}
                                onChange={(e) => setHoldReason(e.target.value)}
                            >
                                {(HOLD_TAXONOMY[holdCategory]?.reasons || []).map((r, i) => (
                                    <option key={i} value={r}>{r}</option>
                                ))}
                            </select>
                        </div>

                        {/* Remarks */}
                        <div className="form-group mb-4">
                            <label className="form-label text-xs font-semibold uppercase">Engineering / Quality Notes (Optional):</label>
                            <textarea
                                className="form-control text-xs"
                                rows={3}
                                placeholder="Describe specific defect symptoms, component part numbers, or quarantine containment scope..."
                                value={holdRemarks}
                                onChange={(e) => setHoldRemarks(e.target.value)}
                            />
                        </div>

                        {holdFeedback && (
                            <div className={`alert alert-${holdFeedback.type === 'success' ? 'success' : 'danger'} mb-3`} style={{ fontSize: '12px' }}>
                                {holdFeedback.message}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                type="button"
                                className="btn btn-secondary text-xs"
                                onClick={() => setShowHoldModal(false)}
                                disabled={holdSubmitting}
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                className="btn btn-warning text-xs"
                                onClick={handleExecuteHold}
                                disabled={holdSubmitting || holdTargetSerials.length === 0}
                            >
                                {holdSubmitting ? 'Applying Hold...' : 'Confirm & Apply Hold'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                MODAL: RELEASE HOLD
               ═══════════════════════════════════════════════════════════════ */}
            {showReleaseModal && (
                <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                    <div className="card" style={{ maxWidth: 520, width: '100%', padding: '1.75rem', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h3 className="font-extrabold text-lg" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981' }}>
                                <Unlock size={18} />
                                Release Unit(s) from Hold
                            </h3>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setShowReleaseModal(false)}
                                style={{ padding: '0.25rem 0.5rem' }}
                            >
                                ✕
                            </button>
                        </div>

                        <div className="form-group mb-3">
                            <label className="form-label text-xs font-semibold uppercase">Releasing Serial(s):</label>
                            <input
                                type="text"
                                className="form-control font-mono text-xs"
                                value={releaseTargetSerials.join(', ')}
                                readOnly
                                style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                            />
                        </div>

                        <div className="form-group mb-3">
                            <label className="form-label text-xs font-semibold uppercase">Mandatory Release Resolution / Justification:</label>
                            <input
                                type="text"
                                className="form-control text-xs"
                                placeholder="e.g. Cleared by engineering audit / False failure confirmed / Part replaced"
                                value={releaseReason}
                                onChange={(e) => setReleaseReason(e.target.value)}
                            />
                        </div>

                        <div className="form-group mb-4">
                            <label className="form-label text-xs font-semibold uppercase">Resolution Details & Corrective Action Notes:</label>
                            <textarea
                                className="form-control text-xs"
                                rows={3}
                                placeholder="Explain corrective actions completed or re-test parameters verified..."
                                value={releaseNotes}
                                onChange={(e) => setReleaseNotes(e.target.value)}
                            />
                        </div>

                        {releaseFeedback && (
                            <div className={`alert alert-${releaseFeedback.type === 'success' ? 'success' : 'danger'} mb-3`} style={{ fontSize: '12px' }}>
                                {releaseFeedback.message}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                type="button"
                                className="btn btn-secondary text-xs"
                                onClick={() => setShowReleaseModal(false)}
                                disabled={releaseSubmitting}
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                className="btn btn-primary text-xs"
                                onClick={handleExecuteRelease}
                                disabled={releaseSubmitting || !releaseReason.trim()}
                            >
                                {releaseSubmitting ? 'Releasing Hold...' : 'Authorize & Release Hold'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                MODAL: LOOPER / SCRAP DISPOSITION
               ═══════════════════════════════════════════════════════════════ */}
            {showDispositionModal && dispositionUnit && (
                <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                    <div className="card" style={{ maxWidth: 540, width: '100%', padding: '1.75rem', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h3 className="font-extrabold text-lg" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444' }}>
                                <Flag size={18} />
                                Formal Looper / Unit Disposition Review
                            </h3>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setShowDispositionModal(false)}
                                style={{ padding: '0.25rem 0.5rem' }}
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-3 mb-3 rounded" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.07)', fontSize: '12px' }}>
                            <div><strong>Unit Serial:</strong> <span className="font-mono">{dispositionUnit.id}</span></div>
                            <div><strong>Project:</strong> {dispositionUnit.project} | <strong>Current Station:</strong> {dispositionUnit.stationName}</div>
                            <div><strong>Current Iteration:</strong> Loop #{dispositionUnit.looper || 1}</div>
                        </div>

                        <div className="form-group mb-3">
                            <label className="form-label text-xs font-semibold uppercase">Disposition Action:</label>
                            <select
                                className="form-control text-xs"
                                value={dispositionActionId}
                                onChange={(e) => setDispositionActionId(e.target.value)}
                            >
                                {Object.values(DISPOSITION_ACTIONS).map(act => (
                                    <option key={act.id} value={act.id}>{act.name} ({act.riskLevel} Risk)</option>
                                ))}
                            </select>
                            <div className="text-muted text-xs mt-1" style={{ fontSize: '11px' }}>
                                {DISPOSITION_ACTIONS[dispositionActionId]?.description}
                            </div>
                        </div>

                        <div className="form-group mb-4">
                            <label className="form-label text-xs font-semibold uppercase">Engineering Disposition Justification:</label>
                            <textarea
                                className="form-control text-xs"
                                rows={3}
                                placeholder="State root cause analysis findings, scrap authorization signoff, or rework restart rationale..."
                                value={dispositionReason}
                                onChange={(e) => setDispositionReason(e.target.value)}
                            />
                        </div>

                        {dispositionFeedback && (
                            <div className={`alert alert-${dispositionFeedback.type === 'success' ? 'success' : 'danger'} mb-3`} style={{ fontSize: '12px' }}>
                                {dispositionFeedback.message}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                type="button"
                                className="btn btn-secondary text-xs"
                                onClick={() => setShowDispositionModal(false)}
                                disabled={dispositionSubmitting}
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                className={`btn ${dispositionActionId === 'SCRAP_REVIEW' ? 'btn-danger' : 'btn-primary'} text-xs`}
                                onClick={handleExecuteDisposition}
                                disabled={dispositionSubmitting || !dispositionReason.trim()}
                            >
                                {dispositionSubmitting ? 'Applying Disposition...' : 'Execute Disposition'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* QR / Barcode Scanner Modal */}
            {showScanner && (
                <QRScanner
                    onScan={(scannedVal) => {
                        setShowScanner(false);
                        handleSearchSerial(scannedVal);
                    }}
                    onClose={() => setShowScanner(false)}
                />
            )}
        </div>
    );
};

export default SerialGovernanceStudio;
