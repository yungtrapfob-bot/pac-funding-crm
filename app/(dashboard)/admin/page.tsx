import { requireRole } from '@/lib/auth';
import { SalesPerformance } from '@/components/sales/performance';

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<Record<string,string>> }) {
  await requireRole(['admin']);
  return <SalesPerformance admin filters={await searchParams} />;
}
