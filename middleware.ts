import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { requiredPublicEnv } from '@/lib/env';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(
    requiredPublicEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set({ name, value, ...options }));
        }
      }
    }
  );

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  const isAuthRoute = req.nextUrl.pathname.startsWith('/login');
  const isAppRoute = req.nextUrl.pathname.startsWith('/dashboard') || req.nextUrl.pathname.startsWith('/hot-leads') || req.nextUrl.pathname.startsWith('/deals') || req.nextUrl.pathname.startsWith('/commissions') || req.nextUrl.pathname.startsWith('/admin');

  // If middleware cannot confidently determine auth state (network, refresh, etc.),
  // do not force redirects that can create loops.
  if (userError) {
    return res;
  }

  if (!user && isAppRoute) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (user && (isAuthRoute || req.nextUrl.pathname.startsWith('/admin'))) {
    const { data: role } = await supabase.rpc('crm_role');
    if (isAuthRoute && role) return NextResponse.redirect(new URL('/dashboard', req.url));
    if (!isAuthRoute && role === 'rep') return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
