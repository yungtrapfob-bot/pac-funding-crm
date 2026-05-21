import { createClient } from '@supabase/supabase-js';
import { requiredPublicEnv, requiredServerEnv } from '@/lib/env';

export function createAdminClient() {
  return createClient(
    requiredPublicEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredServerEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}
