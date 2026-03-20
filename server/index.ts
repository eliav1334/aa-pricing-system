import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import projectsRouter from './routes/projects.js';
import costsRouter from './routes/costs.js';
import pricesRouter from './routes/prices.js';
import statsRouter from './routes/stats.js';
import documentsRouter from './routes/documents.js';
import supplierQuotesRouter from './routes/supplier-quotes.js';
import suppliersRouter from './routes/suppliers.js';
import knowledgeRouter from './routes/knowledge.js';
import './seed-knowledge.js';

const app = express();
const PORT = 3002;

app.use(helmet());
app.use(cors({ origin: ['http://localhost:5175', 'http://localhost:5176', 'http://127.0.0.1:5175', 'http://127.0.0.1:5176'] }));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/projects', projectsRouter);
app.use('/api/costs', costsRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/stats', statsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/supplier-quotes', supplierQuotesRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/knowledge', knowledgeRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
