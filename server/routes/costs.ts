import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

// Get costs for a project
router.get('/project/:projectId', (req, res) => {
  const rows = db.prepare('SELECT * FROM cost_items WHERE project_id = ? ORDER BY sort_order, created_at').all(req.params.projectId);
  res.json(rows);
});

// Create cost item
router.post('/', (req, res) => {
  const b = req.body;
  const id = randomUUID();
  const total = (b.quantity || 0) * (b.unit_price || 0);
  db.prepare(`
    INSERT INTO cost_items (id, project_id, category, description, unit, quantity, unit_price, total, is_actual, dekel_ref, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, b.project_id, b.category || 'other', b.description || '', b.unit || '', b.quantity || 0, b.unit_price || 0, total, b.is_actual || 0, b.dekel_ref || '', b.sort_order || 0);
  res.json({ id, ...b, total });
});

// Batch create cost items (for import)
router.post('/batch', (req, res) => {
  const items: any[] = req.body.items;
  const projectId = req.body.project_id;
  if (!items?.length || !projectId) return res.status(400).json({ error: 'חסרים נתונים' });

  const insert = db.prepare(`
    INSERT INTO cost_items (id, project_id, category, description, unit, quantity, unit_price, total, is_actual, dekel_ref, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction((items: any[]) => {
    for (const b of items) {
      const total = (b.quantity || 0) * (b.unit_price || 0);
      insert.run(randomUUID(), projectId, b.category || 'other', b.description || '', b.unit || '', b.quantity || 0, b.unit_price || 0, total, b.is_actual || 0, b.dekel_ref || '', b.sort_order || 0);
    }
  });

  tx(items);
  res.json({ ok: true, count: items.length });
});

// Update cost item
router.put('/:id', (req, res) => {
  const b = req.body;
  const total = (b.quantity || 0) * (b.unit_price || 0);
  db.prepare(`
    UPDATE cost_items SET category=?, description=?, unit=?, quantity=?, unit_price=?, total=?, is_actual=?, dekel_ref=?, sort_order=?
    WHERE id=?
  `).run(b.category || 'other', b.description || '', b.unit || '', b.quantity || 0, b.unit_price || 0, total, b.is_actual || 0, b.dekel_ref || '', b.sort_order || 0, req.params.id);
  res.json({ ok: true });
});

// Delete cost item
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM cost_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
