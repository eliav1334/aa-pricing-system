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
  isHeader?: boolean;
  sectionTitle?: string;
  catalogNumber?: string;  // מק"ט — for supplier quotes
  totalPrice?: number;     // סה"כ שורה
}

type ImportMode = 'boq' | 'supplier';

interface SupplierInfo {
  name: string;
  quoteNumber: string;
  quoteDate: string;
  contactPerson: string;
  phone: string;
  mobile: string;
  email: string;
  fax: string;
  website: string;
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
  red: '#FF6B6B', redBg: '#FFF0F0', orange: '#FFAA33', orangeBg: '#FFF5E6',
  purple: '#7B61FF', purpleBg: '#F0EDFF',
  f: "'Inter','Heebo',sans-serif",
};

/* ═══ Helpers ═══ */
function toNum(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return 0;
  return parseFloat(v.replace(/[,₪\s]/g, '')) || 0;
}

function detectCategory(desc: string): string {
  const d = desc.toLowerCase();
  const map: [string[], string][] = [
    [['חפירה', 'עפר', 'מילוי', 'הידוק', 'מצע', 'יישור', 'חישוף'], 'labor'],
    [['בטון', 'יציקה', 'כלונס', 'ארמטורה', 'ברזל', 'זיון'], 'materials'],
    [['ניקוז', 'צינור', 'שוחה', 'ביוב', 'מים', 'שרוול', 'תעלה'], 'transport'],
    [['אספלט', 'ריצוף', 'משתלבת', 'אבן שפה', 'מרצפ'], 'materials'],
    [['הריסה', 'פירוק', 'פינוי', 'פסולת', 'סילוק'], 'transport'],
    [['מקדח', 'קידוח', 'בנטונייט', 'בור חלחול'], 'equipment'],
    [['מנוף', 'מחפר', 'טרקטור', 'משאית', 'הובלה', 'ציוד'], 'equipment'],
    [['גדורה', 'משושית', 'בלימה', 'שפה', 'אבן', 'מרצפת', 'סימון'], 'materials'],
  ];
  for (const [keywords, cat] of map) {
    if (keywords.some(k => d.includes(k))) return cat;
  }
  return 'other';
}

/** סינון שורות זבל — מידע עסקי/מנהלי שאינו סעיף עלות */
function isJunkRow(desc: string): boolean {
  const d = desc.trim();
  if (d.length < 3) return true;
  if (/^[\d\s\-\.(),/₪%*#+]+$/.test(d)) return true;
  const junkPatterns = [
    /עוסק מורשה/, /מספר תיק/, /ח\.?פ\.?[:\s]/, /ע\.?מ\.?[:\s]/,
    /web\s*site/i, /www\./i, /https?:\/\//i, /@.*\./,
    /טל[פ]?[:\s]/, /טלפון[:\s]/, /פקס[:\s]/, /דוא["\u05F4]ל/i, /e-?mail/i, /נייד[:\s]/,
    /^\d{2}[\/\-.]\d{2}[\/\-.]\d{2,4}$/, /^\d{7,10}$/,
    /תאריך ה(צעה|דפסה)[:\s]/, /הצעת מחיר מס[פ']?/, /לכבוד[:\s]?$/, /בכבוד רב/,
    /חתימה[:\s]/, /תנאי תשלום/, /בתוקף עד/, /עמוד \d/i, /page \d/i,
    /סה["\u05F4]כ(?:\s+כללי)?$/, /^\*+$/, /^-+$/,
    /באיחוד עוסקים/, /תי?אור ישוב[:\s]/, /מס\.\s*תיק ניכויים/,
    /משקל תעודה[:\s]/, /^\d+\s+שקד$/, /^[*]?PQ\d+/,
    /בע["\u05F4]מ$/, /בע["\u05F4]מ\s*[-–]/, /מספר הצעה/,
    /סוכן[:\s]/, /מס[.'׳]?\s*לקוח/, /מס[.'׳]?\s*חברה/, /מהדורה\s+(נוכחית|קודמת)/,
    /מחיר כולל/, /סה["\u05F4]כ\s+מחיר/, /סה["\u05F4]כ\s+ללא/,
    /מע["\u05F4]מ\s*[\(\[]?\d/, /\(\d+\.?\d*%\)\s*מע/, /מע["\u05F4]מ$/,
    /כתובת[:\s]/, /רח['׳]?\s/, /ת\.?ד\.?\s*\d/, /מיקוד[:\s]/,
    /איזור תעשי[יה]/, /אזור תעשי[יה]/, /תא[:\s]?\d/, /א\.?ת\.?\s/,
    /^סה["\u05F4]כ/, /מחיר\s+כולל\s+\d/, /כולל\s+מע/, /ללא\s+מע/,
    /תאריך\s*ה+צע/, /תאריך[:\s]/, /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\s/,
    /עבודות\s+עפר\s+ופיתוח/, /קבלן\s+ראשי/, /פסון$/, /חב['׳]?\s/,
    /מחירי\s+ה(הובלה|משלוח)/, /המחירים\s+אינם/, /משלוח\s+משטחים/,
    /הערות[:\s]*$/, /תנאים[:\s]*$/, /הצהרה[:\s]*$/,
    /הצעת\s+מחיר\s+אינ/, /מינימום\s+הזמנה/, /בהעדר\s+מלאי/,
    /אינה\s+מהווה/,
    // Numbered notes: "5. " at start (1-2 digits only) — NOT catalog numbers
    /^\d{1,2}\.\s+[א-ת]/,
    // Separator/header rows in grouped quotes (e.g., רוקח: "****** ביוב ******")
    /\*{3,}/, /^[\s*]+$/,
    // ERP/system footers
    /הופק\s+ע["\u05F4]י/, /חשבשבת/, /מסמך\s+ממוחשב/, /העתק\s+משוחזר/,
    /סה["\u05F4]כ\s+משקל/, /סה["\u05F4]כ\s+לתשלום/,
  ];
  return junkPatterns.some(p => p.test(d));
}

/** זיהוי ספק ידוע מתוך טקסט */
const KNOWN_SUPPLIERS = [
  { pattern: /איטונג|ytong/i, name: 'איטונג' },
  { pattern: /אקרשטיין|ackerstein/i, name: 'אקרשטיין' },
  { pattern: /רדימקס|readymix/i, name: 'רדימקס' },
  { pattern: /נשר|nesher/i, name: 'נשר מלט' },
  { pattern: /טמבור|tambour/i, name: 'טמבור' },
  { pattern: /המשביר/i, name: 'המשביר' },
  { pattern: /שפיר/i, name: 'שפיר' },
  { pattern: /אלומט|alumat/i, name: 'אלומט' },
  { pattern: /פלסאון|plasson/i, name: 'פלסאון' },
  { pattern: /כרמית|carmit/i, name: 'כרמית' },
  { pattern: /מדברי/i, name: 'איטונג' },
  { pattern: /רוקח\s*יוסף|rokach/i, name: 'רוקח יוסף מוצרי מלט' },
  { pattern: /מפעלי\s*בטון|concrete\s*products/i, name: 'מפעלי בטון' },
  { pattern: /אבן\s*יהודה/i, name: 'אבן יהודה' },
  { pattern: /בלוקים|blocks/i, name: 'מפעל בלוקים' },
];

function detectSupplierFromText(allLines: string[]): SupplierInfo {
  const all = allLines.join(' ');
  const headerLines = allLines.slice(0, 20);
  const footerLines = allLines.slice(-15);
  const fullText = [...headerLines, ...footerLines].join(' ');
  let name = '';

  // 1. Try known supplier patterns
  for (const s of KNOWN_SUPPLIERS) {
    if (s.pattern.test(all)) { name = s.name; break; }
  }

  // 2. If not found, look for "XXX בע"מ" pattern in first lines
  if (!name) {
    for (const line of headerLines.slice(0, 8)) {
      const m = line.match(/([\u0590-\u05FF\s\.]+)\s*בע["\u05F4]מ/);
      if (m) { name = m[1].trim() + ' בע"מ'; break; }
    }
  }

  // 3. Extract quote number
  let quoteNumber = '';
  const qnMatch = all.match(/PQ\d{5,}/i) || all.match(/הצעת מחיר מס[פ']?\s*[:.]?\s*(\d+)/);
  if (qnMatch) quoteNumber = qnMatch[0];

  // 4. Extract date
  let quoteDate = '';
  const dateMatch = all.match(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/);
  if (dateMatch) quoteDate = dateMatch[1];

  // 5. Extract email (from all text — footer often has contact info)
  let email = '';
  const emailMatch = fullText.match(/[\w.\-]+@[\w.\-]+\.\w{2,}/);
  if (emailMatch) email = emailMatch[0];

  // 6. Extract phones — look for Israeli patterns
  let phone = '', mobile = '', fax = '';
  const phoneMatches = [...fullText.matchAll(/(?:טל[פ']?[:\s]*|טלפון[:\s]*)?(0\d[\d\-]{7,})/g)];
  const faxMatch = fullText.match(/פקס[:\s]*(0\d[\d\-]{7,})/);
  const mobileMatch = fullText.match(/(?:נייד[:\s]*|טלפון נייד[:\s]*)(05\d[\d\-]{7,})/);
  if (faxMatch) fax = faxMatch[1];
  if (mobileMatch) mobile = mobileMatch[1];

  // Separate landline from mobile from all found numbers
  for (const m of phoneMatches) {
    const num = m[1].replace(/\D/g, '');
    if (num === fax?.replace(/\D/g, '')) continue;
    if (num.startsWith('05')) {
      if (!mobile) mobile = m[1];
    } else {
      if (!phone) phone = m[1];
    }
  }

  // 7. Extract website
  let website = '';
  const webMatch = fullText.match(/(?:www\.[\w.\-]+|https?:\/\/[\w.\-]+)/i);
  if (webMatch) website = webMatch[0];

  // 8. Extract contact person (look for "בברכה, NAME" or "סוכן: NAME" in footer)
  let contactPerson = '';
  for (const line of footerLines) {
    // "מירי ביטון" style — Hebrew name after בברכה
    const nameMatch = line.match(/בברכה[,\s]*/);
    if (nameMatch) {
      // Next line is usually the person name
      const idx = footerLines.indexOf(line);
      if (idx + 1 < footerLines.length) {
        const nextLine = footerLines[idx + 1].trim();
        if (nextLine.length < 30 && /^[\u0590-\u05FF\s]+$/.test(nextLine)) {
          contactPerson = nextLine;
        }
      }
    }
    // "סוכן: NAME"
    const agentMatch = line.match(/סוכן[:\s]+([\u0590-\u05FF\s]+)/);
    if (agentMatch && !contactPerson) contactPerson = agentMatch[1].trim();
  }

  return { name, quoteNumber, quoteDate, contactPerson, phone, mobile, email, fax, website };
}

/** זיהוי אם ה-PDF הוא הצעת ספק (לא כתב כמויות) */
function isSupplierQuotePdf(headerLines: string[]): boolean {
  const text = headerLines.slice(0, 15).join(' ');
  // Strong indicators: מק"ט column header, ש"ח prices, "הצעת מחיר" title
  const hasCatalogHeader = /מק["\u05F4]ט|מק["\u05F4]ס|קטלוג|catalog/i.test(text);
  const hasQuoteTitle = /הצעת מחיר/.test(text);
  const hasSupplier = KNOWN_SUPPLIERS.some(s => s.pattern.test(text));
  const hasBem = /בע["\u05F4]מ/.test(text);
  const hasToField = /לכבוד/.test(text);

  // At least 2 indicators = supplier quote
  const score = [hasCatalogHeader, hasQuoteTitle, hasSupplier, hasBem && hasToField].filter(Boolean).length;
  return score >= 2;
}

const KNOWN_DESC = ['תיאור', 'פריט', 'שם', 'description', 'item', 'סעיף', 'פירוט'];
const KNOWN_UNIT = ['יחידה', 'יח', 'unit'];
const KNOWN_QTY = ['כמות', 'quantity', 'qty'];
const KNOWN_PRICE = ['מחיר', 'price', 'עלות', 'מחיר ליחידה'];

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
  const [importMode, setImportMode] = useState<ImportMode>('boq');
  const [supplierInfo, setSupplierInfo] = useState<SupplierInfo>({ name: '', quoteNumber: '', quoteDate: '', contactPerson: '', phone: '', mobile: '', email: '', fax: '', website: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Parse any file ───
  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setLoading(true);
    setLoadMsg('קורא קובץ...');
    setRows([]);

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
        showToast('סוג קובץ לא נתמך');
      }

      // Filter junk rows — apply to ALL imports (BOQ and supplier)
      {
        const beforeFilter = parsed.length;
        parsed = parsed.filter(r => {
          if (!r.isHeader && isJunkRow(r.description)) return false;
          // Filter separator rows: description is mostly asterisks
          if (/^\*{2,}/.test(r.description.trim()) || /\*{3,}/.test(r.description)) return false;
          return true;
        });
        const filtered = beforeFilter - parsed.length;
        if (filtered > 0) setLoadMsg(`${filtered} שורות סוננו`);
      }

      setRows(parsed);
      if (parsed.length === 0) showToast('לא נמצאו שורות בקובץ');
      else {
        const modeLabel = importMode === 'supplier' ? 'פריטי ספק' : 'שורות';
        showToast(`נקלטו ${parsed.length} ${modeLabel}`);
      }
    } catch (e: any) {
      showToast('שגיאה: ' + e.message);
    } finally {
      setLoading(false);
      setLoadMsg('');
    }
  }, [importMode]);

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
    const descCol = dCol >= 0 ? dCol : (() => { let mx = 0, mi = 0; hdrs.forEach((_: string, i: number) => { const l = body.slice(0, 5).reduce((s: number, r: any[]) => s + String(r[i] || '').length, 0); if (l > mx) { mx = l; mi = i; } }); return mi; })();

    const result: ImportRow[] = [];
    let currentSection = '';

    for (const row of body) {
      const desc = String(row[descCol] || '').trim();
      if (!desc || desc.length < 2) continue;
      if (isJunkRow(desc)) continue;

      const unit = uCol >= 0 ? String(row[uCol] || '').trim() : '';
      const qty = qCol >= 0 ? toNum(row[qCol]) : 0;
      const price = pCol >= 0 ? toNum(row[pCol]) : 0;

      const hasNumericData = qty > 0 || price > 0;
      const looksLikeHeader = !hasNumericData && desc.length < 40 && !desc.includes(' - ');

      if (looksLikeHeader) {
        currentSection = desc;
        result.push({ description: desc, unit: '', quantity: 0, unitPrice: 0, category: 'header', checked: false, isHeader: true });
      } else {
        result.push({
          description: desc, unit, quantity: qty, unitPrice: price,
          category: currentSection || detectCategory(desc), checked: true,
          sectionTitle: currentSection || undefined,
        });
      }
    }
    return result;
  }

  // ─── PDF (column-based extraction with pattern fallback) ───
  async function parsePdf(file: File): Promise<ImportRow[]> {
    setLoadMsg('קורא PDF...');
    let lib = (window as any).pdfjsLib;
    if (!lib) {
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = () => { (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(); };
        s.onerror = rej; document.head.appendChild(s);
      });
      lib = (window as any).pdfjsLib;
    }
    const buf = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: buf }).promise;

    // Step 1: Extract ALL text items with x,y positions
    interface TItem { str: string; x: number; y: number; page: number; }
    const allItems: TItem[] = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      setLoadMsg(`עמוד ${p}/${pdf.numPages}...`);
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const vp = page.getViewport({ scale: 1 });
      for (const item of tc.items as any[]) {
        if (!item.str?.trim()) continue;
        allItems.push({ str: item.str.trim(), x: item.transform[4], y: Math.round(vp.height - item.transform[5]), page: p });
      }
    }
    if (allItems.length === 0) return [];

    // Step 2: Group into STRUCTURED rows (keep items with x positions)
    // CRITICAL: Sort by PAGE first, then Y — items from different pages have
    // overlapping Y coordinates (Y is relative to each page, not absolute).
    // Without page-first sorting, rows from different pages merge together.
    interface StructRow { items: TItem[]; y: number; text: string; page: number; }
    allItems.sort((a, b) => a.page - b.page || a.y - b.y || b.x - a.x);
    const structRows: StructRow[] = [];
    let curY = allItems[0].y;
    let curPage = allItems[0].page;
    let curItems: TItem[] = [allItems[0]];

    for (let i = 1; i < allItems.length; i++) {
      // Same row = same page AND close Y position
      if (allItems[i].page === curPage && Math.abs(allItems[i].y - curY) <= 6) {
        curItems.push(allItems[i]);
      } else {
        curItems.sort((a, b) => b.x - a.x);
        structRows.push({ items: [...curItems], y: curY, text: curItems.map(t => t.str).join(' '), page: curPage });
        curItems = [allItems[i]];
        curY = allItems[i].y;
        curPage = allItems[i].page;
      }
    }
    curItems.sort((a, b) => b.x - a.x);
    structRows.push({ items: [...curItems], y: curY, text: curItems.map(t => t.str).join(' '), page: curPage });

    const textRows = structRows.map(r => r.text);

    // Step 3: Auto-detect if this is a supplier quote
    const isSupplierPdf = isSupplierQuotePdf(textRows);
    if (isSupplierPdf) {
      setImportMode('supplier');
      const info = detectSupplierFromText(textRows);
      setSupplierInfo(info);
      setLoadMsg(`זוהה הצעת ספק: ${info.name || 'לא ידוע'}...`);
    }

    // Step 4: Try COLUMN-BASED extraction (works with any table format)
    setLoadMsg('מנתח מבנה טבלה...');
    const columnResult = tryColumnParsing(structRows);
    if (columnResult.length >= 2) return columnResult;

    // Step 5: Fallback — PATTERN-BASED extraction (for simpler PDFs)
    setLoadMsg('מנסה זיהוי תבניות...');
    const patternResult = tryPatternParsing(textRows);
    if (patternResult.length >= 2) return patternResult;

    // Step 6: Last fallback — return all non-junk lines as raw text
    return textRows
      .filter(l => l.length > 5 && !isJunkRow(l))
      .filter(l => !/מחיר כולל|סה["\u05F4]כ|מע["\u05F4]מ|עוסק מורשה|www\.|@/.test(l))
      .map(l => ({ description: l, unit: '', quantity: 0, unitPrice: 0, category: detectCategory(l), checked: true }));
  }

  /** ═══ COLUMN-BASED TABLE PARSING ═══
   * Detects table header row, maps column positions, extracts data by x-position.
   * Works with ANY table format regardless of number/price formatting. */
  function tryColumnParsing(rows: { items: { str: string; x: number }[]; text: string; page?: number }[]): ImportRow[] {
    // Column keyword definitions
    const COL_KEYS: Record<string, string[]> = {
      description: ['תיאור', 'תאור', 'פריט', 'שם פריט', 'שם מוצר', 'פירוט', 'description', 'item', 'סעיף'],
      catalog: ['מק"ט', "מק'ט", 'מקט', 'קוד', 'קטלוג', 'catalog', 'sku', 'מק״ט', 'פריט מס'],
      quantity: ['כמות', 'qty', 'quantity'],
      price: ['מחיר', 'price', 'מחיר ליחידה', 'מחיר ליח', 'מח. ליח'],
      total: ['סה"כ', "סה'כ", 'סהכ', 'total', 'סכום', 'סה״כ', 'סה"כ מחיר'],
      unit: ['יחידה', 'יח', 'unit', 'יח מידה', 'יח\''],
      packing: ['אריזה', 'סוג אריזה', 'תאור סוג', 'אריזות', 'מס. אריזות', 'מס אריזות'],
      discount: ['הנחה', 'הנחה %', 'discount'],
      weight: ['משקל', 'משקל ליחידה', 'weight', 'ק"ג', 'קג'],
    };

    // Normalize text for comparison
    const norm = (s: string) => s.replace(/["\u05F4\u05F3'״׳]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

    // Find header row — scan first 20 rows for one with 3+ column keyword matches
    let headerIdx = -1;
    let colMap: Record<string, number> = {}; // column key → x position

    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const row = rows[i];
      if (row.items.length < 3) continue;

      const tempMap: Record<string, number> = {};
      let matches = 0;

      for (const item of row.items) {
        const txt = norm(item.str);
        for (const [key, keywords] of Object.entries(COL_KEYS)) {
          if (tempMap[key]) continue; // already matched
          if (keywords.some(k => txt.includes(norm(k)) || norm(k).includes(txt))) {
            tempMap[key] = item.x;
            matches++;
            break;
          }
        }
      }

      // Need at least 3 column matches, including description or catalog
      if (matches >= 3 && (tempMap.description || tempMap.catalog)) {
        headerIdx = i;
        colMap = tempMap;
        break;
      }
    }

    if (headerIdx < 0) return []; // No header found

    // Build sorted column positions for nearest-neighbor assignment
    const colEntries = Object.entries(colMap).map(([key, x]) => ({ key, x }));

    // Parse data rows after header
    const results: ImportRow[] = [];
    const seenDescs = new Set<string>();

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.items.length < 2) continue;

      // Skip summary/footer/header rows — comprehensive patterns for Israeli supplier quotes
      const txt = row.text;
      if (/סה["\u05F4״']כ|מחיר כולל|עמוד\s*\d/i.test(txt)) continue;
      if (/מע["\u05F4״]מ\s*[\(\[]?\d|\(\d+\.?\d*%\)/i.test(txt)) continue;
      if (/הצעת מחיר|לכבוד|תאריך ה|עוסק מורשה|בע["\u05F4]מ/i.test(txt)) continue;
      if (/www\.|@.*\.|e-?mail/i.test(txt)) continue;
      if (/תנאי תשלום|בתוקף עד|בברכה|חתימה|סוכן[:\s]|מס[.'׳]?\s*לקוח/i.test(txt)) continue;
      if (/מהדורה\s+(נוכחית|קודמת)|טלפון נייד|מס[.'׳]?\s*חברה|מספר תיק/i.test(txt)) continue;
      if (/באיחוד עוסקים|משקל תעודה|תאור ישוב|מדווח לצרכי/i.test(txt)) continue;
      if (/מינימום הזמנה|הצעת מחיר אינ|אינה מהווה|המחירים אינם/i.test(txt)) continue;
      if (/הובלה יתומחרו|משלוח משטחים|בהעדר מלאי/i.test(txt)) continue;
      if (/המזמין מצהיר|הבדלים טבעיים|איטונג ריצופים|מחלקת שיווק/i.test(txt)) continue;
      if (/^\*+$|^-+$|^\d{1,2}\.\s+[א-ת]/.test(txt)) continue;
      // Skip separator/header rows: lines that are mostly asterisks (section dividers like "****** ביוב ******")
      if (/^\*{2,}[\s\u05D0-\u05EA*]*\*{2,}$/.test(txt.trim())) continue;
      if (/^[\s*]+$/.test(txt.trim())) continue;
      // Skip rows where description is only asterisks/stars (common in grouped quotes like רוקח)
      const descOnly = txt.replace(/[\d\s.,\-+()]/g, '').trim();
      if (/^\*+$/.test(descOnly)) continue;
      // Skip if this looks like a repeated header row
      let headerWordCount = 0;
      for (const item of row.items) {
        const n = norm(item.str);
        for (const keywords of Object.values(COL_KEYS)) {
          if (keywords.some(k => n.includes(norm(k)))) { headerWordCount++; break; }
        }
      }
      if (headerWordCount >= 3) continue;

      // Assign each item to nearest column by x-position
      // Sort colEntries by x for boundary-based assignment
      const sortedCols = [...colEntries].sort((a, b) => a.x - b.x);
      const descX = colEntries.find(c => c.key === 'description')?.x;
      const catX = colEntries.find(c => c.key === 'catalog')?.x;
      const values: Record<string, string[]> = {};
      for (const item of row.items) {
        // Hebrew text items should go to description column (not to numeric columns)
        // In RTL PDFs, description text extends leftward from the header position,
        // so it can be closer to quantity/price columns by x-position.
        const hasHebrew = /[\u0590-\u05FF]/.test(item.str);
        let nearestCol = '';
        let nearestDist = Infinity;
        if (hasHebrew && descX && item.str.length > 3) {
          // For Hebrew text: prefer description column if item is between
          // any numeric column and the description header position
          const distToDesc = Math.abs(item.x - descX);
          const distToCat = catX ? Math.abs(item.x - catX) : Infinity;
          if (distToCat < distToDesc && distToCat < 60) {
            // Closer to catalog — likely a short label in catalog column
            nearestCol = 'catalog';
            nearestDist = distToCat;
          } else if (distToDesc < 150) {
            nearestCol = 'description';
            nearestDist = distToDesc;
          }
        }
        if (!nearestCol) {
          for (const col of sortedCols) {
            const dist = Math.abs(item.x - col.x);
            if (dist < nearestDist) { nearestDist = dist; nearestCol = col.key; }
          }
        }
        if (nearestCol && nearestDist < 150) {
          (values[nearestCol] ||= []).push(item.str);
        }
      }

      // Move Hebrew text items from catalog/packing to description.
      // In some PDFs (e.g., Ytong), product name parts like "גן" land in the
      // catalog column (by x-position proximity) while the actual catalog number
      // is also there. Similarly "מדברי זהוב" can land in packing column.
      // Fix: relocate non-numeric text from catalog, and descriptive text from packing.
      if (values.catalog) {
        const kept: string[] = [];
        for (const part of values.catalog) {
          // If it's a pure catalog number (digits), keep it in catalog
          if (/^\d[\d\s]*$/.test(part.trim())) {
            kept.push(part);
          } else {
            // Hebrew/text part → move to description
            (values.description ||= []).unshift(part);
          }
        }
        values.catalog = kept;
      }

      // Move descriptive text from packing to description.
      // Keep only packaging-format items (like "7.74 מ"ר בחב'", "16 יח' בחב'")
      if (values.packing) {
        for (const part of values.packing) {
          const isPackagingFormat = /בחב|אריז|משטח|ליח|^\d/.test(part);
          if (!isPackagingFormat && /[\u0590-\u05FF]/.test(part)) {
            // Looks like product description text, not packaging info
            (values.description ||= []).push(part);
          }
        }
      }
      delete values.packing;
      delete values.discount; // הנחה — ignore, don't let it bleed into other columns
      delete values.weight;   // משקל — ignore, don't let it bleed into other columns

      // Extract structured data
      const descParts = values.description || values.catalog || [];
      let desc = descParts.join(' ').replace(/\s+/g, ' ').trim();
      if (!desc || desc.length < 2) continue;

      // Clean description — remove pure numbers from desc
      desc = desc.replace(/^\d+[\.\s]+/, '').trim();

      const catalogParts = values.catalog || [];
      let catalog = '';
      for (const part of catalogParts) {
        const m = part.match(/\b(\d{3,15})\b/);
        if (m) { catalog = m[1]; break; }
      }

      // If catalog was part of the description column, extract it
      if (!catalog) {
        const m = desc.match(/\b(\d{4,15})\b/);
        if (m) { catalog = m[1]; desc = desc.replace(m[0], '').trim(); }
      }

      // Extract quantity — handle cases like "2,089.80 מ"ר" or "514.80 מ"ר"
      const qtyRaw = (values.quantity || []).join(' ');
      const qtyUnitMatch = qtyRaw.match(/([\d,]+\.?\d*)\s*(מ["\u05F4]ר|מ["\u05F4]א|מ["\u05F4]ק|יח['\u05F3]?|טון)?/);
      const quantity = qtyUnitMatch ? toNum(qtyUnitMatch[1]) : toNum(qtyRaw);
      const qtyUnit = qtyUnitMatch?.[2]?.replace(/["\u05F4]/g, '"').trim() || '';

      const unitPrice = toNum((values.price || []).join(' '));
      const totalPrice = toNum((values.total || []).join(' '));

      // Unit: prefer explicit unit column, then unit extracted from quantity, then default
      let unit = (values.unit || []).join(' ').replace(/["\u05F4]/g, '"').trim() || qtyUnit || 'יח\'';

      // Must have SOME numeric data (price or quantity) to be a product row
      if (quantity === 0 && unitPrice === 0 && totalPrice === 0) continue;

      // Skip separator rows: description is mostly asterisks/stars
      if (/\*{3,}/.test(desc)) continue;

      // Skip if description is just numbers
      if (/^[\d\s\.,]+$/.test(desc)) continue;

      // Dedup — use description+total as key so same product in different assemblies is kept
      // (e.g., רוקח: "תקרה בינוני 104" appears in multiple manhole assemblies with same price)
      const key = `${desc}|${totalPrice}|${unitPrice}`.toLowerCase().replace(/\s+/g, '');
      if (seenDescs.has(key)) continue;
      seenDescs.add(key);

      // Calculate missing values
      const calcTotal = totalPrice || (quantity * unitPrice) || 0;
      const calcUnitPrice = unitPrice || (totalPrice && quantity ? Math.round(totalPrice / quantity * 100) / 100 : 0);

      results.push({
        description: catalog ? `${desc} (${catalog})` : desc,
        unit,
        quantity,
        unitPrice: calcUnitPrice,
        totalPrice: calcTotal,
        category: detectCategory(desc),
        checked: totalPrice > 0 || unitPrice > 0, // Auto-check items with prices
        catalogNumber: catalog,
      });
    }

    return results;
  }

  /** ═══ PATTERN-BASED PARSING (fallback) ═══
   * Original approach: looks for catalog numbers (7+ digits) or ש"ח prices in text. */
  function tryPatternParsing(textRows: string[]): ImportRow[] {
    const results: ImportRow[] = [];
    const catalogPattern = /\b(\d{7,15})\b/;
    const pricePattern = /(\d{1,3}(?:,\d{3})*\.?\d{0,2})\s*ש["\u05F4]ח/;
    const qtyUnitPattern = /(\d{1,3}(?:,\d{3})*\.?\d{0,2})\s*(מ["\u05F4]ר|מ["\u05F4]א|מ["\u05F4]ק|יח['\u05F3]?|טון)/;

    for (const line of textRows) {
      const hasCatalog = catalogPattern.test(line);
      const hasPrice = pricePattern.test(line);
      if (!hasCatalog && !hasPrice) continue;
      if (/^סה["\u05F4]כ|מחיר כולל|מע["\u05F4]מ\s*[\(\[]?\d|\(\d+\.?\d*%\)\s*מע/.test(line)) continue;

      const catalog = line.match(catalogPattern)?.[1] || '';
      let description = line
        .replace(/\b\d{7,15}\b/g, '')
        .replace(/[\d,]+\.?\d*\s*ש["\u05F4]ח/g, '')
        .replace(/[\d,]+\.?\d*\s*(מ["\u05F4]ר|מ["\u05F4]א|יח['\u05F3]?)\s*(בחב['\u05F3]?)?/g, '')
        .replace(/\b\d{1,3}(?:,\d{3})*\.?\d{0,2}\b/g, '')
        .replace(/\s+/g, ' ').trim();
      if (description.length < 2) continue;

      const allPrices = [...line.matchAll(/(\d{1,3}(?:,\d{3})*\.?\d{0,2})\s*ש["\u05F4]ח/g)].map(m => toNum(m[1]));
      const unitPrice = allPrices.length >= 1 ? allPrices[0] : 0;
      const totalPrice = allPrices.length >= 2 ? allPrices[allPrices.length - 1] : unitPrice;

      const qtyMatch = line.match(qtyUnitPattern);
      let quantity = qtyMatch ? toNum(qtyMatch[1]) : 0;
      const unit = qtyMatch ? qtyMatch[2].replace(/["\u05F4]/g, '"') : '';

      if (!quantity && unitPrice > 0 && totalPrice > unitPrice) {
        quantity = Math.round((totalPrice / unitPrice) * 100) / 100;
      }
      if (!quantity) {
        const nums = [...line.matchAll(/\b(\d{1,6}(?:\.\d{1,2})?)\b/g)]
          .map(m => toNum(m[1]))
          .filter(n => n > 0 && n < 100000 && !allPrices.includes(n) && String(n).length < 7);
        if (nums.length > 0) quantity = nums[0];
      }

      results.push({
        description: catalog ? `${description} (${catalog})` : description,
        unit, quantity, unitPrice,
        totalPrice: totalPrice !== unitPrice ? totalPrice : quantity * unitPrice,
        category: detectCategory(description), checked: true, catalogNumber: catalog,
      });
    }
    return results;
  }

  // ─── Word ───
  async function parseWord(file: File): Promise<ImportRow[]> {
    setLoadMsg('קורא Word...');
    const mammoth = await import('mammoth');
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value.split('\n').map(l => l.trim()).filter(l => l.length > 2)
      .map(l => ({ description: l, unit: '', quantity: 0, unitPrice: 0, category: detectCategory(l), checked: true }));
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
        s.onerror = rej; document.head.appendChild(s);
      });
    }
    setLoadMsg('מזהה טקסט (OCR)...');
    const worker = await Tess.createWorker('heb+eng');
    const url = URL.createObjectURL(file);
    const { data } = await worker.recognize(url);
    URL.revokeObjectURL(url);
    await worker.terminate();
    return data.text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 2)
      .map((l: string) => ({ description: l, unit: '', quantity: 0, unitPrice: 0, category: detectCategory(l), checked: true }));
  }

  // ─── Import as BOQ (כתב כמויות) ───
  const doImportBoq = async () => {
    const selected = rows.filter(r => r.checked && !r.isHeader);
    if (selected.length === 0) { showToast('לא נבחרו פריטים'); return; }
    setImporting(true);
    try {
      const existing = await api.get<{ description: string }[]>(`/costs/project/${projectId}`);
      const existingSet = new Set(existing.map(e => e.description.trim().replace(/\s+/g, ' ').toLowerCase()));
      const items = selected.filter(r => !existingSet.has(r.description.trim().replace(/\s+/g, ' ').toLowerCase()))
        .map(r => ({ category: r.category, description: r.description, unit: r.unit || UNITS[0], quantity: r.quantity, unit_price: r.unitPrice }));
      const skipped = selected.length - items.length;
      if (items.length === 0) { showToast('כל הסעיפים כבר קיימים'); setImporting(false); return; }
      await api.post('/costs/batch', { project_id: projectId, items });
      showToast(skipped > 0 ? `${items.length} סעיפים יובאו (${skipped} כפילויות דולגו)` : `${items.length} סעיפים יובאו`);
      onImported(); onClose();
    } catch (e: any) { showToast('שגיאה: ' + e.message); }
    finally { setImporting(false); }
  };

  // ─── Import as Supplier Quote (הצעת ספק) ───
  const doImportSupplier = async () => {
    const selected = rows.filter(r => r.checked && !r.isHeader);
    if (selected.length === 0) { showToast('לא נבחרו פריטים'); return; }
    if (!supplierInfo.name.trim()) { showToast('יש להזין שם ספק'); return; }
    setImporting(true);
    try {
      // 1. Save/update supplier contact info
      const supplierResult = await api.post<{ id: string; created: boolean }>('/suppliers', {
        name: supplierInfo.name.trim(),
        contact_person: supplierInfo.contactPerson,
        phone: supplierInfo.phone,
        mobile: supplierInfo.mobile,
        email: supplierInfo.email,
        fax: supplierInfo.fax,
        website: supplierInfo.website,
      });

      // 2. Save quote with items
      const items = selected.map(r => ({
        catalog_number: r.catalogNumber || '',
        description: r.description,
        unit: r.unit || '',
        quantity: r.quantity,
        unit_price: r.unitPrice,
      }));
      const result = await api.post<{ ok: boolean; id: string; count: number }>('/supplier-quotes', {
        project_id: projectId,
        supplier_name: supplierInfo.name.trim(),
        supplier_id: supplierResult.id,
        quote_number: supplierInfo.quoteNumber,
        quote_date: supplierInfo.quoteDate,
        items,
      });

      // 3. Auto-match after import
      await api.post(`/supplier-quotes/auto-match/${projectId}`, {});

      const savedMsg = supplierResult.created ? ' (ספק חדש נשמר)' : ' (ספק עודכן)';
      showToast(`${result.count} פריטים מ-${supplierInfo.name} נשמרו${savedMsg}`);
      onImported(); onClose();
    } catch (e: any) { showToast('שגיאה: ' + e.message); }
    finally { setImporting(false); }
  };

  const doImport = importMode === 'supplier' ? doImportSupplier : doImportBoq;

  const toggleAll = (v: boolean) => setRows(prev => prev.map(r => r.isHeader ? r : { ...r, checked: v }));
  const toggleRow = (i: number) => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, checked: !r.checked } : r));
  const updateRow = (i: number, key: keyof ImportRow, val: any) => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  const selectedCount = rows.filter(r => r.checked && !r.isHeader).length;
  const totalCost = rows.filter(r => r.checked && !r.isHeader).reduce((s, r) => s + (r.totalPrice || r.quantity * r.unitPrice), 0);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(30,30,45,.3)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }} onClick={onClose}>
      <div style={{ background: T.card, borderRadius: 22, width: '95%', maxWidth: importMode === 'supplier' ? 1080 : 960, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(30,30,60,.15)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 28px', borderBottom: `1.5px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: T.f, fontSize: 20, fontWeight: 800, color: T.text1 }}>
              {importMode === 'supplier' ? 'קליטת הצעת ספק' : 'הוסף קובץ'}
            </div>
            {fileName && <div style={{ fontFamily: T.f, fontSize: 13, color: T.text3, marginTop: 4 }}>📄 {fileName}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Mode toggle */}
            {rows.length > 0 && (
              <div style={{ display: 'flex', borderRadius: 10, border: `1.5px solid ${T.border}`, overflow: 'hidden' }}>
                <button onClick={() => setImportMode('boq')} style={{
                  fontFamily: T.f, padding: '6px 14px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: importMode === 'boq' ? T.accent : T.card, color: importMode === 'boq' ? '#fff' : T.text3,
                }}>📋 כתב כמויות</button>
                <button onClick={() => setImportMode('supplier')} style={{
                  fontFamily: T.f, padding: '6px 14px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: importMode === 'supplier' ? T.purple : T.card, color: importMode === 'supplier' ? '#fff' : T.text3,
                }}>💰 הצעת ספק</button>
              </div>
            )}
            <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: T.bg, cursor: 'pointer', fontSize: 16, color: T.text3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        </div>

        {/* Supplier info bar (only in supplier mode) */}
        {importMode === 'supplier' && rows.length > 0 && (
          <div style={{ padding: '12px 28px', background: T.purpleBg, borderBottom: `1.5px solid ${T.border}`, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontFamily: T.f, fontSize: 12, fontWeight: 700, color: T.purple }}>שם ספק:</label>
              <input value={supplierInfo.name} onChange={e => setSupplierInfo(prev => ({ ...prev, name: e.target.value }))}
                style={{ fontFamily: T.f, padding: '4px 10px', borderRadius: 8, border: `1.5px solid ${T.purple}40`, fontSize: 13, fontWeight: 700, color: T.text1, width: 160, outline: 'none' }}
                placeholder="איטונג, אקרשטיין..." />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontFamily: T.f, fontSize: 12, fontWeight: 700, color: T.purple }}>מס׳ הצעה:</label>
              <input value={supplierInfo.quoteNumber} onChange={e => setSupplierInfo(prev => ({ ...prev, quoteNumber: e.target.value }))}
                style={{ fontFamily: T.f, padding: '4px 10px', borderRadius: 8, border: `1.5px solid ${T.purple}40`, fontSize: 13, color: T.text2, width: 140, outline: 'none' }}
                placeholder="PQ26000776" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontFamily: T.f, fontSize: 12, fontWeight: 700, color: T.purple }}>תאריך:</label>
              <input value={supplierInfo.quoteDate} onChange={e => setSupplierInfo(prev => ({ ...prev, quoteDate: e.target.value }))}
                style={{ fontFamily: T.f, padding: '4px 10px', borderRadius: 8, border: `1.5px solid ${T.purple}40`, fontSize: 13, color: T.text2, width: 110, outline: 'none' }}
                placeholder="18/03/26" />
            </div>
            {totalCost > 0 && (
              <div style={{ marginRight: 'auto', fontFamily: T.f, fontSize: 14, fontWeight: 800, color: T.purple }}>
                סה"כ: {fmt(totalCost)} ₪
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>

          {/* Upload zone */}
          {rows.length === 0 && !loading && (
            <div
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              style={{
                border: `2.5px dashed ${dragOver ? T.accent : T.border}`, borderRadius: 20,
                padding: '48px 40px', textAlign: 'center', cursor: 'pointer',
                background: dragOver ? T.accentBg : T.bg, transition: 'all .2s',
              }}
              onClick={() => fileRef.current?.click()}
            >
              <div style={{ fontSize: 48, marginBottom: 16, opacity: .6 }}>📁</div>
              <div style={{ fontFamily: T.f, fontSize: 18, fontWeight: 700, color: T.text1, marginBottom: 8 }}>גרור קובץ או לחץ לבחירה</div>
              <div style={{ fontFamily: T.f, fontSize: 14, color: T.text3, marginBottom: 8 }}>Excel · CSV · PDF · Word · תמונות</div>
              <div style={{ fontFamily: T.f, fontSize: 13, color: T.purple, fontWeight: 600, marginBottom: 20 }}>PDF הצעת מחיר מספק יזוהה אוטומטית</div>
              <div style={{ display: 'inline-flex', padding: '12px 28px', background: `linear-gradient(135deg, ${T.cta}, #EA580C)`, color: '#fff', borderRadius: 14, fontFamily: T.f, fontSize: 14, fontWeight: 700, boxShadow: '0 4px 16px rgba(249,115,22,.25)' }}
                onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}>📂 בחר קובץ</div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,.doc,.jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} style={{ display: 'none' }} />
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <div style={{ width: 40, height: 40, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin .6s linear infinite', margin: '0 auto 16px' }} />
              <div style={{ fontFamily: T.f, fontSize: 16, fontWeight: 700, color: T.text1 }}>{loadMsg}</div>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}

          {/* Results table */}
          {rows.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontFamily: T.f, fontSize: 16, fontWeight: 700, color: T.text1 }}>
                  {selectedCount} {importMode === 'supplier' ? 'פריטים' : 'סעיפים'} נבחרו
                  {rows.some(r => r.isHeader) ? ` · ${rows.filter(r => r.isHeader).length} כותרות` : ''}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setRows([]); setFileName(''); setImportMode('boq'); setSupplierInfo({ name: '', quoteNumber: '', quoteDate: '', contactPerson: '', phone: '', mobile: '', email: '', fax: '', website: '' }); }}
                    style={{ fontFamily: T.f, padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.card, fontSize: 12, fontWeight: 600, color: T.text3, cursor: 'pointer' }}>📂 קובץ אחר</button>
                  <button onClick={() => toggleAll(true)} style={{ fontFamily: T.f, padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.card, fontSize: 12, fontWeight: 600, color: T.accent, cursor: 'pointer' }}>בחר הכל</button>
                  <button onClick={() => toggleAll(false)} style={{ fontFamily: T.f, padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.card, fontSize: 12, fontWeight: 600, color: T.text3, cursor: 'pointer' }}>בטל הכל</button>
                </div>
              </div>

              <div style={{ overflowX: 'auto', borderRadius: 14, border: `1.5px solid ${T.border}` }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.f }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>✓</th>
                      {importMode === 'supplier' && <th style={{ ...thStyle, width: 110 }}>מק"ט</th>}
                      <th style={thStyle}>תיאור</th>
                      <th style={{ ...thStyle, width: 80 }}>יחידה</th>
                      <th style={{ ...thStyle, width: 80 }}>כמות</th>
                      <th style={{ ...thStyle, width: 110 }}>מחיר ליחידה</th>
                      {importMode === 'supplier' && <th style={{ ...thStyle, width: 110 }}>סה"כ</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => r.isHeader ? (
                      <tr key={i} style={{ background: '#F0F0FA' }}>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <span style={{ fontSize: 14, color: T.accent }}>📁</span>
                        </td>
                        <td colSpan={importMode === 'supplier' ? 6 : 4} style={{ ...tdStyle, fontWeight: 800, fontSize: 14, color: T.accent, letterSpacing: '-.01em' }}>
                          {r.description}
                        </td>
                      </tr>
                    ) : (
                      <tr key={i} style={{ background: r.checked ? '' : '#F8F8FA' }}>
                        <td style={tdStyle}><input type="checkbox" checked={r.checked} onChange={() => toggleRow(i)} style={{ width: 16, height: 16, accentColor: importMode === 'supplier' ? T.purple : T.accent }} /></td>
                        {importMode === 'supplier' && (
                          <td style={{ ...tdStyle, fontSize: 11, color: T.text3, fontFamily: 'monospace', direction: 'ltr', textAlign: 'center' }}>
                            {r.catalogNumber || '—'}
                          </td>
                        )}
                        <td style={{ ...tdStyle, fontWeight: 600, color: T.text1, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.description}
                          {r.sectionTitle && <span style={{ fontSize: 10, color: T.text3, marginRight: 8 }}>({r.sectionTitle})</span>}
                        </td>
                        <td style={tdStyle}>
                          <input value={r.unit} onChange={e => updateRow(i, 'unit', e.target.value)}
                            style={cellInput} placeholder="יח'" />
                        </td>
                        <td style={tdStyle}>
                          <input type="number" min={0} step="any" value={r.quantity || ''} onChange={e => updateRow(i, 'quantity', parseFloat(e.target.value) || 0)}
                            style={cellInput} placeholder="0" />
                        </td>
                        <td style={tdStyle}>
                          <input type="number" min={0} step="any" value={r.unitPrice || ''} onChange={e => updateRow(i, 'unitPrice', parseFloat(e.target.value) || 0)}
                            style={cellInput} placeholder="0" />
                        </td>
                        {importMode === 'supplier' && (
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: T.text1 }}>
                            {fmt(r.totalPrice || r.quantity * r.unitPrice)} ₪
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', borderTop: `1.5px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onClose} style={{ fontFamily: T.f, padding: '10px 24px', borderRadius: 12, border: `1.5px solid ${T.border}`, background: T.card, fontSize: 14, fontWeight: 600, color: T.text2, cursor: 'pointer' }}>ביטול</button>
          {rows.length > 0 && selectedCount > 0 && (
            <button onClick={doImport} disabled={importing} style={{
              fontFamily: T.f, padding: '10px 28px', borderRadius: 12, border: 'none',
              background: importMode === 'supplier'
                ? `linear-gradient(135deg, ${T.purple}, #5B3FBB)`
                : `linear-gradient(135deg, ${T.cta}, #EA580C)`,
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              boxShadow: importMode === 'supplier' ? '0 4px 16px rgba(123,97,255,.25)' : '0 4px 16px rgba(249,115,22,.25)',
            }}>
              {importing ? '...שומר' : importMode === 'supplier'
                ? `💰 שמור הצעת ${supplierInfo.name || 'ספק'} (${selectedCount})`
                : `📥 ייבא ${selectedCount} סעיפים`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#A0A3BD',
  textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'right',
  borderBottom: '2px solid #E4E4EE', background: '#FAFAFF',
  fontFamily: "'Inter','Heebo',sans-serif",
};

const tdStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13, color: '#6E7191',
  borderBottom: '1px solid #E4E4EE',
  fontFamily: "'Inter','Heebo',sans-serif",
};

const cellInput: React.CSSProperties = {
  width: '100%', padding: '4px 8px', borderRadius: 6,
  border: '1px solid #E4E4EE', fontSize: 13,
  fontFamily: "'Inter','Heebo',sans-serif",
  textAlign: 'center', outline: 'none',
};
