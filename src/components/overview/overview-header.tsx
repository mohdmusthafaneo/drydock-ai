"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Share2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toast } from "@/components/ui/toast";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

export function OverviewHeader({
  model,
  className,
}: {
  model: OverviewDashboardModel;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [menuReady, setMenuReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    setMenuReady(true);
  }, []);

  const sprints = model.sprints.length > 0 ? model.sprints : null;

  function selectSprint(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sprint", id);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setShareError(false);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      setShareError(true);
    }
  }

  const sprintChip = (
    <>
      <strong className="text-[13px] font-semibold text-[#4a2b1e]">
        {model.sprint.name}
      </strong>
      <span className="border-l border-border pl-[13px] text-[#7b8798]">
        {model.sprint.startLabel} – {model.sprint.endLabel}
      </span>
      {sprints ? (
        <ChevronDown className="ml-auto h-[15px] w-[15px] text-muted" strokeWidth={1.7} />
      ) : null}
    </>
  );

  return (
    <div
      className={cn(
        "mb-[18px] flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
      data-slot="overview-header"
    >
      <div className="min-w-0">
        <h1 className="text-[28px] leading-[1.12] font-bold tracking-[-0.75px] text-ink">
          {model.greeting}, {model.greetingName}
        </h1>
        <p className="mt-[5px] text-[15px] text-muted">
          Here&apos;s how your engineering work is tracking.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        {sprints && menuReady ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-[42px] min-w-[245px] items-center gap-[13px] rounded-[9px] border border-border bg-pure-white px-[13px] text-[12px] text-[#334155] hover:bg-hover"
                aria-label="Select sprint"
              >
                {sprintChip}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Sprint window</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {sprints.map((sprint) => (
                <DropdownMenuItem
                  key={sprint.id}
                  onSelect={() => selectSprint(sprint.id)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-primary">{sprint.name}</p>
                    <p className="truncate text-xs text-muted">{sprint.rangeLabel}</p>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div
            className="inline-flex h-[42px] min-w-[245px] items-center gap-[13px] rounded-[9px] border border-border bg-pure-white px-[13px] text-[12px] text-[#334155]"
            aria-label={sprints ? "Select sprint" : undefined}
          >
            {sprintChip}
          </div>
        )}
        <button
          type="button"
          onClick={share}
          className="inline-flex h-[42px] items-center gap-2 rounded-[9px] border border-border bg-pure-white px-3.5 text-[14px] font-semibold text-[#182230] hover:bg-hover"
        >
          <Share2 className="h-[17px] w-[17px]" strokeWidth={1.7} />
          {copied ? "Copied" : "Share"}
        </button>
      </div>
      <Toast
        message="Clipboard access denied — copy the URL from the address bar."
        visible={shareError}
        onDismiss={() => setShareError(false)}
      />
    </div>
  );
}
