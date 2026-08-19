import Link from "next/link";
import { Button } from "@/components/ui/button";

const PROVIDER_LABELS: Record<string, string> = {
  github: "GitHub",
  github_app: "GitHub",
  jira: "Jira",
  grafana: "Grafana",
  prometheus: "Prometheus",
  aws: "Cloud Hygiene",
  slack: "Slack",
};

export function ConnectHandoffBanner({
  connected,
}: {
  connected?: string | null;
}) {
  const label = connected ? PROVIDER_LABELS[connected] ?? connected : undefined;

  return (
    <div
      className="rounded-[20px] border border-chart-blue/30 bg-sky-wash px-5 py-4"
      role="status"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[15px] font-medium text-ink">First snapshot in progress</p>
          <p className="mt-1 text-[14px] leading-relaxed text-ash">
            {label
              ? `${label} is connected. AIDOS is pulling read-only delivery signals. Open the briefing when you\u2019re ready; it improves as sync completes.`
              : "AIDOS is pulling read-only delivery signals. Open the briefing when you\u2019re ready; it improves as sync completes."}
          </p>
        </div>
        <Button asChild variant="ink" size="lg" className="shrink-0">
          <Link href="/dashboard">View briefing</Link>
        </Button>
      </div>
    </div>
  );
}