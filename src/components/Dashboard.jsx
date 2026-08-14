/* eslint-disable react-refresh/only-export-components */
import React, { useState, useMemo, useCallback } from 'react';
import {
    Package,
    TrendingUp,
    TrendingDown,
    Activity,
    AlertTriangle,
    RefreshCw,
    Download,
    FileSpreadsheet,
    ArrowLeft,
    Search,
    Filter,
    Layers,
    BarChart3,
    ChevronDown,
    Minus,
    CheckCircle2,
    XCircle,
    Clock,
    User,
    ArrowUpRight,
    ArrowDownRight,
    Trash2,
    Inbox,
    ShieldAlert,
    PieChart,
    BarChart,
    Settings,
    Smartphone,
    Monitor,
    GanttChartSquare,
    Zap,
    Bell,
    Layers as LayersIcon,
    Gauge,
    Trophy,
    Target,
    Menu
} from 'lucide-react';
import { useCQA } from '../hooks/useCQA';
import * as XLSX from 'xlsx';


/* ─── Metric Card (KPI) ─── */
const MetricCard = ({ label, value, subText, color, icon: Icon, subColor, onClick }) => (
    <div 
        onClick={onClick}
        className="kpi-card-hover"
        style={{
            background: '#FFFFFF',
            padding: '20px',
            borderRadius: '12px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
            border: '1px solid #EDEDED',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            flex: 1,
            minWidth: '180px',
            position: 'relative',
            overflow: 'hidden',
            cursor: onClick ? 'pointer' : 'default',
            transition: 'all 0.2s ease'
        }}
    >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#777', fontWeight: 700, letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ background: `${color}15`, padding: '8px', borderRadius: '10px' }}>
                <Icon size={18} color={color} />
            </div>
        </div>
        <div>
            <div style={{ fontSize: '32px', fontWeight: '800', color: '#1A1A1A', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '12px', color: subColor || '#888', fontWeight: 600, marginTop: '6px' }}>{subText}</div>
        </div>
    </div>
);

/* ─── Capacity Progress Bar ─── */
const CapacityBar = ({ label, current, capacity = 100 }) => {
    const pct = Math.min(100, (current / capacity) * 100);
    const isOverload = current > capacity;
    const isWarning = pct > 80;
    const color = isOverload ? '#E53935' : (isWarning ? '#FFB300' : '#43A047');
    
    return (
        <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#444' }}>
                <span>{label}</span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {isOverload && <span style={{ background: '#E53935', color: '#FFF', padding: '2px 6px', borderRadius: '4px', fontSize: '9px' }}>BOTTLENECK DETECTED</span>}
                    <span>{current} / {capacity}</span>
                </div>
            </div>
            <div style={{ height: '8px', background: '#F0F0F0', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.5s ease-out' }}></div>
            </div>
        </div>
    );
};

/* ─── Station Performance (FPY) Bar ─── */
const StationPerformanceBar = ({ label, pass, fail }) => {
    const total = pass + fail;
    const passPct = total > 0 ? (pass / total) * 100 : 0;
    const fpy = total > 0 ? Math.round(passPct) : 0;
    
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <div style={{ width: '100px', fontSize: '12px', fontWeight: 700, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
            <div style={{ flex: 1, height: '24px', background: '#F0F0F0', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                <div style={{ height: '100%', width: `${passPct}%`, background: '#43A047' }}></div>
                <div style={{ height: '100%', width: `${100 - passPct}%`, background: '#E53935' }}></div>
            </div>
            <div style={{ width: '60px', textAlign: 'right', fontSize: '13px', fontWeight: 800, color: '#333' }}>FPY {fpy}%</div>
        </div>
    );
};

/* ─── Chart Widgets ─── */
const useChart = (canvasRef, config, inlinePlugins) => {
    const chartRef = React.useRef(null);
    const configStr = JSON.stringify(config);
    React.useEffect(() => {
        if (!window.Chart || !canvasRef.current) return;
        if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
        try {
            chartRef.current = new window.Chart(canvasRef.current, {
                ...config,
                plugins: [window.ChartDataLabels, ...(inlinePlugins || [])].filter(Boolean)
            });
        } catch(e) { console.error('Chart error:', e); }
        return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [configStr]);
};

class DashboardErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, info: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, info) {
        console.error("Dashboard Error:", error, info);
        this.setState({ info });
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 20, background: '#fee', color: 'red', border: '1px solid red', borderRadius: 8 }}>
                    <h3>Something went wrong in the Dashboard Charts.</h3>
                    <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error && this.state.error.toString()}</pre>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{this.state.info && this.state.info.componentStack}</pre>
                </div>
            );
        }
        return this.props.children;
    }
}

const BaseChart = ({ config, height = '220px', plugins }) => {
    const canvasRef = React.useRef(null);
    useChart(canvasRef, config, plugins);
    return <div style={{ position: 'relative', width: '100%', height }}><canvas ref={canvasRef}></canvas></div>;
};

const ChartCard = ({ title, children, fullHeight }) => (
    <div className="card" style={{ 
        padding: '16px', 
        background: '#FFFFFF', 
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)', 
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        height: fullHeight ? '100%' : 'auto'
    }}>
        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '16px', textAlign: 'center', color: '#333' }}>
            {title}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {children}
        </div>
    </div>
);

const getChartDataArrays = (metrics) => {
    // passFailData is already ordered by station pipeline (built from stationKeys in metrics)
    // Each entry: { name: displayName, pass: N, fail: N }
    // wipByStationKey: { 'RECEIVING': N, 'INSPECTION': N, ... } — uppercase keys

    const stationKeys = metrics.stationKeys || [];
    const labels      = metrics.passFailData.map(d => d.name);          // display names, pipeline order
    const output      = metrics.passFailData.map(d => d.pass);          // Pass FROM each station
    const rejections  = metrics.passFailData.map(d => d.fail);          // Fail AT each station
    const queue       = stationKeys.map(k => metrics.wipByStationKey[k] || 0); // In Progress AT each station
    const fpy         = metrics.passFailData.map((d, i) => {
        const p = d.pass, f = d.fail;
        return (p + f) > 0 ? Math.round((p / (p + f)) * 100) : 0;
    });

    return { labels, output, queue, fpy, rejections,
             workflowInProgress: queue, workflowPass: output, workflowFail: rejections };
};


// 1. Station Output Trend (Top-Left)
const StationOutputChart = ({ data }) => {
    const config = {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                data: data.output,
                borderColor: '#28a745',
                borderWidth: 2.5,
                tension: 0.4,
                pointBackgroundColor: '#28a745',
                fill: false,
                datalabels: { align: 'top', offset: 8, color: '#28a745', font: { weight: 'bold', size: 11 }, textStrokeColor: '#ffffff', textStrokeWidth: 4, formatter: (v) => Number(v).toLocaleString() }
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#F0F0F0' }, ticks: { color: '#6c757d', font: { size: 11 } } },
                x: { grid: { display: false }, ticks: { color: '#6c757d', font: { size: 11 } } }
            }
        }
    };
    return <ChartCard title="Station Output"><BaseChart config={config} /></ChartCard>;
};

// 2. Station Queue Trend (Top-Middle)
const StationQueueChart = ({ data }) => {
    const config = {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                data: data.queue,
                borderColor: '#fd7e14',
                borderWidth: 2.5,
                tension: 0.4,
                pointBackgroundColor: '#fd7e14',
                fill: false,
                datalabels: { align: 'top', offset: 8, color: '#fd7e14', font: { weight: 'bold', size: 11 }, textStrokeColor: '#ffffff', textStrokeWidth: 4, formatter: (v) => Number(v).toLocaleString() }
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#F0F0F0' }, ticks: { color: '#6c757d', font: { size: 11 } } },
                x: { grid: { display: false }, ticks: { color: '#6c757d', font: { size: 11 } } }
            }
        }
    };
    return <ChartCard title="Station Queue"><BaseChart config={config} /></ChartCard>;
};

// 3. FPY Trend (Bottom-Left)
const FPYTrendChart = ({ data }) => {
    const config = {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                data: data.fpy,
                borderColor: '#17a2b8',
                borderWidth: 2.5,
                tension: 0.4,
                pointBackgroundColor: '#17a2b8',
                fill: false,
                datalabels: { align: 'top', offset: 8, color: '#17a2b8', font: { weight: 'bold', size: 11 }, textStrokeColor: '#ffffff', textStrokeWidth: 4, formatter: (v) => Number(v).toLocaleString() + '%' }
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 0, max: 120, grid: { color: '#F0F0F0' }, ticks: { color: '#6c757d', font: { size: 11 } } },
                x: { grid: { display: false }, ticks: { color: '#6c757d', font: { size: 11 } } }
            }
        }
    };
    return <ChartCard title="FPY Trend"><BaseChart config={config} /></ChartCard>;
};

// 4. Rejection Trend (Bottom-Middle)
const RejectionTrendChart = ({ data }) => {
    const config = {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                data: data.rejections,
                borderColor: '#dc3545',
                borderWidth: 2.5,
                tension: 0.4,
                pointBackgroundColor: '#dc3545',
                fill: false,
                datalabels: { align: 'top', offset: 8, color: '#dc3545', font: { weight: 'bold', size: 11 }, textStrokeColor: '#ffffff', textStrokeWidth: 4, formatter: (v) => Number(v).toLocaleString() }
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#F0F0F0' }, ticks: { color: '#6c757d', font: { size: 11 } } },
                x: { grid: { display: false }, ticks: { color: '#6c757d', font: { size: 11 } } }
            }
        }
    };
    return <ChartCard title="Rejection Trend"><BaseChart config={config} /></ChartCard>;
};

// 5. Current Workflow (Right Column - Tall)
const WorkflowChart = ({ data }) => {
    const config = {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'In Progress',
                    data: data.workflowInProgress,
                    backgroundColor: '#ffc107',
                    categoryPercentage: 0.7,
                    barPercentage: 1.0
                },
                {
                    label: 'Pass',
                    data: data.workflowPass,
                    backgroundColor: '#28a745',
                    categoryPercentage: 0.7,
                    barPercentage: 1.0
                },
                {
                    label: 'Fail',
                    data: data.workflowFail,
                    backgroundColor: '#dc3545',
                    categoryPercentage: 0.7,
                    barPercentage: 1.0
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                datalabels: { display: false },
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: { boxWidth: 10, font: { size: 10 }, padding: 8 }
                },
                tooltip: { enabled: true }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { display: false },
                    ticks: { color: '#6c757d', font: { size: 11 } }
                },
                y: {
                    grid: { color: '#F5F5F5' },
                    ticks: { color: '#333', font: { size: 11 } }
                }
            },
            animation: { duration: 400 }
        }
    };
    const workflowPlugins = [{
        id: 'segmentLabels',
        afterDatasetsDraw(chart) {
            const { ctx } = chart;
            ctx.save();
            chart.data.datasets.forEach((dataset, i) => {
                const meta = chart.getDatasetMeta(i);
                if (meta.hidden) return;
                meta.data.forEach((bar, index) => {
                    const value = dataset.data[index];
                    if (value > 0) {
                        ctx.fillStyle = '#222';
                        ctx.font = 'bold 11px Inter, sans-serif';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        // Draw label at the right edge of the bar
                        ctx.fillText(value, bar.x + 4, bar.y);
                    }
                });
            });
            ctx.restore();
        }
    }];
    return <ChartCard title="Current Workflow" fullHeight><BaseChart config={config} height="100%" plugins={workflowPlugins} /></ChartCard>;
};

/* ─── Dashboard Component ─── */
const DashboardInner = ({ toggleSidebar }) => {
    const { store, getDisplayName, resolveActiveProject } = useCQA();
    const [project, setProject] = useState('Device');
    const [showExport, setShowExport] = useState(false);
    const [drillDown, setDrillDown] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterProduct, setFilterProduct] = useState('all');
    const [filterLocation, setFilterLocation] = useState('all');
    const [filterOperator, setFilterOperator] = useState('all');
    const [filterShift, setFilterShift] = useState('all');
    const [currentTime, setCurrentTime] = React.useState(new Date().toLocaleTimeString());
    const [loadedDevices, setLoadedDevices] = useState([]);
    const [isLoadingData, setIsLoadingData] = useState(true);   // blocks UI only on first load
    const [isRefreshing, setIsRefreshing] = useState(false);    // subtle banner on project switch
    const [lastRefreshed, setLastRefreshed] = useState(null);
    const projectDisp = getDisplayName('projects', project);

    // ── Real-time onSnapshot listener ──────────────────────────────────────
    React.useEffect(() => {
        let isMounted = true;
        // Cache of already-fetched history so we don't re-fetch unchanged docs
        const historyCache = {};

        const setupListener = async () => {
            // Only show the full-screen spinner when there is no data at all.
            // On project switches, show a lightweight refresh banner instead.
            if (loadedDevices.length === 0) {
                setIsLoadingData(true);
            } else {
                setIsRefreshing(true);
            }

            const { collection, query, where, onSnapshot, getDocs, db } = await import('../firebase');
            const devicesCol = collection(db, 'devices');
            const q = query(devicesCol, where('project', 'in', [project, projectDisp]));

            const unsubscribe = onSnapshot(q, async (snapshot) => {
                if (!isMounted) return;

                // Only fetch history for docs that actually changed
                const changedDocs = snapshot.docChanges()
                    .filter(c => c.type === 'added' || c.type === 'modified')
                    .map(c => c.doc);

                // Fetch in chunks of 50 to avoid Firebase rate-limiting which silently fails and causes Pass/Fail = 0
                const CHUNK_SIZE = 50;
                for (let i = 0; i < changedDocs.length; i += CHUNK_SIZE) {
                    const chunk = changedDocs.slice(i, i + CHUNK_SIZE);
                    await Promise.all(chunk.map(async (docSnap) => {
                        try {
                            const histSnap = await getDocs(collection(docSnap.ref, 'history'));
                            historyCache[docSnap.id] = histSnap.docs
                                .map(h => h.data())
                                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                        } catch { historyCache[docSnap.id] = []; }
                    }));
                }

                // Remove deleted docs from cache
                snapshot.docChanges()
                    .filter(c => c.type === 'removed')
                    .forEach(c => delete historyCache[c.doc.id]);

                if (!isMounted) return;

                const devicesList = snapshot.docs.map(docSnap => {
                    const data = docSnap.data();
                    const inlineHistory = Array.isArray(data.history) ? data.history : [];
                    const subcolHistory = historyCache[docSnap.id] || [];
                    
                    // Merge old inline history with new subcollection history
                    // Sort the combined history by timestamp
                    const combinedHistory = [...inlineHistory, ...subcolHistory].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

                    return {
                        id: docSnap.id,
                        ...data,
                        history: combinedHistory,
                        _resolvedProject: resolveActiveProject({ id: docSnap.id, ...data })
                    };
                });

                setLoadedDevices(devicesList);
                setIsLoadingData(false);
                setIsRefreshing(false);
                setLastRefreshed(new Date());
            }, (err) => {
                console.error('Dashboard listener error:', err);
                setIsLoadingData(false);
                setIsRefreshing(false);
            });

            return unsubscribe;
        };

        let unsubFn = null;
        setupListener().then(unsub => { unsubFn = unsub; });
        return () => { isMounted = false; if (unsubFn) unsubFn(); };
    }, [project, projectDisp, resolveActiveProject]);

    React.useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
        return () => clearInterval(timer);
    }, []);

    const allProjectDevices = useMemo(() => {
        let devices = loadedDevices;

        // Apply sub-filters
        if (filterProduct !== 'all') {
            devices = devices.filter(u => (u.details?.productType || u.details?.model) === filterProduct);
        }
        if (filterLocation !== 'all') {
            devices = devices.filter(u => (getDisplayName('stations', u.stationName) || 'FG') === filterLocation);
        }
        if (filterOperator !== 'all') {
            devices = devices.filter(u => {
                const lastH = u.history?.[u.history.length - 1];
                return (lastH?.operator === filterOperator) || (u.operator === filterOperator);
            });
        }
        
        if (filterShift !== 'all') {
            const shiftConfigs = {
                'General': { start: 10, duration: 8 },
                'Shift A': { start: 6, duration: 8 },
                'Shift B': { start: 14, duration: 8 },
                'Shift C': { start: 22, duration: 8 }
            };
            const config = shiftConfigs[filterShift];
            if (config) {
                devices = devices.filter(u => {
                    if (!u.updatedAt) return false;
                    const hour = new Date(u.updatedAt).getHours();
                    const end = (config.start + config.duration) % 24;
                    if (config.start < end) return hour >= config.start && hour < end;
                    return hour >= config.start || hour < end;
                });
            }
        }

        return devices;
    }, [loadedDevices, project, projectDisp, filterProduct, filterLocation, filterOperator, filterShift, getDisplayName]);

    const formatDate = useCallback((dateStr) => {
        if (!dateStr) return '—';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            
            // ISO 8601 format: YYYY-MM-DD HH:MM:SS (Excel friendly & removes ambiguity)
            const pad = (n) => n.toString().padStart(2, '0');
            const y = date.getFullYear();
            const m = pad(date.getMonth() + 1);
            const d = pad(date.getDate());
            const hh = pad(date.getHours());
            const mm = pad(date.getMinutes());
            const ss = pad(date.getSeconds());
            
            return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
        } catch { return dateStr; }
    }, []);

    const isToday = useCallback((dateStr) => {
        if (!dateStr) return false;
        try {
            const now = new Date();
            const date = new Date(dateStr);

            // Standard JS Date parsing check
            if (!isNaN(date.getTime())) {
                if (date.getFullYear() === now.getFullYear() &&
                    date.getMonth() === now.getMonth() &&
                    date.getDate() === now.getDate()) return true;
            }

            // Fallback: Manual string parsing for "DD/MM/YYYY" or "MM/DD/YYYY"
            // This handles cases where locale-dependent strings like "03/09/2026" 
            // might be misinterpreted by the browser's default parser.
            const parts = dateStr.split(/[,\s/:-]+/);
            if (parts.length >= 3) {
                const p1 = parseInt(parts[0]);
                const p2 = parseInt(parts[1]);
                const p3 = parseInt(parts[2]);
                const d = now.getDate();
                const m = now.getMonth() + 1;
                const y = now.getFullYear();

                // Check for YYYY at p3 (common in Mes logs)
                if (p3 === y || (p3 > 0 && p3 < 100 && (2000 + p3) === y)) {
                    if ((p1 === d && p2 === m) || (p1 === m && p2 === d)) return true;
                }
                // Check for YYYY at p1
                if (p1 === y) {
                    if ((p2 === m && p3 === d) || (p2 === d && p3 === m)) return true;
                }
            }
            return false;
        } catch { return false; }
    }, []);

    const metrics = useMemo(() => {
        const units = allProjectDevices;

        // ─────────────────────────────────────────────────────────────────────
        // STATION DEFINITIONS — canonical internal keys per project
        // Used to build the station axis, matching exactly what is written
        // into history[].station by processUnit() in useCQA.jsx
        // ─────────────────────────────────────────────────────────────────────
        const projectStationKeys = {
            'Device':     ['RECEIVING','INSPECTION','DEBUG','REWORK','FINAL QC','PACKING','MOVE TO FG','SCRAP REVIEW'],
            'Peripherals':['RECEIVING','QC','MOVE TO FG','REJECTION REVIEW'],
            'Inward QC':  ['RECEIVING','IQC','MOVE TO FG','REJECTION']
        };
        const stationKeys = projectStationKeys[project] || projectStationKeys['Device'];

        // Helper: normalise a raw station string to upper-case for comparison
        const norm = (s) => (s || '').trim().toUpperCase();

        // ── 1. IN PROGRESS per station ────────────────────────────────────────
        // SOURCE: device document (active WIP table)
        // RULE: device.stationName is set to the station where the SN is
        //       currently WAITING to be processed. This is the correct "current
        //       station" field. device.status === 'Processing' confirms it's active WIP.
        // NOTE: processUnit() writes device.stationName = nextStationName after
        //       each scan, so stationName always = the station the SN is queued at.
        const wipByStation = {}; // keyed by uppercase station key
        units
            .filter(u => u.status?.toLowerCase() === 'processing')
            .forEach(u => {
                const sKey = norm(u.stationName); // directly from device doc
                if (sKey) wipByStation[sKey] = (wipByStation[sKey] || 0) + 1;
            });

        // ── 2. PASS / FAIL per station (cumulative event counting) ────────────
        // SOURCE: history sub-collection (station transaction log)
        // RULE: Count EVERY history event, not unique SNs. If an SN fails at
        //       INSPECTION twice (fail → rework → fail again), Fail count = 2.
        // history[].station = the station where the event occurred (Pass or Fail FROM)
        // history[].result  = 'Pass' | 'Fail' | 'COMPLETED' | 'SCRAP' | 'REJECTED'
        const passFailByKey = {}; // { 'INSPECTION': { pass: N, fail: N }, ... }

        units.forEach(u => {
            if (!u.history || u.history.length === 0) return;
            u.history.forEach(h => {
                const sKey = norm(h.station);
                if (!sKey) return;
                const r = (h.result || '').toUpperCase();
                if (!passFailByKey[sKey]) passFailByKey[sKey] = { pass: 0, fail: 0 };
                if (r === 'PASS' || r === 'COMPLETED') {
                    passFailByKey[sKey].pass++;
                } else if (r === 'FAIL' || r === 'SCRAP' || r === 'REJECTED') {
                    passFailByKey[sKey].fail++;
                }
                // 'COMPLETED' at RECEIVING = a pass (unit entered next station)
                // All other result strings are ignored (no-ops, admin entries, etc.)
            });
        });

        // ── 3. BUILD ORDERED passFailData ARRAY (one entry per station in pipeline order)
        const passFailData = stationKeys.map(key => {
            const d = passFailByKey[key] || { pass: 0, fail: 0 };
            return { name: getDisplayName('stations', key), pass: d.pass, fail: d.fail };
        });

        // WIP display-name map (for alerts / KPI text)
        const wipByStationDisplay = {};
        Object.entries(wipByStation).forEach(([key, count]) => {
            wipByStationDisplay[getDisplayName('stations', key)] = (wipByStationDisplay[getDisplayName('stations', key)] || 0) + count;
        });


        // ── 4. KPI AGGREGATES ─────────────────────────────────────────────────
        const wipUnits      = units.filter(u => u.status?.toLowerCase() === 'processing');
        const fgUnits       = units.filter(u => u.status?.toLowerCase() === 'completed');
        const scrapUnits    = units.filter(u => u.status?.toLowerCase() === 'scrap');
        const rejectUnits   = units.filter(u => u.status?.toLowerCase().includes('reject'));
        const totalRejectionCount = scrapUnits.length + rejectUnits.length;
        const totalInputs   = wipUnits.length + fgUnits.length + totalRejectionCount;

        const todayOutput = fgUnits.filter(u =>
            isToday(u.cycleEndDate) ||
            (isToday(u.updatedAt) && (!u.history?.length || isToday(u.history[u.history.length - 1].timestamp)))
        ).length;

        const todayRejection = [...scrapUnits, ...rejectUnits].filter(u =>
            isToday(u.lockDate) ||
            (isToday(u.updatedAt) && (!u.history?.length || isToday(u.history[u.history.length - 1].timestamp)))
        ).length;

        // ── 5. ALERTS ─────────────────────────────────────────────────────────
        const alerts = [];
        const scrapRejectRate = totalInputs > 0 ? (totalRejectionCount / totalInputs * 100) : 0;
        if (scrapRejectRate > 10) alerts.push({ type: 'error', message: `High Rejection Rate: ${scrapRejectRate.toFixed(1)}%` });
        const maxWipEntry = Object.entries(wipByStationDisplay).sort((a, b) => b[1] - a[1])[0];
        if (maxWipEntry && maxWipEntry[1] > 20) alerts.push({ type: 'warning', message: `Bottleneck: ${maxWipEntry[0]} has ${maxWipEntry[1]} units waiting.` });

        // ── 6. SHIFT / HOURLY (for KPI sub-text, not chart axes) ─────────────
        const activeShift = filterShift === 'all' ? 'General' : ((['General','Shift A','Shift B','Shift C'].includes(filterShift)) ? filterShift : 'General');
        const shiftTimes  = { 'General':{start:10,duration:8}, 'Shift A':{start:6,duration:8}, 'Shift B':{start:14,duration:8}, 'Shift C':{start:22,duration:8} };
        const st          = shiftTimes[activeShift];
        const now         = new Date();
        const hoursPassed = (() => { const h = now.getHours(); return h >= st.start ? h - st.start : h + 24 - st.start; })();
        const remainingH  = Math.max(0, 8 - hoursPassed);
        const predictedEOD = todayOutput > 0 ? Math.round(todayOutput + (todayOutput / (hoursPassed || 0.5)) * remainingH) : '—';

        const totalPass = passFailData.reduce((s, d) => s + d.pass, 0);
        const totalFail = passFailData.reduce((s, d) => s + d.fail, 0);
        const avgFPY    = (totalPass + totalFail) > 0 ? ((totalPass / (totalPass + totalFail)) * 100).toFixed(1) : 0;

        return {
            totalInputs, wipCount: wipUnits.length, fgCount: fgUnits.length,
            rejectionCount: totalRejectionCount, todayOutput, todayRejection,
            wipByStation: wipByStationDisplay,
            passFailData,              // array of { name, pass, fail } — display-name keyed
            passFailByKey,             // object keyed by UPPERCASE station key — for getChartDataArrays
            wipByStationKey: wipByStation, // object keyed by UPPERCASE station key
            alerts, predictedEOD, avgFPY, activeShift,
            stationKeys,               // ordered list of station keys for chart axis
        };
    }, [allProjectDevices, project, getDisplayName, isToday, filterShift]);

    const handleExport = (format) => {
        const units = allProjectDevices;
        const projectConfigs = {
            'Device': [
                { id: 1, name: 'RECEIVING', hasStatus: false, hasRemarks: false },
                { id: 2, name: 'INSPECTION', hasStatus: true, hasRemarks: true },
                { id: 3, name: 'DEBUG', hasStatus: true, hasRemarks: true },
                { id: 4, name: 'REWORK', hasStatus: true, hasRemarks: true },
                { id: 5, name: 'FINAL QC', hasStatus: true, hasRemarks: true },
                { id: 6, name: 'PACKING', hasStatus: true, hasRemarks: false },
                { id: 7, name: 'MOVE TO FG', hasStatus: false, hasRemarks: false },
                { id: 8, name: 'SCRAP REVIEW', hasStatus: true, hasRemarks: true },
            ],
            'Peripherals': [
                { id: 1, name: 'RECEIVING', hasStatus: false, hasRemarks: false },
                { id: 2, name: 'QC', hasStatus: true, hasRemarks: true },
                { id: 3, name: 'MOVE TO FG', hasStatus: false, hasRemarks: false },
                { id: 4, name: 'REJECTION REVIEW', hasStatus: true, hasRemarks: true },
            ],
            'Inward QC': [
                { id: 1, name: 'RECEIVING', hasStatus: false, hasRemarks: false },
                { id: 2, name: 'IQC', hasStatus: true, hasRemarks: true },
                { id: 3, name: 'MOVE TO FG', hasStatus: false, hasRemarks: false },
                { id: 4, name: 'REJECTION', hasStatus: true, hasRemarks: true },
            ]
        };

        const currentStations = projectConfigs[project] || [];
        const isPeripheral = project === 'Peripherals';

        // Build Headers
        const headers = ['Sl', 'Batch No', 'Device ID', 'Looper', 'Model'];
        if (isPeripheral) headers.push('Category');
        headers.push('Device Type', 'HW Version', 'SW Version', 'CX Remarks');

        currentStations.forEach(s => {
            const disp = getDisplayName('stations', s.name);
            headers.push(`${disp} Date`);
            if (s.hasStatus) headers.push(`${disp} Status`);
            if (s.hasRemarks) headers.push(`${disp} Remarks`);

            // "By" column label logic based on examples
            let byLabel = `${disp} By`;
            const n = s.name.toUpperCase();
            if (n === 'RECEIVING') byLabel = 'Received By';
            else if (n === 'INSPECTION') byLabel = 'Inspected By';
            else if (n === 'DEBUG') byLabel = 'Debugged By';
            else if (n === 'FINAL QC' || n === 'QC' || n === 'IQC') byLabel = 'QC By';
            else if (n === 'PACKING' || n === 'PACKAGING') byLabel = 'Packaged By';
            else if (n === 'MOVE TO FG') byLabel = 'Move To FG By';
            else if (n === 'SCRAP REVIEW') byLabel = 'Scraped By';
            else if (n === 'REJECTION REVIEW' || n === 'REJECTION') byLabel = 'Rejected By';

            headers.push(byLabel);
        });

        headers.push('Current Status', 'Aging');

        const rows = units.map((u, index) => {
            const row = [];
            row.push(index + 1);

            const receivingStage = (u.history || []).find(h => h.stationId === 1 || h.station === 'RECEIVING');

            row.push(u.details?.batchNo || receivingStage?.details?.batchNo || '');
            row.push(u.id);
            row.push(u.looper || 1);
            row.push(u.details?.model || receivingStage?.details?.model || '');

            if (isPeripheral) row.push(u.details?.category || receivingStage?.details?.category || '');

            row.push(u.details?.productType || receivingStage?.details?.productType || '');
            row.push(u.details?.hw || receivingStage?.details?.hw || '');
            row.push(u.details?.sw || receivingStage?.details?.sw || '');
            row.push(u.details?.cx_remarks || receivingStage?.details?.cx_remarks || '');

            currentStations.forEach(s => {
                const historyForStation = (u.history || []).filter(h => h.stationId === s.id || h.station === s.name);
                const h = historyForStation[historyForStation.length - 1];

                if (h) {
                    // For Excel export, use native Date object to allow hierarchical filtering (Year -> Month -> Day)
                    // For CSV export, use the formatted ISO string
                    row.push(format === 'xlsx' ? new Date(h.timestamp) : formatDate(h.timestamp));
                    if (s.hasStatus) {
                        let res = h.result;
                        if (res === 'Pass' || res === 'COMPLETED') row.push('Pass');
                        else if (res === 'Fail' || res === 'SCRAP' || res === 'REJECTED') row.push('Fail');
                        else row.push('Pending');
                    }
                    if (s.hasRemarks) {
                        let remark = h.details?.remarks || h.details?.comment || '';
                        // If it failed and we have checklist results, we can combine them if needed, 
                        // but the rule says "exact remarks entered by the user".
                        row.push(remark);
                    }
                    row.push(h.operator || h.user || 'SYSTEM_ADMIN');
                } else {
                    row.push(''); // Date
                    if (s.hasStatus) row.push(''); // Status
                    if (s.hasRemarks) row.push(''); // Remarks
                    row.push(''); // By
                }
            });

            // Current Status
            let currentStatus = '';
            if (u.status === 'Completed') currentStatus = 'Completed';
            else if (u.status === 'Scrap') currentStatus = 'Scrapped';
            else if (u.status === 'Reject') currentStatus = 'Rejected';
            else {
                currentStatus = getDisplayName('stations', u.stationName) || 'Processing';
            }
            row.push(currentStatus);

            // Aging calculation
            let aging = '0';
            const receiveDateStr = u.createdAt || (receivingStage ? receivingStage.timestamp : null);
            if (receiveDateStr) {
                try {
                    const rDate = new Date(receiveDateStr);
                    const now = new Date();
                    const diff = now - rDate;
                    aging = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24))).toString();
                } catch { aging = '0'; }
            }
            row.push(aging);

            return row;
        });

        const fileName = `CQA-Export-${project.replace(/\s+/g, '')}`;

        if (format === 'xlsx') {
            const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
            XLSX.writeFile(workbook, `${fileName}.xlsx`);
        } else {
            const csvString = [headers, ...rows].map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${fileName}.csv`;
            link.click();
        }
        setShowExport(false);
    };


    // Drill-down data
    const data = useMemo(() => {
        if (!drillDown) return [];
        let filtered = [];
        switch (drillDown.type) {
            case 'total': filtered = allProjectDevices; break;
            case 'current': filtered = allProjectDevices.filter(d => d.status === 'Processing'); break;
            case 'fg': filtered = allProjectDevices.filter(d => d.status === 'Completed'); break;
            case 'assigned': filtered = allProjectDevices.filter(d => d.status === 'Assigned' || (d.details && (d.details.assignedTo || d.details.assignedUser))); break;
            case 'wip': filtered = allProjectDevices.filter(d => d.status === 'Processing'); break;
            case 'scrap': filtered = allProjectDevices.filter(d => d.status === (project === 'Device' ? 'Scrap' : 'Reject')); break;
            case 'todayOutput':
                filtered = allProjectDevices.filter(u =>
                    u.status?.toLowerCase() === 'completed' && (
                        isToday(u.cycleEndDate) ||
                        (isToday(u.updatedAt) && (!u.history?.length || isToday(u.history[u.history.length - 1].timestamp)))
                    )
                );
                break;
            case 'todayRejection':
                filtered = allProjectDevices.filter(u =>
                    (u.status?.toLowerCase().includes('scrap') || u.status?.toLowerCase().includes('reject')) && (
                        isToday(u.lockDate) ||
                        (isToday(u.updatedAt) && (!u.history?.length || isToday(u.history[u.history.length - 1].timestamp)))
                    )
                );
                break;
            case 'station': filtered = allProjectDevices.filter(d => d.status === 'Processing' && d.stationName === drillDown.value); break;
        }
        
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(d => 
                d.id.toLowerCase().includes(term) || 
                (d.details?.batchNo || '').toLowerCase().includes(term)
            );
        }
        return filtered;
    }, [drillDown, allProjectDevices, project, isToday, searchTerm]);

    // ────── These must be before ANY early returns (Rules of Hooks) ──────
    const products = useMemo(() => {
        const set = new Set(allProjectDevices.map(u => u.details?.productType || u.details?.model).filter(Boolean));
        return Array.from(set);
    }, [allProjectDevices]);

    const locations = useMemo(() => {
        const set = new Set(allProjectDevices.map(u => getDisplayName('stations', u.stationName) || 'FG').filter(Boolean));
        return Array.from(set);
    }, [allProjectDevices, getDisplayName]);

    if (isLoadingData && loadedDevices.length === 0) {
        return (
            <div className="flex-center" style={{ height: '100vh', flexDirection: 'column', gap: '1rem', background: '#F8FAFC' }}>
                <div className="spinner" style={{ width: 48, height: 48, border: '4px solid #E2E8F0', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <h2 className="font-bold text-muted">Compiling Analytics Data...</h2>
            </div>
        );
    }

    // ────── Drill-Down View ──────
    if (drillDown) {
        const drillDownLabel = drillDown.type === 'total' ? 'Total Input' :
            drillDown.type === 'current' ? 'Current WIP' :
                drillDown.type === 'fg' ? 'Finished Goods' :
                    drillDown.type === 'scrap' ? 'Total Rejected Units' :
                        drillDown.type === 'todayOutput' ? 'Output Today (Finished Goods)' :
                            drillDown.type === 'todayRejection' ? 'Rejections Today (Rejected Units)' : 'Detailed View';

        return (
            <div className="animate-fade-in">
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div className="card-body">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <button className="btn btn-secondary" style={{ width: 38, minWidth: 38, padding: 0 }} onClick={() => { setDrillDown(null); setSearchTerm(''); setFilterProduct('all'); setFilterLocation('all'); }}>
                                <ArrowLeft size={16} />
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="text-xs uppercase font-bold" style={{ color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{projectDisp} Records</div>
                                <h2 className="font-extrabold" style={{ fontSize: '1.25rem' }}>{drillDownLabel}</h2>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn btn-secondary" onClick={() => handleExport('xlsx')}>
                                    <FileSpreadsheet size={14} /> <span>Export</span>
                                </button>
                                <span className="status-pill info font-bold">{data.length} Units</span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative', flex: 2, minWidth: 200 }}>
                                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    style={{ paddingLeft: '2.25rem' }}
                                    placeholder="Search Device ID / Serial Number..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value.toUpperCase().replace(/\//g, '-'))}
                                />
                            </div>
                            <select
                                style={{ flex: 1, minWidth: 150 }}
                                value={filterProduct}
                                onChange={e => setFilterProduct(e.target.value)}
                            >
                                <option value="all">All Products</option>
                                {products.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <select
                                style={{ flex: 1, minWidth: 150 }}
                                value={filterLocation}
                                onChange={e => setFilterLocation(e.target.value)}
                            >
                                <option value="all">All Locations</option>
                                {locations.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="table-to-cards">
                    <div className="table-container card">
                        <table>
                            <thead>
                                <tr>
                                    <th>Device ID / Serial Number</th>
                                    <th>Product Name</th>
                                    <th>Location</th>
                                    <th>Status</th>
                                    <th>User Name</th>
                                    <th>Date Added</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map(u => (
                                    <tr key={u.id}>
                                        <td data-label="Serial" className="text-mono font-bold" style={{ color: 'var(--primary)' }}>{u.id}</td>
                                        <td data-label="Product">{u.details?.productType || u.details?.model || '—'}</td>
                                        <td data-label="Location">
                                            <span className="status-pill info">{getDisplayName('stations', u.stationName) || 'FG'}</span>
                                        </td>
                                        <td data-label="Status"><span className={`status-pill ${u.status.toLowerCase()}`}>{u.status}</span></td>
                                        <td data-label="User Name">
                                            {(() => {
                                                if (!u.history || u.history.length === 0) return '—';

                                                if (drillDown.type === 'fg') {
                                                    const fgStep = [...u.history].reverse().find(h => h.station === 'MOVE TO FG' || h.result === 'COMPLETED');
                                                    return fgStep?.operator || fgStep?.user || '—';
                                                }

                                                if (drillDown.type === 'scrap') {
                                                    const scrapStep = [...u.history].reverse().find(h => h.result === 'SCRAP' || h.result === 'REJECTED');
                                                    return scrapStep?.operator || scrapStep?.user || '—';
                                                }

                                                // Default for Total Input and Current WIP: Last activity user
                                                const lastStep = u.history[u.history.length - 1];
                                                return lastStep?.operator || lastStep?.user || '—';
                                            })()}
                                        </td>
                                        <td data-label="Date Added" className="text-xs text-muted text-mono">{formatDate(u.createdAt || u.updatedAt)}</td>
                                    </tr>
                                ))}
                                {data.length === 0 && (
                                    <tr>
                                        <td colSpan="6">
                                            <div className="empty-state">
                                                <div className="empty-state-icon"><Filter size={28} /></div>
                                                <h3>No records found</h3>
                                                <p>Try adjusting your search or filters</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    // ────── Main Dashboard ──────

    return (
        <div style={{ 
            background: '#F5F7F5', 
            minHeight: '100vh', 
            fontFamily: '"Inter", sans-serif',
            color: '#333'
        }}>
            {/* Header / Meta Bar */}
            <div style={{ 
                background: '#FFF', 
                padding: '12px 24px', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                borderBottom: '1px solid #E0E0E0'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button className="nav-trigger show-mobile-only" onClick={toggleSidebar} aria-label="Toggle Menu" style={{ padding: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#333', display: 'flex', alignItems: 'center' }}>
                        <Menu size={20} />
                    </button>
                    <div className="hide-mobile" style={{ background: '#1B5E20', color: '#FFF', padding: '6px 12px', borderRadius: '4px', fontWeight: 800, fontSize: '14px' }}>CQA MES</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#555' }}>Production Dashboard — {projectDisp}</div>
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#888', display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                            background: '#28a745',
                            boxShadow: '0 0 0 2px rgba(40,167,69,0.3)',
                            animation: 'pulse 2s infinite'
                        }} />
                        <span style={{ color: '#28a745' }}>LIVE</span>
                        {lastRefreshed && <span style={{ color: '#aaa', fontWeight: 500 }}>· {lastRefreshed.toLocaleTimeString()}</span>}
                    </div>
                    <div>Shift: <span style={{color: '#1B5E20'}}>{metrics.activeShift}</span></div>
                    <div>Filters: <span style={{color: '#1B5E20'}}>{filterProduct === 'all' ? 'All Products' : filterProduct} | {filterShift === 'all' ? 'All Shifts' : filterShift}</span></div>
                </div>
            </div>

            <div style={{ padding: '20px 24px' }}>

                {/* Refreshing Banner — non-blocking, shown on project switch */}
                {isRefreshing && (
                    <div style={{
                        background: '#E8F5E9',
                        border: '1px solid #A5D6A7',
                        padding: '8px 16px',
                        borderRadius: '10px',
                        marginBottom: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#2E7D32'
                    }}>
                        <div style={{ width: 14, height: 14, border: '2px solid #A5D6A7', borderTopColor: '#2E7D32', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                        Updating data for <strong style={{ marginLeft: 4 }}>{projectDisp}</strong>…
                    </div>
                )}

                {/* 1. System Alerts Section */}
                {metrics.alerts?.length > 0 && (
                    <div style={{ 
                        background: '#FFF0F0', 
                        border: '1px solid #FFCDCD', 
                        padding: '12px 20px', 
                        borderRadius: '12px', 
                        marginBottom: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                    }}>
                        <ShieldAlert color="#E53935" size={20} />
                        <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 800, color: '#D32F2F', marginRight: '8px' }}>CRITICAL ALERT:</span>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: '#555' }}>
                                {metrics.alerts[0].message}
                            </span>
                        </div>
                        <button className="btn-ghost" style={{ padding: '4px' }} onClick={() => metrics.alerts.shift()}>
                            <XCircle size={18} color="#999" />
                        </button>
                    </div>
                )}

                {/* Filters Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', marginBottom: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '10px', background: '#FFF', padding: '6px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', border: '1px solid #EDEDED' }}>
                        <select className="dashboard-select" style={{ border: 'none', background: 'transparent', height: 34, padding: '0 12px', fontSize: '13px', fontWeight: 700 }} value={filterShift} onChange={e => setFilterShift(e.target.value)}>
                            <option value="all">Every Shift</option><option value="General">General Shift</option><option value="Shift A">Shift A</option><option value="Shift B">Shift B</option><option value="Shift C">Shift C</option>
                        </select>
                        <div style={{ width: 1, background: '#DDD', height: 20, marginTop: 7 }} />
                        <select className="dashboard-select" style={{ border: 'none', background: 'transparent', height: 34, padding: '0 12px', fontSize: '13px', fontWeight: 700 }} value={filterProduct} onChange={e => setFilterProduct(e.target.value)}>
                            <option value="all">All Products</option>
                            {Array.from(new Set(allProjectDevices.map(d => d.details?.productType || d.details?.model).filter(Boolean))).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <div className="tab-switcher" style={{ margin: 0, padding: 3, background: '#FFF', border: '1px solid #EDEDED' }}>
                            {['Device', 'Peripherals', 'Inward QC'].map(p => (
                                <button key={p} className={`tab-item ${project === p ? 'active' : ''}`} onClick={() => setProject(p)} style={{ fontSize: '12px', padding: '8px 20px', fontWeight: 700, borderRadius: 8, background: project === p ? '#1B5E20' : 'transparent', color: project === p ? '#FFF' : '#777' }}>
                                    {getDisplayName('projects', p)}
                                </button>
                            ))}
                        </div>
                        <div style={{ position: 'relative' }}>
                            <button className="btn btn-secondary" style={{ background: '#FFF', border: '1px solid #EDEDED', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }} onClick={() => setShowExport(!showExport)}>
                                <Download size={16} /> Data Export
                            </button>
                            {showExport && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    right: 0,
                                    marginTop: '4px',
                                    background: '#FFF',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                    border: '1px solid #EDEDED',
                                    overflow: 'hidden',
                                    zIndex: 50,
                                    minWidth: '160px',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    <button 
                                        style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', borderBottom: '1px solid #F0F0F0', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#333' }} 
                                        onClick={() => handleExport('xlsx')}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                    >
                                        Export to Excel (.xlsx)
                                    </button>
                                    <button 
                                        style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#333' }} 
                                        onClick={() => handleExport('csv')}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                    >
                                        Export to CSV (.csv)
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 2. Primary Production KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                    <MetricCard onClick={() => setDrillDown({ type: 'total' })} label="Total Input" value={metrics.totalInputs} subText="Lifetime recorded" color="#1565C0" icon={Layers} />
                    <MetricCard onClick={() => setDrillDown({ type: 'wip' })} label="Current WIP" value={metrics.wipCount} subText="Across all stations" color="#FB8C00" icon={Activity} />
                    <MetricCard onClick={() => setDrillDown({ type: 'fg' })} label="Finished Goods" value={metrics.fgCount} subText="Total units moved" color="#43A047" icon={CheckCircle2} />
                    <MetricCard onClick={() => setDrillDown({ type: 'scrap' })} label="Rejected Units" value={metrics.rejectionCount} subText="Scrap & Reject" color="#E53935" icon={Trash2} />
                    <MetricCard onClick={() => setDrillDown({ type: 'todayOutput' })} label="Output Today" value={metrics.todayOutput} subText={`${Math.round(metrics.todayOutput / 50 * 100)}% of shift target`} color="#43A047" icon={TrendingUp} subColor="#2E7D32" />
                    <MetricCard onClick={() => setDrillDown({ type: 'todayRejection' })} label="Rejections Today" value={metrics.todayRejection} subText={`${metrics.totalInputs > 0 ? (metrics.todayRejection/metrics.totalInputs*100).toFixed(1) : 0}% rejection rate`} color="#E53935" icon={TrendingDown} subColor="#D32F2F" />
                </div>

                {/* Main Dashboard Body: 3-Column Grid */}
                <div className="dashboard-charts-grid" style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
                    gap: '24px', 
                    alignItems: 'stretch' 
                }}>
                    {(() => {
                        const chartData = getChartDataArrays(metrics);
                        return (
                            <>
                                {/* Left Column: 33% */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                    <StationOutputChart data={chartData} />
                                    <FPYTrendChart data={chartData} />
                                </div>
                                
                                {/* Middle Column: 33% */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                    <StationQueueChart data={chartData} />
                                    <RejectionTrendChart data={chartData} />
                                </div>

                                {/* Right Column: 33% */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                    <WorkflowChart data={chartData} />
                                </div>
                            </>
                        );
                    })()}
                </div>

                {/* Footer Metadata */}
                <div style={{ marginTop: '40px', textAlign: 'center', opacity: 0.5, fontSize: '11px', fontWeight: 600 }}>
                    Manufacturing Execution System — Version 2.0 — Developed for CQA Electronics
                </div>
            </div>
        </div>
    );
};

export default function Dashboard(props) {
    return (
        <DashboardErrorBoundary>
            <DashboardInner {...props} />
        </DashboardErrorBoundary>
    );
}
