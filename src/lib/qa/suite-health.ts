/**
 * Curated automation suite-health snapshot for the QA page.
 * Source: analyzer report (commerceflow-wdio) — not the full raw dump.
 */

export type SuiteHealthSeverity = "high" | "warning" | "medium";

export type SuiteHealthDriver = {
  id: string;
  severity: SuiteHealthSeverity;
  title: string;
  summary: string;
  /** Concrete count or measure the claim rests on. */
  evidence: string;
};

export type SuiteHealthFileFinding = {
  id: string;
  severity: SuiteHealthSeverity;
  path: string;
  detail: string;
  metric: string;
};

export type SuiteHealthQuickWin = {
  id: string;
  title: string;
  detail: string;
};

export type SuiteHealthSnapshot = {
  repo: string;
  framework: string;
  analyzedAt: string;
  /** Analyzer composite — secondary; prefer counts in UI. */
  healthScore: number;
  riskBand: "low" | "medium" | "high";
  totals: {
    suites: number;
    features: number;
    scenarios: number;
    findings: number;
    high: number;
    warning: number;
    medium: number;
  };
  /** Top risk drivers — curated, not every score line. */
  drivers: SuiteHealthDriver[];
  /** Worst file-level evidence for the drivers above. */
  topFiles: SuiteHealthFileFinding[];
  /** Phase-1 hygiene moves worth acting on first. */
  quickWins: SuiteHealthQuickWin[];
  /** Clean checks — keeps the page evidentiary, not only negative. */
  cleanSignals: string[];
};
