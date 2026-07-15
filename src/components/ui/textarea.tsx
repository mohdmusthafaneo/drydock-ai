import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[40px] w-full rounded-2xl border border-dove bg-pure-white px-3 py-2 text-sm text-ink shadow-none placeholder:text-graphite focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
