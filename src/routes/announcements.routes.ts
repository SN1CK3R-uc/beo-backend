import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../db/client.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';
import { logAudit } from '../middleware/audit.js';

export const announcementsRouter = Router();

announcementsRouter.get('/', requireAuth, (_req, res) => {
  const rows = db
    .prepare(`
      SELECT a.*, u.name as author_name, u.role as author_role
      FROM announcements a
      JOIN users u ON u.id = a.author_id
      WHERE a.expires_at IS NULL OR a.expires_at > datetime('now')
      ORDER BY a.created_at DESC
      LIMIT 20
    `)
    .all() as any[];

  res.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      type: r.type,
      linkUrl: r.link_url,
      linkLabel: r.link_label,
      authorId: r.author_id,
      authorName: r.author_name,
      authorRole: r.author_role,
      createdAt: r.created_at,
    })),
  );
});

const CreateSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  type: z.enum(['announcement', 'meeting', 'event']).default('announcement'),
  linkUrl: z.string().url().optional(),
  linkLabel: z.string().optional(),
  expiresAt: z.string().optional(),
});

announcementsRouter.post(
  '/',
  requireAuth,
  requirePermission('announcements.publish'),
  (req: AuthedRequest, res) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO announcements (id, author_id, title, body, type, link_url, link_label, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.userId!,
      parsed.data.title,
      parsed.data.body,
      parsed.data.type,
      parsed.data.linkUrl ?? null,
      parsed.data.linkLabel ?? null,
      parsed.data.expiresAt ?? null,
    );

    logAudit(req, 'announcements.create', id, parsed.data.title);

    const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id) as any;
    res.status(201).json({
      id: row.id,
      title: row.title,
      body: row.body,
      type: row.type,
      linkUrl: row.link_url,
      linkLabel: row.link_label,
      createdAt: row.created_at,
    });
  },
);

announcementsRouter.delete(
  '/:id',
  requireAuth,
  requirePermission('announcements.publish'),
  (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
    logAudit(req, 'announcements.delete', req.params.id);
    res.status(204).end();
  },
);