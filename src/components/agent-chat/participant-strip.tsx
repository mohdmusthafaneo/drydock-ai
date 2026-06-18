import { cn } from "@/lib/utils";
import type { AgentChatParticipantRole } from "@/generated/prisma/client";

export type ThreadParticipant = {
  id: string;
  role: AgentChatParticipantRole;
  agent: { id: string; displayName: string; agentType: string } | null;
  user: { id: string; name: string } | null;
};

function roleLabel(role: AgentChatParticipantRole): string {
  if (role === "coordinator") return "Coordinator";
  if (role === "specialist") return "Specialist";
  return "Human";
}

function avatarColor(role: AgentChatParticipantRole): string {
  if (role === "coordinator") return "bg-apricot-wash text-rust";
  if (role === "specialist") return "bg-sky-wash text-chart-blue";
  return "bg-fog text-ash";
}

function displayName(p: ThreadParticipant): string {
  if (p.role === "human") return p.user?.name ?? "Human";
  return p.agent?.displayName ?? "Agent";
}

export function ParticipantStrip({
  participants,
  className,
}: {
  participants: ThreadParticipant[];
  className?: string;
}) {
  if (participants.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-xs text-graphite">Participants</span>
      {participants.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-pure-white px-2.5 py-1 shadow-[var(--shadow-subtle)]"
          title={roleLabel(p.role)}
        >
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium",
              avatarColor(p.role),
            )}
          >
            {displayName(p).slice(0, 1).toUpperCase()}
          </span>
          <span className="text-xs text-ink">{displayName(p)}</span>
          {p.role !== "human" && (
            <span className="text-[10px] text-graphite">{roleLabel(p.role)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function invitedSpecialists(participants: ThreadParticipant[]) {
  return participants
    .filter((p) => p.role === "specialist" && p.agent)
    .map((p) => ({
      id: p.agent!.id,
      displayName: p.agent!.displayName,
    }));
}
