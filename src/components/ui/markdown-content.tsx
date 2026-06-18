import ReactMarkdown from "react-markdown";

/** Split inline " - item" sequences onto separate lines for list rendering. */
function normalizeInlineMarkdownLists(text: string): string {
  return text
    .replace(/:\*\* - \*\*/g, ":**\n\n- **")
    .replace(/ - \*\*/g, "\n- **")
    .replace(/ - (?=[A-Za-z])/g, "\n- ");
}

type MarkdownContentProps = {
  content: string;
  className?: string;
  normalizeInlineLists?: boolean;
};

export function MarkdownContent({
  content,
  className = "",
  normalizeInlineLists = false,
}: MarkdownContentProps) {
  const source = normalizeInlineLists ? normalizeInlineMarkdownLists(content) : content;

  return (
    <div className={`markdown-content space-y-2 ${className}`.trim()}>
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p className="leading-relaxed text-inherit last:mb-0">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-inherit">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-inherit">{children}</em>,
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-5 text-inherit">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-5 text-inherit">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed text-inherit">{children}</li>,
          code: ({ children }) => (
            <code className="rounded bg-fog px-1 py-0.5 font-mono text-[0.9em] text-inherit">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-xl bg-fog p-3 font-mono text-xs text-inherit">
              {children}
            </pre>
          ),
          h1: ({ children }) => (
            <h1 className="text-base font-semibold text-inherit">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-semibold text-inherit">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-medium text-inherit">{children}</h3>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-brand underline-offset-2 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
