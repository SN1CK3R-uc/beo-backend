import { Router } from 'express';
import { db } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';

export const auditRouter = Router();

auditRouter.get(
  '/',
  requireAuth,
  requirePermission('audit.view'),
  (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);

    const rows = db
      .prepare(`
        SELECT * FROM audit_log
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(limit) as any[];

    res.json(
      rows.map((r) => ({
        id: r.id,
        actorId: r.actor_id,
        actorName: r.actor_name,
        action: r.action,
        target: r.target,
        details: r.details,
        createdAt: r.created_at,
      })),
    );
  },
);