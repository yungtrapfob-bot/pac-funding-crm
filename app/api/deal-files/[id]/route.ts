import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return new Response(null, { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });

  // This query runs with the request session and enforces active-account and deal RLS.
  const { data: file, error } = await supabase.from('deal_files')
    .select('deal_id,path').eq('id', id.data).maybeSingle();
  if (error || !file) return new Response(null, { status: 404 });
  const [directory, ...nameParts] = file.path.split('/');
  if (directory !== file.deal_id || nameParts.length !== 1 || !nameParts[0]) {
    return new Response(null, { status: 404 });
  }

  const { data: object, error: downloadError } = await createAdminClient().storage
    .from('deal-files').download(file.path);
  if (downloadError || !object) return new Response(null, { status: 404 });
  const filename = nameParts[0].replace(/[^a-zA-Z0-9._-]/g, '_');
  return new Response(object, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
