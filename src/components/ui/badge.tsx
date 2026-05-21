import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-enterprise-muted text-enterprise",
        success: "bg-success-muted text-success",
        warning: "bg-warning-muted text-warning",
        error: "bg-error-muted text-error",
        ai: "bg-mvp-muted text-mvp",
        muted: "bg-hover text-muted",
        accent: "bg-accent/15 text-accent",
        brand: "bg-brand-muted text-brand",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
