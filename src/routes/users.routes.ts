import { Router } from 'express';
import { z } from 'zod';
import { emailService } from '../services/email.service.js';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { db } from '../db/client.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';
import { logAudit } from '../middleware/audit.js';

export const usersRouter = Router();

function toPublicUser(row: any) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    phone: row.phone,
    sex: row.sex,
    dob: row.dob,
    balanceMWK: row.balance_mwk,
    createdAt: row.created_at,
    signatureUrl: row.signature_url ?? undefined,
    isActive: !!row.is_active,
  };
}

// ---------- GET /users — list all ----------
usersRouter.get(
  '/',
  requireAuth,
  requirePermission('users.list'),
  (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM users ORDER BY name ASC')
      .all() as any[];
    res.json(rows.map(toPublicUser));
  },
);

// ---------- GET /users/:id ----------
usersRouter.get(
  '/:id',
  requireAuth,
  requirePermission('users.read'),
  (req, res) => {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json(toPublicUser(row));
  },
);

// ---------- POST /users — create ----------
const CreateSchema = z.object({
  id: z.string().min(3),
  name: z.string().min(1),
  role: z.enum(['ceo', 'manager', 'treasurer', 'secretary', 'ict', 'member']),
  sex: z.enum(['Male', 'Female']),
  dob: z.string(),
  email: z.string().email(),
  phone: z.string(),
  passKey: z.string().min(8),
  balanceMWK: z.number().default(0),
});

usersRouter.post(
  '/',
  requireAuth,
  requirePermission('users.create'),
  (req: AuthedRequest, res) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      emailService.sendWelcome(
        {
          name: parsed.data.name,
          email: parsed.data.email,
          id: parsed.data.id,
        },
        parsed.data.passKey,
      );
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(parsed.data.id);
    if (existing) return res.status(409).json({ error: 'User ID already exists' });

    const hash = bcrypt.hashSync(parsed.data.passKey, 10);

    db.prepare(`
      INSERT INTO users (id, name, role, pass_hash, sex, dob, email, phone, balance_mwk)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      parsed.data.id,
      parsed.data.name,
      parsed.data.role,
      hash,
      parsed.data.sex,
      parsed.data.dob,
      parsed.data.email,
      parsed.data.phone,
      parsed.data.balanceMWK,
    );

    logAudit(req, 'users.create', parsed.data.id, `Created ${parsed.data.name}`);

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(parsed.data.id) as any;
    res.status(201).json(toPublicUser(row));
  },
);

// ---------- PATCH /users/:id — update profile ----------
const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['ceo', 'manager', 'treasurer', 'secretary', 'ict', 'member']).optional(),
  sex: z.enum(['Male', 'Female']).optional(),
  dob: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  newPassKey: z.string().min(8).optional(),
});

usersRouter.patch(
  '/:id',
  requireAuth,
  requirePermission('users.update.profile'),
  (req: AuthedRequest, res) => {
    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

    const { newPassKey, ...rest } = parsed.data;
    const updates: string[] = [];
    const values: unknown[] = [];

    if (rest.name !== undefined)  { updates.push('name = ?');  values.push(rest.name); }
    if (rest.role !== undefined)  { updates.push('role = ?');  values.push(rest.role); }
    if (rest.sex !== undefined)   { updates.push('sex = ?');   values.push(rest.sex); }
    if (rest.dob !== undefined)   { updates.push('dob = ?');   values.push(rest.dob); }
    if (rest.email !== undefined) { updates.push('email = ?'); values.push(rest.email); }
    if (rest.phone !== undefined) { updates.push('phone = ?'); values.push(rest.phone); }
    if (newPassKey) {
      updates.push('pass_hash = ?');
      values.push(bcrypt.hashSync(newPassKey, 10));
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields' });

    values.push(req.params.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logAudit(req, 'users.update', req.params.id, `Fields: ${Object.keys(rest).join(', ')}`);

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    res.json(toPublicUser(row));
  },
);

// ---------- PATCH /users/:id/financial — treasurer/secretary only ----------
const FinancialSchema = z.object({
  balanceMWK: z.number(),
  reason: z.string().min(1),
});

usersRouter.patch(
  '/:id/financial',
  requireAuth,
  requirePermission('users.update.financial'),
  (req: AuthedRequest, res) => {
    const parsed = FinancialSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

    const before = db
      .prepare('SELECT balance_mwk FROM users WHERE id = ?')
      .get(req.params.id) as any;
    if (!before) return res.status(404).json({ error: 'User not found' });

    db.prepare('UPDATE users SET balance_mwk = ? WHERE id = ?').run(
      parsed.data.balanceMWK,
      req.params.id,
    );

    // Record the adjustment as a transaction for the audit trail
    db.prepare(`
      INSERT INTO transactions (id, user_id, date, amount_mwk, channel, purpose)
      VALUES (?, ?, date('now'), ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      req.params.id,
      Math.abs(parsed.data.balanceMWK - before.balance_mwk),
      'Adjustment',
      parsed.data.reason,
    );

    logAudit(
      req,
      'users.financial.adjust',
      req.params.id,
      `${before.balance_mwk} → ${parsed.data.balanceMWK}: ${parsed.data.reason}`,
    );

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    res.json(toPublicUser(row));
  },
);

// ---------- PATCH /users/:id/deactivate ----------
usersRouter.patch(
  '/:id/deactivate',
  requireAuth,
  requirePermission('users.deactivate'),
  (req: AuthedRequest, res) => {
    if (req.params.id === req.userId) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(req.params.id);
    logAudit(req, 'users.deactivate', req.params.id);

    res.status(204).end();
  },
);

// ---------- PATCH /users/:id/reactivate ----------
usersRouter.patch(
  '/:id/reactivate',
  requireAuth,
  requirePermission('users.deactivate'),
  (req: AuthedRequest, res) => {
    db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(req.params.id);
    logAudit(req, 'users.reactivate', req.params.id);
    res.status(204).end();
  },
);