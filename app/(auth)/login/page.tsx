import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LoginForm from './login-form';

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: role } = await supabase.rpc('crm_role');
    if (role === 'rep' || role === 'admin') redirect('/dashboard');
  }

  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center p-6">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
