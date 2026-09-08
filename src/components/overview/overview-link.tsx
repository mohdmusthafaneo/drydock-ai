"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { withOverviewContext } from "@/lib/overview/nav-context";
import { MOCK_DEFAULT_SPRINT_ID } from "@/lib/store/mock/dimensions";
import { useAppData, useFilters } from "@/lib/store";

/** Link that carries Overview `team` / `sprint` query params to destinations. */
export function OverviewLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const searchParams = useSearchParams();
  const filters = useFilters();
  const sprints = useAppData((s) => s.data.dimensions.sprints);

  const sprintFromUrl = searchParams.get("sprint");
  const teamFromUrl = searchParams.get("team");
  const effectiveSprint =
    sprintFromUrl ??
    filters.sprint ??
    sprints.find((s) => s.id === MOCK_DEFAULT_SPRINT_ID)?.id ??
    sprints[0]?.id ??
    null;

  const resolved = withOverviewContext(href, {
    team: teamFromUrl ?? filters.team,
    sprint: effectiveSprint,
  });
  return <Link href={resolved} {...props} />;
}
