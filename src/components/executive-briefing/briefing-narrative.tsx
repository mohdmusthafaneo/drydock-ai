import { cn } from "@/lib/utils";

type Props = {
  narrative: string;
  healthLabel?: string | null;
  className?: string;
};

export function BriefingNarrative({ narrative, healthLabel, className }: Props) {
  return (
    <div className={cn("space-y-4", className)}>
      {healthLabel && (
        <p className="text-sm font-medium text-accent">{healthLabel}</p>
      )}
      <p className="max-w-prose text-xl leading-relaxed text-primary lg:text-2xl">{narrative}</p>
    </div>
  );
}
