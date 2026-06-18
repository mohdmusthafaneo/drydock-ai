import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = {
  label: string;
  href: string;
  urgent?: boolean;
};

export function BriefingPrimaryCta({ label, href }: Props) {
  return (
    <Button asChild variant="ink" size="lg">
      <Link href={href}>{label}</Link>
    </Button>
  );
}
