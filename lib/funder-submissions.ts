import { createHash } from 'crypto';
import type { EmailAttachment } from '@/lib/email-provider';

type Deal = { id: string; business_name?: string | null; owner_name?: string | null; state?: string | null; industry?: string | null; monthly_revenue?: number | string | null; time_in_business_months?: number | string | null; requested_amount?: number | string | null; funded_amount?: number | string | null; positions?: number | string | null; fico?: number | string | null; assigned_rep?: { full_name?: string | null } | null };
type Funder = { id: string; verified_at?: string | null; portal_url?: string | null; funder_name?: string | null; submission_method?: string | null; primary_submission_email?: string | null; submission_cc?: string | null; submission_bcc?: string | null; subject_template?: string | null; body_template?: string | null; required_document_types?: string[] | null; required_docs?: string | null; is_active?: boolean | null };
type FileRow = { id: string; file_type: string | null; path: string; created_at?: string | null };

const money = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? `$${n.toLocaleString()}` : '—';
};

export function templateVariables(deal: Deal) {
  return {
    business_name: deal.business_name ?? '—', owner_name: deal.owner_name ?? '—', state: deal.state ?? '—', industry: deal.industry ?? '—',
    monthly_revenue: money(deal.monthly_revenue), time_in_business: deal.time_in_business_months ? `${deal.time_in_business_months} months` : '—',
    requested_amount: money(deal.requested_amount), positions: deal.positions ?? '—', fico: deal.fico ?? '—',
    assigned_rep: deal.assigned_rep?.full_name ?? 'Unassigned', deal_id: deal.id
  } as Record<string, string>;
}

export function renderTemplate(template: string | null | undefined, variables: Record<string, string>) {
  return String(template ?? '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => variables[key] ?? '—');
}

export function splitRequiredDocs(funder: Funder) {
  const configured = Array.isArray(funder.required_document_types) ? funder.required_document_types : [];
  return configured.length ? configured.map(String) : String(funder.required_docs ?? '').split(/[;,]/).map((x) => x.trim()).filter(Boolean);
}

function normalized(value: string | null | undefined) { return String(value ?? '').toLowerCase(); }

export function missingRequiredDocs(funder: Funder, files: FileRow[]) {
  const types = new Set(files.map((f) => normalized(f.file_type)));
  return splitRequiredDocs(funder).filter((doc) => {
    const d = normalized(doc);
    if (!d || d === 'not specified') return false;
    if (d.includes('statement') || d.includes('bank')) return !types.has('statement');
    if (d.includes('app')) return !types.has('application');
    if (d.includes('license') || d === 'dl') return !types.has('drivers_license') && !types.has('license');
    if (d.includes('void')) return !types.has('voided_check');
    return !Array.from(types).some((t) => d.includes(t) || t.includes(d));
  });
}

const packageTypes = ['application', 'statement', 'supporting', 'drivers_license', 'license', 'voided_check'];

export function selectedPackageFiles(files: FileRow[], extraIds: string[] = []) {
  return files.filter(file => {
    const type = normalized(file.file_type);
    return ['application', 'statement'].includes(type) || (packageTypes.includes(type) && extraIds.includes(file.id));
  });
}

export function originalFilename(path: string) {
  const leaf = path.split('/').pop() ?? path;
  return leaf.replace(/^\d+-\d+-/, '');
}

export function buildIdempotencyKey(dealId: string, funderId: string) {
  return createHash('sha256').update(`${dealId}:${funderId}:initial-email-submission`).digest('hex');
}

export function buildPreview(deal: Deal, funder: Funder, files: FileRow[], previous?: { status?: string | null; submitted_at?: string | null }, extraIds: string[] = []) {
  const vars = templateVariables(deal);
  const packageFiles = selectedPackageFiles(files, extraIds);
  return {
    funderId: funder.id,
    funderName: funder.funder_name ?? 'Unknown funder',
    method: funder.submission_method ?? 'tbd',
    verifiedAt: funder.verified_at ?? null, portalUrl: funder.portal_url ?? null,
    to: funder.primary_submission_email ?? '', cc: funder.submission_cc ?? '', bcc: funder.submission_bcc ?? '',
    subject: renderTemplate(funder.subject_template, vars), body: renderTemplate(funder.body_template, vars),
    attachments: packageFiles.map(f => ({ id: f.id, fileType: f.file_type, filename: originalFilename(f.path) })),
    missingDocuments: missingRequiredDocs(funder, packageFiles), previousStatus: previous?.status ?? null, lastSubmittedAt: previous?.submitted_at ?? null,
    idempotencyKey: buildIdempotencyKey(deal.id, funder.id),
    confirmationKey: createHash('sha256').update(JSON.stringify({
      id: deal.id, funder: funder.id, verifiedAt: funder.verified_at, method: funder.submission_method, portal: funder.portal_url,
      recipients: [funder.primary_submission_email, funder.submission_cc, funder.submission_bcc],
      subject: renderTemplate(funder.subject_template, vars), body: renderTemplate(funder.body_template, vars),
      required: splitRequiredDocs(funder), files: packageFiles.map(file => [file.id, file.path]).sort(),
    })).digest('hex')
  };
}

export async function downloadAttachments(supabase: { storage: { from: (bucket: string) => { download: (path: string) => Promise<{ data?: Blob | null; error?: { message: string } | null }> } } }, files: FileRow[]): Promise<EmailAttachment[]> {
  const attachments: EmailAttachment[] = [];
  let totalSize = 0;
  for (const file of files) {
    const { data, error } = await supabase.storage.from('deal-files').download(file.path);
    if (error || !data) throw new Error(`Failed to download ${originalFilename(file.path)}: ${error?.message ?? 'missing file'}`);
    totalSize += data.size;
    if (totalSize > 15 * 1024 * 1024) throw new Error('Attachment package exceeds the 15 MB limit.');
    attachments.push({ filename: originalFilename(file.path), contentType: data.type, bytes: await data.arrayBuffer() });
  }
  return attachments;
}
