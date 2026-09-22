import { Router } from 'express';
import { z } from 'zod';
import { emailService } from '../services/email.service.js';
import crypto from 'node:crypto';
import { db } from '../db/client.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';
import { logAudit } from '../middleware/audit.js';

export const memosRouter = Router();

const MemoSchema = z.object({
  to: z.string().min(1),
  from: z.string().min(1),
  date: z.string().min(1),
  subject: z.string().min(1),
  salute: z.string().min(1),
  body: z.string().min(1),
});

// ---------- Shared row mapper ----------
interface JoinedMemoRow {
  id: string;
  author_id: string;
  to_field: string;
  from_field: string;
  date: string;
  subject: string;
  salute: string;
  body: string;
  total_recipients: number;
  created_at: string;
  author_name: string;
  author_role: string;
  author_signature_url: string | null;
}

function mapMemo(
  r: JoinedMemoRow,
  readCount: number,
  hasRead: boolean,
) {
  return {
    id: r.id,
    authorId: r.author_id,
    authorName: r.author_name,
    authorRole: r.author_role,
    authorSignatureUrl: r.author_signature_url ?? undefined,
    to: r.to_field,
    from: r.from_field,
    date: r.date,
    subject: r.subject,
    salute: r.salute,
    body: r.body,
    readCount,
    totalRecipients: r.total_recipients,
    hasRead,
    createdAt: r.created_at,
  };
}

// ---------- GET /memos — list ----------
memosRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  const userId = req.userId!;

  const rows = db
    .prepare(`
      SELECT
        m.*,
        u.name          AS author_name,
        u.role          AS author_role,
        u.signature_url AS author_signature_url
      FROM memos m
      JOIN users u ON u.id = m.author_id
      ORDER BY m.created_at DESC
    `)
    .all() as JoinedMemoRow[];

  const readStmt = db.prepare(
    'SELECT COUNT(*) as c FROM memo_reads WHERE memo_id = ?',
  );
  const hasReadStmt = db.prepare(
    'SELECT 1 FROM memo_reads WHERE memo_id = ? AND user_id = ?',
  );

  res.json(
    rows.map((r) =>
      mapMemo(
        r,
        (readStmt.get(r.id) as any).c,
        !!hasReadStmt.get(r.id, userId),
      ),
    ),
  );
});

// ---------- GET /memos/:id — single ----------
memosRouter.get('/:id', requireAuth, (req: AuthedRequest, res) => {
  const row = db
    .prepare(`
      SELECT
        m.*,
        u.name          AS author_name,
        u.role          AS author_role,
        u.signature_url AS author_signature_url
      FROM memos m
      JOIN users u ON u.id = m.author_id
      WHERE m.id = ?
    `)
    .get(req.params.id) as JoinedMemoRow | undefined;

  if (!row) return res.status(404).json({ error: 'Memo not found' });

  const readCount = (
    db
      .prepare('SELECT COUNT(*) as c FROM memo_reads WHERE memo_id = ?')
      .get(row.id) as any
  ).c;

  const hasRead = !!db
    .prepare('SELECT 1 FROM memo_reads WHERE memo_id = ? AND user_id = ?')
    .get(row.id, req.userId!);

  res.json(mapMemo(row, readCount, hasRead));
});

// ---------- POST /memos — publish ----------
memosRouter.post(
  '/',
  requireAuth,
  requirePermission('memos.publish'),
  (req: AuthedRequest, res) => {
    const parsed = MemoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid memo payload' });
    }

    const id = crypto.randomUUID();
    const m = parsed.data;

    const totalUsers = (
      db.prepare("SELECT COUNT(*) as c FROM users WHERE is_active = 1").get() as any
    ).c;

    db.prepare(`
      INSERT INTO memos (id, author_id, to_field, from_field, date, subject, salute, body, total_recipients)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.userId!, m.to, m.from, m.date, m.subject, m.salute, m.body, totalUsers);

    logAudit(req, 'memos.publish', id, m.subject);

    // Notify all active users except the author
    const users = db
      .prepare('SELECT id FROM users WHERE is_active = 1 AND id != ?')
      .all(req.userId!) as any[];

    const notifStmt = db.prepare(`
      INSERT INTO notifications (id, user_id, title, body)
      VALUES (?, ?, ?, ?)
    `);
    for (const u of users) {
      notifStmt.run(
        crypto.randomUUID(),
        u.id,
        'New Memo Published',
        `Subject: ${m.subject}`,
      );
    }

    // Fetch full user details for emailing
    const emailRecipients = db
      .prepare(
        `SELECT name, email FROM users WHERE is_active = 1 AND id != ?`,
      )
      .all(req.userId!) as Array<{ name: string; email: string }>;

    for (const recipient of emailRecipients) {
      emailService.sendNewMemo(recipient, {
        subject: m.subject,
        from: m.from,
        date: m.date,
      });
    }

    // Return the full joined row so the frontend gets author info immediately
    const row = db
      .prepare(`
        SELECT
          m.*,
          u.name          AS author_name,
          u.role          AS author_role,
          u.signature_url AS author_signature_url
        FROM memos m
        JOIN users u ON u.id = m.author_id
        WHERE m.id = ?
      `)
      .get(id) as JoinedMemoRow;

    res.status(201).json(mapMemo(row, 0, false));
  },
);

// ---------- POST /memos/:id/read ----------
memosRouter.post('/:id/read', requireAuth, (req: AuthedRequest, res) => {
  try {
    db.prepare('INSERT INTO memo_reads (memo_id, user_id) VALUES (?, ?)')
      .run(req.params.id, req.userId!);
  } catch {
    /* already read */
  }
  res.status(204).end();
});

// ---------- DELETE /memos/:id ----------
memosRouter.delete(
  '/:id',
  requireAuth,
  requirePermission('memos.delete'),
  (req: AuthedRequest, res) => {
    const row = db
      .prepare('SELECT subject FROM memos WHERE id = ?')
      .get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'Memo not found' });

    db.prepare('DELETE FROM memo_reads WHERE memo_id = ?').run(req.params.id);
    db.prepare('DELETE FROM memos WHERE id = ?').run(req.params.id);

    logAudit(req, 'memos.delete', req.params.id, row.subject);
    res.status(204).end();
  },
);