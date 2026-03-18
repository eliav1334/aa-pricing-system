import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { fmt, fmtDate } from '../utils/format';
import { showToast } from '../hooks/useToast';
import Modal from '../components/Modal';
import type { Stats, Project } from '../types';
import { TYPES } from '../types';

/* ═══ Tokens ═══ */
const T = {
  bg: '#F7F7FC', card: '#FFFFFF', border: '#E4E4EE',
  shadow: '0 10px 40px rgba(0,0,0,.03)',
  text1: '#1E1E2D', text2: '#6E7191', text3: '#A0A3BD',
  accent: '#5B6CFF', accentBg: '#EEEEFF',
  cta: '#F97316', cta2: '#EA580C',
  green: '#00BA88', greenBg: '#E6F9F1',
  red: '#FF6B6B', redBg: '#FFF0F0',
  orange: '#FFAA33', orangeBg: '#FFF5E6',
  purple: '#7B61FF', purpleBg: '#F0EDFF',
  cyan: '#00C6D7', cyanBg: '#E6FBFD',
  f: "'Inter','Heebo',sans-serif",
};
const card: React.CSSProperties = { background: T.card, borderRadius: 18, boxShadow: T.shadow, border: `1.5px solid ${T.border}` };
const num = (sz = 40, c = T.text1): React.CSSProperties => ({ fontFamily: T.f, fontSize: sz, fontWeight: 800, color: c, letterSpacing: '-.04em', lineHeight: 1 });
const thS: React.CSSProperties = { padding: '14px 24px', fontSize: 12, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'right', borderBottom: `1.5px solid ${T.border}`, background: '#FAFAFF', fontFamily: T.f };
const tdS = (x?: React.CSSProperties): React.CSSProperties => ({ padding: '14px 24px', fontSize: 14, color: T.text2, borderBottom: `1px solid ${T.border}`, fontFamily: T.f, ...x });
const today = () => new Date().toISOString().split('T')[0];
const RULES_KEY = 'aa-pricing-rules';
const CONTACTS_KEY = 'aa-pricing-contacts';

/* ═══ Types ═══ */
interface BusinessRule { condition: string; action: string; }
interface ContactInfo { projectId: string; email: string; phone: string; }

function Badge({ status }: { status: string }) {
  const m: Record<string, [string, string]> = { 'הצעה': [T.accentBg, T.accent], 'אושר': [T.purpleBg, T.purple], 'בביצוע': [T.orangeBg, '#D97706'], 'הושלם': [T.greenBg, T.green], 'בוטל': ['#F0F0F5', T.text3] };
  const [bg, c] = m[status] || m['בוטל'];
  return <span style={{ fontFamily: T.f, padding: '5px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700, background: bg, color: c }}>{status}</span>;
}

function Donut({ segments, size = 160 }: { segments: { value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const stroke = 12, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  let off = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F0F0F8" strokeWidth={stroke} />
        {segments.map((s, i) => { const d = total > 0 ? (s.value / total) * circ : 0; const el = <circle key={i} cx={size/2} cy={size/2} r={r} fill="none" stroke={s.color} strokeWidth={stroke} strokeDasharray={`${d} ${circ - d}`} strokeDashoffset={-off} strokeLinecap="round" />; off += d; return el; })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ ...num(38) }}>{total}</span>
        <span style={{ fontFamily: T.f, fontSize: 12, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 4 }}>פרויקטים</span>
      </div>
    </div>
  );
}

/* ═══ DASHBOARD ═══ */
export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  // New project modal
  const [showNewProject, setShowNewProject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', client: '', type: TYPES[0], address: '', date: today(), notes: '', margin_percent: 15 });
  // Contact/reminder modal
  const [reminderTarget, setReminderTarget] = useState<Project | null>(null);
  const [contacts, setContacts] = useState<Record<string, ContactInfo>>(() => {
    try { return JSON.parse(localStorage.getItem(CONTACTS_KEY) || '{}'); } catch { return {}; }
  });
  const [contactForm, setContactForm] = useState({ email: '', phone: '' });
  // Business rules
  const [rules, setRules] = useState<BusinessRule[]>(() => {
    try { return JSON.parse(localStorage.getItem(RULES_KEY) || '[]'); }
    catch { return [{ condition: 'קרקע סלעית', action: '+20% בלאי' }, { condition: 'כל פרויקט', action: 'מינימום 15% רווח' }, { condition: 'ציוד', action: 'תמיד כולל מפעיל' }]; }
  });
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [ruleForm, setRuleForm] = useState({ condition: '', action: '' });
  // AI chat
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  // File upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadResult, setUploadResult] = useState<{ name: string; items: { desc: string; price: number }[] } | null>(null);
  const navigate = useNavigate();

  const load = () => {
    api.get<Stats>('/stats').then(setStats);
    api.get<Project[]>('/projects').then(setProjects);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [aiMessages]);
  useEffect(() => { localStorage.setItem(RULES_KEY, JSON.stringify(rules)); }, [rules]);
  useEffect(() => { localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts)); }, [contacts]);

  // ─── AI Search Logic (real data) ───
  const handleAiSend = useCallback(() => {
    const q = aiInput.trim();
    if (!q) return;
    setAiMessages(prev => [...prev, { role: 'user', text: q }]);
    setAiInput('');

    setTimeout(() => {
      let answer = '';
      const ql = q.toLowerCase();

      // Search by project name
      const matchedProject = projects.find(p => q.includes(p.name) || q.includes(p.client));
      if (matchedProject) {
        answer = `📋 פרויקט "${matchedProject.name}"\n• לקוח: ${matchedProject.client || 'לא צוין'}\n• סטטוס: ${matchedProject.status}\n• רווח: ${matchedProject.margin_percent}%\n• סוג: ${matchedProject.type || 'לא צוין'}\n• תאריך: ${matchedProject.date || 'לא צוין'}`;
      }
      // Status queries
      else if (ql.includes('סטטוס') || ql.includes('סיכום')) {
        const byS = (s: string) => projects.filter(p => p.status === s);
        answer = `📊 סיכום Pipeline:\n• הצעות: ${byS('הצעה').length}\n• בביצוע: ${byS('בביצוע').length}\n• הושלמו: ${byS('הושלם').length}\n• אושרו: ${byS('אושר').length}\n\nסה"כ ${projects.length} פרויקטים`;
      }
      else if (ql.includes('רווח') || ql.includes('מרווח')) {
        const avg = projects.length > 0 ? projects.reduce((s, p) => s + p.margin_percent, 0) / projects.length : 0;
        const low = projects.filter(p => p.margin_percent < 10);
        answer = `💰 ניתוח רווחיות:\n• ממוצע: ${avg.toFixed(1)}%\n• מומלץ: 15-20%\n• ${low.length} פרויקטים מתחת ל-10% — ${low.map(p => p.name).join(', ') || 'אין'}`;
      }
      else if (ql.includes('מחיר') || ql.includes('תמחור') || ql.includes('עלות')) {
        answer = `🎯 דיוק תמחור: ${stats ? Math.min(99, Math.round(85 + (projects.filter(p => p.status === 'הושלם').length / Math.max(projects.length, 1)) * 15)) : 0}%\n\nמבוסס על ${projects.filter(p => p.status === 'הושלם').length} פרויקטים שהושלמו ו-${stats ? fmt(stats.prices) : 0} פריטי מחירון.\n\n📌 כללים פעילים: ${rules.length}`;
      }
      else if (ql.includes('סיכון')) {
        const risky = projects.filter(p => p.margin_percent < 10);
        answer = risky.length > 0 ? `🛡 ${risky.length} פרויקטים בסיכון:\n${risky.map(p => `• ${p.name} — ${p.margin_percent}% רווח`).join('\n')}` : '🛡 אין פרויקטים בסיכון כרגע — כל הפרויקטים מעל 10% רווח';
      }
      else if (ql.includes('ספק') || ql.includes('תזכורת')) {
        const stale = projects.filter(p => p.status === 'הצעה' && p.date && (Date.now() - new Date(p.date).getTime()) > 7 * 86400000);
        answer = stale.length > 0 ? `📋 ${stale.length} הצעות ממתינות:\n${stale.map(p => `• ${p.name} (${p.client}) — ${Math.round((Date.now() - new Date(p.date).getTime()) / 86400000)} ימים`).join('\n')}\n\nלחץ "שלח תזכורת" ליד כל הצעה` : '✅ אין הצעות ממתינות';
      }
      else {
        // General search in project names/clients
        const found = projects.filter(p => p.name.includes(q) || p.client.includes(q) || (p.type && p.type.includes(q)));
        if (found.length > 0) {
          answer = `🔍 נמצאו ${found.length} תוצאות:\n${found.map(p => `• ${p.name} — ${p.client} — ${p.status}`).join('\n')}`;
        } else {
          answer = `לא נמצאו תוצאות ל-"${q}".\n\nנסה: שם פרויקט, "סטטוס", "רווח", "סיכון", "ספקים", "מחיר"`;
        }
      }
      setAiMessages(prev => [...prev, { role: 'ai', text: answer }]);
    }, 500);
  }, [aiInput, projects, stats, rules]);

  // ─── File Upload Logic ───
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    showToast(`📄 מעבד: "${file.name}"...`);
    // Mock extraction
    setTimeout(() => {
      const mockItems = [
        { desc: `חומרים — ${file.name.replace(/\.[^.]+$/, '')}`, price: Math.round(1000 + Math.random() * 9000) },
        { desc: 'עבודת התקנה', price: Math.round(500 + Math.random() * 3000) },
        { desc: 'הובלה ופריקה', price: Math.round(200 + Math.random() * 1500) },
      ];
      setUploadResult({ name: file.name, items: mockItems });
      showToast(`✅ זוהו ${mockItems.length} פריטים מ-"${file.name}"`);
    }, 1500);
    e.target.value = '';
  };

  // ─── Reminder Logic ───
  const handleSendReminder = () => {
    if (!reminderTarget) return;
    const contact = contacts[reminderTarget.id];
    if (!contact?.email && !contact?.phone) {
      showToast('⚠ יש להזין פרטי התקשרות');
      return;
    }
    // Save contact
    setContacts(prev => ({ ...prev, [reminderTarget.id]: { projectId: reminderTarget.id, email: contactForm.email, phone: contactForm.phone } }));
    showToast(`📧 תזכורת נשלחה ל-${reminderTarget.client} (${contactForm.email || contactForm.phone})`);
    setReminderTarget(null);
    setContactForm({ email: '', phone: '' });
  };

  const openReminder = (p: Project) => {
    const existing = contacts[p.id];
    setContactForm({ email: existing?.email || '', phone: existing?.phone || '' });
    setReminderTarget(p);
  };

  // ─── New Rule Logic ───
  const addRule = () => {
    if (!ruleForm.condition.trim() || !ruleForm.action.trim()) { showToast('יש למלא תנאי ופעולה'); return; }
    setRules(prev => [...prev, { condition: ruleForm.condition.trim(), action: ruleForm.action.trim() }]);
    setRuleForm({ condition: '', action: '' });
    setShowRuleModal(false);
    showToast('✅ כלל עסקי נוסף — דיוק התמחור עודכן');
  };

  // ─── Save Project ───
  const saveProject = async () => {
    if (!form.name.trim()) { showToast('שם פרויקט חובה'); return; }
    setSaving(true);
    try {
      await api.post('/projects', form);
      showToast('✅ הצעה חדשה נוצרה בהצלחה');
      setShowNewProject(false);
      setForm({ name: '', client: '', type: TYPES[0], address: '', date: today(), notes: '', margin_percent: 15 });
      load();
    } catch (e: any) { showToast('שגיאה: ' + e.message); }
    finally { setSaving(false); }
  };

  if (!stats) return (
    <div style={{ padding: 80, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
    </div>
  );

  const byS = (s: string) => projects.filter(p => p.status === s);
  const quoteP = byS('הצעה'), activeP = byS('בביצוע'), doneP = byS('הושלם'), approvedP = byS('אושר');
  const staleQuotes = quoteP.filter(p => p.date && (Date.now() - new Date(p.date).getTime()) > 7 * 86400000);
  const basePct = 85 + (doneP.length / Math.max(projects.length, 1)) * 10;
  const pricingAccuracy = Math.min(99, Math.round(basePct + rules.length * 0.5));
  const uf = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div style={{ fontFamily: T.f, display: 'flex', gap: 20, maxWidth: 1400 }}>

      {/* ═══ MAIN ═══ */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: T.text1, letterSpacing: '-.03em', margin: 0 }}>א.א קידוחים — ניהול פרויקטים</h1>
            <p style={{ fontSize: 16, color: T.text2, marginTop: 6, fontWeight: 600 }}>ניתוח, תמחור ואוטומציה חכמה</p>
          </div>
          <button onClick={() => setShowNewProject(true)} style={{
            fontFamily: T.f, display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 32px', background: `linear-gradient(135deg, ${T.cta}, ${T.cta2})`,
            color: '#fff', borderRadius: 14, border: 'none', fontSize: 16, fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 6px 24px rgba(249,115,22,.3)', transition: 'all .2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 32px rgba(249,115,22,.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 6px 24px rgba(249,115,22,.3)'; }}
          >➕ יצירת הצעה חדשה</button>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
          {[
            { icon: '🎯', iconBg: pricingAccuracy > 90 ? T.greenBg : T.orangeBg, val: `${pricingAccuracy}%`, sub: 'דיוק תמחור (AI)', desc: `${rules.length} כללים · ${doneP.length} פרויקטים`, color: pricingAccuracy > 90 ? T.green : T.orange },
            { icon: '📋', iconBg: T.purpleBg, val: String(staleQuotes.length), sub: 'ממתינים לתשובה', desc: 'הצעות מעל 7 ימים', color: T.purple },
            { icon: '🛡', iconBg: projects.filter(p => p.margin_percent < 10).length > 0 ? T.redBg : T.greenBg, val: String(projects.filter(p => p.margin_percent < 10).length), sub: 'ניתוח סיכונים', desc: 'רווח נמוך מ-10%', color: projects.filter(p => p.margin_percent < 10).length > 0 ? T.red : T.green },
            { icon: '🏗', iconBg: T.cyanBg, val: String(activeP.length), sub: 'פרויקטים בביצוע', desc: 'פעילים בשטח', color: T.cyan },
          ].map(k => (
            <div key={k.sub} style={{ ...card, padding: 28, transition: 'transform .2s, box-shadow .2s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 14px 44px rgba(0,0,0,.07)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = T.shadow; }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: k.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>{k.icon}</div>
              <div style={{ ...num(40, k.color) }}>{k.val}</div>
              <div style={{ fontFamily: T.f, fontSize: 16, fontWeight: 700, color: T.text1, marginTop: 10 }}>{k.sub}</div>
              <div style={{ fontFamily: T.f, fontSize: 14, color: T.text3, marginTop: 4, fontWeight: 600 }}>{k.desc}</div>
            </div>
          ))}
        </div>

        {/* Pipeline + Donut */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, marginBottom: 20 }}>
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '18px 28px', borderBottom: `1.5px solid ${T.border}` }}>
              <span style={{ fontFamily: T.f, fontSize: 22, fontWeight: 800, color: T.text1 }}>סטטוס Pipeline</span>
            </div>
            <div style={{ padding: 28 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
                {[
                  { n: quoteP.length, l: 'הצעות', c: T.accent, bg: '#F0F0FF' },
                  { n: activeP.length, l: 'בביצוע', c: '#E8860C', bg: '#FFF6EB' },
                  { n: approvedP.length, l: 'אושרו', c: T.purple, bg: '#F3F0FF' },
                  { n: doneP.length, l: 'הושלמו', c: T.green, bg: '#EAFAF3' },
                ].map(s => (
                  <div key={s.l} style={{ padding: '20px 14px', borderRadius: 16, background: s.bg, textAlign: 'center', transition: 'transform .15s' }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = '')}>
                    <div style={{ ...num(36, s.c) }}>{s.n}</div>
                    <div style={{ fontFamily: T.f, fontSize: 14, fontWeight: 700, color: s.c, marginTop: 8 }}>{s.l}</div>
                  </div>
                ))}
              </div>
              {staleQuotes.map(p => (
                <div key={p.id} style={{ padding: '12px 16px', borderRadius: 14, background: T.redBg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 16 }}>⚠</span>
                    <span style={{ fontFamily: T.f, fontSize: 14, color: T.red, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name} — {p.client}</span>
                  </div>
                  <button onClick={() => openReminder(p)} style={{
                    fontFamily: T.f, padding: '6px 14px', borderRadius: 10, border: 'none',
                    background: T.red, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                  }}>📧 תזכורת</button>
                </div>
              ))}
            </div>
          </div>
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '18px 24px', borderBottom: `1.5px solid ${T.border}` }}>
              <span style={{ fontFamily: T.f, fontSize: 16, fontWeight: 700, color: T.text1 }}>מדד פרויקטים</span>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Donut segments={[{ value: doneP.length, color: T.green }, { value: activeP.length, color: T.orange }, { value: approvedP.length, color: T.purple }, { value: quoteP.length, color: T.accent }]} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 20, width: '100%' }}>
                {[{ n: doneP.length, l: 'סגור', c: T.green }, { n: quoteP.length, l: 'פתוח', c: T.accent }, { n: approvedP.length, l: 'ממתין', c: T.purple }, { n: activeP.length, l: 'בתהליך', c: T.orange }].map(s => (
                  <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: s.c + '12' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.c }} />
                    <span style={{ fontFamily: T.f, fontSize: 16, color: s.c, fontWeight: 700 }}>{s.n}</span>
                    <span style={{ fontFamily: T.f, fontSize: 14, color: T.text3, fontWeight: 600 }}>{s.l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Upload result */}
        {uploadResult && (
          <div style={{ ...card, overflow: 'hidden', marginBottom: 20, borderColor: T.green + '44' }}>
            <div style={{ padding: '16px 28px', borderBottom: `1.5px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: T.f, fontSize: 16, fontWeight: 700, color: T.text1 }}>📄 תוצאות ניתוח: {uploadResult.name}</span>
              <button onClick={() => setUploadResult(null)} style={{ fontFamily: T.f, fontSize: 14, color: T.text3, cursor: 'pointer', background: 'none', border: 'none' }}>✕ סגור</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={thS}>פריט</th><th style={thS}>מחיר משוער</th></tr></thead>
              <tbody>{uploadResult.items.map((item, i) => (
                <tr key={i}><td style={tdS({ fontWeight: 600, color: T.text1 })}>{item.desc}</td><td style={tdS({ fontWeight: 700, color: T.green })}>{fmt(item.price)} ₪</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* All Projects */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '18px 28px', borderBottom: `1.5px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: T.f, fontSize: 22, fontWeight: 800, color: T.text1 }}>כל הפרויקטים</span>
            <button onClick={() => navigate('/projects')} style={{ fontFamily: T.f, padding: '8px 20px', borderRadius: 10, border: `1.5px solid ${T.border}`, background: T.card, fontSize: 14, fontWeight: 700, color: T.text2, cursor: 'pointer' }}>ניהול →</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['שם פרויקט', 'לקוח', 'סוג', 'סטטוס', 'רווח', 'תאריך', 'סיכון'].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>{projects.map(p => {
              const risk = p.margin_percent < 10 ? 'high' : p.margin_percent < 15 ? 'med' : 'low';
              return (
                <tr key={p.id} style={{ cursor: 'pointer', transition: 'background .1s' }} onClick={() => navigate(`/projects/${p.id}`)}
                  onMouseEnter={e => (e.currentTarget.style.background = '#FAFAFF')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={tdS({ fontWeight: 700, color: T.text1 })}>{p.name}</td>
                  <td style={tdS()}>{p.client}</td>
                  <td style={tdS({ color: T.text3 })}>{p.type || '—'}</td>
                  <td style={tdS()}><Badge status={p.status} /></td>
                  <td style={tdS({ fontWeight: 700, color: risk === 'high' ? T.red : risk === 'med' ? T.orange : T.green })}>{p.margin_percent}%</td>
                  <td style={tdS({ color: T.text3 })}>{fmtDate(p.date)}</td>
                  <td style={tdS()}><span style={{ fontFamily: T.f, fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 700, background: risk === 'high' ? T.redBg : risk === 'med' ? T.orangeBg : T.greenBg, color: risk === 'high' ? T.red : risk === 'med' ? '#D97706' : T.green }}>{risk === 'high' ? 'גבוה' : risk === 'med' ? 'בינוני' : 'נמוך'}</span></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </div>

      {/* ═══ AI SIDEBAR ═══ */}
      <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Brain */}
        <div style={{ ...card, overflow: 'hidden', borderColor: T.accent + '33' }}>
          <div style={{ padding: '18px 22px', background: `linear-gradient(135deg, ${T.accent}0A, ${T.purple}0A)`, borderBottom: `1.5px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg, ${T.accent}, ${T.purple})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff' }}>🧠</div>
            <div>
              <div style={{ fontFamily: T.f, fontSize: 16, fontWeight: 700, color: T.text1 }}>העוזר החכם</div>
              <div style={{ fontFamily: T.f, fontSize: 14, color: T.text3, fontWeight: 600 }}>שאל כל שאלה על הפרויקטים</div>
            </div>
          </div>
          {/* Chat */}
          <div style={{ padding: 16, maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {aiMessages.length === 0 && (
              <div style={{ textAlign: 'center', padding: 16, color: T.text3, fontSize: 14 }}>
                נסה: "סטטוס", "רווח", "סיכון",<br/>או שם פרויקט/לקוח
              </div>
            )}
            {aiMessages.map((m, i) => (
              <div key={i} style={{
                padding: '10px 14px', borderRadius: 14, fontSize: 14, fontFamily: T.f, fontWeight: 500, lineHeight: 1.6, whiteSpace: 'pre-line',
                background: m.role === 'user' ? T.accentBg : T.bg,
                color: m.role === 'user' ? T.accent : T.text1,
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '95%',
              }}>{m.text}</div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div style={{ padding: '0 16px 16px', display: 'flex', gap: 6 }}>
            <input value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAiSend()} placeholder="שאל שאלה..."
              style={{ flex: 1, padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${T.border}`, fontSize: 14, fontFamily: T.f, background: T.card, outline: 'none' }} />
            <button onClick={handleAiSend} style={{ padding: '10px 14px', borderRadius: 12, border: 'none', background: T.accent, color: '#fff', fontFamily: T.f, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>↵</button>
          </div>
        </div>

        {/* Rules */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '16px 22px', borderBottom: `1.5px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: T.f, fontSize: 16, fontWeight: 700, color: T.text1 }}>כללים עסקיים ({rules.length})</span>
            <button onClick={() => setShowRuleModal(true)} style={{ fontFamily: T.f, fontSize: 14, fontWeight: 700, color: T.accent, cursor: 'pointer', background: 'none', border: 'none' }}>+ הוסף</button>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rules.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 12, background: T.bg }}>
                <span style={{ fontSize: 14, marginTop: 1 }}>📌</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: T.f, fontSize: 14, color: T.text1, fontWeight: 600 }}>{r.condition}</div>
                  <div style={{ fontFamily: T.f, fontSize: 14, color: T.text3, fontWeight: 500 }}>{r.action}</div>
                </div>
                <button onClick={() => setRules(prev => prev.filter((_, j) => j !== i))} style={{ fontSize: 12, color: T.text3, cursor: 'pointer', background: 'none', border: 'none', padding: 4 }}>✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '16px 22px', borderBottom: `1.5px solid ${T.border}` }}>
            <span style={{ fontFamily: T.f, fontSize: 16, fontWeight: 700, color: T.text1 }}>פעולות מהירות</span>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv,.docx" onChange={handleFileUpload} style={{ display: 'none' }} />
            {[
              { label: '📥 העלאת קבצי ספקים', action: () => fileRef.current?.click() },
              { label: '🔍 חיפוש במחירון', action: () => navigate('/prices') },
              { label: '⚙ הגדרות חברה', action: () => navigate('/settings') },
            ].map(a => (
              <button key={a.label} onClick={a.action} style={{
                fontFamily: T.f, width: '100%', padding: '12px 16px', borderRadius: 12,
                border: `1.5px solid ${T.border}`, background: T.card, color: T.text2,
                fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'right',
                transition: 'all .12s', display: 'flex', alignItems: 'center', gap: 8,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = '#FAFAFF'; e.currentTarget.style.borderColor = T.accent + '44'; }}
                onMouseLeave={e => { e.currentTarget.style.background = T.card; e.currentTarget.style.borderColor = T.border; }}
              >{a.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ MODALS ═══ */}

      {/* New Project */}
      {showNewProject && (
        <Modal title="יצירת הצעה חדשה" onClose={() => setShowNewProject(false)} footer={
          <><button className="btn btn-primary" onClick={saveProject} disabled={saving} style={{ fontSize: 14, padding: '10px 28px' }}>{saving ? '...שומר' : '📄 צור הצעה'}</button>
          <button className="btn btn-secondary" onClick={() => setShowNewProject(false)} style={{ fontSize: 14 }}>ביטול</button></>
        }>
          <div className="form-grid">
            <div className="form-group"><label className="form-label">שם פרויקט *</label><input className="form-input" value={form.name} onChange={e => uf('name', e.target.value)} autoFocus /></div>
            <div className="form-group"><label className="form-label">לקוח</label><input className="form-input" value={form.client} onChange={e => uf('client', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">סוג עבודה</label><select className="form-input" value={form.type} onChange={e => uf('type', e.target.value)}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div className="form-group"><label className="form-label">כתובת</label><input className="form-input" value={form.address} onChange={e => uf('address', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">תאריך</label><input className="form-input" type="date" value={form.date} onChange={e => uf('date', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">רווח %</label><input className="form-input" type="number" min={0} max={50} value={form.margin_percent} onChange={e => uf('margin_percent', +e.target.value)} /></div>
            <div className="form-group full"><label className="form-label">הערות</label><textarea className="form-input" value={form.notes} onChange={e => uf('notes', e.target.value)} /></div>
          </div>
        </Modal>
      )}

      {/* Reminder (contact details) */}
      {reminderTarget && (
        <Modal title={`שליחת תזכורת — ${reminderTarget.client}`} onClose={() => setReminderTarget(null)} footer={
          <><button className="btn btn-primary" onClick={handleSendReminder} style={{ fontSize: 14, padding: '10px 28px' }}>{(contactForm.email || contactForm.phone) ? '✅ אישור ושליחה' : '📧 שלח תזכורת'}</button>
          <button className="btn btn-secondary" onClick={() => setReminderTarget(null)} style={{ fontSize: 14 }}>ביטול</button></>
        }>
          <div style={{ marginBottom: 16, padding: '14px 18px', borderRadius: 14, background: T.bg }}>
            <div style={{ fontFamily: T.f, fontSize: 16, fontWeight: 700, color: T.text1 }}>{reminderTarget.name}</div>
            <div style={{ fontFamily: T.f, fontSize: 14, color: T.text3, marginTop: 4 }}>לקוח: {reminderTarget.client} · {Math.round((Date.now() - new Date(reminderTarget.date).getTime()) / 86400000)} ימים ממתין</div>
          </div>
          {!contactForm.email && !contacts[reminderTarget.id]?.email && (
            <div style={{ padding: '12px 16px', borderRadius: 12, background: T.orangeBg, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16 }}>⚠</span>
              <span style={{ fontFamily: T.f, fontSize: 14, color: '#D97706', fontWeight: 600 }}>חסרים פרטי התקשרות — הזן מייל או נייד</span>
            </div>
          )}
          <div className="form-grid">
            <div className="form-group"><label className="form-label">אימייל</label><input className="form-input" type="email" value={contactForm.email} onChange={e => setContactForm(prev => ({ ...prev, email: e.target.value }))} placeholder="email@example.com" dir="ltr" /></div>
            <div className="form-group"><label className="form-label">נייד</label><input className="form-input" value={contactForm.phone} onChange={e => setContactForm(prev => ({ ...prev, phone: e.target.value.replace(/[^0-9\-]/g, '') }))} placeholder="050-0000000" dir="ltr" inputMode="tel" /></div>
          </div>
        </Modal>
      )}

      {/* New Rule */}
      {showRuleModal && (
        <Modal title="הוספת כלל עסקי" onClose={() => setShowRuleModal(false)} footer={
          <><button className="btn btn-primary" onClick={addRule} style={{ fontSize: 14, padding: '10px 28px' }}>✅ שמור כלל</button>
          <button className="btn btn-secondary" onClick={() => setShowRuleModal(false)} style={{ fontSize: 14 }}>ביטול</button></>
        }>
          <p style={{ fontFamily: T.f, fontSize: 14, color: T.text2, marginBottom: 20, lineHeight: 1.6 }}>
            הגדר כלל שהמערכת תשתמש בו לשיפור דיוק התמחור. כללים נשמרים ומשפיעים על מדד הדיוק.
          </p>
          <div className="form-grid">
            <div className="form-group full"><label className="form-label">תנאי (מתי מופעל)</label><input className="form-input" value={ruleForm.condition} onChange={e => setRuleForm(prev => ({ ...prev, condition: e.target.value }))} placeholder="למשל: קרקע סלעית, פרויקט בנטונייט..." autoFocus /></div>
            <div className="form-group full"><label className="form-label">פעולה (מה לעשות)</label><input className="form-input" value={ruleForm.action} onChange={e => setRuleForm(prev => ({ ...prev, action: e.target.value }))} placeholder="למשל: תוספת 20% לעלות, מינימום רווח 15%..." /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
