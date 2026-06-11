import type { AgentChatThreadStatus } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<
  AgentChatThreadStatus,
  "success" | "warning" | "error" | "ai" | "muted" | "accent"
> = {
  open: "accent",
  routing: "ai",
  active: "success",
  awaiting_human: "warning",
  done: "muted",
  stalled: "error",
};

export function ThreadStatusBadge({
  status,
  className,
}: {
  status: AgentChatThreadStatus;
  className?: string;
}) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={cn("capitalize", className)}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
