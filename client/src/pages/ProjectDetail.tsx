import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { fmt } from '../utils/format';
import { showToast } from '../hooks/useToast';
import Modal from '../components/Modal';
import SmartImport from '../components/SmartImport';
import ProjectDocs from '../components/ProjectDocs';
import type { Project, CostItem } from '../types';
import { CATEGORIES, UNITS } from '../types';

const T = {
  card: '#FFFFFF', border: '#E4E4EE', bg: '#F7F7FC',
  text1: '#1E1E2D', text2: '#6E7191', text3: '#A0A3BD',
  accent: '#5B6CFF', accentBg: '#EEEEFF',
  cta: '#F97316', green: '#00BA88', greenBg: '#E6F9F1',
  red: '#FF6B6B', redBg: '#FFF0F0', orange: '#FFAA33', orangeBg: '#FFF5E6',
  purple: '#7B61FF', purpleBg: '#F0EDFF',
  f: "'Inter','Heebo',sans-serif",
};

type Tab = 'boq' | 'docs' | 'quote' | 'tools';
type SortKey = 'category' | 'description' | 'unit' | 'quantity' | 'unit_price' | 'total';
type SortDir = 'asc' | 'desc';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [proj, setProj] = useState<Project | null>(null);
  const [costs, setCosts] = useState<CostItem[]>([]);
  const [tab, setTab] = useState<Tab>('boq');
  const [modal, setModal] = useState<Partial<CostItem> | null>(null);
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('category');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const load = () => {
    if (!id) return;
    api.get<Project>(`/projects/${id}`).then(setProj).catch(() => navigate('/projects'));
    api.get<CostItem[]>(`/costs/project/${id}`).then(setCosts);
  };
  useEffect(() => { load(); }, [id]);

  const sorted = useMemo(() => [...costs].sort((a, b) => {
    let av: any = a[sortKey], bv: any = b[sortKey];
    if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
    return sortDir === 'asc' ? String(av || '').localeCompare(String(bv || ''), 'he') : String(bv || '').localeCompare(String(av || ''), 'he');
  }), [costs, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => { if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('asc'); } };

  const byCat = useMemo(() => { const m: Record<string, CostItem[]> = {}; costs.forEach(c => (m[c.category] ||= []).push(c)); return m; }, [costs]);
  const subtotal = costs.reduce((s, c) => s + c.total, 0);
  const overhead = subtotal * ((proj?.overhead_percent || 0) / 100);
  const insurance = subtotal * ((proj?.insurance_percent || 0) / 100);
  const margin = (subtotal + overhead + insurance) * ((proj?.margin_percent || 0) / 100);
  const beforeVat = subtotal + overhead + insurance + margin;
  const vat = proj?.vat_included ? beforeVat * 0.17 : 0;
  const finalPrice = beforeVat + vat;

  if (!proj) return <div style={{ padding: 40, textAlign: 'center', color: T.text3, fontFamily: T.f }}>טוען...</div>;

  const emptyCost = (): Partial<CostItem> => ({ project_id: id, category: 'labor', description: '', unit: UNITS[0], quantity: 1, unit_price: 0, is_actual: 0 });
  const saveCost = async () => {
    if (!modal?.description?.trim()) { showToast('תיאור חובה'); return; }
    setSaving(true);
    try { if (modal.id) await api.put(`/costs/${modal.id}`, modal); else await api.post('/costs', { ...modal, project_id: id }); showToast('נשמר'); setModal(null); load(); }
    catch (e: any) { showToast('שגיאה: ' + e.message); } finally { setSaving(false); }
  };
  const delCost = async (cid: string) => { if (!confirm('למחוק?')) return; await api.del(`/costs/${cid}`); showToast('נמחק'); load(); };
  const u = (k: string, v: any) => setModal(prev => prev ? { ...prev, [k]: v } : prev);

  const TABS: { id: Tab; label: string; ico: string }[] = [
    { id: 'boq', label: 'כתב כמויות', ico: '📋' },
    { id: 'docs', label: 'מסמכים', ico: '📎' },
    { id: 'quote', label: 'הצעת מחיר', ico: '💰' },
    { id: 'tools', label: 'כלי תמחור', ico: '⚙' },
  ];

  const SortTh = ({ label, field, w }: { label: string; field: SortKey; w?: string }) => (
    <th onClick={() => toggleSort(field)} style={{
      padding: '8px 12px', fontSize: 11, fontWeight: 700, color: sortKey === field ? T.accent : T.text3,
      textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'right',
      borderBottom: `2px solid ${sortKey === field ? T.accent : T.border}`, background: '#FAFAFF',
      fontFamily: T.f, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', width: w,
    }}>{label} {sortKey === field && <span style={{ fontSize: 9 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}</th>
  );

  return (
    <div style={{ fontFamily: T.f }}>
      {/* ═══ PROJECT HEADER ═══ */}
      <div style={{ background: T.card, borderRadius: 18, boxShadow: '0 10px 40px rgba(0,0,0,.03)', border: `1.5px solid ${T.border}`, marginBottom: 20, overflow: 'hidden' }}>
        {/* Top bar */}
        <div style={{ padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <button onClick={() => navigate('/projects')} style={{ fontFamily: T.f, fontSize: 13, color: T.text3, background: 'none', border: 'none', cursor: 'pointer', marginBottom: 8 }}>← חזרה לפרויקטים</button>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: T.text1, letterSpacing: '-.03em', margin: 0 }}>{proj.name}</h1>
            <p style={{ fontSize: 14, color: T.text2, marginTop: 6, fontWeight: 600 }}>
              {proj.client} · {proj.date} · {proj.type || 'לא צוין'} · רווח {proj.margin_percent}%
            </p>
          </div>
          {/* Summary mini */}
          <div style={{ textAlign: 'left', minWidth: 180 }}>
            <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>מחיר סופי</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: T.text1, letterSpacing: '-.03em' }}>{fmt(finalPrice)} ₪</div>
            <div style={{ fontSize: 12, color: T.text3 }}>{costs.length} סעיפים · {Object.keys(byCat).length} קטגוריות</div>
          </div>
        </div>

        {/* Tab navigation */}
        <div style={{ display: 'flex', borderTop: `1px solid ${T.border}`, padding: '0 20px' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              fontFamily: T.f, padding: '14px 20px', fontSize: 14, fontWeight: 600,
              color: tab === t.id ? T.accent : T.text3, background: 'none', border: 'none',
              borderBottom: tab === t.id ? `3px solid ${T.accent}` : '3px solid transparent',
              cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>{t.ico}</span> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ TAB: כתב כמויות ═══ */}
      {tab === 'boq' && (
        <>
          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text1 }}>כתב כמויות ({costs.length})</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowImport(true)} style={{ fontFamily: T.f, padding: '9px 18px', borderRadius: 12, border: `1.5px solid ${T.border}`, background: T.card, fontSize: 13, fontWeight: 600, color: T.text2, cursor: 'pointer' }}>📂 הוסף קובץ</button>
              <button onClick={() => setModal(emptyCost())} style={{ fontFamily: T.f, padding: '9px 18px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg, ${T.cta}, #EA580C)`, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', boxShadow: '0 2px 8px rgba(249,115,22,.2)' }}>+ הוסף סעיף</button>
            </div>
          </div>

          {/* Summary bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'סיכום ביניים', val: fmt(subtotal), color: T.text1 },
              { label: `רווח (${proj.margin_percent}%)`, val: fmt(margin), color: T.green },
              { label: 'מע"מ', val: proj.vat_included ? fmt(vat) : '—', color: T.text3 },
              { label: 'מחיר סופי', val: fmt(finalPrice), color: T.cta },
            ].map(s => (
              <div key={s.label} style={{ background: T.card, borderRadius: 14, padding: '14px 18px', border: `1.5px solid ${T.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: '-.02em', marginTop: 4 }}>{s.val} ₪</div>
              </div>
            ))}
          </div>

          {/* Cost table */}
          {costs.length === 0 ? (
            <div style={{ background: T.card, borderRadius: 18, border: `1.5px solid ${T.border}`, padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: .3 }}>📋</div>
              <div style={{ fontSize: 16, color: T.text3, fontWeight: 500, marginBottom: 16 }}>כתב הכמויות ריק</div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => setShowImport(true)} style={{ fontFamily: T.f, padding: '10px 24px', borderRadius: 12, border: `1.5px solid ${T.border}`, background: T.card, fontSize: 14, fontWeight: 600, color: T.text2, cursor: 'pointer' }}>📂 ייבא מקובץ</button>
                <button onClick={() => setModal(emptyCost())} style={{ fontFamily: T.f, padding: '10px 24px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg, ${T.cta}, #EA580C)`, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>+ הוסף ידנית</button>
              </div>
            </div>
          ) : (
            <div style={{ background: T.card, borderRadius: 18, border: `1.5px solid ${T.border}`, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.f }}>
                  <thead><tr>
                    <th style={{ ...thS, width: 40 }}>#</th>
                    <SortTh label="קטגוריה" field="category" w="110px" />
                    <SortTh label="תאור סעיף" field="description" />
                    <SortTh label="יח' מידה" field="unit" w="70px" />
                    <SortTh label="כמות" field="quantity" w="70px" />
                    <SortTh label="מחיר יחידה" field="unit_price" w="100px" />
                    <SortTh label="סה״כ" field="total" w="100px" />
                    <th style={{ ...thS, width: 60 }}>פעולות</th>
                  </tr></thead>
                  <tbody>
                    {sorted.map((c, i) => {
                      const cat = CATEGORIES.find(x => x.id === c.category) || CATEGORIES[6];
                      return (
                        <tr key={c.id} style={{ transition: 'background .1s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#FAFAFF')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          <td style={{ ...tdS, textAlign: 'center', color: T.text3, fontSize: 11 }}>{i + 1}</td>
                          <td style={tdS}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color }} /><span style={{ fontWeight: 600 }}>{cat.name}</span></span></td>
                          <td style={{ ...tdS, fontWeight: 600, color: T.text1, maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</td>
                          <td style={{ ...tdS, textAlign: 'center', fontSize: 12 }}>{c.unit}</td>
                          <td style={{ ...tdS, textAlign: 'center', fontWeight: 600 }}>{c.quantity}</td>
                          <td style={{ ...tdS, textAlign: 'center' }}>{fmt(c.unit_price)} ₪</td>
                          <td style={{ ...tdS, textAlign: 'center', fontWeight: 700, color: c.total > 0 ? T.text1 : T.text3 }}>{fmt(c.total)} ₪</td>
                          <td style={{ ...tdS, textAlign: 'center' }}>
                            <button onClick={() => setModal(c)} style={actBtn}>✎</button>
                            <button onClick={() => delCost(c.id)} style={{ ...actBtn, color: T.red }}>🗑</button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: '#FAFAFF' }}>
                      <td colSpan={6} style={{ ...tdS, fontWeight: 800, fontSize: 14, borderBottom: 'none' }}>סה"כ</td>
                      <td style={{ ...tdS, textAlign: 'center', fontWeight: 800, fontSize: 15, color: T.green, borderBottom: 'none' }}>{fmt(subtotal)} ₪</td>
                      <td style={{ ...tdS, borderBottom: 'none' }} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ TAB: מסמכים ═══ */}
      {tab === 'docs' && id && (
        <div style={{ background: T.card, borderRadius: 18, border: `1.5px solid ${T.border}`, padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text1, marginBottom: 16 }}>מסמכי פרויקט</div>
          <ProjectDocs projectId={id} />
        </div>
      )}

      {/* ═══ TAB: הצעת מחיר ═══ */}
      {tab === 'quote' && (
        <div style={{ background: T.card, borderRadius: 18, border: `1.5px solid ${T.border}`, padding: 28 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text1, marginBottom: 20 }}>הצעת מחיר</div>

          {/* Financial summary */}
          <div style={{ background: 'linear-gradient(135deg, #1E1E2D, #2D2D44)', borderRadius: 16, padding: 28, color: '#fff', marginBottom: 24 }}>
            {[
              { label: 'סיכום ביניים', val: fmt(subtotal) },
              overhead > 0 ? { label: `תקורות (${proj.overhead_percent}%)`, val: fmt(overhead) } : null,
              insurance > 0 ? { label: `ביטוח (${proj.insurance_percent}%)`, val: fmt(insurance) } : null,
              { label: `רווח קבלני (${proj.margin_percent}%)`, val: fmt(margin) },
              proj.vat_included ? { label: 'מע"מ (17%)', val: fmt(vat) } : null,
            ].filter(Boolean).map(s => (
              <div key={s!.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 15, color: '#A0A3BD' }}>
                <span>{s!.label}</span><span style={{ color: '#D1D5DB' }}>{s!.val} ₪</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0 0', marginTop: 12, borderTop: '1px solid #3D3D55', fontSize: 24, fontWeight: 800 }}>
              <span>מחיר סופי</span><span>{fmt(finalPrice)} ₪</span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={{ fontFamily: T.f, padding: '12px 28px', borderRadius: 14, border: 'none', background: `linear-gradient(135deg, ${T.cta}, #EA580C)`, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(249,115,22,.25)' }}>📄 ייצוא PDF</button>
            <button style={{ fontFamily: T.f, padding: '12px 28px', borderRadius: 14, border: `1.5px solid ${T.border}`, background: T.card, color: T.text2, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>📧 שלח ללקוח</button>
            <button style={{ fontFamily: T.f, padding: '12px 28px', borderRadius: 14, border: `1.5px solid ${T.border}`, background: T.card, color: T.text2, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>📱 שתף WhatsApp</button>
          </div>
        </div>
      )}

      {/* ═══ TAB: כלי תמחור ═══ */}
      {tab === 'tools' && (
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text1, marginBottom: 6 }}>כלי תמחור חכמים</div>
          <div style={{ fontSize: 14, color: T.text3, marginBottom: 20 }}>חסכו זמן ע"י שימוש חוזר בעבודה שכבר נעשתה</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { ico: '🔍', title: 'חיפוש מחירים היסטוריים', desc: 'מצאו סעיפים דומים מפרויקטים קודמים והעתיקו את המחירים בקלות', status: 'פעיל', color: T.green, action: () => navigate('/prices') },
              { ico: '✨', title: 'איתור מילות מפתח', desc: 'הדגשה אוטומטית של מילים חשובות בכתב הכמויות', status: 'פעיל', color: T.green, action: () => setTab('boq') },
              { ico: '📥', title: 'העתקת מחירים בין הצעות', desc: 'ייבוא מחירי יחידה מהצעה קודמת — התאמה מדויקת', status: 'פעיל', color: T.green, action: () => setShowImport(true) },
              { ico: '📊', title: 'ניתוח מחירים היסטוריים', desc: 'קבלת טווח מחירים טיפוסי לכל סעיף על בסיס הגשות קודמות', status: 'בקרוב', color: T.orange, action: null },
              { ico: '📄', title: 'התאמת פורמט הצעה', desc: 'צרו תבנית נקייה ומקצועית להצעת המחיר', status: 'בקרוב', color: T.orange, action: null },
              { ico: '🤖', title: 'ייבוא מחירים מכל קובץ', desc: 'העלו Excel, PDF, Word או תמונה — חילוץ אוטומטי', status: 'פעיל', color: T.green, action: () => setShowImport(true) },
            ].map(tool => (
              <div key={tool.title} style={{
                background: T.card, borderRadius: 18, border: `1.5px solid ${T.border}`, padding: 24,
                display: 'flex', flexDirection: 'column', gap: 12, transition: 'box-shadow .15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.06)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
              >
                <div style={{ width: 48, height: 48, borderRadius: 14, background: tool.status === 'פעיל' ? T.greenBg : T.orangeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{tool.ico}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.text1 }}>{tool.title}</div>
                <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.6, flex: 1 }}>{tool.desc}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: tool.color }}>{tool.status}</span>
                  {tool.action && (
                    <button onClick={tool.action} style={{ fontFamily: T.f, padding: '6px 16px', borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.card, fontSize: 12, fontWeight: 600, color: T.accent, cursor: 'pointer' }}>נסו עכשיו →</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ MODALS ═══ */}
      {modal && (
        <Modal title={modal.id ? 'עריכת סעיף' : 'הוסף סעיף'} onClose={() => setModal(null)} footer={
          <><button className="btn btn-primary" onClick={saveCost} disabled={saving} style={{ fontSize: 14 }}>{modal.id ? 'שמור' : 'הוסף'}</button>
          <button className="btn btn-secondary" onClick={() => setModal(null)} style={{ fontSize: 14 }}>ביטול</button></>
        }>
          <div className="form-grid">
            <div className="form-group"><label className="form-label">קטגוריה</label><select className="form-input" value={modal.category || 'other'} onChange={e => u('category', e.target.value)}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="form-group"><label className="form-label">יחידה</label><select className="form-input" value={modal.unit || ''} onChange={e => u('unit', e.target.value)}>{UNITS.map(un => <option key={un}>{un}</option>)}</select></div>
            <div className="form-group full"><label className="form-label">תיאור *</label><input className="form-input" value={modal.description || ''} onChange={e => u('description', e.target.value)} autoFocus /></div>
            <div className="form-group"><label className="form-label">כמות</label><input className="form-input" type="number" min={0} step="any" value={modal.quantity || ''} onChange={e => u('quantity', +e.target.value)} /></div>
            <div className="form-group"><label className="form-label">מחיר ליחידה</label><input className="form-input" type="number" min={0} step="any" value={modal.unit_price || ''} onChange={e => u('unit_price', +e.target.value)} /></div>
          </div>
        </Modal>
      )}

      {showImport && id && <SmartImport projectId={id} onClose={() => setShowImport(false)} onImported={load} />}
    </div>
  );
}

const thS: React.CSSProperties = {
  padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#A0A3BD',
  textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'right',
  borderBottom: '2px solid #E4E4EE', background: '#FAFAFF',
  fontFamily: "'Inter','Heebo',sans-serif",
};
const tdS: React.CSSProperties = {
  padding: '6px 12px', fontSize: 13, color: '#6E7191',
  borderBottom: '1px solid #E4E4EE', fontFamily: "'Inter','Heebo',sans-serif",
};
const actBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 14,
  padding: '2px 6px', borderRadius: 6,
};
