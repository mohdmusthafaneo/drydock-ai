import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  totalTests: number;
  trustedCount: number;
  untrustedCount: number;
  href?: string;
  className?: string;
};

/** Trust as a count, never a score. */
export function TrustCount({
  totalTests,
  trustedCount,
  untrustedCount,
  href = "/ledger",
  className,
}: Props) {
  const formatted = {
    total: totalTests.toLocaleString("en-US"),
    trusted: trustedCount.toLocaleString("en-US"),
    untrusted: untrustedCount.toLocaleString("en-US"),
  };

  return (
    <div className={cn("space-y-3", className)}>
      <p className="font-display text-[28px] leading-[1.15] tracking-[-0.4px] text-ink sm:text-[36px] sm:tracking-[-0.55px]">
        {formatted.total} tests.{" "}
        <span className="text-ink">{formatted.trusted} are giving you real signal.</span>{" "}
        <span className="text-rust">{formatted.untrusted} are not.</span>
      </p>
      <p className="text-[15px] text-ash">
        The deficit is the work queue.{" "}
        <Link
          href={href}
          className="font-medium text-ink underline decoration-dove underline-offset-4 hover:decoration-ink"
        >
          Open the Ledger
        </Link>
      </p>
    </div>
  );
}
