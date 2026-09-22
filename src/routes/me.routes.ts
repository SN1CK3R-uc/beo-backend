import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { db } from '../db/client.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';
import { logAudit } from '../middleware/audit.js';

export const meRouter = Router();

interface UserRow {
  id: string;
  name: string;
  role: string;
  sex: string;
  dob: string;
  email: string;
  phone: string;
  balance_mwk: number;
  signature_url: string | null;
  created_at: string;
}

function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    phone: row.phone,
    sex: row.sex,
    dob: row.dob,
    createdAt: row.created_at,
    signatureUrl: row.signature_url ?? undefined,
  };
}

// ---------- GET /me/balance ----------
meRouter.get('/balance', requireAuth, (req: AuthedRequest, res) => {
  const row = db
    .prepare('SELECT balance_mwk FROM users WHERE id = ?')
    .get(req.userId!) as { balance_mwk: number } | undefined;

  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json({ amountMWK: row.balance_mwk });
});

// ---------- GET /me/transactions ----------
meRouter.get('/transactions', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT id, date, amount_mwk, channel, purpose
       FROM transactions
       WHERE user_id = ?
       ORDER BY date DESC`,
    )
    .all(req.userId!) as any[];

  res.json(
    rows.map((r) => ({
      id: r.id,
      date: r.date,
      amountMWK: r.amount_mwk,
      channel: r.channel,
      purpose: r.purpose,
    })),
  );
});

// ---------- PATCH /me ----------
const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  sex: z.enum(['Male', 'Female']).optional(),
  dob: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  signatureUrl: z.string().optional(),
  newPassKey: z.string().min(8).optional(),
});

meRouter.patch('/', requireAuth, (req: AuthedRequest, res) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid update payload' });
  }

  const { newPassKey, ...rest } = parsed.data;

  const updates: string[] = [];
  const values: unknown[] = [];

  if (rest.name !== undefined)         { updates.push('name = ?');          values.push(rest.name); }
  if (rest.sex !== undefined)          { updates.push('sex = ?');           values.push(rest.sex); }
  if (rest.dob !== undefined)          { updates.push('dob = ?');           values.push(rest.dob); }
  if (rest.email !== undefined)        { updates.push('email = ?');         values.push(rest.email); }
  if (rest.phone !== undefined)        { updates.push('phone = ?');         values.push(rest.phone); }
  if (rest.signatureUrl !== undefined) { updates.push('signature_url = ?'); values.push(rest.signatureUrl); }
  if (newPassKey) {
    updates.push('pass_hash = ?');
    values.push(bcrypt.hashSync(newPassKey, 10));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(req.userId!);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const row = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(req.userId!) as UserRow;

  logAudit(req, 'me.profile.update', req.userId, `Updated: ${Object.keys(rest).join(', ')}`);

  res.json(toPublicUser(row));
});