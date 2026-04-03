import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();

  // TODO(email-provider): replace console stub with provider integration
  // Send deal submission notification to processing@paragonaltcap.com
  console.info('Stub processing notification', {
    dealId: body.dealId,
    to: 'processing@paragonaltcap.com'
  });

  return NextResponse.json({ ok: true });
}
