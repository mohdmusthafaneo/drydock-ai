"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DataRefreshButtonProps = {
  onRefresh: () => void;
  isFetching: boolean;
  dataUpdatedAt?: number;
  className?: string;
};

export function DataRefreshButton({
  onRefresh,
  isFetching,
  dataUpdatedAt,
  className,
}: DataRefreshButtonProps) {
  const updatedLabel = dataUpdatedAt
    ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString()}`
    : null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {updatedLabel && (
        <span className="text-xs text-slate-500">{updatedLabel}</span>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onRefresh}
        disabled={isFetching}
        className="gap-1.5"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        Refresh
      </Button>
    </div>
  );
}
