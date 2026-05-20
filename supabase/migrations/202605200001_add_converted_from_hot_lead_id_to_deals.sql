alter table public.deals
  add column if not exists converted_from_hot_lead_id uuid references public.hot_leads(id);

create index if not exists deals_converted_from_hot_lead_id_idx
  on public.deals (converted_from_hot_lead_id);
