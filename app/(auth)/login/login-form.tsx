'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(searchParams.get('error'));
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const signInResult = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Sign-in request timed out. Please try again.')), 15000);
        })
      ]);
      const { error: signInError } = signInResult;

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.replace('/dashboard');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected sign-in error.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function sendMagicLink() {
    setError(null);
    setNotice(null);
    if (!email) {
      setError('Enter your email first to receive a magic link.');
      return;
    }

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`
      }
    });

    if (otpError) {
      setError(otpError.message);
      return;
    }

    setNotice('Magic link sent. Check your inbox and spam folder.');
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <Image
        src="/brand/paragon-wallpaper.svg"
        alt="Paragon Alternative Capital brand background"
        fill
        priority
        className="object-cover"
      />
      <div className="absolute inset-0 bg-slate-100/75 backdrop-blur-[1px]" aria-hidden="true" />
      <form onSubmit={onSubmit} className="relative z-10 w-full max-w-md space-y-4 rounded-2xl border border-border/90 bg-card/95 p-6 shadow-2xl">
        <div className="space-y-3 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/30 p-2">
              <Image
                src="/brand/paragon-logo.svg"
                alt="Paragon Alternative Capital"
                width={160}
                height={48}
                className="h-full w-full object-contain"
                priority
              />
            </div>
            <p className="text-sm font-semibold leading-tight text-foreground">Paragon Alternative Capital</p>
          </div>
          <div>
            <h1 className="text-xl font-semibold">Platform Login</h1>
            <p className="text-sm text-muted-foreground">Sign in to continue to the Paragon Funding CRM.</p>
          </div>
        </div>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" required />
        <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-emerald-700">{notice}</p>}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in...' : 'Sign In'}
        </Button>
        <Button type="button" className="w-full" onClick={sendMagicLink}>
          Send Magic Link
        </Button>
      </form>
    </div>
  );
}
