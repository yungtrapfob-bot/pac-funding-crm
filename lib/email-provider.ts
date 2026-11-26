export type EmailAttachment = { filename: string; contentType?: string | null; bytes: ArrayBuffer };
export type EmailPackage = { to: string; cc?: string | null; bcc?: string | null; subject: string; body: string; attachments: EmailAttachment[]; idempotencyKey: string };
export type EmailSendResult = { messageId: string };

export interface EmailProvider {
  sendEmail(pkg: EmailPackage): Promise<EmailSendResult>;
}

export class EmailRejected extends Error {}

export function emailMode() {
  if (process.env.FUNDER_EMAIL_PROVIDER === 'test' && process.env.FUNDER_SUBMISSION_TEST_RECIPIENT) return 'test';
  if (process.env.FUNDER_EMAIL_PROVIDER === 'resend' && process.env.FUNDER_EMAIL_LIVE_ENABLED === 'true'
    && process.env.RESEND_API_KEY && process.env.FUNDER_EMAIL_FROM) return 'resend';
  return 'disabled';
}

class TestEmailProvider implements EmailProvider {
  async sendEmail(pkg: EmailPackage): Promise<EmailSendResult> {
    if (pkg.to.toLowerCase() !== process.env.FUNDER_SUBMISSION_TEST_RECIPIENT?.toLowerCase() || pkg.cc || pkg.bcc) {
      throw new EmailRejected('The test provider requires the configured test recipient and no CC or BCC.');
    }
    return { messageId: `test-${pkg.idempotencyKey}` };
  }
}

class ResendEmailProvider implements EmailProvider {
  async sendEmail(pkg: EmailPackage): Promise<EmailSendResult> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': pkg.idempotencyKey,
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        from: process.env.FUNDER_EMAIL_FROM, to: [pkg.to], cc: pkg.cc?.split(',').map(address => address.trim()),
        bcc: pkg.bcc?.split(',').map(address => address.trim()), subject: pkg.subject, text: pkg.body,
        attachments: pkg.attachments.map(item => ({ filename: item.filename, content: Buffer.from(item.bytes).toString('base64') })),
      }),
    });
    if ([400, 401, 403, 422, 429].includes(response.status)) throw new EmailRejected('The provider rejected the request.');
    if (!response.ok) throw new Error('Provider acceptance is uncertain.');
    const result = await response.json() as { id?: unknown };
    if (typeof result.id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(result.id)) {
      throw new Error('The provider did not return a valid message ID.');
    }
    return { messageId: result.id };
  }
}

export function getEmailProvider(): EmailProvider {
  const mode = emailMode();
  if (mode === 'test') return new TestEmailProvider();
  if (mode === 'resend') return new ResendEmailProvider();
  throw new EmailRejected('Email submissions are disabled or the provider configuration is incomplete.');
}
