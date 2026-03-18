import { useState, useRef, useCallback } from 'react';
import { api } from '../utils/api';
import { fmt } from '../utils/format';
import { showToast } from '../hooks/useToast';
import type { PriceItem } from '../types';
import { UNITS } from '../types';

/* ═══ Types ═══ */
interface ImportRow {
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  category: string;
  checked: boolean;
}

interface SmartImportProps {
  projectId: string;
  onClose: () => void;
  onImported: () => void;
}

const T = {
  card: '#FFFFFF', border: '#E4E4EE', bg: '#F7F7FC',
  text1: '#1E1E2D', text2: '#6E7191', text3: '#A0A3BD',
  accent: '#5B6CFF', accentBg: '#EEEEFF',
  cta: '#F97316', green: '#00BA88', greenBg: '#E6F9F1',
  red: '#FF6B6B', redBg: '#FFF0F0',
  orange: '#FFAA33', orangeBg: '#FFF5E6',
  f: "'Inter','Heebo',sans-serif",
};

/* ═══ Helpers ═══ */
function toNum(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return 0;
  return parseFloat(v.replace(/[,₪\s]/g, '')) || 0;
}

/** Fix #4: Improved category detection with chapter headers */
let currentChapterCategory = 'other';

function detectCategoryFromChapter(line: string): string | null {
  const d = line.trim();
  // Detect chapter/section headers
  const chapterPatterns: [RegExp, string][] = [
    [/^(פרק|סעיף)?\s*[א-ת0-9.\-]*\s*(עבודות\s*עפר|חפירה|מילוי|הידוק|יישור|חישוף|פיתוח)/i, 'labor'],
    [/^(פרק|סעיף)?\s*[א-ת0-9.\-]*\s*(בטון|יציקה|כלונס|ארמטורה|ברזל|זיון|שלד)/i, 'materials'],
    [/^(פרק|סעיף)?\s*[א-ת0-9.\-]*\s*(ניקוז|צינור|שוחה|ביוב|מים|תשתית|אינסטלציה)/i, 'materials'],
    [/^(פרק|סעיף)?\s*[א-ת0-9.\-]*\s*(אספלט|ריצוף|משתלבת|גינון|שפה|מדרכ)/i, 'materials'],
    [/^(פרק|סעיף)?\s*[א-ת0-9.\-]*\s*(הריסה|פירוק|פינוי|סילוק|פסולת)/i, 'transport'],
    [/^(פרק|סעיף)?\s*[א-ת0-9.\-]*\s*(קידוח|בנטונייט|כלונס|בור\s*חלחול)/i, 'equipment'],
    [/^(פרק|סעיף)?\s*[א-ת0-9.\-]*\s*(הובלה|ציוד|מנוף|מחפר|משאית|טרקטור)/i, 'equipment'],
    [/^(פרק|סעיף)?\s*[א-ת0-9.\-]*\s*(עבודה|כ"א|שעות|ימי)/i, 'labor'],
    [/^(פרק|סעיף)?\s*[א-ת0-9.\-]*\s*(קבלן|קבלני\s*משנה|שירותי)/i, 'subcontractor'],
    [/^(פרק|סעיף)?\s*[א-ת0-9.\-]*\s*(היתר|רישוי|אגרה|מיסים|ביטוח)/i, 'permits'],
  ];
  for (const [re, cat] of chapterPatterns) {
    if (re.test(d)) return cat;
  }
  return null;
}

function detectCategory(desc: string): string {
  const d = desc.toLowerCase();
  // Check if this is a chapter header — update context
  const chapterCat = detectCategoryFromChapter(desc);
  if (chapterCat) {
    currentChapterCategory = chapterCat;
    return chapterCat;
  }

  const map: [string[], string][] = [
    // עבודות עפר ופיתוח
    [['חפירה', 'עפר', 'מילוי', 'הידוק', 'מצע', 'יישור', 'חישוף', 'חציבה', 'כרייה', 'פילוס', 'גריסה', 'עבודות עפר', 'פיתוח'], 'labor'],
    // בטון ומבנים
    [['בטון', 'יציקה', 'כלונס', 'ארמטורה', 'ברזל', 'זיון', 'תבנית', 'טפסות', 'דופן', 'קורה', 'עמוד', 'יסוד', 'רצפה', 'תקרה'], 'materials'],
    // ניקוז ותשתיות
    [['ניקוז', 'צינור', 'שוחה', 'ביוב', 'מים', 'שרוול', 'תעלה', 'מנהרה', 'תשתית', 'אינסטל'], 'materials'],
    // כבישים וריצוף
    [['אספלט', 'ריצוף', 'משתלבת', 'אבן שפה', 'מרצפ', 'מדרכה', 'כביש', 'גינון'], 'materials'],
    // הריסה ופינוי
    [['הריסה', 'פירוק', 'פינוי', 'פסולת', 'סילוק', 'גריסה', 'ניקוי', 'הובלת פסולת'], 'transport'],
    // הובלה וציוד
    [['הובלה', 'הובלת ציוד', 'שינוע', 'העברה', 'משלוח'], 'transport'],
    // ציוד וקידוח
    [['מקדח', 'קידוח', 'בנטונייט', 'בור חלחול', 'מנוף', 'מחפר', 'טרקטור', 'משאית', 'ציוד', 'באגר', 'JCB', 'בובקט', 'מדחס', 'גנרטור', 'משאבה'], 'equipment'],
    // קבלני משנה
    [['קבלן', 'קבלני משנה', 'שירותי'], 'subcontractor'],
    // היתרים
    [['היתר', 'רישוי', 'אגרה', 'ביטוח', 'מדידה', 'פיקוח'], 'permits'],
  ];
  for (const [keywords, cat] of map) {
    if (keywords.some(k => d.includes(k))) return cat;
  }
  // Fallback: use current chapter context
  return currentChapterCategory;
}

const KNOWN_DESC = ['תיאור', 'פריט', 'שם', 'description', 'item', 'סעיף', 'פירוט', 'עבודה'];
const KNOWN_UNIT = ['יחידה', 'יח', 'unit', "יח'"];
const KNOWN_QTY = ['כמות', 'quantity', 'qty'];
const KNOWN_PRICE = ['מחיר', 'price', 'עלות', 'מחיר ליחידה', 'תעריף'];

function detectCol(headers: string[], known: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim().toLowerCase();
    if (known.some(k => h.includes(k))) return i;
  }
  return -1;
}

/* ═══ COMPONENT ═══ */
export default function SmartImport({ projectId, onClose, onImported }: SmartImportProps) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState('');
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Parse any file ───
  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setLoading(true);
    setLoadMsg('קורא קובץ...');
    setRows([]);
    currentChapterCategory = 'other'; // reset chapter context

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    try {
      let parsed: ImportRow[] = [];

      if (['xlsx', 'xls', 'csv'].includes(ext)) {
        parsed = await parseExcel(file);
      } else if (ext === 'pdf') {
        parsed = await parsePdf(file);
      } else if (['docx', 'doc'].includes(ext)) {
        parsed = await parseWord(file);
      } else if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff'].includes(ext)) {
        parsed = await parseImage(file);
      } else {
        showToast('⚠ סוג קובץ לא נתמך');
      }

      // Dedup
      const seen = new Set<string>();
      parsed = parsed.filter(r => {
        const key = r.description.trim().replace(/\s+/g, ' ').toLowerCase();
        if (!key || key.length < 3 || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setRows(parsed);
      if (parsed.length === 0) showToast('⚠ לא נמצאו שורות בקובץ');
      else showToast(\`✅ נקלטו \${parsed.length} שורות\`);
    } catch (e: any) {
      showToast('❌ שגיאה: ' + e.message);
    } finally {
      setLoading(false);
      setLoadMsg('');
    }
  }, []);

  // ─── Excel ───
  async function parseExcel(file: File): Promise<ImportRow[]> {
    setLoadMsg('קורא Excel...');
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (data.length < 2) return [];

    let hIdx = 0;
    for (let i = 0; i < Math.min(5, data.length); i++) {
      if (data[i].filter((c: any) => String(c).trim()).length >= 3) { hIdx = i; break; }
    }
    const hdrs = data[hIdx].map((c: any) => String(c).trim());
    const body = data.slice(hIdx + 1).filter((row: any[]) => row.some((c: any) => String(c).trim()));

    const dCol = detectCol(hdrs, KNOWN_DESC);
    const uCol = detectCol(hdrs, KNOWN_UNIT);
    const qCol = detectCol(hdrs, KNOWN_QTY);
    const pCol = detectCol(hdrs, KNOWN_PRICE);

    const descCol = dCol >= 0 ? dCol : (() => {
      let mx = 0, mi = 0;
      hdrs.forEach((_: string, i: number) => {
        const l = body.slice(0, 5).reduce((s: number, r: any[]) => s + String(r[i] || '').length, 0);
        if (l > mx) { mx = l; mi = i; }
      });
      return mi;
    })();

    return body.map((row: any[]) => {
      const desc = String(row[descCol] || '').trim();
      if (!desc || desc.length < 2) return null;
      return {
        description: desc,
        unit: uCol >= 0 ? String(row[uCol] || '').trim() : '',
        quantity: qCol >= 0 ? toNum(row[qCol]) : 0,
        unitPrice: pCol >= 0 ? toNum(row[pCol]) : 0,
        category: detectCategory(desc),
        checked: true,
      };
    }).filter(Boolean) as ImportRow[];
  }

  // ─── PDF (Fix #5: detect graphic PDFs) ───
  async function parsePdf(file: File): Promise<ImportRow[]> {
    setLoadMsg('קורא PDF...');
    let lib = (window as any).pdfjsLib;
    if (!lib) {
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = () => {
          (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          res();
        };
        s.onerror = rej;
        document.head.appendChild(s);
      });
      lib = (window as any).pdfjsLib;
    }

    const buf = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: buf }).promise;
    const allText: string[] = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      setLoadMsg(\`קורא עמוד \${p}/\${pdf.numPages}...\`);
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      let line = '';
      for (const item of tc.items) {
        const str = (item as any).str || '';
        line += str;
        if ((item as any).hasEOL || str.includes('\n')) {
          if (line.trim()) allText.push(line.trim());
          line = '';
        }
      }
      if (line.trim()) allText.push(line.trim());
    }

    // Fix #5: If very few text lines found, this is likely a graphic/plan PDF
    const meaningfulLines = allText.filter(l => l.length > 5);
    if (meaningfulLines.length < 3) {
      showToast('📄 זהו PDF גרפי (תכנית/מפרט) — מומלץ להעלות כמסמך בטאב "מסמכים"');
      return [];
    }

    return allText
      .filter(l => l.length > 2)
      .map(l => ({
        description: l,
        unit: '',
        quantity: 0,
        unitPrice: 0,
        category: detectCategory(l),
        checked: true,
      }));
  }

  // ─── Word ───
  async function parseWord(file: File): Promise<ImportRow[]> {
    setLoadMsg('קורא Word...');
    const mammoth = await import('mammoth');
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value.split('\n').map(l => l.trim()).filter(l => l.length > 2)
      .map(l => ({
        description: l, unit: '', quantity: 0, unitPrice: 0,
        category: detectCategory(l), checked: true,
      }));
  }

  // ─── Image (OCR) ───
  async function parseImage(file: File): Promise<ImportRow[]> {
    setLoadMsg('טוען OCR...');
    let Tess = (window as any).Tesseract;
    if (!Tess) {
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload = () => { Tess = (window as any).Tesseract; res(); };
        s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    setLoadMsg('מזהה טקסט (OCR)...');
    const worker = await Tess.createWorker('heb+eng');
    const url = URL.createObjectURL(file);
    const { data } = await worker.recognize(url);
    URL.revokeObjectURL(url);
    await worker.terminate();
    return data.text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 2)
      .map((l: string) => ({
        description: l, unit: '', quantity: 0, unitPrice: 0,
        category: detectCategory(l), checked: true,
      }));
  }

  // ─── Import ───
  const doImport = async () => {
    const selected = rows.filter(r => r.checked);
    if (selected.length === 0) { showToast('⚠ לא נבחרו פריטים'); return; }
    setImporting(true);
    try {
      const items = selected.map(r => ({
        category: r.category,
        description: r.description,
        unit: r.unit || UNITS[0],
        quantity: r.quantity,
        unit_price: r.unitPrice,
      }));

      const result = await api.post<{ ok: boolean; count: number; skipped?: number }>('/costs/batch', { project_id: projectId, items });

      if (result.skipped && result.skipped > 0) {
        showToast(\`✅ \${result.count} סעיפים יובאו (\${result.skipped} כפילויות דולגו)\`);
      } else {
        showToast(\`✅ \${result.count} סעיפים יובאו\`);
      }
      onImported();
      onClose();
    } catch (e: any) {
      showToast('❌ ' + e.message);
    } finally {
      setImporting(false);
    }
  };

  const toggleAll = (v: boolean) => setRows(prev => prev.map(r => ({ ...r, checked: v })));
  const toggleRow = (i: number) => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, checked: !r.checked } : r));
  const updateRow = (i: number, key: keyof ImportRow, val: any) => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  const selectedCount = rows.filter(r => r.checked).length;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(30,30,45,.3)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }} onClick={onClose}>
      <div style={{ background: T.card, borderRadius: 22, width: '95%', maxWidth: 960, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(30,30,60,.15)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px 28px', borderBottom: \`1.5px solid \${T.border}\`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: T.f, fontSize: 20, fontWeight: 800, color: T.text1 }}>הוסף קובץ</div>
            {fileName && <div style={{ fontFamily: T.f, fontSize: 13, color: T.text3, marginTop: 4 }}>📄 {fileName}</div>}
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: T.bg, cursor: 'pointer', fontSize: 16, color: T.text3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>
          {rows.length === 0 && !loading && (
            <div onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              style={{ border: \`2.5px dashed \${dragOver ? T.accent : T.border}\`, borderRadius: 20, padding: '48px 40px', textAlign: 'center', cursor: 'pointer', background: dragOver ? T.accentBg : T.bg, transition: 'all .2s' }}
              onClick={() => fileRef.current?.click()}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: .6 }}>📁</div>
              <div style={{ fontFamily: T.f, fontSize: 18, fontWeight: 700, color: T.text1, marginBottom: 8 }}>גרור קובץ או לחץ לבחירה</div>
              <div style={{ fontFamily: T.f, fontSize: 14, color: T.text3, marginBottom: 20 }}>Excel · CSV · PDF · Word · תמונות</div>
              <div style={{ display: 'inline-flex', padding: '12px 28px', background: \`linear-gradient(135deg, \${T.cta}, #EA580C)\`, color: '#fff', borderRadius: 14, fontFamily: T.f, fontSize: 14, fontWeight: 700, boxShadow: '0 4px 16px rgba(249,115,22,.25)' }}
                onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}>📂 בחר קובץ</div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,.doc,.jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} style={{ display: 'none' }} />
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <div style={{ width: 40, height: 40, border: \`3px solid \${T.border}\`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin .6s linear infinite', margin: '0 auto 16px' }} />
              <div style={{ fontFamily: T.f, fontSize: 16, fontWeight: 700, color: T.text1 }}>{loadMsg}</div>
            </div>
          )}

          {rows.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontFamily: T.f, fontSize: 16, fontWeight: 700, color: T.text1 }}>
                  {selectedCount} מתוך {rows.length} נבחרו
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setRows([]); setFileName(''); }} style={{ fontFamily: T.f, padding: '6px 14px', borderRadius: 8, border: \`1.5px solid \${T.border}\`, background: T.card, fontSize: 12, fontWeight: 600, color: T.text3, cursor: 'pointer' }}>📂 קובץ אחר</button>
                  <button onClick={() => toggleAll(true)} style={{ fontFamily: T.f, padding: '6px 14px', borderRadius: 8, border: \`1.5px solid \${T.border}\`, background: T.card, fontSize: 12, fontWeight: 600, color: T.accent, cursor: 'pointer' }}>בחר הכל</button>
                  <button onClick={() => toggleAll(false)} style={{ fontFamily: T.f, padding: '6px 14px', borderRadius: 8, border: \`1.5px solid \${T.border}\`, background: T.card, fontSize: 12, fontWeight: 600, color: T.text3, cursor: 'pointer' }}>בטל הכל</button>
                </div>
              </div>
              <div style={{ overflowX: 'auto', borderRadius: 14, border: \`1.5px solid \${T.border}\` }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.f }}>
                  <thead>
                    <tr>
                      <th style={th}>✓</th>
                      <th style={th}>תיאור</th>
                      <th style={{ ...th, width: 80 }}>יחידה</th>
                      <th style={{ ...th, width: 80 }}>כמות</th>
                      <th style={{ ...th, width: 110 }}>מחיר ליחידה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} style={{ background: r.checked ? '' : '#F8F8FA' }}>
                        <td style={td}><input type="checkbox" checked={r.checked} onChange={() => toggleRow(i)} style={{ width: 16, height: 16, accentColor: T.accent }} /></td>
                        <td style={{ ...td, fontWeight: 600, color: T.text1, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</td>
                        <td style={td}><input value={r.unit} onChange={e => updateRow(i, 'unit', e.target.value)} style={cellInput} placeholder="יח'" /></td>
                        <td style={td}><input type="number" min={0} step="any" value={r.quantity || ''} onChange={e => updateRow(i, 'quantity', parseFloat(e.target.value) || 0)} style={cellInput} placeholder="0" /></td>
                        <td style={td}><input type="number" min={0} step="any" value={r.unitPrice || ''} onChange={e => updateRow(i, 'unitPrice', parseFloat(e.target.value) || 0)} style={cellInput} placeholder="0" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', borderTop: \`1.5px solid \${T.border}\`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onClose} style={{ fontFamily: T.f, padding: '10px 24px', borderRadius: 12, border: \`1.5px solid \${T.border}\`, background: T.card, fontSize: 14, fontWeight: 600, color: T.text2, cursor: 'pointer' }}>ביטול</button>
          {rows.length > 0 && selectedCount > 0 && (
            <button onClick={doImport} disabled={importing}
              style={{ fontFamily: T.f, padding: '10px 28px', borderRadius: 12, border: 'none', background: \`linear-gradient(135deg, \${T.cta}, #EA580C)\`, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(249,115,22,.25)' }}>
              {importing ? '...מייבא' : \`📥 ייבא \${selectedCount} סעיפים\`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#A0A3BD',
  textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'right',
  borderBottom: '2px solid #E4E4EE', background: '#FAFAFF', fontFamily: "'Inter','Heebo',sans-serif",
};
const td: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13, color: '#6E7191',
  borderBottom: '1px solid #E4E4EE', fontFamily: "'Inter','Heebo',sans-serif",
};
const cellInput: React.CSSProperties = {
  width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid #E4E4EE',
  fontSize: 13, fontFamily: "'Inter','Heebo',sans-serif", textAlign: 'center', outline: 'none',
};
