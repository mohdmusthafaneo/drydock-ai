import { redirect } from "next/navigation";

/** AIDOS executive dashboard — redirected to DryDock Briefing. */
export default function EnterpriseDashboardPage() {
  redirect("/briefing");
}
