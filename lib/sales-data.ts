import { createClient } from '@/lib/supabase/server';
import { readPages } from '@/lib/supabase/read-pages';
import type { SalesDeal, SalesEvent, SalesLead } from '@/lib/sales-report';

export async function readSalesData() {
  const supabase = await createClient();
  const [leads, deals, events, links, ledger, profiles] = await Promise.all([
    readPages<SalesLead>((from,to) => supabase.from('hot_leads')
      .select('id,business_name,assigned_rep_id,owner_profile_id,sales_source,sales_stage,sales_test,sales_lost,sales_review,archived_at,converted_at,next_follow_up_date,last_contact_date').order('id').range(from,to)),
    readPages<SalesDeal>((from,to) => supabase.from('crm_sales_deal_queue').select('*').order('id').range(from,to)),
    readPages<SalesEvent>((from,to) => supabase.from('crm_sales_events')
      .select('id,lead_id,deal_id,kind,occurred_at,origin_id,assigned_id,closer_id,processor_id,stage,reason,date_only')
      .neq('kind','task_scheduled').order('id').range(from,to)),
    readPages<{ hot_lead_id: string; deal_id: string }>((from,to) => supabase.from('activities').select('hot_lead_id,deal_id')
      .eq('activity_type','hot_lead_converted').not('hot_lead_id','is',null).not('deal_id','is',null).order('id').range(from,to)),
    readPages<{ id: string; deal_id: string; rep_id: string; recognized_at: string | null; commission_amount: number }>((from,to) =>
      supabase.from('commissions').select('id,deal_id,rep_id,recognized_at,commission_amount').order('id').range(from,to)),
    readPages<{ id: string; full_name: string; role: string; is_active: boolean }>((from,to) =>
      supabase.from('profiles').select('id,full_name,role,is_active').order('id').range(from,to)),
  ]);
  return { leads, deals, events, links, ledger, profiles };
}
