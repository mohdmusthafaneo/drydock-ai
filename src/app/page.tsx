import { redirect } from "next/navigation";
import { getLandingPathForOrganization } from "@/lib/landing-path-org";
import { getSession } from "@/lib/session";

export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(await getLandingPathForOrganization(session.organizationId));
}
