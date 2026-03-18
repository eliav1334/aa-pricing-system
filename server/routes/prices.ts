import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

// List prices with pagination, search, chapter filter
router.get('/', (req, res) => {
  const q = (req.query.q as string) || '';
  const chapter = (req.query.chapter as string) || '';
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = (page - 1) * limit;

  let where = '1=1';
  const params: any[] = [];
  if (q) { where += ' AND name LIKE ?'; params.push(`%${q}%`); }
  if (chapter) { where += ' AND chapter = ?'; params.push(chapter); }

  const countRow = db.prepare(`SELECT COUNT(*) as c FROM price_db WHERE ${where}`).get(...params) as any;
  const rows = db.prepare(`SELECT * FROM price_db WHERE ${where} ORDER BY chapter, name LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const chapters = db.prepare("SELECT DISTINCT chapter FROM price_db WHERE chapter != '' ORDER BY chapter").all() as any[];

  res.json({
    items: rows,
    total: countRow.c,
    page,
    pages: Math.ceil(countRow.c / limit),
    chapters: chapters.map(r => r.chapter)
  });
});

// Suggest (autocomplete for cost item entry)
router.get('/suggest', (req, res) => {
  const q = (req.query.q as string) || '';
  if (!q || q.length < 2) return res.json([]);
  const rows = db.prepare('SELECT * FROM price_db WHERE name LIKE ? LIMIT 10').all(`%${q}%`);
  res.json(rows);
});

// Create price
router.post('/', (req, res) => {
  const b = req.body;
  const id = randomUUID();
  db.prepare(`
    INSERT INTO price_db (id, category, name, unit, price, supplier, dekel_id, chapter)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, b.category || '', b.name || '', b.unit || '', b.price || 0, b.supplier || '', b.dekel_id || '', b.chapter || '');
  res.json({ id, ...b });
});

// Batch insert prices (for import)
router.post('/batch', (req, res) => {
  const items: any[] = req.body.items;
  if (!items?.length) return res.status(400).json({ error: 'חסרים נתונים' });

  const insert = db.prepare(`
    INSERT INTO price_db (id, category, name, unit, price, supplier, dekel_id, chapter)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction((items: any[]) => {
    for (const b of items) {
      insert.run(randomUUID(), b.category || '', b.name || '', b.unit || '', b.price || 0, b.supplier || '', b.dekel_id || '', b.chapter || '');
    }
  });

  tx(items);
  res.json({ ok: true, count: items.length });
});

// Update price
router.put('/:id', (req, res) => {
  const b = req.body;
  db.prepare(`
    UPDATE price_db SET category=?, name=?, unit=?, price=?, supplier=?, dekel_id=?, chapter=?, updated_at=datetime('now')
    WHERE id=?
  `).run(b.category || '', b.name || '', b.unit || '', b.price || 0, b.supplier || '', b.dekel_id || '', b.chapter || '', req.params.id);
  res.json({ ok: true });
});

// Delete price
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM price_db WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
