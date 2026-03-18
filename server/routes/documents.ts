import { Router } from 'express';
import { randomUUID } from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'documents');

// Ensure upload dir exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/** Fix Hebrew filenames - multer encodes as latin1 */
function fixHebrewFilename(rawName: string): string {
  try {
    const decoded = Buffer.from(rawName, 'latin1').toString('utf8');
    if (/[\u0590-\u05FF]/.test(decoded)) return decoded;
  } catch {}
  try {
    return decodeURIComponent(escape(rawName));
  } catch {}
  return rawName;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|xlsx|xls|csv|docx|doc|jpg|jpeg|png|webp|bmp|tiff?|dwg|dxf)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('סוג קובץ לא נתמך'));
  },
});

const router = Router();

// List documents for a project
router.get('/project/:projectId', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM documents WHERE project_id = ? ORDER BY created_at DESC').all(req.params.projectId);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה בטעינת מסמכים: ' + e.message });
  }
});

// Upload documents (multiple)
router.post('/upload/:projectId', upload.array('files', 20), (req, res) => {
  try {
    const projectId = req.params.projectId;
    const category = (req.body?.category as string) || 'general';
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: 'אין קבצים' });

    const insert = db.prepare(`
      INSERT INTO documents (id, project_id, name, original_name, mime_type, size, category)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const docs: any[] = [];
    const tx = db.transaction(() => {
      for (const file of files) {
        const id = randomUUID();
        const originalName = fixHebrewFilename(file.originalname);
        insert.run(id, projectId, file.filename, originalName, file.mimetype, file.size, category);
        docs.push({ id, name: file.filename, original_name: originalName, mime_type: file.mimetype, size: file.size, category });
      }
    });
    tx();
    res.json({ ok: true, count: docs.length, docs });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה בהעלאת קבצים: ' + e.message });
  }
});

// Serve file - with proper Content-Disposition for Hebrew filenames
router.get('/file/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'קובץ לא נמצא' });

    const doc = db.prepare('SELECT original_name, mime_type FROM documents WHERE name = ?').get(filename) as any;
    if (doc?.original_name) {
      const encodedName = encodeURIComponent(doc.original_name);
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedName}`);
    }
    if (doc?.mime_type) {
      res.setHeader('Content-Type', doc.mime_type);
    }
    res.sendFile(filePath);
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה בהורדת קובץ: ' + e.message });
  }
});

// Update document notes/category
router.put('/:id', (req, res) => {
  try {
    const { notes, category } = req.body;
    db.prepare('UPDATE documents SET notes = ?, category = ? WHERE id = ?')
      .run(notes || '', category || 'general', req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה בעדכון מסמך: ' + e.message });
  }
});

// Delete document
router.delete('/:id', (req, res) => {
  try {
    const doc = db.prepare('SELECT name FROM documents WHERE id = ?').get(req.params.id) as any;
    if (doc) {
      const filePath = path.join(UPLOAD_DIR, path.basename(doc.name));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: 'שגיאה במחיקת מסמך: ' + e.message });
  }
});

export default router;
