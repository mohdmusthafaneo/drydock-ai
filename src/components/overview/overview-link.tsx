"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { withOverviewContext } from "@/lib/overview/nav-context";

/** Link that carries Overview `team` / `sprint` query params to destinations. */
export function OverviewLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const searchParams = useSearchParams();
  const resolved = withOverviewContext(href, {
    team: searchParams.get("team"),
    sprint: searchParams.get("sprint"),
  });
  return <Link href={resolved} {...props} />;
}
