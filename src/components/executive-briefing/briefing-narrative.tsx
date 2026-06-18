import { cn } from "@/lib/utils";

type Props = {
  narrative: string;
  healthLabel?: string | null;
  className?: string;
};

export function BriefingNarrative({ narrative, healthLabel, className }: Props) {
  return (
    <div className={cn("space-y-5", className)}>
      {healthLabel && (
        <p className="text-[15px] font-medium text-rust">{healthLabel}</p>
      )}
      <p className="max-w-prose text-[22px] leading-[1.35] tracking-[-0.2px] text-ink lg:text-[26px] lg:leading-[1.25] lg:tracking-[-0.23px]">
        {narrative}
      </p>
    </div>
  );
}
