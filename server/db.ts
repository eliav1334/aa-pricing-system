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
  CREATE INDEX IF NOT EXISTS idx_prices_name ON price_db(name);
  CREATE INDEX IF NOT EXISTS idx_prices_chapter ON price_db(chapter);
  CREATE INDEX IF NOT EXISTS idx_docs_project ON documents(project_id);
`);

export default db;
