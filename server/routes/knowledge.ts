import { Router } from 'express';
import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import db from '../db.js';

const router = Router();

const REPORT_PATH = join(import.meta.dirname || '.', '..', '..', 'data', 'scan-report.json');

// Get scan report (for review UI)
router.get('/scan-report', (req, res) => {
  try {
    if (!existsSync(REPORT_PATH)) {
      return res.json({ files: [], totalFiles: 0, totalItems: 0 });
    }
    const raw = readFileSync(REPORT_PATH, 'utf-8');
    const report = JSON.parse(raw);

    // Filter: only files with items
    const filesWithItems = report.files.filter((f: any) => f.items?.length > 0);

    // Add status from DB (approved/rejected)
    const approvedItems = db.prepare('SELECT source_file, description FROM knowledge_items').all() as any[];
    const approvedSet = new Set(approvedItems.map((a: any) => `${a.source_file}::${a.description}`));

    for (const f of filesWithItems) {
      for (const item of f.items) {
        item._status = approvedSet.has(`${f.fileName}::${item.description}`) ? 'approved' : 'pending';
      }
    }

    res.json({
      scanDate: report.scanDate,
      totalFiles: report.totalFiles,
      totalItems: report.totalItems,
      files: filesWithItems,
    });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה בקריאת דוח: ' + e.message });
  }
});

// Approve items — save to knowledge base
router.post('/approve', (req, res) => {
  try {
    const { items } = req.body as {
      items: {
        description: string;
        unit: string;
        quantity: number;
        unitPrice: number;
        total: number;
        category: string;
        sourceFile: string;
        folder: string;
        docType: string;
        supplier?: string;
        date?: string;
      }[];
    };

    if (!items?.length) return res.status(400).json({ error: 'אין פריטים' });

    const insert = db.prepare(`
      INSERT OR IGNORE INTO knowledge_items
      (id, description, unit, quantity, unit_price, total, category, source_file, folder, doc_type, supplier, date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')
    `);

    let added = 0;
    const tx = db.transaction(() => {
      for (const item of items) {
        const result = insert.run(
          randomUUID(),
          item.description, item.unit, item.quantity, item.unitPrice, item.total,
          item.category, item.sourceFile, item.folder, item.docType,
          item.supplier || '', item.date || ''
        );
        if (result.changes > 0) added++;
      }
    });
    tx();

    res.json({ ok: true, added, total: items.length });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה: ' + e.message });
  }
});

// Get approved knowledge items (with search/filter)
router.get('/items', (req, res) => {
  try {
    const q = (req.query.q as string || '').trim();
    const cat = (req.query.category as string || '').trim();
    const supplier = (req.query.supplier as string || '').trim();

    let where = "status = 'approved'";
    const params: any[] = [];
    if (q) { where += ' AND description LIKE ?'; params.push(`%${q}%`); }
    if (cat) { where += ' AND category = ?'; params.push(cat); }
    if (supplier) { where += ' AND supplier LIKE ?'; params.push(`%${supplier}%`); }

    const items = db.prepare(`SELECT * FROM knowledge_items WHERE ${where} ORDER BY category, description`).all(...params);
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה: ' + e.message });
  }
});

// Get stats
router.get('/stats', (req, res) => {
  try {
    const total = (db.prepare("SELECT count(*) as c FROM knowledge_items WHERE status = 'approved'").get() as any).c;
    const byCat = db.prepare("SELECT category, count(*) as c FROM knowledge_items WHERE status = 'approved' GROUP BY category ORDER BY c DESC").all();
    const bySupplier = db.prepare("SELECT supplier, count(*) as c FROM knowledge_items WHERE status = 'approved' AND supplier != '' GROUP BY supplier ORDER BY c DESC").all();
    res.json({ total, byCategory: byCat, bySupplier });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה: ' + e.message });
  }
});

// Delete knowledge item
router.delete('/items/:id', (req, res) => {
  try {
    db.prepare("DELETE FROM knowledge_items WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה: ' + e.message });
  }
});

export default router;
