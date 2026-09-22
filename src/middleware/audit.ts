import crypto from 'node:crypto';
import { db } from '../db/client.js';
import type { AuthedRequest } from './auth.js';

export function logAudit(
  req: AuthedRequest,
  action: string,
  target?: string,
  details?: string,
) {
  try {
    const user = req.userId
      ? (db.prepare('SELECT name, role FROM users WHERE id = ?').get(req.userId) as any)
      : null;

    db.prepare(`
      INSERT INTO audit_log (id, actor_id, actor_name, action, target, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      req.userId ?? null,
      user ? `${user.name} (${user.role})` : 'system',
      action,
      target ?? null,
      details ?? null,
    );
  } catch (err) {
    console.error('[audit]', err);
  }
}