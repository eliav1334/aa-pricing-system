import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { showToast } from '../hooks/useToast';
import { fmtDate } from '../utils/format';
import Modal from '../components/Modal';
import type { Project } from '../types';
import { TYPES, STATUSES } from '../types';

const today = () => new Date().toISOString().split('T')[0];

const emptyProject = (): Partial<Project> => ({
  name: '', client: '', type: TYPES[0], address: '', date: today(),
  status: 'הצעה', notes: '', margin_percent: 15, overhead_percent: 0,
  insurance_percent: 0, vat_included: 0,
});

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<Partial<Project> | null>(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const load = () => api.get<Project[]>('/projects').then(setProjects);
  useEffect(() => { load(); }, []);

  const filtered = projects.filter(p =>
    !search || p.name.includes(search) || p.client.includes(search)
  );

  const save = async () => {
    if (!modal?.name?.trim()) { showToast('שם פרויקט חובה'); return; }
    setSaving(true);
    try {
      if (modal.id) {
        await api.put(`/projects/${modal.id}`, modal);
      } else {
        await api.post('/projects', modal);
      }
      showToast('נשמר בהצלחה');
      setModal(null);
      load();
    } catch (e: any) { showToast('שגיאה: ' + e.message); }
    finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!confirm('למחוק את הפרויקט?')) return;
    await api.del(`/projects/${id}`);
    showToast('נמחק');
    load();
  };

  const u = (k: string, v: any) => setModal(prev => prev ? { ...prev, [k]: v } : prev);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">פרויקטים</div>
          <div className="page-sub">{projects.length} פרויקטים</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="search-box">
            <span className="s-ico">🔍</span>
            <input placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={() => setModal(emptyProject())}>+ פרויקט חדש</button>
        </div>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="ico">📁</div>
            <div className="msg">אין פרויקטים</div>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>שם</th><th>לקוח</th><th>סוג</th><th>סטטוס</th><th>תאריך</th><th></th></tr></thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${p.id}`)}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>{p.client}</td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{p.type}</td>
                    <td><span className={`badge badge-${p.status === 'הצעה' ? 'quote' : p.status === 'בביצוע' ? 'active' : p.status === 'הושלם' ? 'done' : p.status === 'אושר' ? 'approved' : 'cancelled'}`}>{p.status}</span></td>
                    <td style={{ color: 'var(--text3)', fontSize: 12 }}>{fmtDate(p.date)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn-ghost btn-sm" onClick={() => setModal(p)}>✎</button>
                      <button className="btn-ghost btn-sm" onClick={() => del(p.id)} style={{ color: 'var(--red)' }}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <Modal
          title={modal.id ? 'עריכת פרויקט' : 'פרויקט חדש'}
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{modal.id ? 'שמור' : 'צור'}</button>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>ביטול</button>
            </>
          }
        >
          <div className="form-grid">
            <div className="form-group"><label className="form-label">שם פרויקט *</label><input className="form-input" value={modal.name || ''} onChange={e => u('name', e.target.value)} autoFocus /></div>
            <div className="form-group"><label className="form-label">לקוח</label><input className="form-input" value={modal.client || ''} onChange={e => u('client', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">סוג עבודה</label><select className="form-input" value={modal.type || ''} onChange={e => u('type', e.target.value)}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div className="form-group"><label className="form-label">סטטוס</label><select className="form-input" value={modal.status || ''} onChange={e => u('status', e.target.value)}>{STATUSES.map(s => <option key={s.id}>{s.id}</option>)}</select></div>
            <div className="form-group"><label className="form-label">כתובת</label><input className="form-input" value={modal.address || ''} onChange={e => u('address', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">תאריך</label><input className="form-input" type="date" value={modal.date || ''} onChange={e => u('date', e.target.value)} /></div>
            <div className="form-group full">
              <label className="form-label">מרווח קבלני — {modal.margin_percent || 0}%</label>
              <div className="range-row">
                <input type="range" min={0} max={50} value={modal.margin_percent || 0} onChange={e => u('margin_percent', +e.target.value)} />
                <span className="range-val">{modal.margin_percent || 0}%</span>
              </div>
            </div>
            <div className="form-group"><label className="form-label">תקורות %</label><input className="form-input" type="number" min={0} max={30} value={modal.overhead_percent || 0} onChange={e => u('overhead_percent', +e.target.value)} /></div>
            <div className="form-group"><label className="form-label">ביטוח %</label><input className="form-input" type="number" min={0} max={20} value={modal.insurance_percent || 0} onChange={e => u('insurance_percent', +e.target.value)} /></div>
            <div className="form-group full"><label className="form-label">הערות</label><textarea className="form-input" value={modal.notes || ''} onChange={e => u('notes', e.target.value)} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}
