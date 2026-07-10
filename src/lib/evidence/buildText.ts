import { redactSecrets } from "./redactSecrets";
import type { EvidenceCommit, EvidenceTicket } from "./types";

export function buildTicketEmbedText(ticket: EvidenceTicket): string {
  const summary = ticket.summary ?? "";
  const desc = redactSecrets(ticket.descriptionText).slice(0, 1500);
  return `Summary: ${summary}\nDescription: ${desc}`.trim();
}

export function buildCommitEmbedText(commit: EvidenceCommit): string {
  if (commit.codeText?.trim()) return commit.codeText.trim();

  const parts: string[] = [];
  parts.push(`Subject: ${commit.subject ?? ""}`);
  if (commit.body) {
    parts.push(`Body: ${commit.body.slice(0, 800)}`);
  }
  if (commit.hunkSnippet) {
    const hunkLines: string[] = [];
    for (const line of commit.hunkSnippet.split("\n")) {
      if (
        (line.startsWith("+") || line.startsWith("-")) &&
        !line.startsWith("+++") &&
        !line.startsWith("---")
      ) {
        hunkLines.push(line);
        if (hunkLines.length > 40) break;
      }
    }
    if (hunkLines.length) {
      parts.push(`Changes:\n${hunkLines.join("\n")}`);
    }
  }
  if (commit.filesTouched?.length) {
    parts.push(`Files: ${[...new Set(commit.filesTouched)].sort().join(", ")}`);
  }
  if (commit.funcSignatures?.length) {
    parts.push(`Functions: ${commit.funcSignatures.slice(0, 8).join(", ")}`);
  }
  return parts.join("\n");
}
