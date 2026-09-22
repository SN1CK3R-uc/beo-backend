import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../db/client.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';
import { logAudit } from '../middleware/audit.js';
import { paychangu } from '../services/paychangu.service.js';
import { emailService } from '../services/email.service.js';

export const financeRouter = Router();

const InitiateSchema = z.object({
  purpose: z.string().min(1),
  amountMWK: z.number().positive(),
  provider: z.string().min(1),
  phone: z.string().optional(),
});

// ============================================================
// POST /payments/initiate
// ============================================================
financeRouter.post(
  '/payments/initiate',
  requireAuth,
  requirePermission('finance.transact'),
  async (req: AuthedRequest, res, next) => {
    try {
      const parsed = InitiateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid payment payload' });
      }

      const userRow = db
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(req.userId!) as any;
      if (!userRow) return res.status(401).json({ error: 'User not found' });

      const paymentId = crypto.randomUUID();
      const txRef = `BEO-${paymentId.slice(0, 12)}`;

      db.prepare(`
        INSERT INTO payments (id, user_id, purpose, amount_mwk, provider, phone, status, gateway_ref)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(
        paymentId,
        req.userId!,
        parsed.data.purpose,
        parsed.data.amountMWK,
        'PayChangu',
        parsed.data.phone ?? '',
        txRef,
      );

      const [firstName, ...rest] = userRow.name.split(' ');
      const lastName = rest.join(' ');

      const result = await paychangu.initiate({
        txRef,
        amountMWK: parsed.data.amountMWK,
        email: userRow.email,
        firstName: firstName || 'BEO',
        lastName: lastName || 'Member',
        title: 'BEO Membership Payment',
        description: parsed.data.purpose,
      });

      res.json({
        paymentId,
        txRef,
        checkoutUrl: result.checkoutUrl,
        status: 'pending',
      });
    } catch (err) {
      console.error('[payments initiate]', err);
      next(err);
    }
  },
);

// ============================================================
// POST /payments/verify
// ============================================================
financeRouter.post(
  '/payments/verify',
  requireAuth,
  async (req: AuthedRequest, res, next) => {
    try {
      const { txRef } = z.object({ txRef: z.string().min(1) }).parse(req.body);

      const payment = db
        .prepare('SELECT * FROM payments WHERE gateway_ref = ? AND user_id = ?')
        .get(txRef, req.userId!) as any;

      if (!payment) return res.status(404).json({ error: 'Payment not found' });

      if (payment.status === 'confirmed') {
        return res.json({ status: 'confirmed', alreadyProcessed: true });
      }

      const verification = await paychangu.verify(txRef);

      if (verification.status !== 'success') {
        db.prepare(`
          UPDATE payments SET status = ?, updated_at = datetime('now') WHERE id = ?
        `).run(
          verification.status === 'failed' ? 'failed' : 'pending',
          payment.id,
        );

        return res.json({ status: verification.status });
      }

      if (verification.currency !== 'MWK') {
        db.prepare(
          `UPDATE payments SET status = 'failed', updated_at = datetime('now') WHERE id = ?`,
        ).run(payment.id);
        return res.status(400).json({ error: 'Currency mismatch' });
      }

      const applyPayment = db.transaction(() => {
        db.prepare(
          `UPDATE payments SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?`,
        ).run(payment.id);

        db.prepare('UPDATE users SET balance_mwk = balance_mwk - ? WHERE id = ?').run(
          payment.amount_mwk,
          payment.user_id,
        );

        db.prepare(`
          INSERT INTO transactions (id, user_id, date, amount_mwk, channel, purpose)
          VALUES (?, ?, date('now'), ?, ?, ?)
        `).run(
          payment.id,
          payment.user_id,
          payment.amount_mwk,
          'PayChangu',
          payment.purpose,
        );
      });

      applyPayment();

      logAudit(
        req,
        'finance.payment.confirmed',
        payment.id,
        `MWK ${payment.amount_mwk}`,
      );

      // Fire payment confirmation email
      const payer = db
        .prepare('SELECT name, email FROM users WHERE id = ?')
        .get(payment.user_id) as { name: string; email: string } | undefined;

      if (payer) {
        emailService.sendPaymentConfirmed(payer, {
          amountMWK: payment.amount_mwk,
          purpose: payment.purpose,
          reference: payment.gateway_ref ?? payment.id,
        });
      }

      res.json({ status: 'confirmed' });
    } catch (err) {
      console.error('[payments verify]', err);
      next(err);
    }
  },
);

// ============================================================
// POST /payments/callback — PayChangu webhook (production)
// ============================================================
financeRouter.post('/payments/callback', (req, res) => {
  const { tx_ref, status } = req.body ?? {};

  if (status === 'success' && tx_ref) {
    paychangu
      .verify(tx_ref)
      .then((verification) => {
        if (verification.status !== 'success') return;

        const payment = db
          .prepare('SELECT * FROM payments WHERE gateway_ref = ?')
          .get(tx_ref) as any;

        if (!payment || payment.status === 'confirmed') return;

        const applyPayment = db.transaction(() => {
          db.prepare(
            `UPDATE payments SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?`,
          ).run(payment.id);

          db.prepare('UPDATE users SET balance_mwk = balance_mwk - ? WHERE id = ?').run(
            payment.amount_mwk,
            payment.user_id,
          );

          db.prepare(`
            INSERT INTO transactions (id, user_id, date, amount_mwk, channel, purpose)
            VALUES (?, ?, date('now'), ?, ?, ?)
          `).run(
            payment.id,
            payment.user_id,
            payment.amount_mwk,
            'PayChangu',
            payment.purpose,
          );
        });

        applyPayment();

        // Audit log entry
        const actor = db
          .prepare('SELECT name, role FROM users WHERE id = ?')
          .get(payment.user_id) as { name: string; role: string } | undefined;

        if (actor) {
          db.prepare(`
            INSERT INTO audit_log (id, actor_id, actor_name, action, target, details)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            crypto.randomUUID(),
            payment.user_id,
            `${actor.name} (${actor.role})`,
            'finance.payment.confirmed',
            payment.id,
            `MWK ${payment.amount_mwk} (callback)`,
          );
        }

        console.log(`[paychangu callback] payment ${payment.id} confirmed`);

        // Payment confirmation email
        const payer = db
          .prepare('SELECT name, email FROM users WHERE id = ?')
          .get(payment.user_id) as { name: string; email: string } | undefined;

        if (payer) {
          emailService.sendPaymentConfirmed(payer, {
            amountMWK: payment.amount_mwk,
            purpose: payment.purpose,
            reference: payment.gateway_ref ?? payment.id,
          });
        }
      })
      .catch((err) => console.error('[paychangu callback]', err));
  }

  res.status(200).json({ received: true });
});

// ============================================================
// GET /payments — current user's payment history
// ============================================================
financeRouter.get('/payments', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT id, purpose, amount_mwk, provider, status, gateway_ref, created_at
       FROM payments
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .all(req.userId!) as any[];

  res.json(
    rows.map((r) => ({
      id: r.id,
      purpose: r.purpose,
      amountMWK: r.amount_mwk,
      provider: r.provider,
      status: r.status,
      gatewayRef: r.gateway_ref,
      createdAt: r.created_at,
    })),
  );
});

// ============================================================
// GET /payments/all — admin-only: every payment in the system
// ============================================================
financeRouter.get(
  '/payments/all',
  requireAuth,
  requirePermission('finance.read.all'),
  (req, res) => {
    const status = req.query.status as string | undefined;
    const limit = Math.min(Number(req.query.limit ?? 200), 1000);

    const query = status
      ? `SELECT p.*, u.name as user_name, u.role as user_role
         FROM payments p
         JOIN users u ON u.id = p.user_id
         WHERE p.status = ?
         ORDER BY p.created_at DESC
         LIMIT ?`
      : `SELECT p.*, u.name as user_name, u.role as user_role
         FROM payments p
         JOIN users u ON u.id = p.user_id
         ORDER BY p.created_at DESC
         LIMIT ?`;

    const rows = (
      status ? db.prepare(query).all(status, limit) : db.prepare(query).all(limit)
    ) as any[];

    res.json(
      rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        userRole: r.user_role,
        purpose: r.purpose,
        amountMWK: r.amount_mwk,
        provider: r.provider,
        phone: r.phone,
        status: r.status,
        gatewayRef: r.gateway_ref,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    );
  },
);