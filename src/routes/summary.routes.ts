import { Router } from 'express';
import { db } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';

export const summaryRouter = Router();

summaryRouter.get(
  '/',
  requireAuth,
  requirePermission('summary.view'),
  (_req, res) => {
    const members = (db.prepare("SELECT COUNT(*) as c FROM users WHERE is_active = 1").get() as any).c;
    const memos = (db.prepare('SELECT COUNT(*) as c FROM memos').get() as any).c;
    const meetings = (db.prepare('SELECT COUNT(*) as c FROM meetings').get() as any).c;

    // Extra analytics for the enhanced dashboard
    const totalDue = (db
      .prepare('SELECT COALESCE(SUM(balance_mwk), 0) as s FROM users WHERE balance_mwk > 0')
      .get() as any).s;

    const totalCredit = (db
      .prepare('SELECT COALESCE(SUM(-balance_mwk), 0) as s FROM users WHERE balance_mwk < 0')
      .get() as any).s;

    const paidThisMonth = (db
      .prepare(`
        SELECT COALESCE(SUM(amount_mwk), 0) as s FROM transactions
        WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')
      `)
      .get() as any).s;

    // Payments by channel
    const byChannel = db
      .prepare(`
        SELECT channel, SUM(amount_mwk) as total, COUNT(*) as count
        FROM transactions
        GROUP BY channel
        ORDER BY total DESC
      `)
      .all() as any[];

    // Last 6 months revenue
    const monthly = db
      .prepare(`
        SELECT strftime('%Y-%m', date) as month, SUM(amount_mwk) as total
        FROM transactions
        WHERE date >= date('now', '-6 months')
        GROUP BY month
        ORDER BY month ASC
      `)
      .all() as any[];

    res.json({
      activeMembers: members,
      memosReleased: memos,
      meetingsHeld: meetings,
      totalDue,
      totalCredit,
      paidThisMonth,
      byChannel: byChannel.map((c) => ({
        channel: c.channel,
        total: c.total,
        count: c.count,
      })),
      monthly: monthly.map((m) => ({
        month: m.month,
        total: m.total,
      })),
    });
  },
);