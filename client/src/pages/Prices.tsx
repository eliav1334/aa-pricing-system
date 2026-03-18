import { useEffect, useState, useCallback } from 'react';
import { api } from '../utils/api';
import { fmt } from '../utils/format';
import { showToast } from '../hooks/useToast';
import Modal from '../components/Modal';
import type { PriceItem } from '../types';

interface PricesRes {
  items: PriceItem[];
  total: number;
  page: number;
  pages: number;
  chapters: string[];
}

export default function Prices() {
  const [data, setData] = useState<PricesRes | null>(null);
  const [search, setSearch] = useState('');
  const [chapter, setChapter] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<Partial<PriceItem> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (chapter) params.set('chapter', chapter);
    params.set('page', String(page));
    params.set('limit', '50');
    api.get<PricesRes>(`/prices?${params}`).then(setData);
  }, [search, chapter, page]);

  useEffect(() => { load(); }, [load]);

  // Debounce search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const save = async () => {
    if (!modal?.name?.trim()) { showToast('שם חובה'); return; }
    setSaving(true);
    try {
      if (modal.id) {
        await api.put(`/prices/${modal.id}`, modal);
      } else {
        await api.post('/prices', modal);
      }
      showToast('נשמר');
      setModal(null);
      load();
    } catch (e: any) { showToast('שגיאה: ' + e.message); }
    finally { setSaving(false); }
  };

  const del = async (id: string) => {
    await api.del(`/prices/${id}`);
    showToast('נמחק');
    load();
  };

  const u = (k: string, v: any) => setModal(prev => prev ? { ...prev, [k]: v } : prev);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">מחירון</div>
          <div className="page-sub">{data ? fmt(data.total) : '...'} פריטים</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="search-box">
            <span className="s-ico">🔍</span>
            <input placeholder="חיפוש..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={() => setModal({ name: '', unit: '', price: 0, chapter: '', category: '', supplier: '' })}>+ מחיר חדש</button>
        </div>
      </div>

      {/* Chapter chips */}
      {data && data.chapters.length > 0 && (
        <div className="chapter-chips">
          <button className={`chip${!chapter ? ' active' : ''}`} onClick={() => { setChapter(''); setPage(1); }}>כל הפרקים</button>
          {data.chapters.map(ch => (
            <button key={ch} className={`chip${chapter === ch ? ' active' : ''}`} onClick={() => { setChapter(ch); setPage(1); }}>{ch}</button>
          ))}
        </div>
      )}

      <div className="card">
        {!data || data.items.length === 0 ? (
          <div className="empty-state">
            <div className="ico">☰</div>
            <div className="msg">אין פריטים</div>
          </div>
        ) : (
          <>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>פרק</th><th>שם</th><th>יחידה</th><th>מחיר</th><th>ספק</th><th></th></tr></thead>
                <tbody>
                  {data.items.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{p.chapter}</td>
                      <td style={{ fontWeight: 500 }}>{p.name}</td>
                      <td>{p.unit}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(p.price)} ₪</td>
                      <td style={{ fontSize: 12, color: 'var(--text2)' }}>{p.supplier}</td>
                      <td>
                        <button className="btn-ghost btn-sm" onClick={() => setModal(p)}>✎</button>
                        <button className="btn-ghost btn-sm" onClick={() => del(p.id)} style={{ color: 'var(--red)' }}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.pages > 1 && (
              <div className="pager">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>הקודם</button>
                <span>עמוד {data.page} מתוך {data.pages}</span>
                <button disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>הבא</button>
              </div>
            )}
          </>
        )}
      </div>

      {modal && (
        <Modal
          title={modal.id ? 'עריכת מחיר' : 'מחיר חדש'}
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{modal.id ? 'שמור' : 'צור'}</button>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>ביטול</button>
            </>
          }
        >
          <div className="form-grid">
            <div className="form-group full"><label className="form-label">שם *</label><input className="form-input" value={modal.name || ''} onChange={e => u('name', e.target.value)} autoFocus /></div>
            <div className="form-group"><label className="form-label">יחידה</label><input className="form-input" value={modal.unit || ''} onChange={e => u('unit', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">מחיר</label><input className="form-input" type="number" min={0} step="any" value={modal.price || ''} onChange={e => u('price', +e.target.value)} /></div>
            <div className="form-group"><label className="form-label">פרק</label><input className="form-input" value={modal.chapter || ''} onChange={e => u('chapter', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">ספק</label><input className="form-input" value={modal.supplier || ''} onChange={e => u('supplier', e.target.value)} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}
