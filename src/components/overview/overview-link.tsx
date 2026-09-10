"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { withOverviewContext } from "@/lib/overview/nav-context";
import { useAppData, useFilters } from "@/lib/store";

/** Resolve a path with current Overview `team` / `sprint` query params. */
export function useOverviewNavHref() {
  const searchParams = useSearchParams();
  const filters = useFilters();
  const defaultSprintId = useAppData((s) => s.data.dimensions.defaultSprintId);
  const sprints = useAppData((s) => s.data.dimensions.sprints);

  const sprintFromUrl = searchParams.get("sprint");
  const teamFromUrl = searchParams.get("team");
  const effectiveSprint =
    sprintFromUrl ??
    filters.sprint ??
    sprints.find((s) => s.id === defaultSprintId)?.id ??
    sprints[0]?.id ??
    null;

  return (href: string) =>
    withOverviewContext(href, {
      team: teamFromUrl ?? filters.team,
      sprint: effectiveSprint,
    });
}

/** Link that carries Overview `team` / `sprint` query params to destinations. */
export function OverviewLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const resolveHref = useOverviewNavHref();
  return <Link href={resolveHref(href)} {...props} />;
}
