import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

// List all projects
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  res.json(rows);
});

// Get single project
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'לא נמצא' });
  res.json(row);
});

// Create project
router.post('/', (req, res) => {
  const b = req.body;
  const id = randomUUID();
  db.prepare(`
    INSERT INTO projects (id, name, client, type, address, date, status, notes, margin_percent, overhead_percent, insurance_percent, vat_included)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, b.name, b.client || '', b.type || '', b.address || '', b.date || '', b.status || 'הצעה', b.notes || '', b.margin_percent ?? 15, b.overhead_percent ?? 0, b.insurance_percent ?? 0, b.vat_included ?? 0);
  res.json({ id, ...b });
});

// Update project
router.put('/:id', (req, res) => {
  const b = req.body;
  db.prepare(`
    UPDATE projects SET name=?, client=?, type=?, address=?, date=?, status=?, notes=?, margin_percent=?, overhead_percent=?, insurance_percent=?, vat_included=?
    WHERE id=?
  `).run(b.name, b.client || '', b.type || '', b.address || '', b.date || '', b.status || '', b.notes || '', b.margin_percent ?? 15, b.overhead_percent ?? 0, b.insurance_percent ?? 0, b.vat_included ?? 0, req.params.id);
  res.json({ ok: true });
});

// Delete project (cascade deletes cost_items)
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM cost_items WHERE project_id = ?').run(req.params.id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
