import { Router } from 'express';
import { db } from '../db/client.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const notificationsRouter = Router();

notificationsRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.userId!) as any[];

  res.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      read: !!r.read,
      createdAt: r.created_at,
    })),
  );
});

notificationsRouter.post('/:id/read', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.userId!);
  res.status(204).end();
});