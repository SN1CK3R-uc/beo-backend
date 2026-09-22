import type { Response, NextFunction } from 'express';
import { db } from '../db/client.js';
import type { AuthedRequest } from './auth.js';

export type Role = 'ceo' | 'manager' | 'treasurer' | 'secretary' | 'ict' | 'member';

// ---------- Permission definitions ----------
export const PERMISSIONS = {
  // Users
  'users.list':             ['ceo', 'manager', 'ict'],
  'users.read':             ['ceo', 'manager', 'ict'],
  'users.update.profile':   ['ceo', 'manager', 'treasurer', 'secretary', 'ict'],
  'users.update.financial': ['ceo', 'manager', 'treasurer', 'ict'],
  'users.create':           ['ceo', 'manager', 'ict'],
  'users.deactivate':       ['ceo', 'manager', 'ict'],
  'users.delete':           ['ceo'],   // ← keep CEO-only

  // Financials
  'finance.read.own':       ['ceo', 'manager', 'treasurer', 'secretary', 'ict', 'member'],
  'finance.read.all':       ['ceo', 'manager', 'treasurer', 'ict'],
  'finance.transact':       ['ceo', 'manager', 'treasurer', 'secretary', 'ict', 'member'],
  'finance.adjust':         ['ceo', 'manager', 'treasurer', 'ict'],

  // Memos
  'memos.read':             ['ceo', 'manager', 'treasurer', 'secretary', 'ict', 'member'],
  'memos.publish':          ['ceo', 'manager', 'treasurer', 'secretary', 'ict'],
  'memos.delete':           ['ceo', 'manager', 'ict'],

  // Meetings
  'meetings.read':          ['ceo', 'manager', 'treasurer', 'secretary', 'ict', 'member'],
  'meetings.manage':        ['ceo', 'manager', 'secretary', 'ict'],
  'meetings.attend':        ['ceo', 'manager', 'treasurer', 'secretary', 'ict', 'member'],

  // Announcements
  'announcements.read':     ['ceo', 'manager', 'treasurer', 'secretary', 'ict', 'member'],
  'announcements.publish':  ['ceo', 'manager', 'treasurer', 'secretary', 'ict'],

  // PDFs
  'pdfs.issue.own':         ['ceo', 'manager', 'treasurer', 'secretary', 'ict', 'member'],
  'pdfs.issue.any':         ['ceo', 'manager', 'treasurer', 'ict'],

  // Admin
  'admin.access':           ['ceo', 'manager', 'ict'],
  'audit.view':             ['ceo', 'manager', 'ict'],
  'summary.view':           ['ceo', 'manager', 'treasurer', 'secretary', 'ict', 'member'],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: string, permission: Permission): boolean {
  const allowed = PERMISSIONS[permission] as readonly string[];
  return allowed.includes(role);
}

export function requirePermission(...perms: Permission[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.userId) return res.status(401).json({ error: 'Not authenticated' });

    const user = db
      .prepare('SELECT role, is_active FROM users WHERE id = ?')
      .get(req.userId) as { role: string; is_active: number } | undefined;

    if (!user || !user.is_active) {
      return res.status(403).json({ error: 'Account inactive or not found' });
    }

    const allowed = perms.some((p) => hasPermission(user.role, p));
    if (!allowed) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}