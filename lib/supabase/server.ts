import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requiredEnv } from '@/lib/env';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        cookieStore.set({ name, value, ...(options as object) });
      },
      remove(name: string, options: Record<string, unknown>) {
        cookieStore.set({ name, value: '', ...(options as object) });
      }
    }
  });
}
