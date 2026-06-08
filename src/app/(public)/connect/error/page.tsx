import { AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { providerLabel, resolveConnectError } from "@/lib/connect-errors";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ConnectErrorPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const code = firstParam(sp.code);
  const provider = firstParam(sp.provider);
  const error = resolveConnectError(code);
  const label = providerLabel(provider);

  const message =
    code === "already_connected"
      ? `${label} is already connected for this organization.`
      : error.message;

  return (
    <Card className="border-warning/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-warning" />
          <CardTitle className="text-lg">{error.title}</CardTitle>
        </div>
        <CardDescription>{label} setup could not be completed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-secondary">{message}</p>
        <p className="text-sm font-medium text-primary">{error.action}</p>
      </CardContent>
    </Card>
  );
}
