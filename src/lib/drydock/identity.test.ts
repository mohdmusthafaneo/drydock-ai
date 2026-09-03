import assert from "node:assert/strict";
import { test } from "node:test";
import { parseJUnitXml } from "./junit";
import { deriveStableKey, fingerprintError, identitySimilarity } from "./identity";

test("parseJUnitXml maps pass/fail/skip", () => {
  const xml = `<?xml version="1.0"?>
  <testsuite name="checkout › guest" tests="3">
    <testcase classname="checkout › guest" name="guest checkout completes" file="e2e/checkout.spec.ts" time="1.2"/>
    <testcase classname="checkout › guest" name="promo fails" file="e2e/checkout.spec.ts" time="0.4">
      <failure message="TimeoutError: waiting for response exceeded 15000ms">stack</failure>
    </testcase>
    <testcase classname="checkout › guest" name="rural eta" file="e2e/shipping.spec.ts"><skipped/></testcase>
  </testsuite>`;
  const parsed = parseJUnitXml(xml);
  assert.equal(parsed.cases.length, 3);
  assert.equal(parsed.cases[0]?.outcome, "passed");
  assert.equal(parsed.cases[1]?.outcome, "failed");
  assert.equal(parsed.cases[1]?.errorFingerprint?.includes("timeouterror"), true);
  assert.equal(parsed.cases[2]?.outcome, "skipped");
});

test("stableKey is normalized and case-insensitive", () => {
  const a = deriveStableKey({
    repository: "Storefront-Web",
    filePath: "./e2e\\\\checkout/guest.spec.ts",
    suitePath: "checkout › guest",
    name: "Guest Checkout Completes",
  });
  const b = deriveStableKey({
    repository: "storefront-web",
    filePath: "e2e/checkout/guest.spec.ts",
    suitePath: "checkout › guest",
    name: "guest checkout completes",
  });
  assert.equal(a, b);
});

test("identitySimilarity scores a rename in the same file highly", () => {
  const score = identitySimilarity(
    {
      repository: "storefront-web",
      filePath: "e2e/checkout/guest.spec.ts",
      suitePath: "checkout › guest",
      name: "guest checkout completes with valid card",
    },
    {
      repository: "storefront-web",
      filePath: "e2e/checkout/guest.spec.ts",
      suitePath: "checkout › guest",
      name: "guest checkout completes with a valid card",
    },
  );
  assert.ok(score > 0.75);
});

test("fingerprintError collapses ids", () => {
  const a = fingerprintError("Timeout at 0xabc123 waiting 15000ms");
  const b = fingerprintError("Timeout at 0xdef999 waiting 15000ms");
  assert.equal(a, b);
});

