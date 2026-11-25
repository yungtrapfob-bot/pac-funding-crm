import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { SalesPerformance } from '@/components/sales/performance';

export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string,string>> }) {
  const { profile } = await requireUser();
  if (profile.role === 'admin') redirect('/admin');
  return <SalesPerformance filters={await searchParams} />;
}
