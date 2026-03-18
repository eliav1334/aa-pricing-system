import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

/** נרמול טקסט להשוואת כפילויות */
function normalizeDesc(s: string): string {
  return s.trim().replace(/\s+/g, ' ').replace(/['"\u05F4\u05F3]/g, '').toLowerCase();
}

// Get costs for a project
router.get('/project/:projectId', (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM cost_items WHERE project_id = ? ORDER BY sort_order, created_at'
    ).all(req.params.projectId);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה בטעינת סעיפים: ' + e.message });
  }
});

// Create cost item
router.post('/', (req, res) => {
  try {
    const b = req.body;
    const id = randomUUID();
    const total = (b.quantity || 0) * (b.unit_price || 0);
    db.prepare(`
      INSERT INTO cost_items (id, project_id, category, description, unit, quantity, unit_price, total, is_actual, dekel_ref, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, b.project_id, b.category || 'other', b.description || '', b.unit || '', b.quantity || 0, b.unit_price || 0, total, b.is_actual || 0, b.dekel_ref || '', b.sort_order || 0);
    res.json({ id, ...b, total });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה ביצירת סעיף: ' + e.message });
  }
});

// Batch create cost items (for import) — with server-side dedup
router.post('/batch', (req, res) => {
  try {
    const items: any[] = req.body.items;
    const projectId = req.body.project_id;
    if (!items?.length || !projectId) return res.status(400).json({ error: 'חסרים נתונים' });

    // שליפת סעיפים קיימים לבדיקת כפילויות
    const existing = db.prepare(
      'SELECT description FROM cost_items WHERE project_id = ?'
    ).all(projectId) as { description: string }[];

    const existingSet = new Set(existing.map(e => normalizeDesc(e.description)));

    // סינון כפילויות — גם מול DB וגם בתוך ה-batch עצמו
    const seenInBatch = new Set<string>();
    const uniqueItems: any[] = [];
    let skipped = 0;

    for (const item of items) {
      const norm = normalizeDesc(item.description || '');
      if (!norm || existingSet.has(norm) || seenInBatch.has(norm)) {
        skipped++;
        continue;
      }
      seenInBatch.add(norm);
      uniqueItems.push(item);
    }

    if (uniqueItems.length === 0) {
      return res.json({ ok: true, count: 0, skipped, message: 'כל הסעיפים כבר קיימים' });
    }

    const insert = db.prepare(`
      INSERT INTO cost_items (id, project_id, category, description, unit, quantity, unit_price, total, is_actual, dekel_ref, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction((items: any[]) => {
      for (const b of items) {
        const total = (b.quantity || 0) * (b.unit_price || 0);
        insert.run(
          randomUUID(), projectId,
          b.category || 'other', b.description || '', b.unit || '',
          b.quantity || 0, b.unit_price || 0, total,
          b.is_actual || 0, b.dekel_ref || '', b.sort_order || 0
        );
      }
    });

    tx(uniqueItems);
    res.json({ ok: true, count: uniqueItems.length, skipped });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה בייבוא סעיפים: ' + e.message });
  }
});

// Update cost item
router.put('/:id', (req, res) => {
  try {
    const b = req.body;
    const total = (b.quantity || 0) * (b.unit_price || 0);
    db.prepare(`
      UPDATE cost_items SET category=?, description=?, unit=?, quantity=?, unit_price=?, total=?, is_actual=?, dekel_ref=?, sort_order=?
      WHERE id=?
    `).run(b.category || 'other', b.description || '', b.unit || '', b.quantity || 0, b.unit_price || 0, total, b.is_actual || 0, b.dekel_ref || '', b.sort_order || 0, req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה בעדכון סעיף: ' + e.message });
  }
});

// Delete cost item
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM cost_items WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה במחיקת סעיף: ' + e.message });
  }
});

export default router;
