import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../db/client.js';
import { emailService } from '../services/email.service.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';
import { logAudit } from '../middleware/audit.js';

export const meetingsRouter = Router();

meetingsRouter.get('/', requireAuth, (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM meetings ORDER BY date ASC')
    .all() as any[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      date: r.date,
      location: r.location,
      duration: r.duration,
      chairperson: r.chairperson,
      tag: r.tag,
      minutes: r.minutes,
      cancelled: !!r.cancelled,
    })),
  );
});

const MeetingSchema = z.object({
  title: z.string().min(1),
  date: z.string().min(1),
  location: z.string().min(1),
  duration: z.string().min(1),
  chairperson: z.string().min(1),
  tag: z.string().min(1).default('Official Meeting'),
});

meetingsRouter.post(
  '/',
  requireAuth,
  requirePermission('meetings.manage'),
  (req: AuthedRequest, res) => {
    const parsed = MeetingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO meetings (id, title, date, location, duration, chairperson, tag)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      parsed.data.title,
      parsed.data.date,
      parsed.data.location,
      parsed.data.duration,
      parsed.data.chairperson,
      parsed.data.tag,
    );

    logAudit(req, 'meetings.create', id, parsed.data.title);

    // Notify everyone
    const users = db.prepare('SELECT id FROM users WHERE is_active = 1').all() as any[];
    const notifStmt = db.prepare(`
      INSERT INTO notifications (id, user_id, title, body)
      VALUES (?, ?, ?, ?)
    `);
    for (const u of users) {
      notifStmt.run(
        crypto.randomUUID(),
        u.id,
        'New Meeting Scheduled',
        `${parsed.data.title} on ${parsed.data.date}`,
      );
    }

    const emailRecipients = db
      .prepare('SELECT name, email FROM users WHERE is_active = 1')
      .all() as Array<{ name: string; email: string }>;

    for (const recipient of emailRecipients) {
      emailService.sendMeetingScheduled(recipient, {
        title: parsed.data.title,
        date: parsed.data.date,
        location: parsed.data.location,
      });
    }

    const row = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as any;
    res.status(201).json(row);
  },
);

meetingsRouter.patch(
  '/:id',
  requireAuth,
  requirePermission('meetings.manage'),
  (req: AuthedRequest, res) => {
    const parsed = MeetingSchema.partial().extend({
      minutes: z.string().optional(),
      cancelled: z.boolean().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

    const updates: string[] = [];
    const values: unknown[] = [];
    const d = parsed.data;

    if (d.title !== undefined)       { updates.push('title = ?');       values.push(d.title); }
    if (d.date !== undefined)        { updates.push('date = ?');        values.push(d.date); }
    if (d.location !== undefined)    { updates.push('location = ?');    values.push(d.location); }
    if (d.duration !== undefined)    { updates.push('duration = ?');    values.push(d.duration); }
    if (d.chairperson !== undefined) { updates.push('chairperson = ?'); values.push(d.chairperson); }
    if (d.tag !== undefined)         { updates.push('tag = ?');         values.push(d.tag); }
    if (d.minutes !== undefined)     { updates.push('minutes = ?');     values.push(d.minutes); }
    if (d.cancelled !== undefined)   { updates.push('cancelled = ?');   values.push(d.cancelled ? 1 : 0); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields' });

    values.push(req.params.id);
    db.prepare(`UPDATE meetings SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logAudit(req, 'meetings.update', req.params.id);

    const row = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);
    res.json(row);
  },
);

meetingsRouter.delete(
  '/:id',
  requireAuth,
  requirePermission('meetings.manage'),
  (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM meetings WHERE id = ?').run(req.params.id);
    logAudit(req, 'meetings.delete', req.params.id);
    res.status(204).end();
  },
);

meetingsRouter.post(
  '/:id/attendance',
  requireAuth,
  requirePermission('meetings.attend'),
  (req: AuthedRequest, res) => {
    const meetingId = req.params.id;
    const meeting = db.prepare('SELECT id FROM meetings WHERE id = ?').get(meetingId);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    try {
      db.prepare('INSERT INTO attendance (meeting_id, user_id) VALUES (?, ?)')
        .run(meetingId, req.userId!);
    } catch {
      // already registered
    }
    res.status(204).end();
  },
);

meetingsRouter.get('/:id/attendance', requireAuth, (req, res) => {
  const rows = db
    .prepare(`
      SELECT a.user_id, u.name, u.role, a.created_at
      FROM attendance a
      JOIN users u ON u.id = a.user_id
      WHERE a.meeting_id = ?
      ORDER BY a.created_at ASC
    `)
    .all(req.params.id) as any[];

  res.json(
    rows.map((r) => ({
      userId: r.user_id,
      name: r.name,
      role: r.role,
      registeredAt: r.created_at,
    })),
  );
});