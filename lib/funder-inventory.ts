import { createClient } from '@/lib/supabase/server';
import { readPages } from '@/lib/supabase/read-pages';
import { normalizeSubmissionMethod, type FunderMasterRecord } from '@/lib/funder-routing';

export const funderKey = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

type Master = FunderMasterRecord & { id: string };
type Config = {
  funder_key: string; submission_method: string; primary_submission_email: string | null;
  submission_cc: string | null; submission_bcc: string | null; subject_template: string;
  body_template: string; required_document_types: string[]; internal_submission_notes: string | null;
  is_active: boolean; portal_url: string | null; verified_at: string | null;
};

export async function readFunderInventory(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [master, configs] = await Promise.all([
    readPages<Master>((from,to) => supabase.from('funder_master').select('*').order('funder_name').order('id').range(from,to)),
    readPages<Config>((from,to) => supabase.from('funder_submission_configs').select('funder_key,submission_method,primary_submission_email,submission_cc,submission_bcc,subject_template,body_template,required_document_types,internal_submission_notes,is_active,portal_url,verified_at').order('funder_key').range(from,to)),
  ]);
  const configsByKey = new Map(configs.map(config => [config.funder_key, config]));
  const groups = new Map<string, number>();
  for (const row of master) {
    const key = funderKey(row.funder_name);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const funders = master.map(row => {
    const key = funderKey(row.funder_name);
    const ambiguous = groups.get(key) !== 1;
    const config = ambiguous ? undefined : configsByKey.get(key);
    return {
      ...row,
      ...config,
      id: row.id,
      funder_name: row.funder_name,
      key,
      configurationAmbiguous: ambiguous,
      submission_method: normalizeSubmissionMethod(config?.submission_method ?? row.submission_method),
      masterActive: row.is_active !== false,
      is_active: row.is_active !== false && config?.is_active !== false,
      verified_at: config?.verified_at ?? null,
      portal_url: config?.portal_url ?? null,
    };
  });
  return {
    funders,
    duplicateKeys: [...groups].filter(([, count]) => count > 1).map(([key]) => key),
    unmatchedConfigs: configs.filter(config => !groups.has(config.funder_key)).length,
  };
}
