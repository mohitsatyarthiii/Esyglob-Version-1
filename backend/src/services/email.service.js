import { config } from '../config/env.js';

function assertEmailConfiguration() {
  if (!config.email.apiKey) {
    const error = new Error('Transactional email is not configured');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }
}

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[character]));

export async function sendPasswordResetOtp({ to, name, otp, expiresInMinutes }) {
  assertEmailConfiguration();
  const message = buildPasswordResetEmail({ name, otp, expiresInMinutes });
  const response = await fetch(config.email.apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.email.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      from: `${config.email.fromName} <${config.email.fromAddress}>`,
      to: [to],
      reply_to: config.email.replyTo,
      ...message,
    }),
  });
  if (!response.ok) {
    const error = new Error(`Transactional email provider rejected the message (${response.status})`);
    error.code = 'EMAIL_DELIVERY_FAILED';
    throw error;
  }
  return response.json();
}

export function buildPasswordResetEmail({ name, otp, expiresInMinutes }) {
  const safeName = escapeHtml(name || 'EsyGlob member');
  const subject = 'Your EsyGlob password verification code';
  const text = [
    `Hello ${name || 'EsyGlob member'},`,
    '',
    `Use this verification code to reset your EsyGlob password: ${otp}`,
    `This code expires in ${expiresInMinutes} minutes and can be used only once.`,
    '',
    'If you did not request a password reset, you can safely ignore this email. Never share this code with anyone.',
    '',
    'Need help? Contact info@esyglob.com.',
    '',
    'EsyGlob Security',
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f3f6fa;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fa;padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #dfe7f1;border-radius:14px;overflow:hidden"><tr><td style="background:#0b2748;padding:24px 32px"><img src="${escapeHtml(config.email.logoUrl)}" alt="EsyGlob" width="128" style="display:block;max-width:128px"><div style="color:#b9cae0;font-size:12px;margin-top:12px">Account Security</div></td></tr><tr><td style="padding:34px 32px"><h1 style="font-size:24px;margin:0 0 16px;color:#0b2748">Password reset verification</h1><p style="font-size:15px;line-height:1.6;margin:0 0 18px">Hello ${safeName},</p><p style="font-size:15px;line-height:1.6;margin:0 0 24px">Use the code below to continue resetting your EsyGlob password.</p><div style="background:#eef5ff;border:1px solid #c9dcfa;border-radius:12px;color:#145edb;font-size:32px;font-weight:700;letter-spacing:10px;padding:20px;text-align:center">${otp}</div><p style="font-size:13px;color:#52647a;line-height:1.6;margin:18px 0 0">This code expires in <strong>${expiresInMinutes} minutes</strong>. A newer code automatically invalidates this one.</p><div style="border-top:1px solid #e5ebf2;margin-top:28px;padding-top:22px"><strong style="color:#0b2748;font-size:13px">Security notice</strong><p style="font-size:12px;color:#64748b;line-height:1.6;margin:8px 0 0">EsyGlob will never ask you to share this code. If you did not request this reset, ignore this message and your password will remain unchanged.</p></div><p style="font-size:12px;color:#64748b;margin:24px 0 0">Need help? Email <a href="mailto:${escapeHtml(config.email.replyTo)}" style="color:#145edb">${escapeHtml(config.email.replyTo)}</a>.</p></td></tr><tr><td style="background:#f8fafc;border-top:1px solid #e5ebf2;color:#718096;font-size:11px;line-height:1.6;padding:20px 32px">© ${new Date().getFullYear()} EsyGlob. Global trade, made easier.<br>This is an automated account-security message.</td></tr></table></td></tr></table></body></html>`;

  return { subject, text, html };
}
