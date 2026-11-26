'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { documentFacts, summarizeFinancialFacts } from '@/lib/document-analysis';
import { analysisMode, getDocumentAnalysisProvider } from '@/lib/document-analysis-provider';

class AnalysisIssue extends Error {}

async function reportResult(operation: () => Promise<void>): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await operation();
    return { ok: true };
  } catch (error) {
    if (error instanceof AnalysisIssue) return { ok: false, message: error.message };
    throw error;
  }
}

const version = 'financial-facts-v1';
const limit = 12 * 1024 * 1024;

function refresh(dealId: string) {
  revalidatePath(`/deals/${dealId}`);
  revalidatePath('/admin/processing');
}

export async function analyzeProcessingDocuments(dealId: string, reanalyze: boolean) {
  return reportResult(() => runDocumentAnalysis(dealId, reanalyze));
}

async function runDocumentAnalysis(dealId: string, reanalyze: boolean) {
  const { profile } = await requireRole(['admin']);
  z.guid().parse(dealId);
  const mode = analysisMode();
  if (mode === 'disabled') throw new AnalysisIssue('Document analysis is disabled or configuration is incomplete.');
  const supabase = await createClient();
  const [deal, files] = await Promise.all([
    supabase.from('deals').select('id,sales_test,archived_at,sales_lost,current_stage').eq('id', dealId).single(),
    supabase.from('deal_files').select('id,path,file_type').eq('deal_id', dealId).in('file_type', ['application','statement']).order('file_type').order('id'),
  ]);
  if (deal.error || !deal.data || deal.data.archived_at || deal.data.sales_lost || ['Funded','Killed','KIF'].includes(deal.data.current_stage)) throw new AnalysisIssue('The deal is closed or unavailable.');
  if (mode === 'mock' && !deal.data.sales_test) throw new AnalysisIssue('Mock analysis is limited to synthetic test deals.');
  if (mode === 'openai' && deal.data.sales_test) throw new AnalysisIssue('Use the mock provider for test records.');
  if (files.error || !files.data?.some(file => file.file_type === 'application') || !files.data.some(file => file.file_type === 'statement')) {
    throw new AnalysisIssue('An application and at least one statement are required.');
  }
  if (files.data.length > 8) throw new AnalysisIssue('Analysis supports up to eight PDFs per deal.');
  const admin = createAdminClient();
  const model = mode === 'openai' ? process.env.PROCESSING_ANALYSIS_MODEL : 'mock';
  const key = createHash('sha256').update(JSON.stringify([version, mode, model, files.data.map(file => [file.id,file.path])])).digest('hex');
  const { error: staleError } = await admin.from('processing_document_analyses')
    .update({ status: 'failed', finished_at: new Date().toISOString() }).eq('deal_id', dealId).eq('status', 'analyzing')
    .lt('created_at', new Date(Date.now() - 300_000).toISOString());
  if (staleError) throw new AnalysisIssue('The analysis queue is unavailable.');
  const { data: existing, error: historyError } = await supabase.from('processing_document_analyses').select('id,status')
    .eq('deal_id', dealId).eq('input_key', key).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (historyError) throw new AnalysisIssue('Analysis history is unavailable.');
  if (existing?.status === 'analyzing') throw new AnalysisIssue('Analysis is already running.');
  if (existing && !reanalyze) return;
  const { data: run, error } = await admin.from('processing_document_analyses').insert({
    deal_id: dealId, requested_by: profile.id, provider: mode, version: `${version}:${model}`,
    input_key: key, document_ids: files.data.map(file => file.id), status: 'analyzing',
  }).select('id').single();
  if (error || !run) throw new AnalysisIssue('Another analysis may already be running.');
  try {
    const documents: { type: string; bytes: ArrayBuffer }[] = [];
    let size = 0;
    for (const file of files.data) {
      if (!file.path.startsWith(dealId + '/')) throw new AnalysisIssue('Document unavailable.');
      const { data, error: downloadError } = await supabase.storage.from('deal-files').download(file.path);
      if (downloadError || !data) throw new AnalysisIssue('Document unavailable.');
      size += data.size;
      if (size > limit || await data.slice(0,5).text() !== '%PDF-') throw new AnalysisIssue('Invalid PDF or package size limit exceeded.');
      documents.push({ type: file.file_type, bytes: await data.arrayBuffer() });
    }
    const raw = documentFacts.parse(await getDocumentAnalysisProvider(mode).extract(documents));
    if (raw.application && documents[raw.application.file]?.type !== 'application'
      || raw.statements.some(statement => documents[statement.file]?.type !== 'statement')) throw new AnalysisIssue('Source evidence is invalid.');
    const summary = summarizeFinancialFacts(raw);
    const { error: saveError } = await admin.from('processing_document_analyses')
      .update({ summary, status: 'needs_review', finished_at: new Date().toISOString() }).eq('id', run.id);
    if (saveError) throw new AnalysisIssue('Analysis could not be saved.');
  } catch {
    await admin.from('processing_document_analyses')
      .update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', run.id);
    refresh(dealId);
    throw new AnalysisIssue('Analysis failed. Check the PDFs, file limits, and provider configuration before retrying.');
  }
  refresh(dealId);
}

const optionalNumber = (min: number, max: number, whole = false) => z.preprocess(
  value => typeof value === 'string' && value.trim() ? Number(value) : null,
  (whole ? z.number().int() : z.number()).min(min).max(max).nullable(),
);
const underwriting = z.object({
  revenue: optionalNumber(0, 9999999999.99), requested: optionalNumber(0, 9999999999.99),
  balance: optionalNumber(-9999999999.99, 9999999999.99),
  deposits: optionalNumber(0, 10000, true), positions: optionalNumber(0, 100, true),
  fico: optionalNumber(300, 850, true), months: optionalNumber(0, 1200, true),
  nsfs: optionalNumber(0, 10000, true), negativeDays: optionalNumber(0, 31, true),
  industry: z.string().trim().max(100).transform(value => value || null),
  state: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/).transform(value => value || null),
});

export async function saveProcessingUnderwriting(dealId: string, analysisId: string | null, form: FormData) {
  return reportResult(() => persistProcessingUnderwriting(dealId, analysisId, form));
}

async function persistProcessingUnderwriting(dealId: string, analysisId: string | null, form: FormData) {
  await requireRole(['admin']);
  z.guid().parse(dealId);
  if (analysisId) z.guid().parse(analysisId);
  const inputs = underwriting.safeParse(Object.fromEntries(form));
  if (!inputs.success) throw new AnalysisIssue('Enter valid underwriting values or leave unknown fields blank.');
  const { error } = await (await createClient()).rpc('crm_save_processing_underwriting', {
    target_deal: dealId, analysis_id: analysisId, inputs: inputs.data,
  });
  if (error) throw new AnalysisIssue('Could not save underwriting. Check the deal stage and analysis evidence.');
  refresh(dealId);
}
