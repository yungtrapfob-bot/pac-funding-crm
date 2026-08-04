import { cn } from '@/lib/utils';

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  return (
    <button
      className={cn('inline-flex h-9 items-center justify-center rounded-md border border-primary bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition duration-120 ease-out hover:border-emerald-700 hover:bg-emerald-700 disabled:opacity-50', className)}
      {...rest}
    />
  );
}
