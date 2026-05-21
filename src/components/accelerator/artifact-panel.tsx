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
      <div className="rounded-xl border border-white/8 bg-[#1B2435] p-6 text-sm text-slate-500">
        {emptyMessage ?? `No ${title} yet. Generate the MVP package to populate this section.`}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/8 bg-[#1B2435]">
      <div className="border-b border-white/8 px-6 py-3">
        <h2 className="font-semibold">{title}</h2>
      </div>
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap p-6 font-mono text-xs leading-relaxed text-slate-300">
        {content}
      </pre>
    </div>
  );
}
