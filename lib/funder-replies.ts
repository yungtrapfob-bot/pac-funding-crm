export type FunderMessage = {
  id: string; sender: string; subject: string; text: string;
  references: string[]; senderVerified: boolean;
};
export type SentSubmission = {
  id: string; deal_id: string; funder_name: string; recipient: string;
  provider_message_id: string | null; idempotency_key: string;
};
const stages = ['acknowledged','underwriting','approved','declined','documents_requested','stipulations',
  'revised_approval','contract_sent','funding_confirmation'] as const;
type ResponseKind = typeof stages[number] | 'other';

function email(value: string) {
  return (value.match(/<([^>]+)>/)?.[1] ?? value).trim().toLowerCase();
}

export function matchFunderReply(message: FunderMessage, sent: SentSubmission[], trustedMock = false) {
  const content = message.subject + '\n' + message.text;
  const refs = new Set([...content.matchAll(/\bPAC-([a-f0-9]{64})\b/gi)].map(match => match[1]!.toLowerCase()));
  const matches = sent.filter(entry => refs.has(entry.idempotency_key) ||
    (entry.provider_message_id && message.references.includes(entry.provider_message_id)));
  const match = matches.length === 1 ? matches[0]! : null;
  return {
    submissionId: match?.id ?? null,
    confidence: !match ? 'manual' : message.senderVerified && (trustedMock || email(message.sender) === email(match.recipient))
      ? 'verified_reference' : 'reference_needs_sender_review',
  };
}

export function extractFunderReply(message: FunderMessage) {
  const values = new Map<string, string>();
  for (const line of message.text.split(/\r?\n/)) {
    const field = line.match(/^([a-z][a-z _-]{0,28}):\s*(.{1,350})$/i);
    if (field && !values.has(field[1]!.toLowerCase())) values.set(field[1]!.toLowerCase(), field[2]!.trim());
  }
  const declared = values.get('decision')?.toLowerCase().replaceAll(' ', '_');
  const conditional = /subject to|conditional approval|pre[- ]?qualif|not an approval|marketing only/i.test(message.text);
  const kind: ResponseKind = !conditional && stages.some(stage => stage === declared) ? declared as ResponseKind : 'other';
  const amount = (field: string) => {
    const raw = values.get(field);
    if (!raw || !/^\$?\d[\d,]*(?:\.\d{1,3})?$/.test(raw)) return null;
    const number = Number(raw.replace(/[$,]/g,''));
    return Number.isFinite(number) && number >= 0 && number <= 9999999999.99 ? number : null;
  };
  const principal = amount('approved amount');
  const factor = amount('factor rate');
  const payback = amount('total payback');
  const mismatch = principal !== null && factor !== null && payback !== null && Math.abs(principal * factor - payback) > 1;
  return {
    kind, amount: principal, factor, payback, mismatch, conditional,
    payment: amount('payment amount'), frequency: values.get('payment frequency') ?? null,
    term: values.get('term') ?? null, stipulations: values.get('stipulations') ?? null,
    declineReason: values.get('decline reason') ?? null,
    expiration: values.get('offer expiration') ?? null,
  };
}
