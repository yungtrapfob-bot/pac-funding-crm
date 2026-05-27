import { Card } from '@/components/ui/card';
import Link from 'next/link';

export function MetricCard({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const content = <Card className={`border-border bg-card ${href ? 'transition duration-120 ease-out hover:border-primary/50 hover:bg-muted/40' : ''}`}><p className="tracked-label text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold tabular">{value}</p>{href ? <p className="mt-2 text-xs text-muted-foreground">Open queue</p> : null}</Card>;
  if (!href) return content;
  return <Link href={href} className="block">{content}</Link>;
}
