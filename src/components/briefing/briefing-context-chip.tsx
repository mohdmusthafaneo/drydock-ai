import Link from "next/link";

type Props = {
  from?: string | string[] | undefined;
};

/** Lightweight chip when a domain page was opened from a briefing claim. */
export function BriefingContextChip({ from }: Props) {
  const value = Array.isArray(from) ? from[0] : from;
  if (value !== "briefing") return null;

  return (
    <p className="text-[13px]">
      <Link
        href="/dashboard"
        className="font-medium text-graphite underline-offset-4 hover:text-ink hover:underline"
      >
        ← Back to briefing
      </Link>
    </p>
  );
}
