import { cn } from "@/lib/utils";

export function AidosLogo({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/aidos-logo.svg"
      alt="DryDock"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
    />
  );
}
