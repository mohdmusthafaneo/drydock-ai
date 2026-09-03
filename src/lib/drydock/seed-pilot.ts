/**
 * Pilot seed: synthetic CI history that exercises Signal Integrity detectors.
 * Idempotent per organization.
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { deriveStableKey } from "@/lib/drydock/identity";
import { recomputeTrustForOrganization } from "@/lib/drydock/detectors";
import { mineStandardPatterns } from "@/lib/drydock/standard";
import type { TestCategory, TestOutcome } from "@/generated/prisma/client";

type SeedSpec = {
  repository: string;
  filePath: string;
  suitePath: string;
  name: string;
  kind:
    | "never_failed"
    | "flake"
    | "retry_masked"
    | "skipped"
    | "permafail"
    | "signal_decay"
    | "semantic_duplicate"
    | "trusted";
  category?: TestCategory;
};

const SPECIALTY: SeedSpec[] = [
  {
    repository: "storefront-web",
    filePath: "e2e/checkout/guest-checkout.spec.ts",
    suitePath: "checkout › guest",
    name: "guest checkout completes with valid card",
    kind: "never_failed",
  },
  {
    repository: "storefront-web",
    filePath: "e2e/cart/promo.spec.ts",
    suitePath: "cart › promotions",
    name: "promo code applies on cart page",
    kind: "never_failed",
  },
  {
    repository: "storefront-web",
    filePath: "e2e/search/basic.spec.ts",
    suitePath: "search › smoke",
    name: "search returns products for common query",
    kind: "never_failed",
    category: "SMOKE",
  },
  {
    repository: "payments-api",
    filePath: "e2e/payments/webhook.spec.ts",
    suitePath: "payments › webhooks",
    name: "payment confirmation webhook acknowledged",
    kind: "flake",
  },
  {
    repository: "fulfil-service",
    filePath: "e2e/fulfil/inventory.spec.ts",
    suitePath: "fulfil › inventory",
    name: "fulfil inventory updates after purchase",
    kind: "flake",
  },
  {
    repository: "storefront-web",
    filePath: "e2e/pdp/gallery.spec.ts",
    suitePath: "pdp › media",
    name: "PDP image gallery loads within budget",
    kind: "retry_masked",
  },
  {
    repository: "fulfil-service",
    filePath: "e2e/fulfil/express-eta.spec.ts",
    suitePath: "fulfil › shipping",
    name: "express shipping ETA for rural postcodes",
    kind: "skipped",
  },
  {
    repository: "payments-api",
    filePath: "e2e/payments/gift-card.spec.ts",
    suitePath: "payments › gift-cards",
    name: "gift card balance after partial redeem",
    kind: "skipped",
    category: "CONTRACT",
  },
  {
    repository: "payments-api",
    filePath: "e2e/payments/3ds-visa.spec.ts",
    suitePath: "payments › 3ds",
    name: "3DS challenge completes on Visa",
    kind: "permafail",
  },
  {
    repository: "storefront-web",
    filePath: "e2e/account/orders.spec.ts",
    suitePath: "account › orders",
    name: "order history pagination",
    kind: "signal_decay",
  },
  {
    repository: "storefront-web",
    filePath: "e2e/checkout/guest-checkout.spec.ts",
    suitePath: "checkout › guest",
    name: "guest checkout completes with a valid card",
    kind: "semantic_duplicate",
  },
];

function trustedFiller(): SeedSpec[] {
  return Array.from({ length: 40 }, (_, i) => ({
    repository: i % 2 === 0 ? "storefront-web" : "payments-api",
    filePath: `e2e/trusted/case-${i}.spec.ts`,
    suitePath: "trusted › batch",
    name: `trusted path ${i}`,
    kind: "trusted" as const,
  }));
}

function runHash(label: string): string {
  return createHash("sha1").update(`drydock-pilot|${label}`).digest("hex").slice(0, 16);
}

async function clearDryDock(organizationId: string) {
  await prisma.releaseCertificate.deleteMany({ where: { organizationId } });
  await prisma.standardPattern.deleteMany({ where: { organizationId } });
  await prisma.precedent.deleteMany({ where: { organizationId } });
  await prisma.ruling.deleteMany({ where: { organizationId } });
  await prisma.finding.deleteMany({ where: { organizationId } });
  await prisma.testTrustState.deleteMany({ where: { organizationId } });
  await prisma.testExecution.deleteMany({ where: { organizationId } });
  await prisma.testCaseAlias.deleteMany({ where: { organizationId } });
  await prisma.testCase.deleteMany({ where: { organizationId } });
  await prisma.ciRun.deleteMany({ where: { organizationId } });
}

export type SeedPilotResult = {
  organizationId: string;
  testCases: number;
  ciRuns: number;
  findings: number;
  demoted: number;
};

export async function seedPilotSignalIntegrity(
  organizationId: string,
): Promise<SeedPilotResult> {
  await clearDryDock(organizationId);

  const specs = [...SPECIALTY, ...trustedFiller()];
  const now = Date.now();
  const testCaseIds = new Map<string, string>();

  for (const spec of specs) {
    const stableKey = deriveStableKey(spec);
    const row = await prisma.testCase.create({
      data: {
        organizationId,
        repository: spec.repository,
        filePath: spec.filePath,
        suitePath: spec.suitePath,
        name: spec.name,
        stableKey,
        category: spec.category ?? "E2E",
        lifecycleState: spec.kind === "skipped" ? "SKIPPED" : "ACTIVE",
      },
    });
    testCaseIds.set(stableKey, row.id);
  }

  // Shared CI runs across repos / days
  const ciRunIds: string[] = [];
  for (let day = 0; day < 25; day++) {
    for (const repository of [
      "storefront-web",
      "payments-api",
      "fulfil-service",
    ]) {
      const finishedAt = new Date(now - (24 - day) * 86_400_000);
      const commitSha =
        day >= 18 ? "a3f91c2deadbeef01" : `c${day.toString(16).padStart(7, "0")}`;
      const run = await prisma.ciRun.create({
        data: {
          organizationId,
          repository,
          workflowName: "e2e",
          workflowRunId: runHash(`${repository}-${day}`),
          commitSha,
          branch: "main",
          conclusion: "SUCCESS",
          finishedAt,
        },
      });
      ciRunIds.push(run.id);

      const executions: Array<{
        organizationId: string;
        testCaseId: string;
        ciRunId: string;
        outcome: TestOutcome;
        retryCount: number;
        passedOnRetry: boolean;
        errorMessage: string | null;
        errorFingerprint: string | null;
        executedAt: Date;
      }> = [];

      for (const spec of specs.filter((s) => s.repository === repository)) {
        const testCaseId = testCaseIds.get(deriveStableKey(spec));
        if (!testCaseId) continue;

        let outcome: TestOutcome = "PASSED";
        let retryCount = 0;
        let passedOnRetry = false;
        let errorMessage: string | null = null;

        switch (spec.kind) {
          case "skipped":
            outcome = "SKIPPED";
            break;
          case "permafail":
            outcome = "FAILED";
            errorMessage =
              "expect(received).toBe(expected) // challenge frame never attached";
            break;
          case "retry_masked":
            outcome = "PASSED";
            if (day % 5 !== 0) {
              retryCount = 1;
              passedOnRetry = true;
            }
            break;
          case "flake":
            if (day >= 18) {
              // Divergent outcomes on same commit: fail on even, pass on odd
              // Plus a same-day sibling fail run below for even days
              outcome = day % 2 === 0 ? "FAILED" : "PASSED";
              if (outcome === "FAILED") {
                errorMessage =
                  "TimeoutError: waiting for response to /webhooks/payment exceeded 15000ms";
              }
            }
            break;
          case "signal_decay":
            if (day === 5 || day === 12) {
              outcome = "FAILED";
              errorMessage = "TimeoutError: flaky selector";
            }
            break;
          case "trusted":
            // A few early real fails so this is not "never failed"
            if (day < 4) {
              outcome = "FAILED";
              errorMessage = "expect(page).toHaveURL — transient fixture";
            }
            break;
          default:
            outcome = "PASSED";
        }

        executions.push({
          organizationId,
          testCaseId,
          ciRunId: run.id,
          outcome,
          retryCount,
          passedOnRetry,
          errorMessage,
          errorFingerprint: errorMessage
            ? errorMessage.toLowerCase().slice(0, 240)
            : null,
          executedAt: finishedAt,
        });
      }

      if (executions.length > 0) {
        await prisma.testExecution.createMany({ data: executions });
      }

      // Extra fail run on same flake commit to create pass+fail divergence
      if (day >= 18 && day % 2 === 1) {
        const failRun = await prisma.ciRun.create({
          data: {
            organizationId,
            repository,
            workflowName: "e2e",
            workflowRunId: runHash(`${repository}-${day}-retry`),
            commitSha: "a3f91c2deadbeef01",
            branch: "main",
            conclusion: "FAILURE",
            finishedAt: new Date(finishedAt.getTime() + 30 * 60_000),
          },
        });
        ciRunIds.push(failRun.id);
        const flakeSpecs = specs.filter(
          (s) => s.repository === repository && s.kind === "flake",
        );
        if (flakeSpecs.length > 0) {
          await prisma.testExecution.createMany({
            data: flakeSpecs.map((spec) => ({
              organizationId,
              testCaseId: testCaseIds.get(deriveStableKey(spec))!,
              ciRunId: failRun.id,
              outcome: "FAILED" as const,
              retryCount: 0,
              passedOnRetry: false,
              errorMessage:
                "TimeoutError: waiting for response to /webhooks/payment exceeded 15000ms",
              errorFingerprint:
                "timeouterror: waiting for response to /webhooks/payment exceeded 15000ms",
              executedAt: new Date(finishedAt.getTime() + 30 * 60_000),
            })),
          });
        }
      }
    }
  }

  await recomputeTrustForOrganization(organizationId);
  await mineStandardPatterns(organizationId);

  const demotedCount = 14;
  for (let i = 0; i < demotedCount; i++) {
    await prisma.finding.create({
      data: {
        organizationId,
        reason: "NEVER_FAILED",
        status: "DEMOTED",
        verb: "RULE",
        severity: "LOW",
        title: `Demoted never-failed #${i + 1}`,
        plainSentence:
          "Looks covered by earlier rulings on similar smoke coverage.",
        clusterKey: `demoted|never_failed|${i}`,
        clusterSize: 1,
        repository: "storefront-web",
        filePath: `e2e/demoted/case-${i}.spec.ts`,
        evidenceJson: {
          repository: "storefront-web",
          filePath: `e2e/demoted/case-${i}.spec.ts`,
          runSummary: "Demoted — open in one click",
        },
        inference: true,
        estimatedMinutes: 1,
        sinceLastRelease: true,
        demoted: true,
        sourceChipsJson: ["storefront-web", "Precedent"],
      },
    });
  }

  const [testCases, findings, demoted] = await Promise.all([
    prisma.testCase.count({ where: { organizationId } }),
    prisma.finding.count({
      where: { organizationId, status: "OPEN", demoted: false },
    }),
    prisma.finding.count({ where: { organizationId, demoted: true } }),
  ]);

  return {
    organizationId,
    testCases,
    ciRuns: ciRunIds.length,
    findings,
    demoted,
  };
}
