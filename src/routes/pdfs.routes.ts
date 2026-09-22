import { Router } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import { db } from '../db/client.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { generatePdf } from '../services/pdf.service.js';
import { storage } from '../services/storage.service.js';
import { env } from '../env.js';
import {
  renderReceiptHtml,
  renderMemoHtml,
  renderStatementHtml,
} from '../templates/pdf.templates.js';

export const pdfsRouter = Router();

const IssueSchema = z.object({
  type: z.enum(['receipt', 'memo', 'statement']),
  refId: z.string().min(1),
});

// Absolute URL for images inside the PDF (Puppeteer has no "current page")
const LOGO_URL = `${env.CORS_ORIGIN.replace('5173', '8000')}/static/logo.png`;

pdfsRouter.post('/issue', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = IssueSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const { type, refId } = parsed.data;
    const userId = req.userId!;

    // Load the user
    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!userRow) return res.status(401).json({ error: 'User not found' });

    let html: string;

    if (type === 'receipt') {
      const txn = db
        .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
        .get(refId, userId) as any;
      if (!txn) return res.status(404).json({ error: 'Transaction not found' });

      html = renderReceiptHtml({
        transactionId: txn.id,
        memberName: userRow.name,
        memberId: userRow.id,
        date: txn.date,
        channel: txn.channel,
        purpose: txn.purpose,
        amountMWK: txn.amount_mwk,
        signatureDataUrl: userRow.signature_url ?? undefined,
        logoUrl: LOGO_URL,
      });
    } else if (type === 'memo') {
      const memo = db.prepare('SELECT * FROM memos WHERE id = ?').get(refId) as any;
      if (!memo) return res.status(404).json({ error: 'Memo not found' });

      const author = db
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(memo.author_id) as any;

      html = renderMemoHtml({
        memoId: memo.id,
        to: memo.to_field,
        from: memo.from_field,
        date: memo.date,
        subject: memo.subject,
        salute: memo.salute,
        body: memo.body,
        writerName: author?.name ?? '',
        writerPosition: (author?.role ?? '').toUpperCase(),
        signatureDataUrl: author?.signature_url ?? undefined,
        logoUrl: LOGO_URL,
      });
    } else {
      // statement
      const txns = db
        .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC')
        .all(userId) as any[];

      html = renderStatementHtml({
        memberName: userRow.name,
        memberId: userRow.id,
        balanceMWK: userRow.balance_mwk,
        transactions: txns.map((t) => ({
          id: t.id,
          date: t.date,
          amountMWK: t.amount_mwk,
          channel: t.channel,
          purpose: t.purpose,
        })),
        logoUrl: LOGO_URL,
      });
    }

    const result = await generatePdf({ html, type, refId });

    db.prepare(`
      INSERT INTO pdf_files (id, owner_id, type, ref_id, filename, path, size_bytes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.fileId,
      userId,
      type,
      refId,
      result.filename,
      result.storageKey,
      result.sizeBytes,
    );

    res.json({
      pdfId: result.fileId,
      downloadUrl: `/api/pdfs/${result.fileId}/download`,
    });
  } catch (err) {
    next(err);
  }
});

// ---------- GET /pdfs/:id/download ----------
pdfsRouter.get('/:id/download', requireAuth, (req: AuthedRequest, res) => {
  const record = db
    .prepare('SELECT * FROM pdf_files WHERE id = ?')
    .get(req.params.id) as any;

  if (!record) return res.status(404).json({ error: 'PDF not found' });

  // Only owner or CEO can download
  const isOwner = record.owner_id === req.userId;
  const userRow = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId!) as any;
  const isCeo = userRow?.role === 'ceo';

  if (!isOwner && !isCeo) {
    return res.status(403).json({ error: 'Not allowed' });
  }

  const fullPath = storage.resolve(record.path);

  if (!fs.existsSync(fullPath)) {
    return res.status(410).json({ error: 'PDF has been purged' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${record.filename}"`,
  );

  fs.createReadStream(fullPath).pipe(res);
});

// ---------- GET /pdfs — list current user's PDFs ----------
pdfsRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT id, type, ref_id, filename, created_at
       FROM pdf_files
       WHERE owner_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .all(req.userId!) as any[];

  res.json(
    rows.map((r) => ({
      id: r.id,
      type: r.type,
      refId: r.ref_id,
      filename: r.filename,
      createdAt: r.created_at,
    })),
  );
});