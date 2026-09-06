import { cn } from "@/lib/utils";

type Props = {
  asOfLabel: string;
  repositoriesAnalyzed: number;
  runsAnalyzed: number;
  blindSpots?: string[];
  className?: string;
};

/** Plain data-honesty strip — staleness and partial syncs stated on the surface. */
export function HonestyBanner({
  asOfLabel,
  repositoriesAnalyzed,
  runsAnalyzed,
  blindSpots = [],
  className,
}: Props) {
  return (
    <div
      className={cn(
        "rounded-[16px] border border-dove/50 bg-pure-white/70 px-4 py-3 text-[13px] leading-relaxed text-graphite",
        className,
      )}
      role="status"
    >
      <p>
        Overnight analysis of {repositoriesAnalyzed} repositories and {runsAnalyzed}{" "}
        runs. As of {asOfLabel}.
      </p>
      {blindSpots.length > 0 ? (
        <p className="mt-1 text-ash">
          Incomplete data: {blindSpots.join("; ")}.
        </p>
      ) : null}
    </div>
  );
}
