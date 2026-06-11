"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function QueryPanelLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <Card className="border-dashed border-white/10">
      <CardContent className="py-10 text-center text-sm text-slate-500">
        {label}
      </CardContent>
    </Card>
  );
}

export function QueryPanelError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="border-red-500/20">
      <CardContent className="space-y-3 py-8 text-center">
        <p className="text-sm text-red-300">{message}</p>
        {onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
