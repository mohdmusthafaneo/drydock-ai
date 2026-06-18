import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium",
  {
    variants: {
      variant: {
        default: "bg-sky-wash text-ink",
        success: "bg-success-muted text-success",
        warning: "bg-apricot-wash text-rust",
        error: "bg-error-muted text-error",
        ai: "bg-apricot-wash/80 text-rust",
        muted: "bg-fog text-graphite",
        accent: "bg-apricot-wash text-rust",
        brand: "bg-sky-wash text-ink",
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
