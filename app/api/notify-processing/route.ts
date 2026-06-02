import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileError) {
    return NextResponse.json({ error: 'Unable to verify processing access.' }, { status: 500 });
  }
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Processing notifications are admin-only.' }, { status: 403 });
  }

  const body = await request.json();

  // TODO(email-provider): replace console stub with provider integration
  // Send deal submission notification to processing@paragonaltcap.com
  console.info('Stub processing notification', {
    dealId: body.dealId,
    to: 'processing@paragonaltcap.com'
  });

  return NextResponse.json({ ok: true });
}
