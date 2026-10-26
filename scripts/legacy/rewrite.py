import re

file_path = r'c:\Users\biswa\.gemini\antigravity\scratch\CQA\src\components\Dashboard.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Widgets
new_widgets = """/* ─── KPI Card ─── */
const KPICard = ({ label, value, subText, color, isRed }) => (
    <div style={{
        background: '#FFFFFF',
        padding: '12px 20px',
        borderBottom: `3px solid ${color}`,
        borderRadius: '8px',
        border: '0.5px solid #C8E6C9',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flex: 1,
        minWidth: '150px'
    }}>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#888', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: '32px', fontWeight: 'bold', color: color, margin: '4px 0' }}>{value}</div>
        <div style={{ fontSize: '12px', color: isRed ? '#E53935' : (color === '#2E7D32' ? '#2E7D32' : color) }}>{subText}</div>
    </div>
);

/* ─── Chart Widgets ─── */
const useChart = (canvasRef, config, dependencies) => {
    const chartRef = React.useRef(null);
    React.useEffect(() => {
        if (!window.Chart || !canvasRef.current) return;
        if (chartRef.current) chartRef.current.destroy();
        chartRef.current = new window.Chart(canvasRef.current, config);
        return () => { if (chartRef.current) chartRef.current.destroy(); };
    }, dependencies);
};

const Chart1 = ({ hourlyData }) => {
    const canvasRef = React.useRef(null);
    useChart(canvasRef, {
        type: 'bar',
        data: {
            labels: hourlyData.map(d => d.label),
            datasets: [
                {
                    label: 'Actual',
                    data: hourlyData.map(d => d.value),
                    backgroundColor: '#43A047',
                    order: 2
                },
                {
                    label: 'Target',
                    data: hourlyData.map(d => 50),
                    type: 'line',
                    borderColor: '#A5D6A7',
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    borderWidth: 2,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { grid: { color: '#E8F5E9' } }, x: { grid: { display: false } } }
        }
    }, [hourlyData]);
    return (
        <div style={{ background: '#FFFFFF', borderRadius: '8px', border: '0.5px solid #C8E6C9', padding: '10px 12px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold', color: '#1B5E20' }}><span style={{color: '#2E7D32'}}>●</span> DAILY PRODUCTION</div>
                <div style={{ fontSize: '10px', display: 'flex', gap: '8px' }}>
                    <div style={{display:'flex', alignItems:'center', gap:'4px'}}><div style={{width:8, height:8, background:'#43A047'}}></div> Actual</div>
                    <div style={{display:'flex', alignItems:'center', gap:'4px'}}><div style={{width:16, borderTop:'2px dashed #A5D6A7'}}></div> Target</div>
                </div>
            </div>
            <div style={{ position: 'relative', flex: 1, minHeight: '180px' }}><canvas ref={canvasRef}></canvas></div>
        </div>
    );
};

const Chart2 = ({ allDevices, filterShift }) => {
    const canvasRef = React.useRef(null);
    const hourlyData = React.useMemo(() => {
        const activeShift = filterShift === 'all' ? 'General' : filterShift;
        const st = { 'General': {start:10, duration:8}, 'Shift A': {start:6, duration:8}, 'Shift B': {start:14, duration:8}, 'Shift C': {start:22, duration:8} }[activeShift] || {start:10, duration:8};
        const shiftHours = Array.from({ length: st.duration }, (_, i) => (st.start + i) % 24);
        
        const rejected = allDevices.filter(u => u.status?.toLowerCase().includes('scrap') || u.status?.toLowerCase().includes('reject'));
        
        return shiftHours.map(h => {
            const hourStr = h.toString().padStart(2, '0');
            const atHour = rejected.filter(u => {
                const now = new Date();
                const dDateStr = u.lockDate || u.updatedAt;
                if (!dDateStr) return false;
                const date = new Date(dDateStr);
                if (isNaN(date.getTime())) return false;
                if (date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
                    return date.getHours() === h;
                }
                return false;
            });
            return { label: `${hourStr}:00`, value: atHour.length };
        });
    }, [allDevices, filterShift]);

    useChart(canvasRef, {
        type: 'bar',
        data: {
            labels: hourlyData.map(d => d.label),
            datasets: [{
                data: hourlyData.map(d => d.value),
                backgroundColor: hourlyData.map(d => d.value >= 15 ? '#E53935' : '#EF9F27')
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { grid: { color: '#E8F5E9' } }, x: { grid: { display: false } } }
        }
    }, [hourlyData]);

    return (
        <div style={{ background: '#FFFFFF', borderRadius: '8px', border: '0.5px solid #C8E6C9', padding: '10px 12px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold', color: '#1B5E20' }}><span style={{color: '#E53935'}}>●</span> DAILY REJECTION</div>
                <div style={{ fontSize: '10px', display: 'flex', gap: '8px' }}>
                    <div style={{display:'flex', alignItems:'center', gap:'4px'}}><div style={{width:8, height:8, background:'#EF9F27'}}></div> &lt;15</div>
                    <div style={{display:'flex', alignItems:'center', gap:'4px'}}><div style={{width:8, height:8, background:'#E53935'}}></div> ≥15</div>
                </div>
            </div>
            <div style={{ position: 'relative', flex: 1, minHeight: '180px' }}><canvas ref={canvasRef}></canvas></div>
        </div>
    );
};

const Chart3 = ({ distribution }) => {
    const canvasRef = React.useRef(null);
    const total = distribution.fg + distribution.rejection;
    const fgYield = total > 0 ? Math.round((distribution.fg / total) * 100) : 0;

    React.useEffect(() => {
        if (!window.Chart || !canvasRef.current) return;
        
        const centerTextPlugin = {
          id: 'centerText',
          beforeDraw: function(chart) {
            var width = chart.width, height = chart.height, ctx = chart.ctx;
            ctx.restore();
            var fontSize = (height / 114).toFixed(2);
            ctx.font = "bold " + fontSize + "em sans-serif";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#1B5E20";
            var text = fgYield + "%";
            var textX = Math.round((width - ctx.measureText(text).width) / 2), textY = height / 2 - 10;
            ctx.fillText(text, textX, textY);
            ctx.font = "bold " + (fontSize * 0.4) + "em sans-serif";
            ctx.fillStyle = "#888";
            var subText = "FG Yield";
            var subTextX = Math.round((width - ctx.measureText(subText).width) / 2), subTextY = height / 2 + 15;
            ctx.fillText(subText, subTextX, subTextY);
            ctx.save();
          }
        };

        const chart = new window.Chart(canvasRef.current, {
            type: 'doughnut',
            data: {
                labels: ['FG', 'Reject'],
                datasets: [{
                    data: [distribution.fg, distribution.rejection],
                    backgroundColor: ['#2E7D32', '#E53935'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                cutout: '72%',
                plugins: { legend: { display: false } }
            },
            plugins: [centerTextPlugin]
        });
        return () => chart.destroy();
    }, [distribution, fgYield]);

    return (
        <div style={{ background: '#FFFFFF', borderRadius: '8px', border: '0.5px solid #C8E6C9', padding: '10px 12px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold', color: '#1B5E20' }}><span style={{color: '#2E7D32'}}>●</span> FG & REJECTION YIELD</div>
                <div style={{ fontSize: '10px', display: 'flex', gap: '8px' }}>
                    <div style={{display:'flex', alignItems:'center', gap:'4px'}}><div style={{width:8, height:8, background:'#2E7D32'}}></div> FG</div>
                    <div style={{display:'flex', alignItems:'center', gap:'4px'}}><div style={{width:8, height:8, background:'#E53935'}}></div> Reject</div>
                </div>
            </div>
            <div style={{ position: 'relative', flex: 1, minHeight: '180px' }}><canvas ref={canvasRef}></canvas></div>
        </div>
    );
};

const Chart4 = ({ wipByStation }) => {
    const canvasRef = React.useRef(null);
    const labels = Object.keys(wipByStation);
    const data = Object.values(wipByStation);
    const CAPACITY = 100;
    const percentages = data.map(d => Math.min(100, (d / CAPACITY) * 100));

    useChart(canvasRef, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: percentages,
                backgroundColor: percentages.map(p => p > 85 ? '#E53935' : (p >= 60 ? '#FB8C00' : '#43A047'))
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { 
                y: { min: 0, max: 100, ticks: { callback: v => v + '%' }, grid: { color: '#E8F5E9' } },
                x: { grid: { display: false } }
            }
        }
    }, [wipByStation]);

    return (
        <div style={{ background: '#FFFFFF', borderRadius: '8px', border: '0.5px solid #C8E6C9', padding: '10px 12px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold', color: '#1B5E20' }}><span style={{color: '#FB8C00'}}>●</span> STATION-WISE LOAD</div>
                <div style={{ fontSize: '10px', display: 'flex', gap: '8px' }}>
                    <div style={{display:'flex', alignItems:'center', gap:'4px'}}><div style={{width:8, height:8, background:'#43A047'}}></div> &lt;60%</div>
                    <div style={{display:'flex', alignItems:'center', gap:'4px'}}><div style={{width:8, height:8, background:'#FB8C00'}}></div> 60–85%</div>
                    <div style={{display:'flex', alignItems:'center', gap:'4px'}}><div style={{width:8, height:8, background:'#E53935'}}></div> &gt;85%</div>
                </div>
            </div>
            <div style={{ position: 'relative', flex: 1, minHeight: '220px' }}><canvas ref={canvasRef}></canvas></div>
        </div>
    );
};

const Chart5 = ({ allDevices, filterShift }) => {
    const canvasRef = React.useRef(null);
    const hourlyData = React.useMemo(() => {
        const activeShift = filterShift === 'all' ? 'General' : filterShift;
        const st = { 'General': {start:10, duration:8}, 'Shift A': {start:6, duration:8}, 'Shift B': {start:14, duration:8}, 'Shift C': {start:22, duration:8} }[activeShift] || {start:10, duration:8};
        const shiftHours = Array.from({ length: st.duration }, (_, i) => (st.start + i) % 24);
        
        const isToday = d => {
            if (!d) return false;
            const date = new Date(d);
            const now = new Date();
            return !isNaN(date.getTime()) && date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        }

        const outputs = allDevices.filter(u => u.status?.toLowerCase() === 'completed' && u.updatedAt && isToday(u.updatedAt));
        const inputs = allDevices.filter(u => u.createdAt && isToday(u.createdAt));

        return shiftHours.map(h => {
            const hourStr = h.toString().padStart(2, '0');
            const inCount = inputs.filter(u => new Date(u.createdAt).getHours() === h).length;
            const outCount = outputs.filter(u => new Date(u.updatedAt).getHours() === h).length;
            return { label: `${hourStr}:00`, input: inCount, output: outCount };
        });
    }, [allDevices, filterShift]);

    useChart(canvasRef, {
        type: 'bar',
        data: {
            labels: hourlyData.map(d => d.label),
            datasets: [
                { label: 'Input', data: hourlyData.map(d => d.input), backgroundColor: '#42A5F5' },
                { label: 'Output', data: hourlyData.map(d => d.output), backgroundColor: '#2E7D32' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { grid: { color: '#E8F5E9' } }, x: { grid: { display: false } } }
        }
    }, [hourlyData]);

    return (
        <div style={{ background: '#FFFFFF', borderRadius: '8px', border: '0.5px solid #C8E6C9', padding: '10px 12px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold', color: '#1B5E20' }}><span style={{color: '#1565C0'}}>●</span> INPUT VS OUTPUT</div>
                <div style={{ fontSize: '10px', display: 'flex', gap: '8px' }}>
                    <div style={{display:'flex', alignItems:'center', gap:'4px'}}><div style={{width:8, height:8, background:'#42A5F5'}}></div> Input</div>
                    <div style={{display:'flex', alignItems:'center', gap:'4px'}}><div style={{width:8, height:8, background:'#2E7D32'}}></div> Output</div>
                </div>
            </div>
            <div style={{ position: 'relative', flex: 1, minHeight: '220px' }}><canvas ref={canvasRef}></canvas></div>
        </div>
    );
};

const Chart6 = ({ paretoData }) => {
    const canvasRef = React.useRef(null);
    useChart(canvasRef, {
        type: 'bar',
        data: {
            labels: paretoData.map(d => d.name),
            datasets: [
                {
                    label: 'Count',
                    data: paretoData.map(d => d.count),
                    backgroundColor: '#E53935',
                    yAxisID: 'y',
                    order: 3
                },
                {
                    label: 'Cum %',
                    data: paretoData.map(d => d.cumulativePct),
                    type: 'line',
                    borderColor: '#1B5E20',
                    backgroundColor: '#1B5E20',
                    borderWidth: 2,
                    pointRadius: 4,
                    yAxisID: 'y1',
                    order: 2
                },
                {
                    label: '80% Line',
                    data: paretoData.map(() => 80),
                    type: 'line',
                    borderColor: '#FB8C00',
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    borderWidth: 2,
                    yAxisID: 'y1',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { type: 'linear', position: 'left', title: { display: true, text: 'Count', font: { size: 10 } }, grid: { color: '#E8F5E9' } },
                y1: { type: 'linear', position: 'right', min: 0, max: 100, title: { display: true, text: 'Cum %', font: { size: 10 } }, ticks: { callback: v => v + '%' }, grid: { display: false } },
                x: { grid: { display: false } }
            }
        }
    }, [paretoData]);

    return (
        <div style={{ background: '#FFFFFF', borderRadius: '8px', border: '0.5px solid #C8E6C9', padding: '10px 12px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold', color: '#1B5E20' }}><span style={{color: '#E53935'}}>●</span> FAILURE PARETO</div>
                <div style={{ fontSize: '10px', display: 'flex', gap: '8px' }}>
                    <div style={{display:'flex', alignItems:'center', gap:'4px'}}><div style={{width:8, height:8, background:'#E53935'}}></div> Count</div>
                    <div style={{display:'flex', alignItems:'center', gap:'4px'}}><div style={{width:8, height:8, borderRadius:'50%', background:'#1B5E20'}}></div> Cum %</div>
                    <div style={{display:'flex', alignItems:'center', gap:'4px'}}><div style={{width:16, borderTop:'2px dashed #FB8C00'}}></div> 80% Line</div>
                </div>
            </div>
            <div style={{ position: 'relative', flex: 1, minHeight: '180px' }}><canvas ref={canvasRef}></canvas></div>
        </div>
    );
};
"""

start_marker1 = "/* ─── Mini Sparkline ─── */"
end_marker1 = "/* ─── Dashboard Component ─── */"

main_dashboard_new = """    // ────── Main Dashboard ──────
    
    // Real-time clock hook
    const [currentTime, setCurrentTime] = React.useState(new Date().toLocaleTimeString());
    React.useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="animate-fade-in" style={{ 
            background: '#F0FFF4', 
            minHeight: '100vh', 
            height: '100vh', 
            overflow: 'hidden', 
            display: 'grid', 
            gridTemplateRows: 'auto auto auto 1fr', 
            fontFamily: '"Inter", "Segoe UI", sans-serif',
            margin: '-1rem -1.5rem',
            padding: '0'
        }}>
            {/* Header */}
            <div style={{ background: '#1B5E20', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ background: '#43A047', color: '#FFF', fontWeight: 'bold', padding: '6px 12px', borderRadius: '4px' }}>TOHANDS</div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ color: '#FFF', fontSize: '15px', fontWeight: 'bold', lineHeight: 1.2 }}>Assembly Line Monitor</div>
                        <div style={{ color: '#A5D6A7', fontSize: '12px', fontWeight: 600 }}>{projectDisp} — MES Operations Dashboard</div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', color: '#FFF', fontSize: '13px', fontWeight: 'bold' }}>
                    <div style={{ letterSpacing: '0.05em' }}>SHIFT: {metrics.activeShift.toUpperCase()}</div>
                    <div style={{ letterSpacing: '0.05em' }}>LINE ID: L1-MAIN</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#81C784' }}>
                        <span style={{ fontSize: '10px' }}>●</span> RUNNING
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '4px 12px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '15px', letterSpacing: '0.1em' }}>
                        {currentTime}
                    </div>
                </div>
            </div>

            {/* Sub-bar with Filters and Export */}
            <div style={{ padding: '8px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #C8E6C9', background: '#FFFFFF' }}>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', background: '#f8f9fa', padding: '4px 8px', borderRadius: '6px', border: '1px solid #E0E0E0' }}>
                    <div style={{ position: 'relative' }}>
                        <Filter size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                        <select className="text-xs font-bold border-none bg-transparent" style={{ paddingLeft: 26, minHeight: 32, cursor: 'pointer', outline: 'none' }} value={filterOperator} onChange={e => setFilterOperator(e.target.value)}>
                            <option value="all">Every Operator</option><option value="Admin">Admin Only</option><option value="SYSTEM_ADMIN">System Admin</option>
                        </select>
                    </div>
                    <div style={{ borderRight: '1px solid var(--border)', width: 1, margin: '4px 0', height: '20px' }} />
                    <select className="text-xs font-bold border-none bg-transparent" style={{ minHeight: 32, padding: '0 8px', cursor: 'pointer', outline: 'none' }} value={filterShift} onChange={e => setFilterShift(e.target.value)}>
                        <option value="all">All Shifts</option><option value="General">General</option><option value="Shift A">Shift A</option><option value="Shift B">Shift B</option><option value="Shift C">Shift C</option>
                    </select>
                    <div style={{ borderRight: '1px solid var(--border)', width: 1, margin: '4px 0', height: '20px' }} />
                    <select className="text-xs font-bold border-none bg-transparent" style={{ minHeight: 32, padding: '0 8px', cursor: 'pointer', outline: 'none' }} value={filterProduct} onChange={e => setFilterProduct(e.target.value)}>
                        <option value="all">All Products</option>
                        {Array.from(new Set(allProjectDevices.map(d => d.details?.productType || d.details?.model).filter(Boolean))).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <div style={{ borderRight: '1px solid var(--border)', width: 1, margin: '4px 0', height: '20px' }} />
                    <select className="text-xs font-bold border-none bg-transparent" style={{ minHeight: 32, padding: '0 8px', cursor: 'pointer', outline: 'none' }} value={filterLocation} onChange={e => setFilterLocation(e.target.value)}>
                        <option value="all">All Locations</option><option value="FG">Finished Goods</option>
                        {Object.values(store.stations || {}).map(s => <option key={s.id} value={s.name}>{s.name.toUpperCase()}</option>)}
                    </select>
                </div>

                <div className="tab-switcher" style={{ margin: 0, padding: 2, background: '#f8f9fa', border: '1px solid #E0E0E0' }}>
                    {['Device', 'Peripherals', 'Inward QC'].map(p => (
                        <button key={p} className={`tab-item ${project === p ? 'active' : ''}`} onClick={() => setProject(p)} style={{ fontSize: '12px', padding: '6px 16px', fontWeight: 600, border: 'none', background: project === p ? '#fff' : 'transparent', borderRadius: 6, boxShadow: project === p ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: project === p ? '#1B5E20' : '#666', cursor: 'pointer' }}>
                            {getDisplayName('projects', p)}
                        </button>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ position: 'relative' }}>
                        <button className="btn btn-secondary" style={{ padding: '6px 16px', fontSize: '12px', fontWeight: 700, gap: '6px', border: '1px solid #E0E0E0', background: '#fff' }} onClick={() => setShowExport(!showExport)}>
                            <Download size={14} /> <span className="hide-mobile">Export</span>
                        </button>
                        {showExport && (
                            <div className="card animate-fade-in" style={{ position: 'absolute', top: 'calc(100% + 0.5rem)', right: 0, zIndex: 100, minWidth: 160, padding: '0.4rem', border: '1px solid #C8E6C9', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                <button className="nav-item" onClick={() => handleExport('xlsx')} style={{ padding: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}><FileSpreadsheet size={16} color="#1D6F42" /> <span style={{fontWeight:600, color:'#333'}}>Excel Format</span></button>
                                <button className="nav-item" onClick={() => handleExport('csv')} style={{ padding: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', marginTop: '4px' }}><FileSpreadsheet size={16} color="#666" /> <span style={{fontWeight:600, color:'#333'}}>CSV Format</span></button>
                            </div>
                        )}
                    </div>
                    <button className="btn btn-secondary" style={{ padding: '6px 10px', width: 'auto', border: '1px solid #E0E0E0', background: '#fff' }} onClick={() => window.location.reload()}><RefreshCw size={14} /></button>
                </div>
            </div>

            {/* KPI Cards Row */}
            <div style={{ padding: '16px 24px 0 24px', display: 'flex', gap: '16px' }}>
                <KPICard label="DAILY PRODUCTION" value={metrics.todayOutput} subText={`Target: 50 · ${Math.round((metrics.todayOutput / 50) * 100) || 0}%`} color="#2E7D32" />
                <KPICard label="DAILY REJECTION" value={metrics.todayRejection} subText={`Rejection Rate: ${metrics.totalInputs > 0 ? ((metrics.todayRejection / metrics.totalInputs) * 100).toFixed(1) : 0}%`} color="#E53935" isRed={true} />
                <KPICard label="FG YIELD" value={`${metrics.avgFPY}%`} subText={`FG Units: ${metrics.fgCount}`} color="#2E7D32" />
                <KPICard label="TODAY OUTPUT" value={metrics.todayOutput} subText={`Yield rate · ${metrics.totalInputs > 0 ? ((metrics.todayOutput / metrics.totalInputs) * 100).toFixed(1) : 0}%`} color="#FB8C00" />
                <KPICard label="DOWNTIME" value={metrics.alerts?.length || 0} subText={`${metrics.alerts?.length || 0} incidents today`} color="#FB8C00" />
            </div>

            {/* Charts Grid - Fill viewport */}
            <div style={{ padding: '16px 24px 24px 24px', overflowY: 'hidden', display: 'grid', gridTemplateRows: '1fr 1fr 1fr', gap: '16px', height: '100%' }}>
                {/* Row 1 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', minHeight: '0' }}>
                    <Chart1 hourlyData={metrics.hourlyData} />
                    <Chart2 allDevices={allProjectDevices} filterShift={filterShift} />
                    <Chart3 distribution={metrics.distribution} />
                </div>
                {/* Row 2 */}
                <div style={{ display: 'grid', gridTemplateColumns: '60% 1fr', gap: '16px', minHeight: '0' }}>
                    <Chart4 wipByStation={metrics.wipByStation} />
                    <Chart5 allDevices={allProjectDevices} filterShift={filterShift} />
                </div>
                {/* Row 3 */}
                <div style={{ minHeight: '0' }}>
                    <Chart6 paretoData={metrics.paretoData} />
                </div>
            </div>
        </div>
    );
}
"""

p1 = content.find(start_marker1)
p2 = content.find(end_marker1)
content = content[:p1] + new_widgets + '\n' + content[p2:]

start_marker2 = "    // ────── Main Dashboard ──────"
end_marker2 = "export default Dashboard;"
p3 = content.find(start_marker2)
p4 = content.rfind(end_marker2)

content = content[:p3] + main_dashboard_new + '\n};\n\n' + content[p4:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Transformation successful")
