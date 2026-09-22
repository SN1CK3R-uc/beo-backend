import { Router } from 'express';
import { emailService } from '../services/email.service.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../db/client.js';
import { env } from '../env.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';

export const authRouter = Router();

const LoginSchema = z.object({
  userId: z.string().min(1),
  passKey: z.string().min(1),
});

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
  is_active: number;
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

// ---------- POST /auth/login ----------
authRouter.post('/login', (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { userId, passKey } = parsed.data;

  const row = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(userId) as UserRow | undefined;

  if (!row) {
    return res.status(401).json({ error: 'Invalid User ID or Passkey' });
  }

  if (!row.is_active) {
    return res.status(403).json({ error: 'Account is suspended' });
  }

  const passwordOk = bcrypt.compareSync(passKey, (row as any).pass_hash);
  if (!passwordOk) {
    return res.status(401).json({ error: 'Invalid User ID or Passkey' });
  }

  const token = jwt.sign({ sub: row.id }, env.JWT_SECRET, { expiresIn: '24h' });

  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: env.COOKIE_MAX_AGE_MS,
    path: '/',
  });

  const authedReq = { ...req, userId: row.id } as AuthedRequest;
  logAudit(authedReq, 'auth.login', row.id, `${row.name} logged in`);

  res.json(toPublicUser(row));
});

// ---------- POST /auth/logout ----------
authRouter.post('/logout', requireAuth, (req: AuthedRequest, res) => {
  logAudit(req, 'auth.logout', req.userId, 'User logged out');
  res.clearCookie(env.COOKIE_NAME, { path: '/' });
  res.status(204).end();
});

// ---------- GET /auth/me ----------
authRouter.get('/me', requireAuth, (req: AuthedRequest, res) => {
  const row = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(req.userId!) as UserRow | undefined;

  if (!row) return res.status(401).json({ error: 'User not found' });
  if (!row.is_active) return res.status(403).json({ error: 'Account suspended' });

  res.json(toPublicUser(row));
});

// ---------- POST /auth/forgot-password ----------
const ForgotSchema = z.object({ email: z.string().email() });

authRouter.post('/forgot-password', (req, res) => {
  const parsed = ForgotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const user = db
    .prepare('SELECT id, name FROM users WHERE email = ?')
    .get(parsed.data.email) as { id: string; name: string } | undefined;

  // Always return success to prevent email enumeration
  if (!user) return res.json({ ok: true });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO password_resets (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(token, user.id, expiresAt);

  // TODO: send email. For now, log to console.
  emailService.sendPasswordReset(user, token);

  res.json({ ok: true });
});

// ---------- POST /auth/reset-password ----------
const ResetSchema = z.object({
  token: z.string().min(1),
  newPassKey: z.string().min(8),
});

authRouter.post('/reset-password', (req, res) => {
  const parsed = ResetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const row = db
    .prepare('SELECT * FROM password_resets WHERE token = ?')
    .get(parsed.data.token) as any;

  if (!row) return res.status(400).json({ error: 'Invalid token' });
  if (row.used) return res.status(400).json({ error: 'Token already used' });
  if (new Date(row.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Token expired' });
  }

  const hash = bcrypt.hashSync(parsed.data.newPassKey, 10);

  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hash, row.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?').run(parsed.data.token);
  });
  tx();

  logAudit({ userId: row.user_id } as AuthedRequest, 'auth.password_reset', row.user_id);

  res.json({ ok: true });
});