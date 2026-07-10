import { readJsonField } from "@/lib/json-field";

export type ApprovalChatContext = {
  threadId?: string;
  messageId?: string;
};

export function mergeApprovalPayload(
  base: Record<string, unknown>,
  chat?: ApprovalChatContext,
): string {
  const merged = { ...base };
  if (chat?.threadId) merged.threadId = chat.threadId;
  if (chat?.messageId) merged.messageId = chat.messageId;
  return JSON.stringify(merged);
}

export function parseApprovalChatContext(
  payloadJson: unknown,
): ApprovalChatContext | null {
  const parsed = readJsonField<Record<string, unknown>>(payloadJson, {});
  const threadId =
    typeof parsed.threadId === "string" ? parsed.threadId : undefined;
  const messageId =
    typeof parsed.messageId === "string" ? parsed.messageId : undefined;
  if (!threadId && !messageId) return null;
  return { threadId, messageId };
}
