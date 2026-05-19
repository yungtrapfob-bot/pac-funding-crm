import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requiredPublicEnv } from '@/lib/env';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(requiredPublicEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Cookies can only be written in Server Actions / Route Handlers.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // Cookies can only be written in Server Actions / Route Handlers.
        }
      }
    }
  });
}
