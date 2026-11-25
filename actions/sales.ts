'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole, requireUser } from '@/lib/auth';
import { parsePacificInput } from '@/lib/pacific-time';
import { createClient } from '@/lib/supabase/server';

export type SalesResult = { status: 'idle' | 'error' | 'success'; message?: string };

export async function recordSalesAction(_: SalesResult, form: FormData): Promise<SalesResult> {
  await requireUser();
  const parsed = z.object({
    entity: z.enum(['lead', 'deal']),
    id: z.guid(),
    action: z.enum(['call','text','email','note','schedule','task_completed','stage','lost','reopened',
      'submitted','pitched','contracts_out','contracts_signed','source','processor','test_record']),
    value: z.string().max(200).optional(),
    note: z.string().max(3000).optional(),
    due: z.string().optional(),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: 'error', message: 'Check the selected action and its fields.' };
  const { entity, id, action, value, note, due } = parsed.data;
  const dueAt = due ? parsePacificInput(due) : null;
  if (due && !dueAt) return { status: 'error', message: 'Choose a valid Pacific date and time.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('crm_record_sales_action', {
    entity, record_id: id, action, value: value ?? null, explanation: note ?? null, due_at: dueAt,
  });
  if (error) return { status: 'error', message: error.code === 'P0001' ? error.message : 'Could not save the action. Refresh and try again.' };
  revalidatePath(entity === 'lead' ? `/hot-leads/${id}` : `/deals/${id}`);
  for (const path of ['/dashboard', '/hot-leads', '/deals', '/admin', '/admin/processing', '/performance']) revalidatePath(path);
  return { status: 'success', message: 'Saved.' };
}

const bulkOperation = z.enum(['archive', 'delete', 'restore', 'reassign']);
export type BulkResult = SalesResult & {
  preview?: { operation: string; rows: { id: string; business_name: string; reason: string | null }[] };
};

export async function manageSalesLeads(_: BulkResult, form: FormData): Promise<BulkResult> {
  return manageSalesRecords(form, 'lead');
}

export async function manageSalesDeals(_: BulkResult, form: FormData): Promise<BulkResult> {
  return manageSalesRecords(form, 'deal');
}

async function manageSalesRecords(form: FormData, entity: 'lead' | 'deal'): Promise<BulkResult> {
  await requireRole(['admin']);
  const parsed = z.object({
    ids: z.array(z.guid()).min(1).max(100),
    operation: bulkOperation,
    mode: z.enum(['preview', 'apply']),
    target: z.guid().optional(),
  }).safeParse({
    ids: form.getAll('lead_ids'), operation: form.get('operation'),
    mode: form.get('mode'), target: form.get('target') || undefined,
  });
  if (!parsed.success || (entity === 'deal' && parsed.data.operation === 'reassign')) {
    return { status: 'error', message: `Choose ${entity}s and an action.` };
  }
  const { ids, operation, mode, target } = parsed.data;
  const supabase = await createClient();
  const recordIds = [...new Set(ids.map(id => id.toLowerCase()))];
  if (mode === 'preview') {
    const { data, error } = entity === 'lead'
      ? await supabase.rpc('crm_sales_lead_eligibility', { lead_ids: recordIds, operation })
      : await supabase.rpc('crm_deal_cleanup_eligibility', { deal_ids: recordIds, operation });
    if (error) return { status: 'error', message: `Could not check the selected ${entity}s.` };
    return { status: 'idle', preview: { operation, rows: data } };
  }
  if (operation === 'reassign' && !target) return { status: 'error', message: 'Choose an active sales rep.' };
  const { data, error } = entity === 'lead'
    ? await supabase.rpc('crm_sales_manage_leads', { lead_ids: recordIds, operation, target_rep: target ?? null })
    : await supabase.rpc('crm_manage_deal_cleanup', { deal_ids: recordIds, operation });
  if (error) return { status: 'error', message: error.code === 'P0001' ? error.message : `The action could not be completed. No selected ${entity}s were changed.` };
  for (const path of ['/dashboard', '/hot-leads', '/deals', '/admin', '/admin/pipeline', '/admin/processing', '/performance']) revalidatePath(path);
  const verb = { archive: 'archived', delete: 'deleted', restore: 'restored', reassign: 'reassigned' }[operation];
  return { status: 'success', message: `${data} ${entity}${data === 1 ? '' : 's'} ${verb}.` };
}
