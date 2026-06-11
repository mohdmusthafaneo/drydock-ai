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
  if (role === "coordinator") return "bg-mvp-muted text-mvp";
  if (role === "specialist") return "bg-brand/20 text-brand";
  return "bg-white/10 text-slate-300";
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
      <span className="text-xs text-slate-500">Participants</span>
      {participants.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#131A2A]/60 px-2.5 py-1"
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
          <span className="text-xs text-slate-300">{displayName(p)}</span>
          {p.role !== "human" && (
            <span className="text-[10px] text-slate-500">{roleLabel(p.role)}</span>
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
