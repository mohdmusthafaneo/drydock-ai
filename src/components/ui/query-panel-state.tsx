"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function QueryPanelLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <Card className="border-dashed border-dove/60">
      <CardContent className="py-10 text-center text-sm text-graphite">
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
    <Card className="border-error/30">
      <CardContent className="space-y-3 py-8 text-center">
        <p className="text-sm text-error">{message}</p>
        {onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
