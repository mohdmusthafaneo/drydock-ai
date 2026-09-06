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

const TRUSTED_SPECS: Array<{ repository: string; filePath: string; suitePath: string; name: string }> = [
  { repository: "storefront-web", filePath: "e2e/account/address-book.spec.ts", suitePath: "account › addresses", name: "user profile loads address book" },
  { repository: "payments-api", filePath: "e2e/orders/confirmation-email.spec.ts", suitePath: "orders › email", name: "order confirmation email dispatched" },
  { repository: "storefront-web", filePath: "e2e/cart/quantity-update.spec.ts", suitePath: "cart › quantity", name: "cart quantity updates instantly" },
  { repository: "payments-api", filePath: "e2e/checkout/tax-calc.spec.ts", suitePath: "checkout › tax", name: "tax rate computed for zip code" },
  { repository: "storefront-web", filePath: "e2e/catalog/category-filter.spec.ts", suitePath: "catalog › filters", name: "category filter refines product list" },
  { repository: "storefront-web", filePath: "e2e/cart/coupon-validation.spec.ts", suitePath: "cart › promo", name: "discount coupon code validated" },
  { repository: "payments-api", filePath: "e2e/checkout/saved-payment.spec.ts", suitePath: "checkout › payment", name: "saved payment method selected at checkout" },
  { repository: "fulfil-service", filePath: "e2e/fulfil/inventory-hold.spec.ts", suitePath: "fulfil › hold", name: "inventory reservation expires after 15m" },
  { repository: "storefront-web", filePath: "e2e/pdp/recommendations.spec.ts", suitePath: "pdp › related", name: "product recommendations carousel renders" },
  { repository: "storefront-web", filePath: "e2e/search/autocomplete.spec.ts", suitePath: "search › suggestions", name: "search autocomplete yields brand matches" },
  { repository: "storefront-web", filePath: "e2e/pdp/reviews.spec.ts", suitePath: "pdp › reviews", name: "customer reviews render pagination" },
  { repository: "payments-api", filePath: "e2e/checkout/billing-sync.spec.ts", suitePath: "checkout › billing", name: "billing address syncs with shipping" },
  { repository: "payments-api", filePath: "e2e/orders/cancellation.spec.ts", suitePath: "orders › cancel", name: "order cancellation reflects in ledger" },
  { repository: "fulfil-service", filePath: "e2e/fulfil/gift-receipt.spec.ts", suitePath: "fulfil › packing", name: "gift receipt option included in packlist" },
  { repository: "storefront-web", filePath: "e2e/account/password-reset.spec.ts", suitePath: "account › auth", name: "password reset token expires in 1 hour" },
  { repository: "storefront-web", filePath: "e2e/auth/session-renewal.spec.ts", suitePath: "auth › session", name: "session cookie renewed on activity" },
  { repository: "storefront-web", filePath: "e2e/cart/wishlist-move.spec.ts", suitePath: "cart › wishlist", name: "wishlist item moves to active cart" },
  { repository: "payments-api", filePath: "e2e/pricing/multi-currency.spec.ts", suitePath: "pricing › fx", name: "currency conversion rates applied" },
  { repository: "fulfil-service", filePath: "e2e/fulfil/store-pickup.spec.ts", suitePath: "fulfil › pickup", name: "store pickup availability check" },
  { repository: "payments-api", filePath: "e2e/checkout/wallet-express.spec.ts", suitePath: "checkout › wallet", name: "express checkout redirects to wallet" },
  { repository: "storefront-web", filePath: "e2e/pdp/variant-sku.spec.ts", suitePath: "pdp › variants", name: "variant selector switches sku image" },
  { repository: "storefront-web", filePath: "e2e/marketing/newsletter.spec.ts", suitePath: "marketing › signup", name: "newsletter subscription confirms email" },
  { repository: "fulfil-service", filePath: "e2e/orders/return-label.spec.ts", suitePath: "orders › returns", name: "return label generation succeeds" },
  { repository: "payments-api", filePath: "e2e/payments/fraud-velocity.spec.ts", suitePath: "payments › fraud", name: "fraud scoring flags velocity breach" },
  { repository: "storefront-web", filePath: "e2e/account/loyalty-points.spec.ts", suitePath: "account › loyalty", name: "loyalty tier points accrued on purchase" },
  { repository: "fulfil-service", filePath: "e2e/fulfil/tracking-webhook.spec.ts", suitePath: "fulfil › webhook", name: "shipment tracking webhook updates status" },
  { repository: "storefront-web", filePath: "e2e/pdp/size-guide.spec.ts", suitePath: "pdp › modal", name: "size guide modal opens without layout shift" },
  { repository: "storefront-web", filePath: "e2e/cart/cart-merge.spec.ts", suitePath: "cart › merge", name: "guest cart persists after user sign in" },
  { repository: "payments-api", filePath: "e2e/payments/refund-batch.spec.ts", suitePath: "payments › refund", name: "refund batch dispatches to gateway" },
  { repository: "storefront-web", filePath: "e2e/marketing/promo-banner.spec.ts", suitePath: "marketing › banner", name: "promo banner dismiss state saved" },
  { repository: "storefront-web", filePath: "e2e/auth/2fa-sms.spec.ts", suitePath: "auth › 2fa", name: "two factor authentication sms verification" },
  { repository: "storefront-web", filePath: "e2e/seo/sitemap.spec.ts", suitePath: "seo › catalog", name: "sitemap xml generates active catalog" },
  { repository: "storefront-web", filePath: "e2e/catalog/stock-badge.spec.ts", suitePath: "catalog › stock", name: "out of stock badge replaces add to cart" },
  { repository: "payments-api", filePath: "e2e/pricing/bundle-discount.spec.ts", suitePath: "pricing › bundles", name: "bundle price reflects tiered discount" },
  { repository: "payments-api", filePath: "e2e/payments/apple-pay.spec.ts", suitePath: "payments › applepay", name: "apple pay token validated on ios user agent" },
  { repository: "storefront-web", filePath: "e2e/cart/bogo-promo.spec.ts", suitePath: "cart › bogo", name: "bogo promotion applies to eligible pairs" },
  { repository: "payments-api", filePath: "e2e/orders/invoice-download.spec.ts", suitePath: "orders › invoice", name: "order invoice pdf downloadable" },
  { repository: "storefront-web", filePath: "e2e/pdp/delivery-estimate.spec.ts", suitePath: "pdp › shipping", name: "estimated delivery date shown on pdp" },
  { repository: "storefront-web", filePath: "e2e/auth/session-timeout.spec.ts", suitePath: "auth › timeout", name: "session timeout prompts graceful re-auth" },
  { repository: "storefront-web", filePath: "e2e/account/gdpr-export.spec.ts", suitePath: "account › privacy", name: "gdpr personal data export archives order history" },
];

function trustedFiller(): SeedSpec[] {
  return TRUSTED_SPECS.map((spec) => ({
    ...spec,
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
          "Looks covered by earlier decisions on similar smoke coverage.",
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
