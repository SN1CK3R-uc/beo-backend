function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c]!,
  );
}

interface ReceiptData {
  transactionId: string;
  memberName: string;
  memberId: string;
  date: string;
  channel: string;
  purpose: string;
  amountMWK: number;
  signatureDataUrl?: string;
  logoUrl: string;
}

export function renderReceiptHtml(d: ReceiptData): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #000; padding: 20px; }
  .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; }
  .header img { height: 70px; margin-bottom: 8px; }
  .header h1 { font-size: 20px; letter-spacing: 2px; margin: 4px 0; }
  .header p { font-size: 12px; margin: 2px 0; color: #444; font-style: italic; }
  h2 { text-align: center; font-size: 16px; margin: 24px 0 16px; letter-spacing: 1px; }
  table { width: 100%; font-size: 13px; border-collapse: collapse; }
  td { padding: 10px; border-bottom: 1px solid #ddd; }
  td.label { font-weight: bold; width: 40%; background: #f5f5f5; }
  .amount { font-size: 20px; font-weight: bold; }
  .footer { margin-top: 48px; display: flex; justify-content: space-between; }
  .signature { max-height: 50px; margin-top: 8px; }
  .disclaimer { text-align: center; font-size: 11px; color: #888; margin-top: 40px; }
</style>
</head>
<body>
  <div class="header">
    <img src="${d.logoUrl}" alt="Logo" />
    <h1>BUILDING ENTREPRENEURS</h1>
    <p>Creating Great Minds For Youths</p>
  </div>

  <h2>OFFICIAL PAYMENT RECEIPT</h2>

  <table>
    <tr><td class="label">Transaction ID</td><td>${escapeHtml(d.transactionId)}</td></tr>
    <tr><td class="label">Member</td><td>${escapeHtml(d.memberName)} (${escapeHtml(d.memberId)})</td></tr>
    <tr><td class="label">Date</td><td>${escapeHtml(d.date)}</td></tr>
    <tr><td class="label">Purpose</td><td>${escapeHtml(d.purpose)}</td></tr>
    <tr><td class="label">Payment Channel</td><td>${escapeHtml(d.channel)}</td></tr>
    <tr><td class="label">Amount Paid</td><td class="amount">MWK${d.amountMWK.toFixed(2)}</td></tr>
  </table>

  <div class="footer">
    <div>
      <p style="font-size:12px; margin:0;">Issued by:</p>
      <p style="font-weight:bold; margin:4px 0;">Finance Department</p>
      ${
        d.signatureDataUrl
          ? `<img src="${d.signatureDataUrl}" class="signature" alt="Signature" />`
          : ''
      }
    </div>
    <div style="text-align:right;">
      <p style="font-size:12px; margin:0;">Date issued:</p>
      <p style="margin:4px 0;">${new Date().toLocaleDateString('en-GB')}</p>
    </div>
  </div>

  <p class="disclaimer">
    This is a computer-generated receipt. No physical signature is required.
  </p>
</body>
</html>`;
}

interface MemoData {
  memoId: string;
  to: string;
  from: string;
  date: string;
  subject: string;
  salute: string;
  body: string;
  writerName: string;
  writerPosition: string;
  signatureDataUrl?: string;
  logoUrl: string;
}

export function renderMemoHtml(d: MemoData): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Times New Roman', serif; color: #000; padding: 20px; line-height: 1.5; }
  .header { text-align: center; border-bottom: 1px solid #000; padding-bottom: 12px; }
  .header img { height: 70px; margin-bottom: 8px; }
  .header h1 { font-size: 18px; letter-spacing: 2px; margin: 4px 0; }
  .header p { font-size: 11px; margin: 2px 0; color: #444; font-style: italic; }
  h2 { text-align: center; font-size: 15px; margin: 24px 0 16px; letter-spacing: 2px; }
  .field { margin: 6px 0; font-size: 13px; }
  .field strong { display: inline-block; min-width: 70px; }
  hr { border: none; border-top: 1px solid #000; margin: 14px 0; }
  .body-content { margin-top: 16px; white-space: pre-wrap; font-size: 13px; }
  .signature-block { margin-top: 48px; }
  .signature-block p { margin: 2px 0; font-size: 13px; }
  .signature { max-height: 60px; margin-top: 8px; }
</style>
</head>
<body>
  <div class="header">
    <img src="${d.logoUrl}" alt="Logo" />
    <h1>BUILDING ENTREPRENEURS</h1>
    <p>Creating Great Minds For Youths</p>
  </div>

  <h2>OFFICIAL MEMORANDUM</h2>

  <p class="field"><strong>TO:</strong> ${escapeHtml(d.to)}</p>
  <p class="field"><strong>FROM:</strong> ${escapeHtml(d.from)}</p>
  <p class="field"><strong>DATE:</strong> ${escapeHtml(d.date)}</p>
  <hr>
  <p class="field"><strong>SUBJECT:</strong> ${escapeHtml(d.subject)}</p>
  <p class="field" style="margin-top:16px;">${escapeHtml(d.salute)}</p>
  <div class="body-content">${escapeHtml(d.body)}</div>

  <div class="signature-block">
    <p><strong>${escapeHtml(d.writerName)}</strong></p>
    <p>${escapeHtml(d.writerPosition)}</p>
    ${
      d.signatureDataUrl
        ? `<img src="${d.signatureDataUrl}" class="signature" alt="Signature" />`
        : ''
    }
  </div>
</body>
</html>`;
}

interface StatementData {
  memberName: string;
  memberId: string;
  balanceMWK: number;
  transactions: Array<{
    id: string;
    date: string;
    amountMWK: number;
    channel: string;
    purpose: string;
  }>;
  logoUrl: string;
}

export function renderStatementHtml(d: StatementData): string {
  const rows = d.transactions
    .map(
      (t) => `
    <tr>
      <td>${escapeHtml(t.id)}</td>
      <td>${escapeHtml(t.date)}</td>
      <td>${escapeHtml(t.channel)}</td>
      <td>${escapeHtml(t.purpose)}</td>
      <td style="text-align:right;">MWK${t.amountMWK.toFixed(2)}</td>
    </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #000; padding: 20px; }
  .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; }
  .header img { height: 70px; margin-bottom: 8px; }
  .header h1 { font-size: 20px; letter-spacing: 2px; margin: 4px 0; }
  h2 { text-align: center; font-size: 16px; margin: 24px 0; letter-spacing: 1px; }
  .meta { margin: 16px 0; font-size: 13px; }
  .balance-box { background: #f0f0f0; padding: 16px; border-radius: 6px; margin: 16px 0; }
  .balance-box .amount { font-size: 22px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 16px; }
  th { background: #333; color: #fff; padding: 10px; text-align: left; }
  td { padding: 8px 10px; border-bottom: 1px solid #ddd; }
</style>
</head>
<body>
  <div class="header">
    <img src="${d.logoUrl}" alt="Logo" />
    <h1>BUILDING ENTREPRENEURS</h1>
    <p style="font-size:11px; color:#444;">Creating Great Minds For Youths</p>
  </div>

  <h2>ACCOUNT STATEMENT</h2>

  <div class="meta">
    <p><strong>Member:</strong> ${escapeHtml(d.memberName)} (${escapeHtml(d.memberId)})</p>
    <p><strong>Statement Date:</strong> ${new Date().toLocaleDateString('en-GB')}</p>
  </div>

  <div class="balance-box">
    <p style="margin: 0; font-size: 12px;">Current Balance:</p>
    <p class="amount">MWK${Math.abs(d.balanceMWK).toFixed(2)}
      ${
        d.balanceMWK > 0
          ? '(Due)'
          : d.balanceMWK < 0
          ? '(Credit)'
          : '(Cleared)'
      }
    </p>
  </div>

  <h3 style="font-size:14px; margin-top:24px;">Transaction History</h3>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Date</th>
        <th>Channel</th>
        <th>Purpose</th>
        <th style="text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="5" style="text-align:center; color:#888;">No transactions</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;
}