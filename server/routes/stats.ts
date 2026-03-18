import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (_req, res) => {
  const projects = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c;
  const quotes = (db.prepare("SELECT COUNT(*) as c FROM projects WHERE status='הצעה'").get() as any).c;
  const active = (db.prepare("SELECT COUNT(*) as c FROM projects WHERE status='בביצוע'").get() as any).c;
  const done = (db.prepare("SELECT COUNT(*) as c FROM projects WHERE status='הושלם'").get() as any).c;
  const prices = (db.prepare('SELECT COUNT(*) as c FROM price_db').get() as any).c;
  const totalVal = (db.prepare('SELECT COALESCE(SUM(total),0) as v FROM cost_items').get() as any).v;

  res.json({ projects, quotes, active, done, prices, totalVal });
});

export default router;
