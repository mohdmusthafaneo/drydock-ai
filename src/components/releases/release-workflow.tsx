import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReleaseStatus } from "@/generated/prisma/client";

const STEPS: { status: ReleaseStatus; label: string }[] = [
  { status: "DETECTED", label: "Release detected" },
  { status: "PENDING_APPROVAL", label: "Signals & assessment" },
  { status: "APPROVED", label: "Human approval" },
  { status: "DEPLOYED", label: "Controlled deploy" },
];

function stepIndex(status: ReleaseStatus): number {
  if (status === "DETECTED") return 0;
  if (status === "ASSESSED" || status === "PENDING_APPROVAL" || status === "BLOCKED")
    return 1;
  if (status === "APPROVED") return 2;
  if (status === "DEPLOYED") return 3;
  return 0;
}

export function ReleaseWorkflow({ status }: { status: ReleaseStatus }) {
  const current = stepIndex(status);

  return (
    <ol className="grid gap-2 sm:grid-cols-4">
      {STEPS.map((step, i) => {
        const done = i < current || status === "DEPLOYED";
        const active = i === current;
        return (
          <li
            key={step.status}
            className={cn(
              "flex items-center gap-2 rounded-[16px] border px-3 py-2 text-sm",
              done
                ? "border-success/20 bg-success-muted text-success"
                : active
                  ? "border-chart-blue/30 bg-sky-wash text-ink"
                  : "border-border-subtle bg-fog text-muted",
            )}
          >
            {done ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <Circle className="h-4 w-4 shrink-0" />
            )}
            <span>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
