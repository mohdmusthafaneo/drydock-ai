import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadCertificate } from "@/lib/drydock/certificate";
import { CertificateView } from "@/components/drydock/certificate-view";

export default async function CertificatePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const view = await loadCertificate(session.organizationId);
  return <CertificateView view={view} />;
}
