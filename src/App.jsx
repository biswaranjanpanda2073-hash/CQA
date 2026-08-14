// Build v1.0.1 - Station Logic Polish
import React, { useState, useEffect } from 'react';
import './index.css';
import { CQAProvider, useCQA } from './hooks/useCQA';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Stations, { StationExecutionView } from './components/Stations';
import InfoCentre from './components/InfoCentre';
import UserControl from './components/UserControl';
import { UserControlSection, MaintenanceSection } from './components/SettingsModule';
import Sidebar from './components/Sidebar';
import TopNav from './components/TopNav';
import BaanModule from './components/BaanModule';

const AppContent = () => {
  const { store } = useCQA();
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('cqa_user');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [activeSection, setActiveSection] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const section = params.get('section');
      if (section && ['dashboard', 'operation', 'info', 'baan', 'profile', 'users', 'maintenance'].includes(section)) {
        return section;
      }
    } catch (e) { }
    return 'dashboard';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('cqa_theme') || 'light');

  // Persist user session
  useEffect(() => {
    if (user) {
      localStorage.setItem('cqa_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('cqa_user');
    }
  }, [user]);

  // Theme management
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cqa_theme', theme);
  }, [theme]);

  // Dynamic Browser Tab Title
  useEffect(() => {
    if (!user) {
      document.title = 'CQA – Industrial MES';
      return;
    }

    // If it's a standalone station tab, we skip to let StationExecutionView handle it
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('stationId')) return;

    let title = 'CQA – Industrial MES';
    switch (activeSection) {
      case 'dashboard': title = 'CQA – Dashboard'; break;
      case 'info': title = 'CQA – Info Centre'; break;
      case 'baan': title = 'CQA – BAAN Inventory'; break;
      case 'operation': title = 'CQA – Stations'; break;
      case 'profile': title = 'CQA – Profile'; break;
      case 'users': title = 'CQA – User Management'; break;
      case 'maintenance': title = 'CQA – Maintenance'; break;
    }
    document.title = title;
  }, [user, activeSection]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  const handleLogout = () => {
    setUser(null);
    setActiveSection('dashboard');
  };

  // ─── Standalone Station View ───
  const params = new URLSearchParams(window.location.search);
  const directStationId = params.get('stationId');
  const directProject = params.get('project');

  if (directStationId && directProject && user) {
    return (
      <div className="standalone-station-container" data-theme={theme}>
        <StationExecutionView
          stationId={parseInt(directStationId)}
          project={directProject}
          user={user}
        />
      </div>
    );
  }

  // ─── Login Screen ───
  if (!user) return <Login onLogin={setUser} />;

  // ─── Maintenance Lock ───
  const isMaintenanceMode = store.settings?.maintenanceMode;
  if (isMaintenanceMode && user.role !== 'Admin') {
    return (
      <div className="flex-center" style={{
        minHeight: '100vh',
        background: 'var(--bg-main)',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <div className="card animate-fade-in" style={{ maxWidth: 480, padding: '3rem 2rem' }}>
          <div className="flex-center" style={{
            width: 80,
            height: 80,
            background: 'var(--warning-bg)',
            borderRadius: '50%',
            margin: '0 auto 1.5rem',
          }}>
            <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="var(--warning)" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="font-extrabold" style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>System Maintenance</h1>
          <p className="text-muted font-semibold" style={{ lineHeight: 1.7 }}>
            CQA MES is currently undergoing scheduled maintenance. Production terminals are temporarily offline.
          </p>
          <button className="btn btn-secondary" style={{ marginTop: '2rem', width: '100%' }} onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // ─── Section Renderer ───
  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard': return <Dashboard toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />;
      case 'operation': return <Stations user={user} />;
      case 'info': return <InfoCentre />;
      case 'baan': return <BaanModule user={user} />;
      case 'profile': return <UserControl user={user} />;
      case 'users': return user.role === 'Admin' ? <UserControlSection user={user} /> : <UserControl user={user} />;
      case 'maintenance': return user.role === 'Admin' ? <MaintenanceSection user={user} /> : <Dashboard toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />;
      default: return <Dashboard toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />;
    }
  };

  // ─── Main Layout ───
  return (
    <div className="main-layout" data-theme={theme}>
      <Sidebar
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        onLogout={handleLogout}
        user={user}
        isOpen={sidebarOpen}
        setOpen={setSidebarOpen}
      />
      <div className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`} onClick={() => setSidebarOpen(false)} />
      <div className="layout-right">
        {activeSection !== 'dashboard' && (
          <TopNav
            theme={theme}
            toggleTheme={toggleTheme}
            activeSection={activeSection}
            user={user}
            onSectionChange={setActiveSection}
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />
        )}
        <main className={`main-content ${activeSection === 'dashboard' ? 'p-0 h-100' : ''}`}>
          <div className={activeSection === 'dashboard' ? 'h-100 p-0' : 'content-inner'}>
            {renderSection()}
          </div>
        </main>
      </div>
    </div>
  );
};

const App = () => (
  <CQAProvider>
    <AppContent />
  </CQAProvider>
);

export default App;
