import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'pricing.db');

const db = new Database(DB_PATH);

// Performance settings
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    client TEXT DEFAULT '',
    type TEXT DEFAULT '',
    address TEXT DEFAULT '',
    date TEXT DEFAULT '',
    status TEXT DEFAULT 'הצעה',
    notes TEXT DEFAULT '',
    margin_percent REAL DEFAULT 15,
    overhead_percent REAL DEFAULT 0,
    insurance_percent REAL DEFAULT 0,
    vat_included INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cost_items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    category TEXT DEFAULT 'other',
    description TEXT DEFAULT '',
    unit TEXT DEFAULT '',
    quantity REAL DEFAULT 1,
    unit_price REAL DEFAULT 0,
    total REAL DEFAULT 0,
    is_actual INTEGER DEFAULT 0,
    dekel_ref TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS price_db (
    id TEXT PRIMARY KEY,
    category TEXT DEFAULT '',
    name TEXT NOT NULL,
    unit TEXT DEFAULT '',
    price REAL DEFAULT 0,
    supplier TEXT DEFAULT '',
    dekel_id TEXT DEFAULT '',
    chapter TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT DEFAULT '',
    size INTEGER DEFAULT 0,
    category TEXT DEFAULT 'general',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_costs_project ON cost_items(project_id);

  CREATE TABLE IF NOT EXISTS supplier_quotes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    supplier_name TEXT NOT NULL,
    quote_number TEXT DEFAULT '',
    quote_date TEXT DEFAULT '',
    document_id TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS supplier_quote_items (
    id TEXT PRIMARY KEY,
    quote_id TEXT NOT NULL,
    catalog_number TEXT DEFAULT '',
    description TEXT NOT NULL,
    unit TEXT DEFAULT '',
    quantity REAL DEFAULT 0,
    unit_price REAL DEFAULT 0,
    total_price REAL DEFAULT 0,
    cost_item_id TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (quote_id) REFERENCES supplier_quotes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact_person TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    mobile TEXT DEFAULT '',
    email TEXT DEFAULT '',
    fax TEXT DEFAULT '',
    address TEXT DEFAULT '',
    website TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);

  -- מילון מונחים מקצועי — מאפשר למערכת "להבין" מוצרי ספק
  CREATE TABLE IF NOT EXISTS term_mappings (
    id TEXT PRIMARY KEY,
    term TEXT NOT NULL,
    canonical TEXT NOT NULL,
    category TEXT DEFAULT '',
    source TEXT DEFAULT 'seed',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_terms_term ON term_mappings(term);
  CREATE INDEX IF NOT EXISTS idx_terms_canonical ON term_mappings(canonical);

  -- בסיס ידע מוצרים מקיף — מאגר מוצרי בנייה ופיתוח
  CREATE TABLE IF NOT EXISTS product_knowledge (
    id TEXT PRIMARY KEY,
    supplier TEXT DEFAULT '',
    product_name TEXT NOT NULL,
    product_family TEXT DEFAULT '',
    boq_term TEXT DEFAULT '',
    category TEXT DEFAULT '',
    subcategory TEXT DEFAULT '',
    unit TEXT DEFAULT '',
    dimensions TEXT DEFAULT '',
    material TEXT DEFAULT '',
    use_case TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_pk_supplier ON product_knowledge(supplier);
  CREATE INDEX IF NOT EXISTS idx_pk_family ON product_knowledge(product_family);
  CREATE INDEX IF NOT EXISTS idx_pk_boq ON product_knowledge(boq_term);

  CREATE INDEX IF NOT EXISTS idx_squotes_project ON supplier_quotes(project_id);
  CREATE INDEX IF NOT EXISTS idx_sqitems_quote ON supplier_quote_items(quote_id);
  CREATE INDEX IF NOT EXISTS idx_sqitems_costitem ON supplier_quote_items(cost_item_id);
`);

// Knowledge base — approved price data from scanned files
db.exec(`
  CREATE TABLE IF NOT EXISTS knowledge_items (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    unit TEXT DEFAULT '',
    quantity REAL DEFAULT 0,
    unit_price REAL DEFAULT 0,
    total REAL DEFAULT 0,
    category TEXT DEFAULT 'כללי',
    source_file TEXT DEFAULT '',
    folder TEXT DEFAULT '',
    doc_type TEXT DEFAULT '',
    supplier TEXT DEFAULT '',
    date TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(source_file, description)
  );
  CREATE INDEX IF NOT EXISTS idx_knowledge_cat ON knowledge_items(category);
  CREATE INDEX IF NOT EXISTS idx_knowledge_supplier ON knowledge_items(supplier);
  CREATE INDEX IF NOT EXISTS idx_knowledge_status ON knowledge_items(status);
`);

// Safe migrations
try { db.exec(`ALTER TABLE cost_items ADD COLUMN notes TEXT DEFAULT ''`); } catch (_) { /* already exists */ }
try { db.exec(`ALTER TABLE supplier_quotes ADD COLUMN supplier_id TEXT DEFAULT ''`); } catch (_) { /* already exists */ }

// Seed term mappings (only if empty)
const termCount = (db.prepare('SELECT COUNT(*) as c FROM term_mappings').get() as any).c;
if (termCount === 0) {
  const insertTerm = db.prepare('INSERT INTO term_mappings (id, term, canonical, category, source) VALUES (?, ?, ?, ?, ?)');
  let i = 0;
  const seed = (term: string, canonical: string, cat: string) => {
    insertTerm.run(`seed-${++i}`, term, canonical, cat, 'seed');
  };

  const tx = db.transaction(() => {
    // ══════ ריצוף ══════
    seed('גדורה', 'משתלבת', 'ריצוף');
    seed('גדורה קובית', 'משתלבת', 'ריצוף');
    seed('אבני שביל', 'משתלבת', 'ריצוף');
    seed('דמוי אבן', 'משתלבת', 'ריצוף');
    seed('זעפרן', 'משתלבת', 'ריצוף');
    seed('הולנדית', 'משתלבת', 'ריצוף');
    seed('רומית', 'משתלבת', 'ריצוף');
    seed('דקורטיבי', 'ריצוף דקורטיבי', 'ריצוף');
    seed('משתלבת', 'משתלבת', 'ריצוף');
    seed('ריצוף משתלבת', 'משתלבת', 'ריצוף');
    seed('אבני ריצוף', 'משתלבת', 'ריצוף');

    // ══════ אבן שפה ══════
    seed('שפה', 'אבן שפה', 'שפה');
    seed('אבן שפה', 'אבן שפה', 'שפה');
    seed('שפה תא', 'אבן שפה', 'שפה');
    seed('בורדיור', 'אבן שפה', 'שפה');
    seed('שפת מדרכה', 'אבן שפה', 'שפה');
    seed('שפה ישראלית', 'אבן שפה', 'שפה');
    seed('שפה עגולה', 'אבן שפה', 'שפה');

    // ══════ בלימה / חניה ══════
    seed('בלימה', 'אבני בלימה', 'חניה');
    seed('בלימה לרכב', 'אבני בלימה', 'חניה');
    seed('מעצור חניה', 'אבני בלימה', 'חניה');
    seed('מעצור רכב', 'אבני בלימה', 'חניה');
    seed('סימון חניה', 'סימון חניות', 'חניה');
    seed('סימון חניה לנכים', 'סימון חניות נכים', 'חניה');
    seed('סימון נכים', 'סימון חניות נכים', 'חניה');

    // ══════ ניקוז / תעלות ══════
    seed('תעלת ניקוז', 'תעלה', 'ניקוז');
    seed('תעלה דו שיפועית', 'תעלה', 'ניקוז');
    seed('אבן תעלה', 'תעלה', 'ניקוז');
    seed('תעלה חד שיפועית', 'תעלה', 'ניקוז');
    seed('מרזב ניקוז', 'תעלה', 'ניקוז');
    seed('ניקוז שטחי', 'תעלה', 'ניקוז');
    seed('ביב', 'ניקוז', 'ניקוז');
    seed('שוחה', 'שוחת ניקוז', 'ניקוז');
    seed('שוחת ביקורת', 'שוחת ניקוז', 'ניקוז');

    // ══════ אבן גן / נוי ══════
    seed('גן מדברי', 'אבן גן', 'נוי');
    seed('אבן גן', 'אבן גן', 'נוי');
    seed('אבן נוי', 'אבן גן', 'נוי');
    seed('מדברי', 'אבן גן', 'נוי');
    seed('חברוני', 'אבן גן', 'נוי');

    // ══════ משושית ══════
    seed('משושית', 'אבן גן כורכרי', 'נוי');
    seed('כורכרי', 'כורכרי', 'ריצוף');
    seed('כורכרי מסותת', 'אבן גן כורכרי', 'נוי');

    // ══════ בטון ══════
    seed('בטון', 'בטון', 'בטון');
    seed('בטון מוכן', 'בטון', 'בטון');
    seed('רדימקס', 'בטון', 'בטון');
    seed('יציקה', 'בטון', 'בטון');
    seed('בטון b30', 'בטון', 'בטון');
    seed('בטון b20', 'בטון', 'בטון');
    seed('בטון רזה', 'בטון רזה', 'בטון');

    // ══════ ברזל / זיון ══════
    seed('ברזל', 'ברזל זיון', 'ברזל');
    seed('זיון', 'ברזל זיון', 'ברזל');
    seed('ארמטורה', 'ברזל זיון', 'ברזל');
    seed('רשת פלדה', 'רשת זיון', 'ברזל');

    // ══════ עפר / חפירה ══════
    seed('חפירה', 'חפירה', 'עפר');
    seed('כריה', 'חפירה', 'עפר');
    seed('מילוי', 'מילוי', 'עפר');
    seed('מצע', 'מצע', 'עפר');
    seed('הידוק', 'הידוק', 'עפר');
    seed('חישוף', 'חישוף', 'עפר');
    seed('יישור', 'יישור', 'עפר');
    seed('פינוי עודפים', 'פינוי עפר', 'עפר');
    seed('סילוק', 'פינוי עפר', 'עפר');

    // ══════ אספלט ══════
    seed('אספלט', 'אספלט', 'אספלט');
    seed('ביטומן', 'אספלט', 'אספלט');
    seed('שכבת מסד', 'אספלט', 'אספלט');
    seed('שכבת ביטום', 'אספלט', 'אספלט');
    seed('אמולסיה', 'אספלט', 'אספלט');

    // ══════ צנרת ══════
    seed('צינור', 'צנרת', 'צנרת');
    seed('צנרת', 'צנרת', 'צנרת');
    seed('שרוול', 'שרוול', 'צנרת');
    seed('פי וי סי', 'צנרת PVC', 'צנרת');
    seed('פוליאתילן', 'צנרת פוליאתילן', 'צנרת');

    // ══════ קירות / טיח ══════
    seed('טיח', 'טיח', 'טיח');
    seed('טיח כורכרי', 'טיח כורכרי', 'טיח');
    seed('חיפוי קירות', 'חיפוי קירות', 'חיפוי');
    seed('חיפוי אבן', 'חיפוי קירות', 'חיפוי');
    seed('בלוקים', 'בלוקים', 'קירות');
    seed('בלוק', 'בלוקים', 'קירות');

    // ══════ גינון ══════
    seed('דשא', 'דשא', 'גינון');
    seed('דשא סינטטי', 'דשא סינטטי', 'גינון');
    seed('שתילה', 'שתילה', 'גינון');
    seed('עץ', 'עצים', 'גינון');
    seed('שיח', 'שיחים', 'גינון');
    seed('השקיה', 'מערכת השקיה', 'גינון');

    // ══════ חשמל ══════
    seed('תאורה', 'תאורה', 'חשמל');
    seed('עמוד תאורה', 'עמוד תאורה', 'חשמל');
    seed('בקרת השקיה', 'בקרת השקיה', 'חשמל');

    // ══════ מידות נפוצות (aliases) ══════
    seed('100/17/25', 'אבן שפה', 'שפה');
    seed('100/25/12', 'אבן שפה', 'שפה');
    seed('10/20/100', 'אבן גן', 'נוי');

    // ══════ ספקים ← מוצרים ══════
    seed('איטונג', 'ריצוף/שפה/ניקוז', 'ספק');
    seed('אקרשטיין', 'ריצוף/שפה/ניקוז', 'ספק');
  });

  tx();
  console.log(`📚 Seeded ${i} term mappings`);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_prices_name ON price_db(name);
  CREATE INDEX IF NOT EXISTS idx_prices_chapter ON price_db(chapter);
  CREATE INDEX IF NOT EXISTS idx_docs_project ON documents(project_id);
`);

export default db;
