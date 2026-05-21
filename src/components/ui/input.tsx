import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-sm font-medium text-secondary", className)}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        className,
      )}
      {...props}
    />
  );
}
