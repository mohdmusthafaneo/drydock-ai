import type { AcceleratorFeature, JiraEpic, RoadmapPhase } from "@/lib/mvp-accelerator";
import { Badge } from "@/components/ui/badge";

export function FeaturesTable({ features }: { features: AcceleratorFeature[] }) {
  if (features.length === 0) {
    return <p className="text-sm text-graphite">No features generated yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-3xl border border-dove/50 bg-pure-white shadow-[var(--shadow-subtle)]">
      <table className="w-full text-left text-sm">
        <thead className="bg-fog text-graphite">
          <tr>
            <th className="px-4 py-2 font-medium">ID</th>
            <th className="px-4 py-2 font-medium">Feature</th>
            <th className="px-4 py-2 font-medium">Priority</th>
            <th className="px-4 py-2 font-medium">Effort</th>
          </tr>
        </thead>
        <tbody>
          {features.map((f) => (
            <tr key={f.id} className="border-t border-dove/40">
              <td className="px-4 py-2 font-mono text-chart-blue">{f.id}</td>
              <td className="px-4 py-2">
                <p className="font-medium text-ink">{f.name}</p>
                <p className="text-xs text-graphite">{f.description}</p>
              </td>
              <td className="px-4 py-2">
                <Badge variant={f.priority === "P0" ? "warning" : "muted"}>{f.priority}</Badge>
              </td>
              <td className="px-4 py-2 text-ash">{f.effort}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function JiraEpicsList({ epics }: { epics: JiraEpic[] }) {
  if (epics.length === 0) {
    return <p className="text-sm text-graphite">No Jira epics generated yet.</p>;
  }

  return (
    <div className="space-y-4">
      {epics.map((epic) => (
        <div key={epic.key} className="rounded-3xl border border-dove/50 bg-fog/60 p-4">
          <p className="font-mono text-sm text-chart-blue">{epic.key}</p>
          <p className="font-medium text-ink">{epic.title}</p>
          <p className="mt-1 text-sm text-graphite">{epic.description}</p>
          <ul className="mt-2 list-inside list-disc text-xs text-ash">
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
    return <p className="text-sm text-graphite">No roadmap generated yet.</p>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {phases.map((phase) => (
        <div key={phase.phase} className="rounded-3xl border border-rust/20 bg-apricot-wash/40 p-4">
          <p className="font-medium text-rust">{phase.phase}</p>
          <p className="text-xs text-graphite">{phase.duration}</p>
          <ul className="mt-2 space-y-1 text-sm text-ash">
            {phase.goals.map((g) => (
              <li key={g}>• {g}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
