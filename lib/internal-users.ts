import { createAdminClient } from '@/lib/supabase/admin';

export type InternalUserProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  created_at: string;
};

const INTERNAL_ROLES = new Set(['admin', 'rep']);

export async function getInternalUserProfiles(): Promise<InternalUserProfile[]> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('profiles')
    .select('id,full_name,email,role,created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Unable to load internal user profiles: ${error.message}`);
  }

  return (data ?? []).filter((profile) => INTERNAL_ROLES.has(String(profile.role ?? '').trim().toLowerCase()));
}
