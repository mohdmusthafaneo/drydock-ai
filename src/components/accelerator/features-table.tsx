import type { AcceleratorFeature, JiraEpic, RoadmapPhase } from "@/lib/mvp-accelerator";
import { Badge } from "@/components/ui/badge";

export function FeaturesTable({ features }: { features: AcceleratorFeature[] }) {
  if (features.length === 0) {
    return <p className="text-sm text-slate-500">No features generated yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/8">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#131A2A] text-slate-400">
          <tr>
            <th className="px-4 py-2">ID</th>
            <th className="px-4 py-2">Feature</th>
            <th className="px-4 py-2">Priority</th>
            <th className="px-4 py-2">Effort</th>
          </tr>
        </thead>
        <tbody>
          {features.map((f) => (
            <tr key={f.id} className="border-t border-white/8">
              <td className="px-4 py-2 font-mono text-[#93b4ff]">{f.id}</td>
              <td className="px-4 py-2">
                <p className="font-medium">{f.name}</p>
                <p className="text-xs text-slate-500">{f.description}</p>
              </td>
              <td className="px-4 py-2">
                <Badge variant={f.priority === "P0" ? "warning" : "muted"}>{f.priority}</Badge>
              </td>
              <td className="px-4 py-2">{f.effort}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function JiraEpicsList({ epics }: { epics: JiraEpic[] }) {
  if (epics.length === 0) {
    return <p className="text-sm text-slate-500">No Jira epics generated yet.</p>;
  }

  return (
    <div className="space-y-4">
      {epics.map((epic) => (
        <div key={epic.key} className="rounded-xl border border-white/8 bg-[#131A2A]/60 p-4">
          <p className="font-mono text-sm text-[#93b4ff]">{epic.key}</p>
          <p className="font-medium">{epic.title}</p>
          <p className="mt-1 text-sm text-slate-400">{epic.description}</p>
          <ul className="mt-2 list-inside list-disc text-xs text-slate-500">
            {epic.stories.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function RoadmapList({ phases }: { phases: RoadmapPhase[] }) {
  if (phases.length === 0) {
    return <p className="text-sm text-slate-500">No roadmap generated yet.</p>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {phases.map((phase) => (
        <div key={phase.phase} className="rounded-xl border border-[#8B5CF6]/30 bg-[#8B5CF6]/5 p-4">
          <p className="font-medium text-[#c4b5fd]">{phase.phase}</p>
          <p className="text-xs text-slate-500">{phase.duration}</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {phase.goals.map((g) => (
              <li key={g}>• {g}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
