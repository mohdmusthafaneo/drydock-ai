import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 pb-8 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-display text-[44px] leading-[1.1] tracking-[-0.66px] text-ink">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[16px] leading-relaxed text-ash">{description}</p>
        )}
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-3">{children}</div>}
    </div>
  );
}
