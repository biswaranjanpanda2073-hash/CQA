import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ─── Service Worker Registration + Update Detection ───────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

      // ── Poll for updates every 60 seconds ──
      setInterval(() => { reg.update(); }, 60_000);

      // ── Listen for UPDATE_AVAILABLE message from SW activate ──
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'UPDATE_AVAILABLE') {
          showUpdateBanner();
        }
      });

      // ── If a waiting SW exists already when page loads ──
      if (reg.waiting) showUpdateBanner();

      // ── Detect when a new SW starts waiting ──
      reg.addEventListener('updatefound', () => {
        const incoming = reg.installing;
        if (!incoming) return;
        incoming.addEventListener('statechange', () => {
          if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }
        });
      });

    } catch (err) {
      console.warn('[SW] Registration failed:', err);
    }
  });
}

// ─── Update Banner UI ─────────────────────────────────────────
function showUpdateBanner() {
  if (document.getElementById('cqa-update-banner')) return; // already shown

  const banner = document.createElement('div');
  banner.id = 'cqa-update-banner';
  Object.assign(banner.style, {
    position: 'fixed',
    bottom: '1.25rem',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '99999',
    display: 'flex',
    alignItems: 'center',
    gap: '0.875rem',
    padding: '0.875rem 1.25rem',
    borderRadius: '0.875rem',
    background: 'linear-gradient(135deg, #166534 0%, #14532d 100%)',
    color: '#fff',
    boxShadow: '0 8px 32px rgba(22,101,52,0.45)',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '0.875rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    animation: 'cqa-slide-up 0.35s cubic-bezier(0.34,1.56,0.64,1)',
    maxWidth: 'calc(100vw - 2rem)',
  });

  // Inject keyframe once
  if (!document.getElementById('cqa-banner-style')) {
    const style = document.createElement('style');
    style.id = 'cqa-banner-style';
    style.textContent = `
      @keyframes cqa-slide-up {
        from { opacity:0; transform: translateX(-50%) translateY(20px); }
        to   { opacity:1; transform: translateX(-50%) translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  const text = document.createElement('span');
  text.textContent = '🚀 New version available!';

  const reloadBtn = document.createElement('button');
  reloadBtn.textContent = 'Reload & Update';
  Object.assign(reloadBtn.style, {
    padding: '0.45rem 1rem',
    borderRadius: '0.5rem',
    border: '1.5px solid rgba(255,255,255,0.5)',
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
    fontFamily: 'inherit',
    fontSize: '0.825rem',
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: '0',
  });
  reloadBtn.onmouseover = () => { reloadBtn.style.background = 'rgba(255,255,255,0.25)'; };
  reloadBtn.onmouseout  = () => { reloadBtn.style.background = 'rgba(255,255,255,0.15)'; };
  reloadBtn.onclick = () => {
    // Tell waiting SW to activate, then reload
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        }, { once: true });
      } else {
        window.location.reload();
      }
    });
  };

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = '✕';
  Object.assign(dismissBtn.style, {
    padding: '0.25rem 0.5rem',
    border: 'none',
    background: 'transparent',
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'inherit',
    fontSize: '0.9rem',
    cursor: 'pointer',
    flexShrink: '0',
  });
  dismissBtn.onclick = () => banner.remove();

  banner.appendChild(text);
  banner.appendChild(reloadBtn);
  banner.appendChild(dismissBtn);
  document.body.appendChild(banner);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

