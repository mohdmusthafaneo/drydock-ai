"use client";

import { CertificateView } from "@/components/drydock/certificate-view";
import { useAppData } from "@/lib/store";

export function CertificateFromStore() {
  const view = useAppData((s) => s.data.certificate);

  return <CertificateView view={view} />;
}
