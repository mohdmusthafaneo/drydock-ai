import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-foreground hover:bg-accent-hover",
        brown:
          "bg-brown-button text-white hover:bg-brown-button/90",
        ink: "bg-ink text-pure-white hover:opacity-90",
        secondary:
          "bg-pure-white text-primary border border-border hover:bg-hover",
        outline:
          "bg-pure-white text-primary border border-border hover:bg-hover",
        ghost: "hover:bg-hover text-secondary hover:text-primary",
        link: "text-ink underline-offset-4 hover:underline",
        destructive: "bg-error text-white hover:opacity-90",
        ai: "bg-mvp text-white hover:opacity-90",
        enterprise: "bg-enterprise text-white hover:opacity-90",
        brand: "bg-brand text-brand-foreground hover:bg-brand-hover",
      },
      size: {
        default: "h-10 rounded-[9px] px-4 py-2",
        sm: "h-8 rounded-[8px] px-3 text-xs",
        lg: "h-11 rounded-[9px] px-5 text-[14px] font-semibold",
        icon: "h-10 w-10 rounded-[9px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { buttonVariants };
