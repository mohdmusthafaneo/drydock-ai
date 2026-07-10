import { getCacheClient } from "@/lib/cache";

/** Pub/sub channel for agent-chat SSE wake across web replicas. */
export function agentChatSseChannel(threadId: string): string {
  return `sse:agent-chat:${threadId}`;
}

/** Notify SSE listeners on other replicas that new chunks may be available. */
export async function publishAgentChatWake(threadId: string): Promise<void> {
  await getCacheClient().publish(agentChatSseChannel(threadId), "1");
}

/**
 * Wait until a wake message arrives or `timeoutMs` elapses.
 * Falls back to timeout when Valkey is unset (memory pub/sub is same-process only).
 */
export async function waitForAgentChatWake(
  threadId: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;

  const cache = getCacheClient();
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      void unsub?.();
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };

    const onAbort = () => done();
    signal?.addEventListener("abort", onAbort, { once: true });

    let unsub: (() => Promise<void>) | undefined;
    void cache
      .subscribe(agentChatSseChannel(threadId), () => done())
      .then((u) => {
        unsub = u;
      })
      .catch(() => done());

    const timer = setTimeout(done, timeoutMs);
  });
}
