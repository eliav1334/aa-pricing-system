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

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|xlsx|xls|csv|docx|doc|jpg|jpeg|png|webp|bmp|tiff?|dwg|dxf)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('סוג קובץ לא נתמך'));
  },
});

const router = Router();

// List documents for a project
router.get('/project/:projectId', (req, res) => {
  const rows = db.prepare('SELECT * FROM documents WHERE project_id = ? ORDER BY created_at DESC').all(req.params.projectId);
  res.json(rows);
});

// Upload documents (multiple)
router.post('/upload/:projectId', upload.array('files', 20), (req, res) => {
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
      // Fix Hebrew filenames — multer encodes as latin1
      let originalName: string;
      try { originalName = Buffer.from(file.originalname, 'latin1').toString('utf8'); }
      catch { originalName = file.originalname; }
      insert.run(id, projectId, file.filename, originalName, file.mimetype, file.size, category);
      docs.push({ id, name: file.filename, original_name: originalName, mime_type: file.mimetype, size: file.size, category });
    }
  });
  tx();

  res.json({ ok: true, count: docs.length, docs });
});

// Serve file
router.get('/file/:filename', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'קובץ לא נמצא' });
  res.sendFile(filePath);
});

// Update document notes/category
router.put('/:id', (req, res) => {
  const { notes, category } = req.body;
  db.prepare('UPDATE documents SET notes = ?, category = ? WHERE id = ?')
    .run(notes || '', category || 'general', req.params.id);
  res.json({ ok: true });
});

// Delete document
router.delete('/:id', (req, res) => {
  const doc = db.prepare('SELECT name FROM documents WHERE id = ?').get(req.params.id) as any;
  if (doc) {
    const filePath = path.join(UPLOAD_DIR, doc.name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
