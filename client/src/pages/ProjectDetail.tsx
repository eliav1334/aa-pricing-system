import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { fmt } from '../utils/format';
import { showToast } from '../hooks/useToast';
import Modal from '../components/Modal';
import SmartImport from '../components/SmartImport';
import ProjectDocs from '../components/ProjectDocs';
import type { Project, CostItem, SupplierQuoteItem, SupplierQuote, Supplier } from '../types';
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [editCell, setEditCell] = useState<{ id: string; field: string } | null>(null);
  const [editVal, setEditVal] = useState('');
  const [supplierItems, setSupplierItems] = useState<SupplierQuoteItem[]>([]);
  const [projectSuppliers, setProjectSuppliers] = useState<Supplier[]>([]);
  const [supplierQuotes, setSupplierQuotes] = useState<(SupplierQuote & { items: SupplierQuoteItem[] })[]>([]);
  const [viewQuote, setViewQuote] = useState<(SupplierQuote & { items: SupplierQuoteItem[] }) | null>(null);
  const [suggestions, setSuggestions] = useState<{ supplier_id: string; supplier_name: string; contact: any; items: { id: string; description: string; unit: string; quantity: number }[] }[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [panelSize, setPanelSize] = useState<{ w: number; h: number }>({ w: 620, h: Math.round(window.innerHeight * 0.8) });
  const panelDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panelResizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number; origPosX: number; origPosY: number; corner: string } | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    category: 130, description: 0, unit: 70, quantity: 85, unit_price: 105, total: 110, notes: 150,
  });
  const resizeRef = useRef<{ field: string; startX: number; startW: number } | null>(null);
  const onResizeStart = useCallback((field: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[field] || 100;
    resizeRef.current = { field, startX, startW };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      // RTL: dragging right = smaller, dragging left = wider
      const diff = ev.clientX - resizeRef.current.startX;
      const newW = Math.max(40, resizeRef.current.startW - diff);
      setColWidths(prev => ({ ...prev, [resizeRef.current!.field]: newW }));
    };
    const onUp = () => { resizeRef.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.style.cursor = ''; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
  }, [colWidths]);

  const load = () => {
    if (!id) return;
    api.get<Project>(`/projects/${id}`).then(setProj).catch(() => navigate('/projects'));
    api.get<CostItem[]>(`/costs/project/${id}`).then(setCosts);
    api.get<SupplierQuoteItem[]>(`/supplier-quotes/items/${id}`).then(setSupplierItems).catch(() => {});
    api.get<Supplier[]>(`/suppliers/project/${id}`).then(setProjectSuppliers).catch(() => {});
    api.get<any[]>(`/supplier-quotes/project/${id}`).then(setSupplierQuotes).catch(() => {});
  };
  useEffect(() => { load(); }, [id]);

  // ESC to close quote panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && viewQuote) { setViewQuote(null); setPanelPos(null); setPanelSize({ w: 620, h: Math.round(window.innerHeight * 0.8) }); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewQuote]);

  // Panel drag handlers
  const onPanelDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const pos = panelPos || { x: 0, y: 0 };
    panelDragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!panelDragRef.current) return;
      setPanelPos({
        x: panelDragRef.current.origX + ev.clientX - panelDragRef.current.startX,
        y: panelDragRef.current.origY + ev.clientY - panelDragRef.current.startY,
      });
    };
    const onUp = () => { panelDragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Panel resize from corners/edges
  const onPanelResizeStart = (corner: string) => (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const pos = panelPos || { x: Math.max(20, (window.innerWidth - panelSize.w) / 2), y: 60 };
    panelResizeRef.current = { startX: e.clientX, startY: e.clientY, origW: panelSize.w, origH: panelSize.h, origPosX: pos.x, origPosY: pos.y, corner };
    const onMove = (ev: MouseEvent) => {
      if (!panelResizeRef.current) return;
      const r = panelResizeRef.current;
      const dx = ev.clientX - r.startX;
      const dy = ev.clientY - r.startY;
      let newW = r.origW, newH = r.origH, newX = r.origPosX, newY = r.origPosY;
      if (corner.includes('e')) newW = Math.max(400, r.origW + dx);
      if (corner.includes('w')) { newW = Math.max(400, r.origW - dx); newX = r.origPosX + dx; }
      if (corner.includes('s')) newH = Math.max(300, r.origH + dy);
      if (corner.includes('n')) { newH = Math.max(300, r.origH - dy); newY = r.origPosY + dy; }
      setPanelSize({ w: newW, h: newH });
      setPanelPos({ x: newX, y: newY });
    };
    const onUp = () => { panelResizeRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Map cost_item_id → supplier quote items (for BOQ display)
  const supplierByCostItem = useMemo(() => {
    const m: Record<string, SupplierQuoteItem[]> = {};
    for (const si of supplierItems) {
      if (si.cost_item_id) (m[si.cost_item_id] ||= []).push(si);
    }
    return m;
  }, [supplierItems]);
  const hasSupplierData = supplierItems.length > 0;

  // Delete a supplier quote
  const deleteSupplierQuote = async (quoteId: string, supplierName: string) => {
    if (!confirm(`למחוק את הצעת ${supplierName}? כל הפריטים והקישורים יימחקו.`)) return;
    try {
      await api.del(`/supplier-quotes/${quoteId}`);
      showToast(`הצעת ${supplierName} נמחקה`);
      load();
    } catch (e: any) { showToast('שגיאה: ' + e.message); }
  };

  // Fetch supplier suggestions for uncovered BOQ items
  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const result = await api.get<{ suggestions: typeof suggestions extends infer T | null ? NonNullable<T> : never; uncovered_total: number; covered_total: number }>(`/supplier-quotes/suggest-suppliers/${id}`);
      if (result.suggestions.length === 0) {
        showToast(`כל ${result.covered_total} הסעיפים מכוסים, או שאין ספקים מתאימים`);
        setSuggestions([]);
      } else {
        setSuggestions(result.suggestions);
        showToast(`נמצאו ${result.suggestions.length} ספקים מתאימים ל-${result.uncovered_total} סעיפים חסרים`);
      }
    } catch (e: any) { showToast('שגיאה: ' + e.message); }
    finally { setLoadingSuggestions(false); }
  };

  // Get quote number for a supplier in this project
  const getSupplierQuoteNum = (name: string): string => {
    const quote = supplierQuotes.find(q => q.supplier_name === name);
    return quote?.quote_number ? ` (מס׳ ${quote.quote_number})` : '';
  };

  // Build WhatsApp/email message for a supplier — ONLY items relevant to this supplier
  const sendToSupplier = (supplierName: string, method: 'whatsapp' | 'email', relevantCostItems?: { id: string; description: string; unit: string; quantity: number }[]) => {
    const supplier = projectSuppliers.find(s => s.name === supplierName);
    if (!supplier) { showToast('ספק לא נמצא'); return; }

    // Items already covered by this supplier in the current project
    const sItems = supplierItems.filter(si => si.supplier_name === supplierName && si.cost_item_id);
    const linkedLines: string[] = [];
    for (const si of sItems) {
      const cost = costs.find(c => c.id === si.cost_item_id);
      if (cost) linkedLines.push(`• ${cost.description} — ${fmt(cost.quantity)} ${cost.unit} (מחיר: ${fmt(si.unit_price)} ₪)`);
    }

    // Relevant uncovered items (passed from suggest-suppliers, or empty)
    const uncoveredLines: string[] = [];
    if (relevantCostItems) {
      for (const c of relevantCostItems) {
        uncoveredLines.push(`• ${c.description} — ${fmt(c.quantity)} ${c.unit}`);
      }
    }

    const projectName = proj?.name || '';
    const quoteRef = getSupplierQuoteNum(supplierName);
    const msgLines = [
      `שלום ${supplier.contact_person || supplierName},`,
      ``,
    ];

    if (linkedLines.length > 0) {
      msgLines.push(`בהמשך להצעת המחיר שלכם${quoteRef} עבור הפרויקט "${projectName}":`);
      msgLines.push(``);
      msgLines.push(...linkedLines);
    }

    if (uncoveredLines.length > 0) {
      msgLines.push(``);
      msgLines.push(linkedLines.length > 0
        ? `נבקש הצעת מחיר גם עבור הסעיפים הבאים:`
        : `נבקש הצעת מחיר עבור הפרויקט "${projectName}":`);
      msgLines.push(``);
      msgLines.push(...uncoveredLines);
    }

    if (linkedLines.length === 0 && uncoveredLines.length === 0) {
      msgLines.push(`נבקש הצעת מחיר עבור הפרויקט "${projectName}".`);
    }

    msgLines.push(``);
    msgLines.push(`בתודה,`);
    msgLines.push(`אליאב אהרון`);
    msgLines.push(`א.א. עבודות קידוחים ופיתוח`);
    const msg = msgLines.join('\n');

    if (method === 'whatsapp') {
      const phone = (supplier.mobile || supplier.phone || '').replace(/\D/g, '');
      if (!phone) { showToast('אין מספר טלפון לספק'); return; }
      const intPhone = phone.startsWith('0') ? '972' + phone.slice(1) : phone;
      window.open(`https://wa.me/${intPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      if (!supplier.email) { showToast('אין מייל לספק'); return; }
      const subject = encodeURIComponent(`בקשת הצעת מחיר — ${projectName}`);
      window.open(`mailto:${supplier.email}?subject=${subject}&body=${encodeURIComponent(msg)}`, '_blank');
    }
  };

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
  const delCost = async (cid: string) => { if (!confirm('למחוק?')) return; await api.del(`/costs/${cid}`); showToast('נמחק'); setSelected(prev => { const n = new Set(prev); n.delete(cid); return n; }); load(); };
  const delSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`למחוק ${selected.size} סעיפים?`)) return;
    setDeleting(true);
    try {
      await api.post('/costs/batch-delete', { ids: Array.from(selected) });
      showToast(`🗑 ${selected.size} סעיפים נמחקו`);
      setSelected(new Set());
      load();
    } catch (e: any) { showToast('שגיאה: ' + e.message); }
    finally { setDeleting(false); }
  };
  const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleSelectAll = () => { if (selected.size === costs.length) setSelected(new Set()); else setSelected(new Set(costs.map(c => c.id))); };
  const u = (k: string, v: any) => setModal(prev => prev ? { ...prev, [k]: v } : prev);

  // ─── Inline editing ───
  const startEdit = (id: string, field: string, currentVal: any) => {
    setEditCell({ id, field });
    setEditVal(String(currentVal ?? ''));
  };
  const cancelEdit = () => { setEditCell(null); setEditVal(''); };
  const commitEdit = async () => {
    if (!editCell) return;
    const { id: cid, field } = editCell;
    const item = costs.find(c => c.id === cid);
    if (!item) { cancelEdit(); return; }
    const oldVal = String((item as any)[field] ?? '');
    if (editVal === oldVal) { cancelEdit(); return; }
    // Optimistic update — round numbers to avoid floating point issues
    const numFields = ['quantity', 'unit_price'];
    const newVal = numFields.includes(field) ? Math.round((parseFloat(editVal) || 0) * 100) / 100 : editVal;
    setCosts(prev => prev.map(c => {
      if (c.id !== cid) return c;
      const updated = { ...c, [field]: newVal };
      if (field === 'quantity' || field === 'unit_price') updated.total = updated.quantity * updated.unit_price;
      return updated;
    }));
    cancelEdit();
    try {
      await fetch(`/api/costs/${cid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field, value: newVal }) });
    } catch { showToast('שגיאה בשמירה'); load(); }
  };
  const editKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    else if (e.key === 'Escape') cancelEdit();
  };

  const TABS: { id: Tab; label: string; ico: string }[] = [
    { id: 'boq', label: 'כתב כמויות', ico: '📋' },
    { id: 'docs', label: 'מסמכים', ico: '📎' },
    { id: 'quote', label: 'הצעת מחיר', ico: '💰' },
    { id: 'tools', label: 'כלי תמחור', ico: '⚙' },
  ];

  const numericFields = ['quantity', 'unit_price', 'total'];
  const SortTh = ({ label, field }: { label: string; field: SortKey }) => (
    <th style={{
      padding: '10px 10px', fontSize: 13, fontWeight: 700, color: sortKey === field ? T.accent : T.text2,
      letterSpacing: '.02em', textAlign: numericFields.includes(field) ? 'center' : 'right',
      borderBottom: `2.5px solid ${sortKey === field ? T.accent : T.border}`, background: '#FAFAFF',
      fontFamily: T.f, userSelect: 'none', whiteSpace: 'nowrap', position: 'relative',
      overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      <span style={{ cursor: 'pointer' }} onClick={() => toggleSort(field)}>
        {label} {sortKey === field && <span style={{ fontSize: 10 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </span>
      <span
        onMouseDown={e => onResizeStart(field, e)}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', background: 'transparent', zIndex: 2 }}
        onMouseEnter={e => (e.currentTarget.style.background = T.accent + '40')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      />
    </th>
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
          {/* Actions — only when there are items */}
          {costs.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text1 }}>כתב כמויות ({costs.length})</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {selected.size > 0 && (
                  <button onClick={delSelected} disabled={deleting} style={{ fontFamily: T.f, padding: '9px 18px', borderRadius: 12, border: `1.5px solid ${T.red}`, background: T.redBg, fontSize: 13, fontWeight: 700, color: T.red, cursor: 'pointer' }}>
                    🗑 מחק {selected.size} נבחרים
                  </button>
                )}
                <button onClick={fetchSuggestions} disabled={loadingSuggestions} style={{ fontFamily: T.f, padding: '9px 18px', borderRadius: 12, border: `1.5px solid ${T.purple}`, background: T.purpleBg, fontSize: 13, fontWeight: 700, color: T.purple, cursor: 'pointer' }}>
                  {loadingSuggestions ? '⏳ מחפש...' : '📩 בקש הצעות מספקים'}
                </button>
                <button onClick={() => setShowImport(true)} style={{ fontFamily: T.f, padding: '9px 18px', borderRadius: 12, border: `1.5px solid ${T.border}`, background: T.card, fontSize: 13, fontWeight: 600, color: T.text2, cursor: 'pointer' }}>📂 הוסף קובץ</button>
                <button onClick={() => setModal(emptyCost())} style={{ fontFamily: T.f, padding: '9px 18px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg, ${T.cta}, #EA580C)`, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', boxShadow: '0 2px 8px rgba(249,115,22,.2)' }}>+ הוסף סעיף</button>
              </div>
            </div>
          )}

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

          {/* Supplier suggestions panel */}
          {suggestions && suggestions.length > 0 && (
            <div style={{ background: '#F0FFF4', borderRadius: 14, border: '1.5px solid #38A16925', padding: '14px 20px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontFamily: T.f, fontSize: 14, fontWeight: 800, color: '#38A169' }}>📩 ספקים מומלצים לבקשת הצעת מחיר</span>
                <button onClick={() => setSuggestions(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: T.text3 }}>✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {suggestions.map(s => (
                  <div key={s.supplier_id} style={{ background: T.card, borderRadius: 12, border: `1.5px solid ${T.border}`, padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <span style={{ fontFamily: T.f, fontSize: 14, fontWeight: 700, color: T.text1 }}>{s.supplier_name}</span>
                        <span style={{ fontFamily: T.f, fontSize: 12, color: T.text3, marginRight: 8 }}> — {s.items.length} סעיפים רלוונטיים</span>
                        {s.contact?.contact_person && <span style={{ fontFamily: T.f, fontSize: 11, color: T.text3 }}> · {s.contact.contact_person}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(s.contact?.mobile || s.contact?.phone) && (
                          <button onClick={() => sendToSupplier(s.supplier_name, 'whatsapp', s.items)}
                            style={{ background: '#25D366', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#fff', fontFamily: T.f }}>
                            וואצאפ
                          </button>
                        )}
                        {s.contact?.email && (
                          <button onClick={() => sendToSupplier(s.supplier_name, 'email', s.items)}
                            style={{ background: T.accent, border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#fff', fontFamily: T.f }}>
                            מייל
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ fontFamily: T.f, fontSize: 12, color: T.text2, lineHeight: 1.6 }}>
                      {s.items.slice(0, 5).map(item => (
                        <div key={item.id}>• {item.description} — {fmt(item.quantity)} {item.unit}</div>
                      ))}
                      {s.items.length > 5 && <div style={{ color: T.text3, fontStyle: 'italic' }}>+ עוד {s.items.length - 5} סעיפים...</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supplier quotes bar */}
          {supplierQuotes.length > 0 && (
            <div style={{ background: T.purpleBg, borderRadius: 14, border: `1.5px solid ${T.purple}25`, padding: '14px 20px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: supplierQuotes.length > 0 ? 10 : 0 }}>
                <span style={{ fontFamily: T.f, fontSize: 14, fontWeight: 800, color: T.purple }}>💰 הצעות ספקים ({supplierQuotes.length})</span>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {supplierQuotes.map(q => {
                  const sup = projectSuppliers.find(s => s.name === q.supplier_name);
                  const total = q.items?.reduce((s: number, it: any) => s + (it.unit_price * it.quantity || it.total_price || 0), 0) || 0;
                  const linked = q.items?.filter((it: any) => it.cost_item_id).length || 0;
                  return (
                    <div key={q.id} style={{
                      background: T.card, borderRadius: 12, border: `1.5px solid ${T.border}`,
                      padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 250,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: T.f, fontSize: 14, fontWeight: 700, color: T.text1 }}>{q.supplier_name}</div>
                        <div style={{ fontFamily: T.f, fontSize: 11, color: T.text3, marginTop: 2 }}>
                          {q.quote_number && <span>{q.quote_number} · </span>}
                          {q.quote_date && <span>{q.quote_date} · </span>}
                          {q.items?.length || 0} פריטים · {linked} מקושרים
                          {total > 0 && <span> · {fmt(total)} ₪</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button onClick={() => setViewQuote(q)}
                          title="צפה בהצעה"
                          style={{ background: T.purple, border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#fff', fontWeight: 700, fontFamily: T.f }}>📄 צפה</button>
                        <button onClick={() => deleteSupplierQuote(q.id, q.supplier_name)}
                          title="מחק הצעה"
                          style={{ background: 'none', border: `1px solid ${T.red}40`, borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer', color: T.red }}>🗑</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.f, tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 32 }} />{/* checkbox */}
                    <col style={{ width: 32 }} />{/* # */}
                    <col style={{ width: colWidths.category }} />{/* קטגוריה */}
                    <col />{/* תיאור — auto fills remaining */}
                    <col style={{ width: colWidths.unit }} />{/* יחידה */}
                    <col style={{ width: colWidths.quantity }} />{/* כמות */}
                    <col style={{ width: colWidths.unit_price }} />{/* מחיר */}
                    <col style={{ width: colWidths.total }} />{/* סה"כ */}
                    {hasSupplierData && <col style={{ width: 150 }} />}{/* מחיר ספק */}
                    <col style={{ width: colWidths.notes }} />{/* הערות */}
                    <col style={{ width: 36 }} />{/* 🗑 */}
                  </colgroup>
                  <thead><tr>
                    <th style={{ ...thS, width: 32, textAlign: 'center', padding: '10px 4px' }}>
                      <input type="checkbox" checked={costs.length > 0 && selected.size === costs.length} onChange={toggleSelectAll} style={{ width: 16, height: 16, accentColor: T.accent, cursor: 'pointer' }} title="בחר/בטל הכל" />
                    </th>
                    <th style={{ ...thS, width: 32, textAlign: 'center', padding: '10px 4px' }}>#</th>
                    <SortTh label="קטגוריה" field="category" />
                    <SortTh label="תיאור סעיף" field="description" />
                    <SortTh label="יחידה" field="unit" />
                    <SortTh label="כמות" field="quantity" />
                    <SortTh label="מחיר יח׳" field="unit_price" />
                    <SortTh label="סה״כ" field="total" />
                    {hasSupplierData && (
                      <th style={{ ...thS, textAlign: 'center', padding: '10px 8px', color: T.purple, background: T.purpleBg }}>
                        💰 מחיר ספק
                      </th>
                    )}
                    <th style={{ ...thS, textAlign: 'center', padding: '10px 8px', position: 'relative' }}>
                      הערות
                      <span
                        onMouseDown={e => onResizeStart('notes' as any, e)}
                        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize' }}
                        onMouseEnter={e => (e.currentTarget.style.background = T.accent + '40')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      />
                    </th>
                    <th style={{ ...thS, width: 36, textAlign: 'center', padding: '10px 4px' }}></th>
                  </tr></thead>
                  <tbody>
                    {sorted.map((c, i) => {
                      const cat = CATEGORIES.find(x => x.id === c.category)
                        || { id: c.category, name: c.category, color: '#6B7280' };
                      const isEd = (f: string) => editCell?.id === c.id && editCell?.field === f;
                      const cellClick = (f: string, val: any) => { if (!isEd(f)) startEdit(c.id, f, val); };
                      const inpStyle: React.CSSProperties = { width: '100%', padding: '6px 8px', borderRadius: 6, border: `2px solid ${T.accent}`, fontSize: 14, fontFamily: T.f, textAlign: 'center', outline: 'none', background: '#FAFAFF' };
                      return (
                        <tr key={c.id} style={{ transition: 'background .1s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#FAFAFF')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          <td style={{ ...tdS, textAlign: 'center', padding: '10px 4px' }}>
                            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} style={{ width: 16, height: 16, accentColor: T.accent, cursor: 'pointer' }} />
                          </td>
                          <td style={{ ...tdS, textAlign: 'center', color: T.text3, fontSize: 12, padding: '10px 4px' }}>{i + 1}</td>
                          {/* קטגוריה */}
                          <td style={{ ...tdS, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => cellClick('category', c.category)} title={cat.name}>
                            {isEd('category') ? (
                              <select value={editVal} onChange={e => { setEditVal(e.target.value); }} onBlur={commitEdit} onKeyDown={editKeyDown} autoFocus style={{ ...inpStyle, textAlign: 'right' }}>
                                {CATEGORIES.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                                {!CATEGORIES.find(x => x.id === c.category) && <option value={c.category}>{c.category}</option>}
                              </select>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }} /><span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span></span>
                            )}
                          </td>
                          {/* תיאור */}
                          <td style={{ ...tdS, cursor: 'pointer', fontWeight: 600, color: T.text1 }} onClick={() => cellClick('description', c.description)}>
                            {isEd('description') ? (
                              <input value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={editKeyDown} autoFocus style={{ ...inpStyle, textAlign: 'right', fontWeight: 600 }} />
                            ) : (
                              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.description}>{c.description}</span>
                            )}
                          </td>
                          {/* יחידה */}
                          <td style={{ ...tdS, textAlign: 'center', cursor: 'pointer', fontSize: 12 }} onClick={() => cellClick('unit', c.unit)}>
                            {isEd('unit') ? (
                              <select value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={editKeyDown} autoFocus style={inpStyle}>
                                {UNITS.map(un => <option key={un}>{un}</option>)}
                              </select>
                            ) : c.unit}
                          </td>
                          {/* כמות */}
                          <td style={{ ...tdS, textAlign: 'center', fontWeight: 600, cursor: 'pointer' }} onClick={() => cellClick('quantity', Math.round(c.quantity * 100) / 100)}>
                            {isEd('quantity') ? (
                              <input type="text" inputMode="decimal" value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={editKeyDown} autoFocus style={inpStyle} />
                            ) : fmt(c.quantity)}
                          </td>
                          {/* מחיר יחידה */}
                          <td style={{ ...tdS, textAlign: 'center', cursor: 'pointer' }} onClick={() => cellClick('unit_price', Math.round(c.unit_price * 100) / 100)}>
                            {isEd('unit_price') ? (
                              <input type="text" inputMode="decimal" value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={editKeyDown} autoFocus style={inpStyle} />
                            ) : <>{fmt(c.unit_price)} ₪</>}
                          </td>
                          {/* סה"כ — לא ניתן לעריכה */}
                          <td style={{ ...tdS, textAlign: 'center', fontWeight: 700, color: c.total > 0 ? T.text1 : T.text3 }}>{fmt(c.total)} ₪</td>
                          {/* מחיר ספק + התראות */}
                          {hasSupplierData && (() => {
                            const sItems = supplierByCostItem[c.id] || [];
                            // Check for quantity mismatch warnings
                            const warnings: string[] = [];
                            for (const si of sItems) {
                              if (si.quantity > 0 && c.quantity > 0) {
                                const diff = Math.abs(si.quantity - c.quantity);
                                const pct = diff / Math.max(si.quantity, c.quantity) * 100;
                                if (pct > 5) {
                                  warnings.push(`כמות ספק: ${si.quantity} ≠ כתב כמויות: ${c.quantity}`);
                                }
                              }
                            }
                            // Check if this item SHOULD have a supplier price but doesn't
                            const missingQuote = sItems.length === 0 && supplierQuotes.length > 0;
                            return (
                              <td style={{ ...tdS, textAlign: 'center', padding: '4px 6px',
                                background: sItems.length > 0 ? T.purpleBg + '60' : missingQuote ? T.orangeBg + '40' : '' }}>
                                {sItems.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    {sItems.map(si => (
                                        <div key={si.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12 }}>
                                          <span style={{ fontWeight: 800, color: T.purple }}>{fmt(si.unit_price)} ₪</span>
                                          <span style={{ fontSize: 10, color: T.purple, fontWeight: 600, maxWidth: 55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                            title={si.supplier_name}>{si.supplier_name}</span>
                                        </div>
                                    ))}
                                  </div>
                                ) : missingQuote ? (
                                  <span style={{ fontSize: 10, color: T.orange, fontWeight: 600 }}
                                    title="סעיף ללא הצעת מחיר מספק">⚠ חסר מחיר</span>
                                ) : (
                                  <span style={{ fontSize: 11, color: T.text3, opacity: .3 }}>—</span>
                                )}
                              </td>
                            );
                          })()}
                          {/* הערות */}
                          <td style={{ ...tdS, cursor: 'pointer', padding: '10px 8px', maxWidth: colWidths.notes, minWidth: 40 }} onClick={() => cellClick('notes', c.notes || '')}>
                            {isEd('notes') ? (
                              <input value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={editKeyDown} autoFocus style={{ ...inpStyle, textAlign: 'right', width: '100%' }} placeholder="הערה..." />
                            ) : c.notes ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: T.accent, fontWeight: 600 }}>
                                <span style={{ fontSize: 14, flexShrink: 0 }}>📝</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.notes}</span>
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: T.text3, opacity: .4 }}>+ הערה</span>
                            )}
                          </td>
                          {/* פעולות */}
                          <td style={{ ...tdS, textAlign: 'center', padding: '10px 4px' }}>
                            <button onClick={() => delCost(c.id)} style={{ ...actBtn, color: T.red, fontSize: 16 }}>🗑</button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: '#FAFAFF' }}>
                      <td colSpan={7} style={{ ...tdS, fontWeight: 800, fontSize: 14, borderBottom: 'none' }}>סה"כ</td>
                      <td style={{ ...tdS, textAlign: 'center', fontWeight: 800, fontSize: 15, color: T.green, borderBottom: 'none' }}>{fmt(subtotal)} ₪</td>
                      {hasSupplierData && <td style={{ ...tdS, borderBottom: 'none' }} />}
                      <td colSpan={2} style={{ ...tdS, borderBottom: 'none' }} />
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
            <div className="form-group full"><label className="form-label">הערות</label><textarea className="form-input" rows={2} value={modal.notes || ''} onChange={e => u('notes', e.target.value)} placeholder="הערות לסעיף..." style={{ resize: 'vertical' }} /></div>
          </div>
        </Modal>
      )}

      {showImport && id && <SmartImport projectId={id} onClose={() => setShowImport(false)} onImported={load} />}

      {/* ═══ SUPPLIER QUOTE VIEW MODAL ═══ */}
      {viewQuote && (
        <div style={{
          position: 'fixed',
          top: panelPos?.y ?? 60,
          left: panelPos?.x ?? Math.max(20, (window.innerWidth - panelSize.w) / 2),
          width: panelSize.w, height: panelSize.h,
          zIndex: 9000, background: T.card,
          boxShadow: '0 12px 60px rgba(0,0,0,.25), 0 0 0 1px rgba(0,0,0,.08)',
          borderRadius: 16, overflow: 'auto',
        }}>
          {/* Resize handles — 4 corners + 4 edges */}
          {(['n','s','e','w','ne','nw','se','sw'] as const).map(c => {
            const isCorner = c.length === 2;
            const cur = c === 'n' || c === 's' ? 'ns-resize' : c === 'e' || c === 'w' ? 'ew-resize' :
              c === 'ne' || c === 'sw' ? 'nesw-resize' : 'nwse-resize';
            const pos: React.CSSProperties =
              c === 'n' ? { top: -3, left: 10, right: 10, height: 6 } :
              c === 's' ? { bottom: -3, left: 10, right: 10, height: 6 } :
              c === 'e' ? { top: 10, bottom: 10, right: -3, width: 6 } :
              c === 'w' ? { top: 10, bottom: 10, left: -3, width: 6 } :
              c === 'ne' ? { top: -4, right: -4, width: 14, height: 14, borderRadius: '0 16px 0 0' } :
              c === 'nw' ? { top: -4, left: -4, width: 14, height: 14, borderRadius: '16px 0 0 0' } :
              c === 'se' ? { bottom: -4, right: -4, width: 14, height: 14, borderRadius: '0 0 16px 0' } :
                           { bottom: -4, left: -4, width: 14, height: 14, borderRadius: '0 0 0 16px' };
            return <div key={c} onMouseDown={onPanelResizeStart(c)}
              style={{ position: 'absolute', cursor: cur, zIndex: 2, ...pos }} />;
          })}
          {/* Header — draggable */}
          <div onMouseDown={onPanelDragStart} style={{ padding: '16px 20px', borderBottom: `1.5px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: T.card, zIndex: 1, cursor: 'grab', userSelect: 'none', borderRadius: '16px 16px 0 0' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: T.text1, fontFamily: T.f }}>
                הצעת מחיר — {viewQuote.supplier_name}
              </h2>
              <div style={{ fontSize: 12, color: T.text3, marginTop: 4, fontFamily: T.f }}>
                {viewQuote.quote_number && <span>מס׳ {viewQuote.quote_number} · </span>}
                {viewQuote.quote_date && <span>{viewQuote.quote_date} · </span>}
                {viewQuote.items?.length || 0} פריטים
              </div>
            </div>
            <button onClick={() => { setViewQuote(null); setPanelPos(null); }}
              style={{ background: T.purple, border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: '#fff', fontWeight: 700, fontFamily: T.f }}>✕ סגור</button>
          </div>
          {/* Table — group duplicate items (same description) to avoid inflated display */}
          <div style={{ padding: '12px 16px 28px' }}>
            {(() => {
              // Group items by description to collapse duplicates from auto-match
              const grouped: { item: typeof viewQuote.items[0]; linkedCosts: (CostItem | undefined)[] }[] = [];
              const descMap = new Map<string, number>();
              for (const it of (viewQuote.items || [])) {
                const key = it.description.trim();
                const existing = descMap.get(key);
                if (existing !== undefined) {
                  // Add linked cost to existing group
                  const linkedCost = it.cost_item_id ? costs.find(c => c.id === it.cost_item_id) : undefined;
                  if (linkedCost && !grouped[existing].linkedCosts.some(lc => lc?.id === linkedCost.id)) {
                    grouped[existing].linkedCosts.push(linkedCost);
                  }
                } else {
                  const linkedCost = it.cost_item_id ? costs.find(c => c.id === it.cost_item_id) : undefined;
                  descMap.set(key, grouped.length);
                  grouped.push({ item: it, linkedCosts: linkedCost ? [linkedCost] : [] });
                }
              }
              return (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'right' }}>
                      <th style={{ ...thS, width: 28 }}>#</th>
                      <th style={thS}>מק״ט</th>
                      <th style={thS}>תיאור</th>
                      <th style={thS}>יחידה</th>
                      <th style={thS}>כמות</th>
                      <th style={thS}>מחיר ליח׳</th>
                      <th style={thS}>סה״כ</th>
                      <th style={thS}>סעיפים מקושרים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map((g, i) => (
                      <tr key={g.item.id} style={{ background: i % 2 === 0 ? '#FAFAFF' : T.card }}>
                        <td style={tdS}>{i + 1}</td>
                        <td style={{ ...tdS, fontSize: 10, color: T.text3, direction: 'ltr' }}>{g.item.catalog_number || '—'}</td>
                        <td style={{ ...tdS, fontWeight: 600, color: T.text1, fontSize: 13 }}>{g.item.description}</td>
                        <td style={tdS}>{g.item.unit || '—'}</td>
                        <td style={tdS}>{g.item.quantity}</td>
                        <td style={{ ...tdS, fontWeight: 700, color: T.purple }}>{fmt(g.item.unit_price)} ₪</td>
                        <td style={{ ...tdS, fontWeight: 700 }}>{fmt(g.item.unit_price * g.item.quantity)} ₪</td>
                        <td style={{ ...tdS, fontSize: 11 }}>
                          {g.linkedCosts.length > 0
                            ? <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {g.linkedCosts.map((lc, j) => lc && (
                                  <span key={lc.id} style={{ color: T.green, fontWeight: 600 }}>✓ {lc.description?.substring(0, 25)}</span>
                                ))}
                              </div>
                            : <span style={{ color: T.text3 }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${T.purple}30` }}>
                      <td colSpan={5} />
                      <td style={{ ...tdS, fontWeight: 800, color: T.purple, fontSize: 13 }}>סה״כ</td>
                      <td style={{ ...tdS, fontWeight: 800, color: T.purple, fontSize: 15 }}>
                        {fmt(grouped.reduce((s, g) => s + g.item.unit_price * g.item.quantity, 0))} ₪
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

const thS: React.CSSProperties = {
  padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#A0A3BD',
  textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'right',
  borderBottom: '2px solid #E4E4EE', background: '#FAFAFF',
  fontFamily: "'Inter','Heebo',sans-serif",
};
const tdS: React.CSSProperties = {
  padding: '10px 14px', fontSize: 14, color: '#6E7191',
  borderBottom: '1px solid #E4E4EE', fontFamily: "'Inter','Heebo',sans-serif",
};
const actBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 14,
  padding: '2px 6px', borderRadius: 6,
};
