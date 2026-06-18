import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = {
  label: string;
  href: string;
  urgent?: boolean;
};

export function BriefingPrimaryCta({ label, href, urgent = false }: Props) {
  return (
    <Button asChild variant={urgent ? "destructive" : "default"} size="lg">
      <Link href={href}>{label}</Link>
    </Button>
  );
}
