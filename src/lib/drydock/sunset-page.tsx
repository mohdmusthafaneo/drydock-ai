import { redirect } from "next/navigation";

/** Sunsetted AIDOS surface — DryDock keeps Overview as home. */
export default function SunsettedPage() {
  redirect("/dashboard");
}
