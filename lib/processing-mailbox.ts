import 'server-only';
import type { FunderMessage, SentSubmission } from '@/lib/funder-replies';

export function mailboxMode() {
  if (process.env.PROCESSING_MAILBOX_PROVIDER === 'mock') return 'mock';
  if (process.env.PROCESSING_MAILBOX_PROVIDER === 'gmail' && process.env.PROCESSING_MAILBOX_APPROVED === 'true'
    && process.env.PROCESSING_GMAIL_CLIENT_ID && process.env.PROCESSING_GMAIL_CLIENT_SECRET
    && process.env.PROCESSING_GMAIL_REFRESH_TOKEN && process.env.PROCESSING_GMAIL_LABEL_ID) return 'gmail';
  return 'disabled';
}

export interface ProcessingMailbox {
  read(): Promise<FunderMessage[]>;
}

export function mockProcessingMailbox(entries: SentSubmission[]): ProcessingMailbox {
  return {
    async read() {
      return entries.slice(0,2).map((entry,index) => ({
        id: `synthetic-${entry.id}`, sender: 'funding-review@example.test', senderVerified: true,
        references: entry.provider_message_id ? [entry.provider_message_id] : [],
        subject: `Synthetic response PAC-${entry.idempotency_key}`,
        text: index === 0
          ? 'Decision: approved\nApproved amount: $25,000\nFactor rate: 1.25\nTotal payback: $31,250\nPayment frequency: Weekly\nTerm: 20 weeks'
          : 'Decision: declined\nDecline reason: Synthetic underwriting example',
      }));
    },
  };
}

type MimePart = { mimeType?: string; body?: { data?: string }; parts?: MimePart[]; headers?: { name: string; value: string }[] };

function plainText(part: MimePart): string {
  if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data.slice(0, 12_000), 'base64url').toString('utf8').slice(0, 4000);
  for (const child of part.parts ?? []) {
    const text = plainText(child);
    if (text) return text;
  }
  return '';
}

export function gmailProcessingMailbox(): ProcessingMailbox {
  return {
    async read() {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', signal: AbortSignal.timeout(8_000), body: new URLSearchParams({
          client_id: process.env.PROCESSING_GMAIL_CLIENT_ID ?? '',
          client_secret: process.env.PROCESSING_GMAIL_CLIENT_SECRET ?? '',
          refresh_token: process.env.PROCESSING_GMAIL_REFRESH_TOKEN ?? '', grant_type: 'refresh_token',
        }),
      });
      if (!tokenResponse.ok) throw new Error('Gmail authorization failed.');
      const token = await tokenResponse.json() as { access_token?: string; scope?: string };
      if (!token.access_token || !token.scope?.split(' ').includes('https://www.googleapis.com/auth/gmail.readonly')) {
        throw new Error('Gmail must be authorized with the gmail.readonly scope.');
      }
      async function read(path: string) {
        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages' + path, {
          headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error('Could not read the configured mailbox label.');
        return response.json();
      }
      const query = new URLSearchParams({ labelIds: process.env.PROCESSING_GMAIL_LABEL_ID ?? '', maxResults: '10' });
      const page = await read('?' + query) as { messages?: { id: string }[] };
      return Promise.all((page.messages ?? []).slice(0,10).map(async ({ id }) => {
        const message = await read('/' + encodeURIComponent(id) + '?format=full') as { payload?: MimePart };
        const payload = message.payload ?? {};
        const headers = new Map((payload.headers ?? []).map(header => [header.name.toLowerCase(),header.value]));
        return {
          id, sender: (headers.get('from') ?? '').slice(0,254), subject: (headers.get('subject') ?? '').slice(0,300), text: plainText(payload),
          references: [headers.get('in-reply-to'), headers.get('references')].filter(Boolean).join(' ').split(/\s+/).map(value => value.replace(/[<>]/g,'')),
          // A raw From header cannot verify sender identity. Review every live match.
          senderVerified: false,
        };
      }));
    },
  };
}
