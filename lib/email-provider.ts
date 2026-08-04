export type EmailAttachment = { filename: string; contentType?: string | null; bytes: ArrayBuffer };
export type EmailPackage = { to: string; cc?: string | null; bcc?: string | null; subject: string; body: string; attachments: EmailAttachment[]; idempotencyKey: string };
export type EmailSendResult = { messageId: string };

export interface EmailProvider {
  sendEmail(pkg: EmailPackage): Promise<EmailSendResult>;
}

class TestEmailProvider implements EmailProvider {
  async sendEmail(pkg: EmailPackage): Promise<EmailSendResult> {
    const controlledRecipient = process.env.FUNDER_SUBMISSION_TEST_RECIPIENT;
    if (!controlledRecipient) {
      throw new Error('FUNDER_SUBMISSION_TEST_RECIPIENT is required for the test email provider.');
    }
    if (pkg.to !== controlledRecipient) {
      throw new Error('Test provider blocked live funder delivery. Use FUNDER_SUBMISSION_TEST_RECIPIENT as the configured recipient.');
    }
    return { messageId: `test-${pkg.idempotencyKey}` };
  }
}

export function getEmailProvider(): EmailProvider {
  const provider = process.env.FUNDER_EMAIL_PROVIDER ?? 'test';
  if (provider === 'test') return new TestEmailProvider();
  throw new Error(`Unsupported funder email provider: ${provider}`);
}
