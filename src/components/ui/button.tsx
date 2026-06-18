import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-foreground hover:bg-accent-hover",
        ink: "bg-ink text-pure-white hover:opacity-90",
        secondary:
          "bg-surface text-primary border border-border hover:bg-hover",
        ghost: "hover:bg-hover text-secondary hover:text-primary",
        link: "text-ink underline-offset-4 hover:underline",
        destructive: "bg-error text-white hover:opacity-90",
        ai: "bg-mvp text-white hover:opacity-90",
        enterprise: "bg-enterprise text-white hover:opacity-90",
        brand: "bg-brand text-brand-foreground hover:bg-brand-hover",
      },
      size: {
        default: "h-10 rounded-lg px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-full px-6 text-[15px] font-medium",
        icon: "h-10 w-10 rounded-lg",
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
