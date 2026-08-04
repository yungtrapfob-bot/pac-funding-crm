import { createHash } from 'crypto';
import type { EmailAttachment } from '@/lib/email-provider';

type Deal = { id: string; business_name?: string | null; owner_name?: string | null; state?: string | null; industry?: string | null; monthly_revenue?: number | string | null; time_in_business_months?: number | string | null; requested_amount?: number | string | null; funded_amount?: number | string | null; positions?: number | string | null; fico?: number | string | null; assigned_rep?: { full_name?: string | null } | null };
type Funder = { id: string; funder_name?: string | null; submission_method?: string | null; primary_submission_email?: string | null; submission_cc?: string | null; submission_bcc?: string | null; subject_template?: string | null; body_template?: string | null; required_document_types?: string[] | null; required_docs?: string | null; is_active?: boolean | null };
type FileRow = { id: string; file_type: string | null; path: string; created_at?: string | null };

const money = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? `$${n.toLocaleString()}` : '—';
};

export function templateVariables(deal: Deal) {
  return {
    business_name: deal.business_name ?? '—', owner_name: deal.owner_name ?? '—', state: deal.state ?? '—', industry: deal.industry ?? '—',
    monthly_revenue: money(deal.monthly_revenue), time_in_business: deal.time_in_business_months ? `${deal.time_in_business_months} months` : '—',
    requested_amount: money(deal.requested_amount ?? deal.funded_amount), positions: deal.positions ?? '—', fico: deal.fico ?? '—',
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

export function selectedPackageFiles(files: FileRow[]) {
  return files.filter((f) => ['application', 'statement', 'supporting', 'drivers_license', 'license', 'voided_check'].includes(normalized(f.file_type)));
}

export function originalFilename(path: string) {
  const leaf = path.split('/').pop() ?? path;
  return leaf.replace(/^\d+-\d+-/, '');
}

export function buildIdempotencyKey(dealId: string, funderId: string) {
  return createHash('sha256').update(`${dealId}:${funderId}:initial-email-submission`).digest('hex');
}

export function buildPreview(deal: Deal, funder: Funder, files: FileRow[], previous?: { status?: string | null; submitted_at?: string | null }) {
  const vars = templateVariables(deal);
  const packageFiles = selectedPackageFiles(files);
  return {
    funderId: funder.id,
    funderName: funder.funder_name ?? 'Unknown funder',
    method: funder.submission_method ?? 'tbd',
    to: funder.primary_submission_email ?? '', cc: funder.submission_cc ?? '', bcc: funder.submission_bcc ?? '',
    subject: renderTemplate(funder.subject_template, vars), body: renderTemplate(funder.body_template, vars),
    attachments: packageFiles.map((f) => ({ id: f.id, fileType: f.file_type, filename: originalFilename(f.path), path: f.path })),
    missingDocuments: missingRequiredDocs(funder, files), previousStatus: previous?.status ?? null, lastSubmittedAt: previous?.submitted_at ?? null,
    idempotencyKey: buildIdempotencyKey(deal.id, funder.id)
  };
}

export async function downloadAttachments(supabase: { storage: { from: (bucket: string) => { download: (path: string) => Promise<{ data?: Blob | null; error?: { message: string } | null }> } } }, files: FileRow[]): Promise<EmailAttachment[]> {
  const attachments: EmailAttachment[] = [];
  for (const file of selectedPackageFiles(files)) {
    const { data, error } = await supabase.storage.from('deal-files').download(file.path);
    if (error || !data) throw new Error(`Failed to download ${originalFilename(file.path)}: ${error?.message ?? 'missing file'}`);
    attachments.push({ filename: originalFilename(file.path), contentType: data.type, bytes: await data.arrayBuffer() });
  }
  return attachments;
}
