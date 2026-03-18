import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import type { Project } from '../types';

const NAV = [
  { path: '/', label: 'דשבורד', ico: '📊' },
  { path: '/projects', label: 'פרויקטים', ico: '🏗' },
  { path: '/prices', label: 'מחירון', ico: '☰' },
  { path: '/settings', label: 'הגדרות', ico: '⚙' },
];

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showProjects, setShowProjects] = useState(false);

  useEffect(() => {
    api.get<Project[]>('/projects').then(setProjects).catch(() => {});
  }, []);

  // Auto-expand when on a project page
  const onProjectPage = location.pathname.startsWith('/projects/');

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path;
  };

  const statusDot = (status: string) => {
    const colors: Record<string, string> = {
      'הצעה': '#5B6CFF', 'בביצוע': '#FFAA33', 'הושלם': '#00BA88', 'אושר': '#7B61FF', 'בוטל': '#A0A3BD',
    };
    return colors[status] || '#A0A3BD';
  };

  return (
    <>
      {open && <div onClick={onClose} style={{ display: 'block', position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 45 }} />}
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-head">
          <div className="sidebar-brand" style={{ cursor: 'pointer' }} onClick={() => { navigate('/'); onClose(); }}>
            <div className="brand-icon">א.א</div>
            <div>
              <div className="brand-name">א.א קידוחים</div>
              <div className="brand-sub">מערכת תמחור</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(n => (
            <div key={n.path}>
              <button
                className={`nav-btn${isActive(n.path) || (n.path === '/projects' && onProjectPage) ? ' active' : ''}`}
                onClick={() => {
                  if (n.path === '/projects') {
                    setShowProjects(prev => !prev);
                    navigate(n.path);
                  } else {
                    navigate(n.path);
                  }
                  onClose();
                }}
              >
                <span className="ico">{n.ico}</span>
                {n.label}
                {n.path === '/projects' && projects.length > 0 && (
                  <span style={{
                    marginRight: 'auto', fontSize: 10, color: '#A0A3BD',
                    transform: showProjects || onProjectPage ? 'rotate(90deg)' : 'none',
                    transition: 'transform .2s',
                  }}>▶</span>
                )}
              </button>

              {/* Project sub-menu */}
              {n.path === '/projects' && (showProjects || onProjectPage) && projects.length > 0 && (
                <div style={{ paddingRight: 20, marginBottom: 4 }}>
                  {projects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { navigate(`/projects/${p.id}`); onClose(); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 12px', borderRadius: 8, width: '100%',
                        textAlign: 'right', border: 'none', cursor: 'pointer',
                        fontFamily: "'Inter','Heebo',sans-serif", fontSize: 12,
                        fontWeight: location.pathname === `/projects/${p.id}` ? 700 : 500,
                        color: location.pathname === `/projects/${p.id}` ? '#5B6CFF' : '#6E7191',
                        background: location.pathname === `/projects/${p.id}` ? '#EEEEFF' : 'transparent',
                        transition: 'all .12s', marginBottom: 1,
                      }}
                      onMouseEnter={e => { if (location.pathname !== `/projects/${p.id}`) e.currentTarget.style.background = '#F7F7FC'; }}
                      onMouseLeave={e => { if (location.pathname !== `/projects/${p.id}`) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: statusDot(p.status), flexShrink: 0,
                      }} />
                      <span style={{
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">גרסה 2.0 — מקומי</div>
      </aside>
    </>
  );
}
