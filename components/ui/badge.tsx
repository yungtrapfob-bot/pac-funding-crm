import { cn } from '@/lib/utils';

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('inline-flex items-center rounded-sm border border-border px-2 py-0.5 tracked-label text-muted-foreground', className)} {...props} />;
}
