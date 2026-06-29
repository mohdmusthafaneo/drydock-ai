import { ExternalLink } from "lucide-react";

type Props = {
  href?: string;
  label?: string;
  className?: string;
};

export function JiraIssueLink({
  href,
  label = "View in Jira",
  className = "mt-2 inline-flex items-center gap-1 text-xs text-brand hover:underline",
}: Props) {
  if (!href) return null;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
