import { cn } from '@/lib/utils';

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  return (
    <button
      className={cn('inline-flex h-9 items-center justify-center rounded-md border border-border bg-muted px-3 text-sm font-medium text-foreground transition duration-120 ease-out hover:border-primary/50 hover:bg-card disabled:opacity-50', className)}
      {...rest}
    />
  );
}
