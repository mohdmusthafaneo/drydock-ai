import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  href?: string;
  className?: string;
};

export function ScrollCue({ href = "#breakdown", className }: Props) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent",
        className,
      )}
    >
      More detail
      <ChevronDown className="h-4 w-4" aria-hidden />
    </Link>
  );
}
