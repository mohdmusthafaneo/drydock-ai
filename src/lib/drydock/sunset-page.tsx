import { redirect } from "next/navigation";

/** Sunsetted AIDOS surface — DryDock keeps Briefing as home. */
export default function SunsettedPage() {
  redirect("/briefing");
}
