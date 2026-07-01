import Link from "next/link";

import type { PredictionView } from "@/lib/problem-prediction/types";
import { cn } from "@/lib/utils";

type Props = {
  predictions: PredictionView[];
  lastEvaluatedAt: string | null;
};

function severityTone(severity: PredictionView["severity"]): string {
  switch (severity) {
    case "critical":
      return "border-rust/30 bg-rust/5 text-rust";
    case "warning":
      return "border-apricot/40 bg-apricot/10 text-amber-900";
    default:
      return "border-fog bg-fog/40 text-graphite";
  }
}

function domainLabel(domain: PredictionView["domain"]): string {
  switch (domain) {
    case "delivery":
      return "Delivery";
    case "devops":
      return "DevOps";
    case "compliance":
      return "Compliance";
    case "planning":
      return "Planning";
    case "code":
      return "Code";
    default:
      return domain;
  }
}

export function EarlyWarningsCard({ predictions, lastEvaluatedAt }: Props) {
  const open = predictions.filter((p) => p.status === "open");
  const top = open.slice(0, 5);

  return (
    <section id="early-warnings" className="scroll-mt-24 space-y-6 py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-[32px] leading-[1.15] tracking-[-0.4px] text-ink">
            Early warnings
          </h2>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ash">
            Forward-looking signals from delivery, code, compliance, and planning trends — review
            before they become incidents.
          </p>
        </div>
        {lastEvaluatedAt && (
          <p className="text-[13px] text-graphite">
            Last evaluated {new Date(lastEvaluatedAt).toLocaleString()}
          </p>
        )}
      </div>

      {top.length === 0 ? (
        <div className="rounded-2xl border border-fog bg-white/70 px-6 py-8 text-[15px] text-ash">
          No open predictions right now. Leading indicators look stable.
        </div>
      ) : (
        <ul className="grid gap-4">
          {top.map((prediction) => (
            <li
              key={prediction.id}
              className="rounded-2xl border border-fog bg-white/80 px-5 py-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide",
                    severityTone(prediction.severity),
                  )}
                >
                  {prediction.severity}
                </span>
                <span className="text-[12px] font-medium uppercase tracking-wide text-graphite">
                  {domainLabel(prediction.domain)}
                </span>
                <span className="text-[12px] text-ash">
                  {Math.round(prediction.confidence * 100)}% confidence · {prediction.horizon} horizon
                </span>
                {prediction.projectKey && (
                  <span className="text-[12px] text-ash">· {prediction.projectKey}</span>
                )}
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-ink">{prediction.rationale}</p>
            </li>
          ))}
        </ul>
      )}

      {open.length > 5 && (
        <p className="text-[14px] text-graphite">
          {open.length - 5} more open prediction{open.length - 5 === 1 ? "" : "s"} not shown.
        </p>
      )}

      <Link
        href="/governance"
        className="inline-flex text-[14px] font-medium text-rust underline-offset-4 hover:underline"
      >
        View governance & compliance context
      </Link>
    </section>
  );
}
