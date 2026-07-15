"use client";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  ChevronDown,
  Loader2,
  Settings,
  XCircle,
} from "lucide-react";
import { useState } from "react";

export type ToolPart = {
  type: string;
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  toolCallId?: string;
  errorText?: string;
};

export type ToolProps = {
  toolPart: ToolPart;
  defaultOpen?: boolean;
  className?: string;
};

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

const Tool = ({ toolPart, defaultOpen = false, className }: ToolProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const { state, input, output, toolCallId } = toolPart;

  const getStateIcon = () => {
    switch (state) {
      case "input-streaming":
        return <Loader2 className="h-4 w-4 animate-spin text-chart-blue" />;
      case "input-available":
        return <Settings className="h-4 w-4 text-rust" />;
      case "output-available":
        return <CheckCircle className="h-4 w-4 text-ink" />;
      case "output-error":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Settings className="h-4 w-4 text-graphite" />;
    }
  };

  const getStateBadge = () => {
    const baseClasses = "rounded-full px-2 py-0.5 text-xs font-medium";
    switch (state) {
      case "input-streaming":
        return (
          <span className={cn(baseClasses, "bg-sky-wash text-chart-blue")}>
            Processing
          </span>
        );
      case "input-available":
        return (
          <span className={cn(baseClasses, "bg-apricot-wash text-rust")}>
            Ready
          </span>
        );
      case "output-available":
        return (
          <span className={cn(baseClasses, "bg-fog text-graphite")}>
            Completed
          </span>
        );
      case "output-error":
        return (
          <span className={cn(baseClasses, "bg-destructive/10 text-destructive")}>
            Error
          </span>
        );
      default:
        return (
          <span className={cn(baseClasses, "bg-fog text-graphite")}>Pending</span>
        );
    }
  };

  return (
    <div
      className={cn(
        "border-border-subtle mt-2 overflow-hidden rounded-lg border",
        className,
      )}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="h-auto w-full justify-between rounded-b-none bg-elevated px-3 py-2 font-normal hover:bg-fog"
          >
            <div className="flex min-w-0 items-center gap-2">
              {getStateIcon()}
              <span className="truncate font-mono text-sm font-medium text-ink">
                {toolPart.type}
              </span>
              {getStateBadge()}
            </div>
            <ChevronDown className={cn("h-4 w-4 shrink-0", isOpen && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden border-t border-border-subtle">
          <div className="space-y-3 bg-elevated p-3">
            {input && Object.keys(input).length > 0 ? (
              <div>
                <h4 className="mb-2 text-sm font-medium text-graphite">Input</h4>
                <div className="rounded border border-border-subtle bg-fog p-2 font-mono text-sm">
                  {Object.entries(input).map(([key, value]) => (
                    <div key={key} className="mb-1 last:mb-0">
                      <span className="text-graphite">{key}:</span>{" "}
                      <span className="text-ink">{formatValue(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {output ? (
              <div>
                <h4 className="mb-2 text-sm font-medium text-graphite">Output</h4>
                <div className="max-h-60 overflow-auto rounded border border-border-subtle bg-fog p-2 font-mono text-sm">
                  <pre className="whitespace-pre-wrap text-ink">
                    {formatValue(output)}
                  </pre>
                </div>
              </div>
            ) : null}

            {state === "output-error" && toolPart.errorText ? (
              <div>
                <h4 className="mb-2 text-sm font-medium text-destructive">Error</h4>
                <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
                  {toolPart.errorText}
                </div>
              </div>
            ) : null}

            {state === "input-streaming" ? (
              <div className="text-sm text-graphite">Running tool…</div>
            ) : null}

            {toolCallId ? (
              <div className="border-t border-border-subtle pt-2 text-xs text-graphite">
                <span className="font-mono">Call ID: {toolCallId}</span>
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export { Tool };
