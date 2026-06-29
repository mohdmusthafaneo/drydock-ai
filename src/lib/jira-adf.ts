/** Convert Atlassian Document Format (ADF) to plain text for LLM prompts. */
export function adfToPlainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const doc = node as {
    type?: string;
    text?: string;
    content?: unknown[];
  };

  if (doc.type === "text" && typeof doc.text === "string") {
    return doc.text;
  }

  if (!Array.isArray(doc.content)) return "";

  const parts = doc.content.map((child) => adfToPlainText(child));
  if (doc.type === "paragraph" || doc.type === "heading") {
    return `${parts.join("")}\n`;
  }
  if (doc.type === "bulletList" || doc.type === "orderedList") {
    return parts.join("");
  }
  if (doc.type === "listItem") {
    return `• ${parts.join("")}\n`;
  }
  return parts.join("");
}

export function normalizeJiraDescription(description: unknown): string {
  if (!description) return "";
  if (typeof description === "string") return description.trim();
  return adfToPlainText(description).trim();
}
