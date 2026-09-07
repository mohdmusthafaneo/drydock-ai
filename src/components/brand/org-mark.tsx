import { cn } from "@/lib/utils";

/** Orange ring circle mark for the tenant org in the product shell. */
export function OrgMark({
  className,
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
      data-slot="org-mark"
    >
      <circle cx="14" cy="14" r="12" stroke="#F4773D" strokeWidth="2.5" fill="none" />
      <circle cx="14" cy="14" r="5.5" fill="#F4773D" />
    </svg>
  );
}
