import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { env } from './env.js';
import './db/client.js';

import { authRouter } from './routes/auth.routes.js';
import { meRouter } from './routes/me.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { financeRouter } from './routes/finance.routes.js';
import { meetingsRouter } from './routes/meetings.routes.js';
import { memosRouter } from './routes/memos.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { summaryRouter } from './routes/summary.routes.js';
import { pdfsRouter } from './routes/pdfs.routes.js';
import { announcementsRouter } from './routes/announcements.routes.js';
import { auditRouter } from './routes/audit.routes.js';
import { closeBrowser } from './services/pdf.service.js';

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

app.use('/static', express.static(path.resolve('static')));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/users', usersRouter);
app.use('/api', financeRouter);
app.use('/api/meetings', meetingsRouter);
app.use('/api/memos', memosRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/pdfs', pdfsRouter);
app.use('/api/announcements', announcementsRouter);
app.use('/api/audit', auditRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error('[error]', err);
    res.status(500).json({ error: 'Internal server error' });
  },
);

app.listen(env.PORT, () => {
  console.log(`\n🚀 BEO Backend running`);
  console.log(`   → http://localhost:${env.PORT}`);
  console.log(`   → CORS: ${env.CORS_ORIGIN}`);
  console.log(`   → Env: ${env.NODE_ENV}\n`);
});

process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});