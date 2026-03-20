/**
 * סקריפט סריקת הצעות מחיר וכתבי כמויות
 * סורק תיקיות, מחלץ מחירים מ-Excel/PDF, ומייצר דוח מרוכז
 *
 * הרצה: cd server && npx tsx scan-quotes.ts
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';

// ═══ Types ═══

interface ExtractedPrice {
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
  category: string; // חומר, עבודה, ציוד, הובלה, כללי
}

interface ScannedFile {
  path: string;
  fileName: string;
  folder: string;      // project/subfolder name
  fileType: 'xlsx' | 'pdf' | 'docx';
  docType: string;     // הצעת מחיר ללקוח, הצעת ספק, כתב כמויות, מחירון, אחר
  supplier?: string;   // if identified
  client?: string;
  date?: string;
  items: ExtractedPrice[];
  rawText?: string;    // first 500 chars for review
  error?: string;
  scanDate: string;
}

interface ScanReport {
  scanDate: string;
  totalFiles: number;
  scannedOk: number;
  errors: number;
  totalItems: number;
  files: ScannedFile[];
}

// ═══ Config ═══

const SCAN_PATHS = [
  'D:/עבודות עפר/הצעות מחיר',
  'D:/עבודות עפר/עבודות פיתוח ובנטונייט',
];

const OUTPUT_PATH = join(import.meta.dirname || '.', '..', 'data', 'scan-report.json');

// ═══ Helpers ═══

function toNum(v: any): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (typeof v !== 'string') return 0;
  return parseFloat(v.replace(/[,₪\s]/g, '')) || 0;
}

function detectCategory(desc: string): string {
  const d = desc.toLowerCase();
  if (/מחפר|באגר|בובקט|שופל|מנוף|טרקטור|משאית|פטיש|קידוח|כלי/.test(d)) return 'ציוד';
  if (/הובלה|פינוי|משלוח|הובלת/.test(d)) return 'הובלה';
  if (/חפירה|הידוק|יישור|פילוס|פירוק|הריסה|ניסור|ביצוע|עבודה|צוות|יום עבודה/.test(d)) return 'עבודה';
  if (/אספלט|בטון|משתלבת|ריצוף|שפה|תעלה|צינור|מצע|חול|חמרה|דשא|קומפוסט|ברזל|בלוק|אבן/.test(d)) return 'חומר';
  return 'כללי';
}

function detectDocType(fileName: string, text: string): string {
  const fn = fileName.toLowerCase();
  const t = text.toLowerCase();

  if (/כתב כמויות|כמויות ומחירים|פירוט עבודה/.test(fn)) return 'כתב כמויות';
  if (/מחירון|מחירי |tariff/.test(fn)) return 'מחירון';

  // Check content
  if (/לכבוד.*אליאב|לכבוד.*א\.א/.test(t)) return 'הצעת ספק';
  if (/בע"מ.*הצעת מחיר|הצעת מחיר.*מס/.test(t)) return 'הצעת ספק';
  if (/לכבוד[:\s]/.test(t) && !/אליאב/.test(t.substring(0, t.indexOf('לכבוד') + 50))) return 'הצעת מחיר ללקוח';
  if (/הצעת מחיר/.test(fn)) return 'הצעת מחיר ללקוח';
  if (/כמויות|פירוט/.test(t.substring(0, 200))) return 'כתב כמויות';

  return 'אחר';
}

function detectSupplier(text: string): string | undefined {
  const known = [
    { p: /איטונג|ytong/i, n: 'איטונג' },
    { p: /אקרשטיין|ackerstein/i, n: 'אקרשטיין' },
    { p: /רדימקס|readymix/i, n: 'רדימקס' },
    { p: /רוקח/i, n: 'רוקח יוסף' },
    { p: /וולפמן|wolfman/i, n: 'וולפמן' },
    { p: /נשר|nesher/i, n: 'נשר מלט' },
    { p: /טמבור|tambour/i, n: 'טמבור' },
    { p: /מגנודריין|magnodrain/i, n: 'מגנודריין (וולפמן)' },
    { p: /נופית|עיצוב גנים/i, n: 'נופית עיצוב גנים' },
    { p: /פלסאון|plasson/i, n: 'פלסאון' },
    { p: /BIRCO|בירקו/i, n: 'BIRCO' },
  ];
  for (const s of known) {
    if (s.p.test(text)) return s.n;
  }
  // Try "XXX בע"מ" pattern
  const m = text.match(/([\u0590-\u05FF\s\.]+)\s*בע["\u05F4]מ/);
  if (m && m[1].trim().length > 2 && m[1].trim().length < 30) return m[1].trim() + ' בע"מ';
  return undefined;
}

function extractDate(text: string): string | undefined {
  const m = text.match(/(\d{1,2})[\/\-.](0?\d|1[0-2])[\/\-.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y}`;
  }
  return undefined;
}

// ═══ Parsers ═══

async function parseExcel(filePath: string): Promise<{ items: ExtractedPrice[]; text: string }> {
  const { createRequire } = await import('module');
  const req = createRequire(import.meta.url);
  const XLSX = req('xlsx');
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });

  const items: ExtractedPrice[] = [];
  let allText = '';

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (data.length < 2) continue;

    allText += data.map(r => r.join(' ')).join('\n');

    // Find header row
    const KNOWN_DESC = ['תיאור', 'תאור', 'פריט', 'שם', 'סעיף', 'פירוט', 'description', 'שם פריט'];
    const KNOWN_QTY = ['כמות', 'qty', 'quantity', 'יחידות'];
    const KNOWN_PRICE = ['מחיר', 'price', 'עלות', 'מחיר ליחידה', 'מחיר יחידה'];
    const KNOWN_UNIT = ['יחידה', 'יח', 'unit'];
    const KNOWN_TOTAL = ['סכום', 'סה"כ', 'סהכ', 'total', 'סה״כ'];

    let hIdx = -1;
    let dCol = -1, qCol = -1, pCol = -1, uCol = -1, tCol = -1;

    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i].map((c: any) => String(c).trim().toLowerCase());
      let matches = 0;

      for (let j = 0; j < row.length; j++) {
        const h = row[j];
        if (KNOWN_DESC.some(k => h.includes(k))) { dCol = j; matches++; }
        else if (KNOWN_QTY.some(k => h.includes(k))) { qCol = j; matches++; }
        else if (KNOWN_PRICE.some(k => h.includes(k))) { pCol = j; matches++; }
        else if (KNOWN_UNIT.some(k => h.includes(k))) { uCol = j; matches++; }
        else if (KNOWN_TOTAL.some(k => h.includes(k))) { tCol = j; matches++; }
      }

      if (matches >= 2 && dCol >= 0) { hIdx = i; break; }
    }

    if (hIdx < 0) {
      // Fallback: find longest text column as description
      if (data.length >= 3) {
        let maxLen = 0;
        for (let j = 0; j < (data[1]?.length || 0); j++) {
          const len = data.slice(1, 6).reduce((s, r) => s + String(r[j] || '').length, 0);
          if (len > maxLen) { maxLen = len; dCol = j; }
        }
        hIdx = 0;
      } else continue;
    }

    // Extract data rows
    for (let i = hIdx + 1; i < data.length; i++) {
      const row = data[i];
      const desc = String(row[dCol] || '').trim();
      if (!desc || desc.length < 2) continue;
      if (/^סה["\u05F4״']כ|^total/i.test(desc)) continue;

      const qty = qCol >= 0 ? toNum(row[qCol]) : 0;
      const price = pCol >= 0 ? toNum(row[pCol]) : 0;
      const unit = uCol >= 0 ? String(row[uCol] || '').trim() : '';
      const total = tCol >= 0 ? toNum(row[tCol]) : (qty * price);

      // Skip header-like or empty rows
      if (qty === 0 && price === 0 && total === 0) continue;

      items.push({
        description: desc,
        unit: unit || 'יח\'',
        quantity: qty,
        unitPrice: price || (qty > 0 && total > 0 ? Math.round(total / qty * 100) / 100 : 0),
        total: total || qty * price,
        category: detectCategory(desc),
      });
    }
  }

  return { items, text: allText.substring(0, 1000) };
}

async function parsePdfText(filePath: string): Promise<{ items: ExtractedPrice[]; text: string }> {
  // Dynamic import for pdfjs — installed at project root level
  let pdfjsLib: any;
  try {
    pdfjsLib = (await import('pdfjs-dist/legacy/build/pdf.mjs' as any));
  } catch {
    try {
      // Fallback: require from root node_modules
      const { createRequire } = await import('module');
      const req = createRequire(import.meta.url);
      pdfjsLib = req('../../node_modules/pdfjs-dist/legacy/build/pdf.js');
    } catch {
      return { items: [], text: '[PDF parser לא זמין]' };
    }
  }

  const data = new Uint8Array(readFileSync(filePath));
  let pdf: any;
  try {
    pdf = await pdfjsLib.getDocument({ data }).promise;
  } catch {
    return { items: [], text: '[PDF לא תקין]' };
  }

  let allText = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    allText += tc.items.map((i: any) => i.str || '').join(' ') + '\n';
  }

  if (allText.trim().length < 20) {
    return { items: [], text: '[סריקה - צריך OCR]' };
  }

  // Try to extract prices from text using patterns
  const items: ExtractedPrice[] = [];
  const pricePattern = /(\d{1,3}(?:,\d{3})*\.?\d{0,2})\s*(?:ש["\u05F4]ח|₪)/g;
  const qtyUnitPattern = /(\d{1,6}(?:\.\d{1,2})?)\s*(מ["\u05F4]ר|מ["\u05F4]א|יח['\u05F3]?|טון|קוב|מ"ק|יום)/g;

  // Simple line-by-line extraction
  const lines = allText.split('\n');
  for (const line of lines) {
    if (line.length < 5) continue;
    if (/סה["\u05F4]כ\s*(כללי|לתשלום|מחיר)|מע["\u05F4]מ|עוסק מורשה|www\.|בתוקף עד/.test(line)) continue;

    const prices = [...line.matchAll(pricePattern)].map(m => toNum(m[1]));
    const qtyMatch = line.match(qtyUnitPattern);

    if (prices.length === 0 && !qtyMatch) continue;

    // Clean description
    let desc = line
      .replace(/\b\d{7,15}\b/g, '')                    // catalog numbers
      .replace(/[\d,]+\.?\d*\s*ש["\u05F4]ח/g, '')     // prices
      .replace(/[\d,]+\.?\d*\s*₪/g, '')                // prices ₪
      .replace(/\s+/g, ' ').trim();

    if (desc.length < 3) continue;
    if (desc.length > 100) desc = desc.substring(0, 100);

    const unitPrice = prices[0] || 0;
    const qty = qtyMatch ? toNum(qtyMatch[0]) : 0;
    const unit = qtyMatch ? qtyMatch[0].replace(/[\d.,\s]/g, '').trim() : '';

    if (unitPrice > 0) {
      items.push({
        description: desc,
        unit: unit || 'יח\'',
        quantity: qty,
        unitPrice,
        total: qty > 0 ? qty * unitPrice : unitPrice,
        category: detectCategory(desc),
      });
    }
  }

  return { items, text: allText.substring(0, 1000) };
}

// ═══ Scanner ═══

function getAllFiles(dir: string): { path: string; folder: string }[] {
  const results: { path: string; folder: string }[] = [];
  const SKIP = ['Thumbs.db', '.DS_Store'];
  const VALID_EXT = ['.xlsx', '.xls', '.pdf', '.docx'];

  function walk(currentDir: string, folderName: string) {
    try {
      const entries = readdirSync(currentDir);
      for (const entry of entries) {
        if (entry.startsWith('~$') || SKIP.includes(entry)) continue;
        const fullPath = join(currentDir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath, entry);
          } else if (stat.isFile()) {
            const ext = extname(entry).toLowerCase();
            if (VALID_EXT.includes(ext) && stat.size > 1000 && stat.size < 50_000_000) {
              results.push({ path: fullPath, folder: folderName });
            }
          }
        } catch { /* skip inaccessible */ }
      }
    } catch { /* skip inaccessible dirs */ }
  }

  walk(dir, basename(dir));
  return results;
}

async function scanFile(filePath: string, folder: string): Promise<ScannedFile> {
  const fileName = basename(filePath);
  const ext = extname(fileName).toLowerCase().replace('.', '') as string;
  const now = new Date().toISOString();

  try {
    let items: ExtractedPrice[] = [];
    let text = '';

    if (ext === 'xlsx' || ext === 'xls') {
      const result = await parseExcel(filePath);
      items = result.items;
      text = result.text;
    } else if (ext === 'pdf') {
      const result = await parsePdfText(filePath);
      items = result.items;
      text = result.text;
    } else {
      // docx — skip for now, mark for future
      return {
        path: filePath, fileName, folder, fileType: 'docx',
        docType: 'אחר', items: [], rawText: '[Word - לא נסרק עדיין]',
        scanDate: now,
      };
    }

    const docType = detectDocType(fileName, text);
    const supplier = detectSupplier(text);
    const date = extractDate(text);

    return {
      path: filePath, fileName, folder, fileType: ext as any,
      docType, supplier, date,
      items: items.slice(0, 100), // cap at 100 items per file
      rawText: text.substring(0, 500),
      scanDate: now,
    };
  } catch (e: any) {
    return {
      path: filePath, fileName, folder, fileType: ext as any,
      docType: 'אחר', items: [],
      error: e.message?.substring(0, 100),
      scanDate: now,
    };
  }
}

// ═══ Main ═══

async function main() {
  console.log('🔍 מתחיל סריקה...\n');

  // Collect all files
  const allFiles: { path: string; folder: string }[] = [];
  for (const scanPath of SCAN_PATHS) {
    if (!existsSync(scanPath)) {
      console.log(`⚠ תיקייה לא נמצאה: ${scanPath}`);
      continue;
    }
    const files = getAllFiles(scanPath);
    console.log(`📁 ${scanPath}: ${files.length} קבצים`);
    allFiles.push(...files);
  }

  console.log(`\n📊 סה"כ ${allFiles.length} קבצים לסריקה\n`);

  const report: ScanReport = {
    scanDate: new Date().toISOString(),
    totalFiles: allFiles.length,
    scannedOk: 0,
    errors: 0,
    totalItems: 0,
    files: [],
  };

  let count = 0;
  for (const file of allFiles) {
    count++;
    if (count % 20 === 0 || count === allFiles.length) {
      process.stdout.write(`\r⏳ ${count}/${allFiles.length}...`);
    }

    const result = await scanFile(file.path, file.folder);
    report.files.push(result);

    if (result.error) {
      report.errors++;
    } else {
      report.scannedOk++;
      report.totalItems += result.items.length;
    }
  }

  // Save report
  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`\n\n✅ סריקה הושלמה!`);
  console.log(`   קבצים: ${report.scannedOk} נסרקו | ${report.errors} שגיאות`);
  console.log(`   פריטי מחיר: ${report.totalItems}`);
  console.log(`   דוח נשמר: ${OUTPUT_PATH}`);

  // Summary by doc type
  const byType: Record<string, number> = {};
  for (const f of report.files) {
    byType[f.docType] = (byType[f.docType] || 0) + 1;
  }
  console.log('\n📋 סוגי מסמכים:');
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${type}: ${count}`);
  }

  // Summary by supplier
  const bySupplier: Record<string, number> = {};
  for (const f of report.files) {
    if (f.supplier) bySupplier[f.supplier] = (bySupplier[f.supplier] || 0) + 1;
  }
  if (Object.keys(bySupplier).length > 0) {
    console.log('\n🏭 ספקים שזוהו:');
    for (const [name, count] of Object.entries(bySupplier).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${name}: ${count} קבצים`);
    }
  }

  // Top items by frequency
  const itemFreq: Record<string, { count: number; prices: number[] }> = {};
  for (const f of report.files) {
    for (const item of f.items) {
      const key = item.description.substring(0, 40).toLowerCase().trim();
      if (!itemFreq[key]) itemFreq[key] = { count: 0, prices: [] };
      itemFreq[key].count++;
      if (item.unitPrice > 0) itemFreq[key].prices.push(item.unitPrice);
    }
  }

  const topItems = Object.entries(itemFreq)
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);

  if (topItems.length > 0) {
    console.log('\n📊 פריטים חוזרים (מופיעים ב-2+ קבצים):');
    for (const [name, data] of topItems) {
      const minP = Math.min(...data.prices);
      const maxP = Math.max(...data.prices);
      const priceRange = data.prices.length > 0
        ? minP === maxP ? `${minP} ₪` : `${minP}-${maxP} ₪`
        : 'אין מחיר';
      console.log(`   ${name} — ${data.count} פעמים | ${priceRange}`);
    }
  }
}

main().catch(e => {
  console.error('❌ שגיאה:', e.message);
  process.exit(1);
});
