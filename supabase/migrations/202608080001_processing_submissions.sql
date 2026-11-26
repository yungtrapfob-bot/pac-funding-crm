begin;

alter table public.funder_submission_configs
  add column if not exists portal_url text,
  add column if not exists verified_at timestamptz;
alter table public.funder_submission_logs add column if not exists review_note text;

revoke insert, update, delete on public.funder_submission_logs from public, anon, authenticated;

drop function if exists public.crm_complete_processing_submission(uuid,text);

create or replace function public.crm_complete_processing_submission(log_id uuid, evidence_id text, actor_id uuid, actor_session_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  entry public.funder_submission_logs%rowtype;
begin
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',actor_id,'session_id',actor_session_id)::text,true);
  if public.crm_role() is distinct from 'admin' then raise exception 'Admin access required.'; end if;
  if evidence_id is null or evidence_id !~ '^[a-zA-Z0-9_-]{1,160}$' then
    raise exception 'Submission evidence is required.';
  end if;
  select * into entry from public.funder_submission_logs where id=log_id for update;
  if not found then raise exception 'Submission is unavailable.'; end if;
  if entry.status='sent' and entry.provider_message_id=evidence_id then return; end if;
  if entry.status<>'sending' then raise exception 'Submission is not awaiting confirmation.'; end if;
  perform public.crm_record_sales_action('deal',entry.deal_id,'submitted',entry.funder_name);
  update public.funder_submission_logs
    set status='sent',provider_message_id=evidence_id,submitted_at=now(),updated_at=now(),error_details=null
    where id=log_id;
end;
$$;
revoke all on function public.crm_complete_processing_submission(uuid,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.crm_complete_processing_submission(uuid,text,uuid,uuid) to service_role;

commit;
