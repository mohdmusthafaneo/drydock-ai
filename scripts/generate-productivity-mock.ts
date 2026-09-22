/**
 * Generate mock productivity-derived packs for TPT and Connexus tenants.
 *
 * Run: npx tsx scripts/generate-productivity-mock.ts
 *
 * Emits: src/lib/store/mock/productivity-derived.ts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  AiAttribution,
  Contributor,
  ProductivityDerivedPack,
  ProductivityPullRequest,
  ProductivityReviewEvent,
  ProductivityTicketSprintStats,
} from "../src/lib/productivity/types";

const STORY_POINT_CHOICES = [1, 2, 3, 5, 8] as const;

/** Mulberry32 seeded PRNG — deterministic across runs. */
function createRng(seed: number) {
  let t = seed >>> 0;
  return function next(): number {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isoAt(date: string, hour: number, minute = 0): string {
  const h = String(hour).padStart(2, "0");
  const m = String(minute).padStart(2, "0");
  return `${date}T${h}:${m}:00.000Z`;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function hoursBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / (1000 * 60 * 60);
}

type SprintWindow = { id: string; start: string; end: string };

type TenantSpec = {
  orgKey: "tpt" | "connexus";
  projectKey: string;
  seed: number;
  teams: { key: string; name: string }[];
  sprints: SprintWindow[];
  contributors: Omit<Contributor, "avatarInitials">[];
  repos: string[];
  prTarget: number;
};

const TPT_CONTRIBUTORS: Omit<Contributor, "avatarInitials">[] = [
  {
    id: "c-jordan",
    displayName: "Jordan Lee",
    githubHandle: "jordan.lee",
    jiraName: "Jordan Lee",
    teamKey: "AVENGERS",
  },
  {
    id: "c-samira",
    displayName: "Samira Khan",
    githubHandle: "samira.k",
    jiraName: "Samira Khan",
    teamKey: "AVENGERS",
  },
  {
    id: "c-alex",
    displayName: "Alex Chen",
    githubHandle: "alex.chen",
    jiraName: "Alex Chen",
    teamKey: "APEX",
  },
  {
    id: "c-morgan",
    displayName: "Morgan Torres",
    githubHandle: "morgan.t",
    jiraName: "Morgan Torres",
    teamKey: "APEX",
  },
  {
    id: "c-priya",
    displayName: "Priya Nair",
    githubHandle: "priya.nair",
    jiraName: "Priya Nair",
    teamKey: "DARK",
  },
  {
    id: "c-devon",
    displayName: "Devon Blake",
    githubHandle: "devon.blake",
    jiraName: "Devon Blake",
    teamKey: "DARK",
  },
  {
    id: "c-riley",
    displayName: "Riley Okonkwo",
    githubHandle: "riley.o",
    jiraName: "Riley Okonkwo",
    teamKey: "MOBILE",
  },
  {
    id: "c-casey",
    displayName: "Casey Nguyen",
    githubHandle: "casey.ng",
    jiraName: "Casey Nguyen",
    teamKey: "MOBILE",
  },
  {
    id: "c-aisha",
    displayName: "Aisha Rahman",
    githubHandle: "aisha.r",
    jiraName: "Aisha Rahman",
    teamKey: "AVENGERS",
  },
  {
    id: "c-noah",
    displayName: "Noah Patel",
    githubHandle: "noah.patel",
    jiraName: "Noah Patel",
    teamKey: "APEX",
  },
  {
    id: "c-elena",
    displayName: "Elena Vasquez",
    githubHandle: "elena.v",
    jiraName: "Elena Vasquez",
    teamKey: "DARK",
  },
];

const CONNEXUS_CONTRIBUTORS: Omit<Contributor, "avatarInitials">[] = [
  {
    id: "cx-jordan",
    displayName: "Jordan Lee",
    githubHandle: "jordan.lee",
    jiraName: "Jordan Lee",
    teamKey: "CONNEXUS",
  },
  {
    id: "cx-samira",
    displayName: "Samira Khan",
    githubHandle: "samira.k",
    jiraName: "Samira Khan",
    teamKey: "CONNEXUS",
  },
  {
    id: "cx-alex",
    displayName: "Alex Chen",
    githubHandle: "alex.chen",
    jiraName: "Alex Chen",
    teamKey: "CONNEXUS",
  },
  {
    id: "cx-morgan",
    displayName: "Morgan Torres",
    githubHandle: "morgan.t",
    jiraName: "Morgan Torres",
    teamKey: "CONNEXUS",
  },
  {
    id: "cx-priya",
    displayName: "Priya Nair",
    githubHandle: "priya.nair",
    jiraName: "Priya Nair",
    teamKey: "CONNEXUS",
  },
];

const TPT_SPRINTS: SprintWindow[] = [
  { id: "27", start: "2026-08-31", end: "2026-09-10" },
  { id: "26", start: "2026-08-17", end: "2026-08-28" },
  { id: "25", start: "2026-08-03", end: "2026-08-15" },
  { id: "24", start: "2026-07-20", end: "2026-08-01" },
];

const CONNEXUS_SPRINTS: SprintWindow[] = [
  { id: "37", start: "2026-08-27", end: "2026-09-09" },
  { id: "36", start: "2026-08-13", end: "2026-08-26" },
  { id: "35", start: "2026-07-30", end: "2026-08-12" },
  { id: "34", start: "2026-07-16", end: "2026-07-29" },
];

const PR_TITLES = [
  "auth session refresh",
  "fix payment webhook retry",
  "add sprint burndown API",
  "improve checkout validation",
  "migrate feature flags",
  "reduce flaky e2e waits",
  "document release checklist",
  "cache inventory lookups",
  "support dark mode tokens",
  "harden rate limiter",
  "cleanup dead feature flags",
  "wire observability alerts",
  "fix mobile deep link",
  "batch Jira sync deltas",
  "add empty-state illustration",
  "upgrade prisma client",
  "split large dashboard query",
  "tighten CORS allowlist",
  "surface unmatched activity",
  "align sprint filter chrome",
];

const ATTRIBUTIONS: AiAttribution[] = [
  "human_only",
  "human_only",
  "human_only",
  "ai_assisted",
  "ai_assisted",
  "ai_generated",
];

function buildContributors(
  raw: Omit<Contributor, "avatarInitials">[],
): Contributor[] {
  return raw.map((c) => ({ ...c, avatarInitials: initials(c.displayName) }));
}

function teammates(
  contributors: Contributor[],
  teamKey: string,
  excludeId: string,
): Contributor[] {
  return contributors.filter((c) => c.teamKey === teamKey && c.id !== excludeId);
}

function generatePack(spec: TenantSpec): ProductivityDerivedPack {
  const rng = createRng(spec.seed);
  const contributors = buildContributors(spec.contributors);
  const pullRequests: ProductivityPullRequest[] = [];
  const reviewEvents: ProductivityReviewEvent[] = [];
  const issuesResolvedByContributor: Record<string, string[]> = {};
  const issuesResolvedByContributorSprint: Record<
    string,
    Record<string, string[]>
  > = {};
  const ticketStatsByContributorSprint: Record<
    string,
    Record<string, ProductivityTicketSprintStats>
  > = {};

  for (const c of contributors) {
    issuesResolvedByContributor[c.id] = [];
    issuesResolvedByContributorSprint[c.id] = {};
    ticketStatsByContributorSprint[c.id] = {};
    for (const s of spec.sprints) {
      issuesResolvedByContributorSprint[c.id]![s.id] = [];
      ticketStatsByContributorSprint[c.id]![s.id] = {
        ticketsWorkedOn: 0,
        storyPointsCompleted: 0,
        ticketsSkipped: 0,
        storyPointsSkipped: 0,
      };
    }
  }

  // Weight PR volume: newer sprints slightly higher; some contributors more prolific
  const weightByContributor = new Map<string, number>();
  for (const c of contributors) {
    // 0.6 – 1.6 relative weight
    weightByContributor.set(c.id, 0.6 + rng() * 1.0);
  }
  // Bias one Connexus reviewer toward absorbing review load (mockup ~36%).
  if (spec.orgKey === "connexus") {
    const morgan = contributors.find((c) => c.githubHandle === "morgan.t");
    if (morgan) weightByContributor.set(morgan.id, 0.9);
  }

  let prNumber = 400 + Math.floor(rng() * 50);
  let reviewSeq = 0;
  let issueSeq = 100;

  const sprintShares = [0.3, 0.27, 0.24, 0.19]; // newest first
  let remaining = spec.prTarget;

  for (let si = 0; si < spec.sprints.length; si++) {
    const sprint = spec.sprints[si]!;
    const count =
      si === spec.sprints.length - 1
        ? remaining
        : Math.max(1, Math.round(spec.prTarget * sprintShares[si]!));
    remaining -= count;

    for (let i = 0; i < count; i++) {
      // Weighted author pick
      const weights = contributors.map((c) => weightByContributor.get(c.id)!);
      const sum = weights.reduce((a, b) => a + b, 0);
      let roll = rng() * sum;
      let author = contributors[0]!;
      for (let wi = 0; wi < contributors.length; wi++) {
        roll -= weights[wi]!;
        if (roll <= 0) {
          author = contributors[wi]!;
          break;
        }
      }

      const dayOffset = Math.floor(rng() * 9);
      const openDate = addDays(sprint.start, dayOffset);
      const openHour = 9 + Math.floor(rng() * 8);
      const openedAt = isoAt(openDate, openHour, Math.floor(rng() * 60));

      // Cycle time 0.5d – 6d
      const cycleDays = 0.5 + rng() * 5.5;
      const mergeDate = addDays(openDate, Math.max(0, Math.floor(cycleDays)));
      // Clamp merge within sprint end + 1 day
      const mergeClamped =
        mergeDate > sprint.end ? sprint.end : mergeDate;
      const mergeHour = 10 + Math.floor(rng() * 8);
      const mergedAt = isoAt(mergeClamped, mergeHour, Math.floor(rng() * 60));

      const peers = teammates(contributors, author.teamKey, author.id);
      // Prefer a "review magnet" on Connexus so load concentration is visible.
      let preferredReviewer: Contributor | null = null;
      if (spec.orgKey === "connexus") {
        preferredReviewer =
          peers.find((c) => c.githubHandle === "morgan.t") ?? null;
      }
      const unreviewed = rng() < 0.12 || peers.length === 0;

      prNumber += 1 + Math.floor(rng() * 3);
      const prId = `pr-${spec.orgKey}-${prNumber}`;

      let firstReviewAt: string | null = null;
      const reviewerIds: string[] = [];
      const reviewCount = unreviewed
        ? 0
        : 1 + (rng() < 0.35 && peers.length > 1 ? 1 : 0);

      const available = [...peers];
      for (let r = 0; r < reviewCount && available.length > 0; r++) {
        let reviewer: Contributor;
        if (
          r === 0 &&
          preferredReviewer &&
          available.some((c) => c.id === preferredReviewer!.id) &&
          rng() < 0.55
        ) {
          const idx = available.findIndex((c) => c.id === preferredReviewer!.id);
          reviewer = available.splice(idx, 1)[0]!;
        } else {
          const idx = Math.floor(rng() * available.length);
          reviewer = available.splice(idx, 1)[0]!;
        }
        reviewerIds.push(reviewer.id);

        // First review 2h – 3d after open
        const reviewDelayH = 2 + rng() * 70;
        const reviewMs = Date.parse(openedAt) + reviewDelayH * 3600 * 1000;
        // Keep before merge
        const capped = Math.min(reviewMs, Date.parse(mergedAt) - 3600 * 1000);
        const reviewedAt = new Date(
          Math.max(capped, Date.parse(openedAt) + 3600 * 1000),
        ).toISOString();

        if (!firstReviewAt || reviewedAt < firstReviewAt) {
          firstReviewAt = reviewedAt;
        }

        reviewSeq += 1;
        reviewEvents.push({
          id: `rev-${spec.orgKey}-${reviewSeq}`,
          pullRequestId: prId,
          reviewerId: reviewer.id,
          teamKey: author.teamKey,
          sprintId: sprint.id,
          reviewedAt,
          turnaroundHours: Math.max(0.5, hoursBetween(openedAt, reviewedAt)),
        });
      }

      const additions = 20 + Math.floor(rng() * 480);
      const deletions = Math.floor(rng() * additions * 0.6);
      const attribution = pick(rng, ATTRIBUTIONS);
      const title = pick(rng, PR_TITLES);
      const repo = pick(rng, spec.repos);

      const jiraKey = `${spec.projectKey}-${issueSeq++}`;
      const issueKeys = [jiraKey];
      if (rng() < 0.25) {
        issueKeys.push(`${spec.projectKey}-${issueSeq++}`);
      }

      const pr: ProductivityPullRequest = {
        id: prId,
        number: prNumber,
        title,
        url: `https://github.com/neoito/${repo}/pull/${prNumber}`,
        repo,
        authorId: author.id,
        teamKey: author.teamKey,
        sprintId: sprint.id,
        openedAt,
        firstReviewAt: unreviewed ? null : firstReviewAt,
        mergedAt,
        reviewerIds,
        additions,
        deletions,
        attribution,
        jiraKeys: issueKeys,
        unreviewed,
      };
      pullRequests.push(pr);

      // Issues resolved credited to author for this sprint
      const sprintIssues =
        issuesResolvedByContributorSprint[author.id]![sprint.id]!;
      for (const key of issueKeys) {
        sprintIssues.push(key);
        issuesResolvedByContributor[author.id]!.push(key);
      }

      // Ticket + story-point activity (completed via this PR)
      const ticketStats = ticketStatsByContributorSprint[author.id]![sprint.id]!;
      for (const _key of issueKeys) {
        const points = pick(rng, STORY_POINT_CHOICES);
        ticketStats.ticketsWorkedOn += 1;
        ticketStats.storyPointsCompleted += points;
      }
    }
  }

  // Skipped / spillover tickets: planned but not completed in the sprint.
  // Roughly 15–35% of completed ticket volume per contributor per sprint.
  for (const c of contributors) {
    for (const sprint of spec.sprints) {
      const stats = ticketStatsByContributorSprint[c.id]![sprint.id]!;
      const completed = stats.ticketsWorkedOn;
      if (completed === 0) {
        // Still give light activity so empty teams aren't blank
        const worked = 1 + Math.floor(rng() * 3);
        stats.ticketsWorkedOn = worked;
        for (let i = 0; i < worked; i++) {
          stats.storyPointsCompleted += pick(rng, STORY_POINT_CHOICES);
        }
      }
      const skipCount = Math.max(
        0,
        Math.round(stats.ticketsWorkedOn * (0.15 + rng() * 0.2)),
      );
      stats.ticketsSkipped = skipCount;
      stats.ticketsWorkedOn += skipCount;
      for (let i = 0; i < skipCount; i++) {
        stats.storyPointsSkipped += pick(rng, STORY_POINT_CHOICES);
      }
    }
  }

  return {
    orgKey: spec.orgKey,
    projectKey: spec.projectKey,
    contributors,
    pullRequests,
    reviewEvents,
    issuesResolvedByContributor,
    issuesResolvedByContributorSprint,
    ticketStatsByContributorSprint,
  };
}

function serialize(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  const padIn = "  ".repeat(indent + 1);
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => `${padIn}${serialize(v, indent + 1)}`);
    return `[\n${items.join(",\n")}\n${pad}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const lines = entries.map(
      ([k, v]) => `${padIn}${JSON.stringify(k)}: ${serialize(v, indent + 1)}`,
    );
    return `{\n${lines.join(",\n")}\n${pad}}`;
  }
  return "null";
}

function main() {
  const tpt = generatePack({
    orgKey: "tpt",
    projectKey: "TP",
    seed: 20260922,
    teams: [
      { key: "AVENGERS", name: "Agile Avengers" },
      { key: "APEX", name: "Apex Team" },
      { key: "DARK", name: "Dark Side Team" },
      { key: "MOBILE", name: "Mobile" },
    ],
    sprints: TPT_SPRINTS,
    contributors: TPT_CONTRIBUTORS,
    repos: ["tpt-platform", "tpt-mobile"],
    prTarget: 95,
  });

  const connexus = generatePack({
    orgKey: "connexus",
    projectKey: "CX",
    seed: 20260923,
    teams: [{ key: "CONNEXUS", name: "Connexus" }],
    sprints: CONNEXUS_SPRINTS,
    contributors: CONNEXUS_CONTRIBUTORS,
    repos: ["connexus-platform"],
    prTarget: 42,
  });

  const outPath = resolve(
    process.cwd(),
    "src/lib/store/mock/productivity-derived.ts",
  );

  const header = `/**
 * Productivity mock derived packs (TPT + Connexus).
 * Regenerated by \`scripts/generate-productivity-mock.ts\`.
 * Do not edit by hand — re-run the generator.
 */
import type { ProductivityDerivedPack } from "@/lib/productivity/types";

`;

  const body = `${header}export const TPT_PRODUCTIVITY_DERIVED = ${serialize(tpt)} as const satisfies ProductivityDerivedPack;

export const CONNEXUS_PRODUCTIVITY_DERIVED = ${serialize(connexus)} as const satisfies ProductivityDerivedPack;
`;

  writeFileSync(outPath, body, "utf8");

  console.log(
    `Wrote ${outPath}\n` +
      `  TPT: ${tpt.contributors.length} contributors, ${tpt.pullRequests.length} PRs, ${tpt.reviewEvents.length} reviews\n` +
      `  Connexus: ${connexus.contributors.length} contributors, ${connexus.pullRequests.length} PRs, ${connexus.reviewEvents.length} reviews`,
  );
}

main();
