import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Prices from './pages/Prices';
import Settings from './pages/Settings';
import Knowledge from './pages/Knowledge';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <BrowserRouter>
      <div className="layout">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="mobile-header">
            <button className="mobile-menu" onClick={() => setSidebarOpen(true)}>☰</button>
            <span style={{ fontWeight: 700, fontSize: 14 }}>א.א קידוחים</span>
          </div>
          <div className="main">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/prices" element={<Prices />} />
              <Route path="/knowledge" element={<Knowledge />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </div>
      </div>
      <div id="toast" className="toast" />
    </BrowserRouter>
  );
}
