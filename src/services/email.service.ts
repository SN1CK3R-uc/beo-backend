import { Resend } from 'resend';
import { env } from '../env.js';

const resend = new Resend(env.RESEND_API_KEY);

// ---------- Dev mode override ----------
// In development, all emails go to RESEND_DEV_EMAIL regardless of recipient.
function resolveRecipient(to: string): string {
  if (env.NODE_ENV === 'development' && env.RESEND_DEV_EMAIL) {
    return env.RESEND_DEV_EMAIL;
  }
  return to;
}

function fromAddress(): string {
  return `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`;
}

// ---------- Shared HTML wrapper ----------
function wrapHtml(title: string, body: string, ctaUrl?: string, ctaLabel?: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; background: #f4f6f9; padding: 24px; margin: 0; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #0056b3, #003d80); color: #ffffff; padding: 28px 32px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; letter-spacing: 1px; }
    .header p { margin: 6px 0 0; font-size: 12px; color: rgba(255,255,255,0.85); font-style: italic; }
    .body { padding: 32px; color: #212529; line-height: 1.6; }
    .body h2 { color: #0056b3; font-size: 18px; margin-top: 0; }
    .cta { display: inline-block; padding: 12px 24px; background: #0056b3; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 16px; }
    .footer { text-align: center; padding: 20px; font-size: 11px; color: #6c757d; background: #f8f9fa; }
    .divider { border: none; border-top: 1px solid #e3e6ea; margin: 20px 0; }
    .muted { color: #6c757d; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>BUILDING ENTREPRENEURS</h1>
      <p>Creating Great Minds For Youths</p>
    </div>
    <div class="body">
      <h2>${title}</h2>
      ${body}
      ${ctaUrl ? `<a class="cta" href="${ctaUrl}">${ctaLabel ?? 'Open App'}</a>` : ''}
    </div>
    <div class="footer">
      This is an automated email from BEO MIS. Please do not reply.
    </div>
  </div>
</body>
</html>`;
}

// ---------- Send helper ----------
interface SendInput {
  to: string;
  subject: string;
  html: string;
}

async function send(input: SendInput): Promise<void> {
  try {
    const result = await resend.emails.send({
      from: fromAddress(),
      to: resolveRecipient(input.to),
      subject: input.subject,
      html: input.html,
    });
    console.log(`[email] sent "${input.subject}" to ${input.to}`, result.data?.id ?? '');
  } catch (err) {
    // Never throw from email — it's a side-effect, not a critical path
    console.error('[email] failed to send:', err);
  }
}

// ---------- Public API ----------
export const emailService = {
  async sendWelcome(user: { name: string; email: string; id: string }, initialPass: string) {
    await send({
      to: user.email,
      subject: 'Welcome to BEO MIS',
      html: wrapHtml(
        `Welcome, ${user.name}!`,
        `
        <p>Your BEO MIS account has been created.</p>
        <hr class="divider" />
        <p><strong>User ID:</strong> ${user.id}</p>
        <p><strong>Temporary Passkey:</strong> ${initialPass}</p>
        <hr class="divider" />
        <p class="muted">Please log in and change your passkey as soon as possible.</p>
        `,
        env.CORS_ORIGIN,
        'Log in to BEO MIS',
      ),
    });
  },

  async sendPasswordReset(user: { name: string; email: string }, resetToken: string) {
    const url = `${env.CORS_ORIGIN}/reset-password?token=${resetToken}`;
    await send({
      to: user.email,
      subject: 'Reset your BEO MIS passkey',
      html: wrapHtml(
        'Password Reset Request',
        `
        <p>Hi ${user.name},</p>
        <p>We received a request to reset your passkey. Click the button below to set a new one.</p>
        <p class="muted">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
        `,
        url,
        'Reset Passkey',
      ),
    });
  },

  async sendNewMemo(recipient: { name: string; email: string }, memo: { subject: string; from: string; date: string }) {
    await send({
      to: recipient.email,
      subject: `New Memo: ${memo.subject}`,
      html: wrapHtml(
        'New Memo Published',
        `
        <p>Hi ${recipient.name},</p>
        <p>A new memo has been published by <strong>${memo.from}</strong>.</p>
        <hr class="divider" />
        <p><strong>Subject:</strong> ${memo.subject}</p>
        <p><strong>Date:</strong> ${memo.date}</p>
        <hr class="divider" />
        <p class="muted">Log in to read the full memo and download a PDF copy.</p>
        `,
        `${env.CORS_ORIGIN}/memos`,
        'Read Memo',
      ),
    });
  },

  async sendMeetingScheduled(recipient: { name: string; email: string }, meeting: { title: string; date: string; location: string }) {
    await send({
      to: recipient.email,
      subject: `Meeting Scheduled: ${meeting.title}`,
      html: wrapHtml(
        'New Meeting Scheduled',
        `
        <p>Hi ${recipient.name},</p>
        <p>A new meeting has been scheduled.</p>
        <hr class="divider" />
        <p><strong>Title:</strong> ${meeting.title}</p>
        <p><strong>Date:</strong> ${meeting.date}</p>
        <p><strong>Location:</strong> ${meeting.location}</p>
        <hr class="divider" />
        <p class="muted">Confirm your attendance in the Meetings module.</p>
        `,
        `${env.CORS_ORIGIN}/meetings`,
        'View Meeting',
      ),
    });
  },

  async sendPaymentConfirmed(recipient: { name: string; email: string }, payment: { amountMWK: number; purpose: string; reference: string }) {
    await send({
      to: recipient.email,
      subject: `Payment Confirmed: MWK ${payment.amountMWK.toFixed(2)}`,
      html: wrapHtml(
        'Payment Confirmed',
        `
        <p>Hi ${recipient.name},</p>
        <p>Your payment has been confirmed. Thank you!</p>
        <hr class="divider" />
        <p><strong>Amount:</strong> MWK ${payment.amountMWK.toFixed(2)}</p>
        <p><strong>Purpose:</strong> ${payment.purpose}</p>
        <p><strong>Reference:</strong> ${payment.reference}</p>
        <hr class="divider" />
        <p class="muted">A PDF receipt is available for download in the Financials module.</p>
        `,
        `${env.CORS_ORIGIN}/financials`,
        'View Receipt',
      ),
    });
  },
};