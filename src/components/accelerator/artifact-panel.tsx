export function ArtifactPanel({
  title,
  content,
  emptyMessage,
}: {
  title: string;
  content: string | null;
  emptyMessage?: string;
}) {
  if (!content) {
    return (
      <div className="rounded-3xl border border-dove/50 bg-fog p-6 text-sm text-graphite">
        {emptyMessage ?? `No ${title} yet. Generate the MVP package to populate this section.`}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-dove/50 bg-pure-white shadow-[var(--shadow-subtle)]">
      <div className="border-b border-dove/40 px-6 py-3">
        <h2 className="font-medium text-ink">{title}</h2>
      </div>
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap p-6 font-mono text-xs leading-relaxed text-ash">
        {content}
      </pre>
    </div>
  );
}
