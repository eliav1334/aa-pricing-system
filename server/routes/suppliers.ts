import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

// Get all suppliers
router.get('/', (req, res) => {
  try {
    const q = (req.query.q as string || '').trim();
    let rows;
    if (q) {
      rows = db.prepare('SELECT * FROM suppliers WHERE name LIKE ? OR contact_person LIKE ? ORDER BY name').all(`%${q}%`, `%${q}%`);
    } else {
      rows = db.prepare('SELECT * FROM suppliers ORDER BY name').all();
    }
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה: ' + e.message });
  }
});

// Get single supplier
router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'ספק לא נמצא' });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה: ' + e.message });
  }
});

// Find supplier by name (exact or partial match)
router.get('/by-name/:name', (req, res) => {
  try {
    const name = req.params.name.trim();
    const row = db.prepare('SELECT * FROM suppliers WHERE name = ? OR name LIKE ?').get(name, `%${name}%`);
    res.json(row || null);
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה: ' + e.message });
  }
});

// Create or update supplier (upsert by name)
router.post('/', (req, res) => {
  try {
    const b = req.body;
    if (!b.name?.trim()) return res.status(400).json({ error: 'שם ספק חובה' });

    // Check if supplier already exists by name
    const existing = db.prepare('SELECT * FROM suppliers WHERE name = ?').get(b.name.trim()) as any;

    if (existing) {
      // Update only non-empty fields (don't overwrite existing data with empty)
      const updates: string[] = [];
      const vals: any[] = [];
      for (const field of ['contact_person', 'phone', 'mobile', 'email', 'fax', 'address', 'website', 'notes']) {
        if (b[field] && b[field].trim()) {
          updates.push(`${field} = ?`);
          vals.push(b[field].trim());
        }
      }
      if (updates.length > 0) {
        updates.push("updated_at = datetime('now')");
        vals.push(existing.id);
        db.prepare(`UPDATE suppliers SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
      }
      res.json({ id: existing.id, created: false });
    } else {
      // Create new
      const id = randomUUID();
      db.prepare(`
        INSERT INTO suppliers (id, name, contact_person, phone, mobile, email, fax, address, website, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, b.name.trim(),
        b.contact_person || '', b.phone || '', b.mobile || '',
        b.email || '', b.fax || '', b.address || '', b.website || '', b.notes || ''
      );
      res.json({ id, created: true });
    }
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה: ' + e.message });
  }
});

// Update supplier
router.put('/:id', (req, res) => {
  try {
    const b = req.body;
    db.prepare(`
      UPDATE suppliers SET name=?, contact_person=?, phone=?, mobile=?, email=?, fax=?, address=?, website=?, notes=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      b.name || '', b.contact_person || '', b.phone || '', b.mobile || '',
      b.email || '', b.fax || '', b.address || '', b.website || '', b.notes || '',
      req.params.id
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה: ' + e.message });
  }
});

// Delete supplier
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM suppliers WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה: ' + e.message });
  }
});

// Get suppliers linked to a project (via supplier_quotes)
router.get('/project/:projectId', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT DISTINCT s.*
      FROM suppliers s
      JOIN supplier_quotes sq ON sq.supplier_id = s.id
      WHERE sq.project_id = ?
      ORDER BY s.name
    `).all(req.params.projectId);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה: ' + e.message });
  }
});

export default router;
