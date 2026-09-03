/**
 * Minimal JUnit XML parser for CI test-report artifacts.
 * Supports <testsuites>/<testsuite>/<testcase> with failure/error/skipped.
 */

import { fingerprintError } from "@/lib/drydock/identity";

export type ParsedJUnitCase = {
  suitePath: string;
  name: string;
  classname: string | null;
  filePath: string | null;
  outcome: "passed" | "failed" | "skipped" | "error";
  durationMs: number | null;
  errorMessage: string | null;
  errorFingerprint: string | null;
  /** Retry attempts inferred from nested flaky/retry markers when present. */
  retryCount: number;
  passedOnRetry: boolean;
};

export type ParsedJUnitReport = {
  cases: ParsedJUnitCase[];
  suiteCount: number;
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i");
  const m = tag.match(re);
  if (m) return decodeXmlEntities(m[1]);
  const re2 = new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, "i");
  const m2 = tag.match(re2);
  return m2 ? decodeXmlEntities(m2[1]) : null;
}

function stripCdata(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

/**
 * Parse JUnit XML into per-case outcomes.
 * Intentionally dependency-free — format is constrained.
 */
export function parseJUnitXml(xml: string): ParsedJUnitReport {
  const cleaned = stripCdata(xml.replace(/<\?xml[\s\S]*?\?>/i, ""));
  const cases: ParsedJUnitCase[] = [];
  let suiteCount = 0;

  const suiteRe = /<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/gi;
  let suiteMatch: RegExpExecArray | null;
  while ((suiteMatch = suiteRe.exec(cleaned))) {
    suiteCount += 1;
    const suiteAttrs = suiteMatch[1];
    const suiteBody = suiteMatch[2];
    const suiteName = attr(suiteAttrs, "name") ?? "suite";
    const suiteFile = attr(suiteAttrs, "file") ?? attr(suiteAttrs, "filepath");

    const caseRe = /<testcase\b([^>]*?)(?:\s*\/>|>([\s\S]*?)<\/testcase>)/gi;
    let caseMatch: RegExpExecArray | null;
    while ((caseMatch = caseRe.exec(suiteBody))) {
      const caseAttrs = caseMatch[1];
      const caseBody = caseMatch[2] ?? "";
      const name = attr(caseAttrs, "name") ?? "unnamed";
      const classname = attr(caseAttrs, "classname");
      const filePath =
        attr(caseAttrs, "file") ??
        attr(caseAttrs, "filepath") ??
        suiteFile ??
        (classname ? classname.replace(/\./g, "/") + ".ts" : null);
      const timeSec = attr(caseAttrs, "time");
      const durationMs = timeSec != null && timeSec !== "" ? Math.round(parseFloat(timeSec) * 1000) : null;

      const hasSkipped = /<skipped\b/i.test(caseBody);
      const failureMatch = caseBody.match(/<(failure|error)\b([^>]*)>([\s\S]*?)<\/\1>/i);
      const failureSelf = caseBody.match(/<(failure|error)\b([^>]*)\/>/i);
      const failTag = failureMatch?.[0] ?? failureSelf?.[0];
      const failType = (failureMatch?.[1] ?? failureSelf?.[1] ?? "").toLowerCase();
      const failAttrs = failureMatch?.[2] ?? failureSelf?.[2] ?? "";
      const failBody = failureMatch?.[3] ?? "";

      let outcome: ParsedJUnitCase["outcome"] = "passed";
      let errorMessage: string | null = null;
      if (hasSkipped) {
        outcome = "skipped";
      } else if (failTag) {
        outcome = failType === "error" ? "error" : "failed";
        errorMessage =
          attr(failAttrs, "message") ??
          (failBody.trim() ? decodeXmlEntities(failBody.trim().slice(0, 2000)) : null);
      }

      const retryCountAttr = attr(caseAttrs, "retries") ?? attr(caseAttrs, "retry");
      const retryCount = retryCountAttr ? Math.max(0, parseInt(retryCountAttr, 10) || 0) : 0;
      const passedOnRetry =
        outcome === "passed" &&
        (retryCount > 0 || /flaky|retry/i.test(caseBody) || /retry/i.test(caseAttrs));

      cases.push({
        suitePath: suiteName,
        name,
        classname,
        filePath,
        outcome,
        durationMs: Number.isFinite(durationMs) ? durationMs : null,
        errorMessage,
        errorFingerprint: fingerprintError(errorMessage),
        retryCount: passedOnRetry && retryCount === 0 ? 1 : retryCount,
        passedOnRetry,
      });
    }
  }

  // Bare testcases without wrapping suite
  if (cases.length === 0) {
    const caseRe = /<testcase\b([^>]*?)(?:\s*\/>|>([\s\S]*?)<\/testcase>)/gi;
    let caseMatch: RegExpExecArray | null;
    while ((caseMatch = caseRe.exec(cleaned))) {
      const caseAttrs = caseMatch[1];
      const caseBody = caseMatch[2] ?? "";
      const name = attr(caseAttrs, "name") ?? "unnamed";
      const classname = attr(caseAttrs, "classname");
      const hasSkipped = /<skipped\b/i.test(caseBody);
      const hasFail = /<(failure|error)\b/i.test(caseBody);
      cases.push({
        suitePath: classname ?? "suite",
        name,
        classname,
        filePath: attr(caseAttrs, "file"),
        outcome: hasSkipped ? "skipped" : hasFail ? "failed" : "passed",
        durationMs: null,
        errorMessage: null,
        errorFingerprint: null,
        retryCount: 0,
        passedOnRetry: false,
      });
    }
  }

  return { cases, suiteCount: suiteCount || (cases.length > 0 ? 1 : 0) };
}
