import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import projectsRouter from './routes/projects.js';
import costsRouter from './routes/costs.js';
import pricesRouter from './routes/prices.js';
import statsRouter from './routes/stats.js';
import documentsRouter from './routes/documents.js';

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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
