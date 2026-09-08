import { CertificateFromStore } from "@/components/drydock/certificate-from-store";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function CertificatePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <CertificateFromStore />;
}
