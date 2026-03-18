import { useState, useEffect, type ReactNode } from 'react';
import { api } from '../utils/api';
import { showToast } from '../hooks/useToast';

function Section({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <span>{icon} {title}</span>
      </div>
      <div style={{ padding: 20 }}>
        <div className="form-grid">{children}</div>
      </div>
    </div>
  );
}

/** Input for numeric-only fields - fixes focus loss bug (#3) */
function NumericInput({ value, onChange, placeholder, ...rest }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  [k: string]: any;
}) {
  return (
    <input
      className="form-input"
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={e => {
        const cleaned = e.target.value.replace(/[^0-9\-]/g, '');
        if (cleaned !== e.target.value) onChange(cleaned);
      }}
      onKeyDown={e => {
        // Allow: backspace, delete, tab, escape, enter, arrows, home, end
        if ([8, 9, 27, 13, 46, 35, 36, 37, 38, 39, 40].includes(e.keyCode)) return;
        // Allow: Ctrl+A/C/V/X
        if ((e.ctrlKey || e.metaKey) && [65, 67, 86, 88].includes(e.keyCode)) return;
        // Allow: digits and hyphen
        if (/[0-9\-]/.test(e.key)) return;
        e.preventDefault();
      }}
      placeholder={placeholder}
      dir="ltr"
      inputMode="tel"
      {...rest}
    />
  );
}

interface CompanySettings {
  companyName: string;
  companySubtitle: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  licenseNumber: string;
  vatId: string;
  bankName: string;
  bankBranch: string;
  bankAccount: string;
  defaultMargin: number;
  defaultOverhead: number;
  defaultInsurance: number;
  quoteValidDays: number;
  paymentTerms: string;
  notes: string;
}

const DEFAULTS: CompanySettings = {
  companyName: 'א.א קידוחים ופיתוח',
  companySubtitle: 'עבודות קידוח, בנטונייט, עפר ופיתוח',
  ownerName: 'אליאב אפריאט',
  phone: '', email: '', address: '',
  licenseNumber: '', vatId: '',
  bankName: '', bankBranch: '', bankAccount: '',
  defaultMargin: 15, defaultOverhead: 0, defaultInsurance: 0,
  quoteValidDays: 30, paymentTerms: 'שוטף + 30', notes: '',
};

const STORAGE_KEY = 'aa-pricing-settings';

export default function Settings() {
  const [settings, setSettings] = useState<CompanySettings>(DEFAULTS);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setSettings({ ...DEFAULTS, ...JSON.parse(stored) }); } catch { /* ignore */ }
    }
  }, []);

  const u = (k: keyof CompanySettings, v: any) => {
    setSettings(prev => ({ ...prev, [k]: v }));
    setSaved(false);
  };

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
    showToast('הגדרות נשמרו');
  };

  const exportDb = async () => {
    try {
      const [projects, pricesData] = await Promise.all([
        api.get('/projects'),
        api.get('/prices?limit=99999'),
      ]);
      const data = JSON.stringify({ projects, prices: pricesData, settings }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = \`pricing-backup-\${new Date().toISOString().split('T')[0]}.json\`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('גיבוי הורד בהצלחה');
    } catch { showToast('שגיאה בגיבוי'); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">הגדרות</div>
          <div className="page-sub">פרטי חברה, ברירות מחדל וגיבוי</div>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saved}>
          {saved ? '✓ שמור' : '💾 שמור שינויים'}
        </button>
      </div>

      <div style={{ maxWidth: 720 }}>
        <Section title="פרטי חברה" icon="🏢">
          <div className="form-group">
            <label className="form-label">שם חברה</label>
            <input className="form-input" value={settings.companyName} onChange={e => u('companyName', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">תת-כותרת</label>
            <input className="form-input" value={settings.companySubtitle} onChange={e => u('companySubtitle', e.target.value)} placeholder="מופיע מתחת לשם בהצעת מחיר" />
          </div>
          <div className="form-group">
            <label className="form-label">שם בעלים / איש קשר</label>
            <input className="form-input" value={settings.ownerName} onChange={e => u('ownerName', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">טלפון</label>
            <NumericInput value={settings.phone} onChange={v => u('phone', v)} placeholder="050-0000000" />
          </div>
          <div className="form-group">
            <label className="form-label">אימייל</label>
            <input className="form-input" type="email" value={settings.email} onChange={e => u('email', e.target.value)} placeholder="email@example.com" dir="ltr" />
          </div>
          <div className="form-group">
            <label className="form-label">כתובת</label>
            <input className="form-input" value={settings.address} onChange={e => u('address', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">מספר רישיון קבלן</label>
            <NumericInput value={settings.licenseNumber} onChange={v => u('licenseNumber', v)} placeholder="" />
          </div>
          <div className="form-group">
            <label className="form-label">ח.פ / ע.מ</label>
            <NumericInput value={settings.vatId} onChange={v => u('vatId', v)} placeholder="" />
          </div>
        </Section>

        <Section title="פרטי בנק" icon="🏦">
          <div className="form-group">
            <label className="form-label">שם בנק</label>
            <input className="form-input" value={settings.bankName} onChange={e => u('bankName', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">סניף</label>
            <NumericInput value={settings.bankBranch} onChange={v => u('bankBranch', v)} placeholder="" />
          </div>
          <div className="form-group full">
            <label className="form-label">מספר חשבון</label>
            <NumericInput value={settings.bankAccount} onChange={v => u('bankAccount', v)} placeholder="" />
          </div>
        </Section>

        <Section title="ברירות מחדל להצעות" icon="📋">
          <div className="form-group">
            <label className="form-label">רווח קבלני (%)</label>
            <input className="form-input" type="number" min={0} max={50} value={settings.defaultMargin} onChange={e => u('defaultMargin', +e.target.value)} />
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>מרווח רווח שיתווסף אוטומטית לכל פרויקט חדש</span>
          </div>
          <div className="form-group">
            <label className="form-label">תקורות (%)</label>
            <input className="form-input" type="number" min={0} max={30} value={settings.defaultOverhead} onChange={e => u('defaultOverhead', +e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">ביטוח (%)</label>
            <input className="form-input" type="number" min={0} max={20} value={settings.defaultInsurance} onChange={e => u('defaultInsurance', +e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">תוקף הצעה (ימים)</label>
            <input className="form-input" type="number" min={1} max={90} value={settings.quoteValidDays} onChange={e => u('quoteValidDays', +e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">תנאי תשלום</label>
            <select className="form-input" value={settings.paymentTerms} onChange={e => u('paymentTerms', e.target.value)}>
              <option>שוטף + 30</option>
              <option>שוטף + 45</option>
              <option>שוטף + 60</option>
              <option>שוטף + 90</option>
              <option>מזומן</option>
              <option>לפי התקדמות</option>
            </select>
          </div>
          <div className="form-group full">
            <label className="form-label">הערות קבועות להצעה</label>
            <textarea className="form-input" rows={3} value={settings.notes} onChange={e => u('notes', e.target.value)} placeholder="טקסט שיופיע בתחתית כל הצעת מחיר" />
          </div>
        </Section>

        <Section title="גיבוי ומערכת" icon="💾">
          <div className="form-group full">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={exportDb}>📥 הורד גיבוי JSON</button>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, display: 'block' }}>
              מכיל את כל הפרויקטים, סעיפי עלות, מחירון והגדרות
            </span>
          </div>
          <div className="form-group full" style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 2, background: 'var(--surface2)', padding: 14, borderRadius: 8 }}>
              <div><strong>גרסה:</strong> 2.0 (מקומי)</div>
              <div><strong>מסד נתונים:</strong> D:/אפליקציות/מערכת תמחור/data/pricing.db</div>
              <div><strong>שרת:</strong> localhost:3002 · <strong>לקוח:</strong> localhost:5175</div>
            </div>
          </div>
        </Section>
      </div>
    </>
  );
}
