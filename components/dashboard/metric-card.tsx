import { Card } from '@/components/ui/card';
import Link from 'next/link';

export function MetricCard({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const content = (
    <Card className={href ? 'transition hover:border-primary/50 hover:bg-muted/20' : ''}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {href ? <p className="mt-1 text-xs text-primary">Click to view deals</p> : null}
    </Card>
  );

  if (!href) return content;

  return (
    <Link href={href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {content}
    </Link>
  );
}
