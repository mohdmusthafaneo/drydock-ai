"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Progressive disclosure for credential-heavy connectors.
 * Collapsed by default: outcome copy + one Configure CTA.
 * Expanded: reveals the existing panel form.
 */
export function ConnectorConfigureDisclosure({
  summary,
  configureLabel = "Configure",
  defaultOpen = false,
  children,
}: {
  summary: string;
  configureLabel?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (open) {
    return (
      <div className="space-y-3">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-auto px-0 text-xs text-muted hover:bg-transparent hover:text-secondary"
          onClick={() => setOpen(false)}
        >
          Hide configuration
          <ChevronUp className="ml-1 h-3.5 w-3.5" />
        </Button>
        {children}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{summary}</p>
      <Button type="button" size="sm" variant="brand" onClick={() => setOpen(true)}>
        {configureLabel}
        <ChevronDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
