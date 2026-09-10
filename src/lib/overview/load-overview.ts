import type { OverviewDashboardModel } from "@/lib/overview/types";
import { DEFAULT_FILTERS } from "@/lib/store/dimensions";
import { resolveMockSeed } from "@/lib/store/mock";
import { selectOverviewModel } from "@/lib/store/selectors";

/**
 * Compose Overview from the email-keyed mock seed. Demo stage — replace when the backend lands.
 */
export async function loadOverviewDashboard(input: {
  organizationId: string;
  userName: string;
  email: string;
  teamKey?: string | null;
  sprintId?: string | null;
}): Promise<OverviewDashboardModel> {
  void input.organizationId;
  const seed = resolveMockSeed({ email: input.email });
  const greetingName = input.userName.split(" ")[0] || input.userName;
  return selectOverviewModel({
    data: {
      ...seed,
      user: {
        ...seed.user,
        name: input.userName,
        greetingName,
      },
    },
    filters: {
      ...DEFAULT_FILTERS,
      team: input.teamKey ?? null,
      sprint: input.sprintId ?? null,
    },
    status: "ready",
    error: null,
  });
}
