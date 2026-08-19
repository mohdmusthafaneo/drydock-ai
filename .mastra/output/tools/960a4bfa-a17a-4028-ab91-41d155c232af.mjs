import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path__default from 'node:path';

const REPOWISE_BIN = process.env.REPOWISE_BIN || "repowise";
function parseJsonFromCli(stdout) {
  const trimmed = stdout.trim();
  const objStart = trimmed.indexOf("{");
  const arrStart = trimmed.indexOf("[");
  let start = -1;
  if (objStart >= 0 && arrStart >= 0) start = Math.min(objStart, arrStart);
  else start = Math.max(objStart, arrStart);
  if (start < 0) {
    throw new Error(`repowise returned no JSON. stdout:
${trimmed.slice(0, 500)}`);
  }
  const slice = trimmed.slice(start);
  try {
    return JSON.parse(slice);
  } catch {
    let depth = 0;
    let inString = false;
    let escape = false;
    const open = slice[0];
    const close = open === "[" ? "]" : "}";
    for (let i = 0; i < slice.length; i++) {
      const ch = slice[i];
      if (inString) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          return JSON.parse(slice.slice(0, i + 1));
        }
      }
    }
    throw new Error(`Failed to parse repowise JSON. stdout:
${trimmed.slice(0, 500)}`);
  }
}
async function assertRepoPath(repoPath) {
  const resolved = path__default.resolve(repoPath);
  const gitDir = path__default.join(resolved, ".git");
  try {
    await fs.access(gitDir);
  } catch {
    throw new Error(`Not a git repository: ${resolved}`);
  }
  return resolved;
}
function runRepowise(args, cwd, opts) {
  const timeoutMs = opts?.timeoutMs ?? 10 * 60 * 1e3;
  return new Promise((resolve, reject) => {
    const child = spawn(REPOWISE_BIN, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`repowise timed out after ${timeoutMs}ms: ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Failed to run ${REPOWISE_BIN}: ${err.message}. Is repowise installed and on PATH? Set REPOWISE_BIN if needed.`
        )
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}
const repowiseIndexTool = createTool({
  id: "repowise-index",
  description: "Index a local git repository with repowise (index-only, no LLM). Builds dependency graph, git analytics, code health, and dead-code findings. Re-run after checkout/fetch to refresh. Idempotent; use force=true to rebuild.",
  inputSchema: z.object({
    repo_path: z.string().describe("Absolute path to a local git checkout"),
    force: z.boolean().optional().describe("Force full re-index (default false)")
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    repo_path: z.string(),
    summary: z.string(),
    elapsed_hint: z.string().optional()
  }),
  execute: async (input) => {
    const repoPath = await assertRepoPath(input.repo_path);
    const args = [
      "init",
      "--index-only",
      "-y",
      "--no-workspace",
      "--no-claude-md",
      "--no-agents",
      "--no-codex",
      "--no-distill-hook",
      repoPath
    ];
    if (input.force) args.splice(1, 0, "--force");
    const { stdout, stderr, code } = await runRepowise(args, repoPath, {
      timeoutMs: 15 * 60 * 1e3
    });
    if (code !== 0) {
      throw new Error(`repowise init failed (exit ${code}):
${stderr || stdout}`.slice(0, 2e3));
    }
    const filesMatch = stdout.match(/Files indexed\s+(\d+)/i) || stdout.match(/(\d+)\s+files\s*[·.]/i);
    const symbolsMatch = stdout.match(/Symbols\s+(\d[\d,]*)/i);
    const elapsedMatch = stdout.match(/Elapsed\s+([^\n│]+)/i);
    const summaryParts = [
      filesMatch ? `${filesMatch[1]} files indexed` : "index complete",
      symbolsMatch ? `${symbolsMatch[1]} symbols` : null
    ].filter(Boolean);
    return {
      ok: true,
      repo_path: repoPath,
      summary: summaryParts.join(" \xB7 "),
      elapsed_hint: elapsedMatch?.[1]?.trim()
    };
  }
});
const repowiseHealthTool = createTool({
  id: "repowise-health",
  description: "Get code-health KPIs, worst files, and findings from a repowise index (no LLM). Call repowise-index first. Use for defect-risk / maintainability triage.",
  inputSchema: z.object({
    repo_path: z.string().describe("Absolute path to an indexed git checkout"),
    worst_n: z.number().int().min(1).max(50).optional().describe("How many lowest-scoring files to return (default 15)"),
    include_findings: z.boolean().optional().describe("Include high/medium severity findings (default true)"),
    findings_limit: z.number().int().min(1).max(100).optional().describe("Max findings to return (default 40)"),
    refactoring_targets: z.boolean().optional().describe("If true, return ranked refactoring targets instead of full health metrics")
  }),
  outputSchema: z.object({
    kpis: z.record(z.string(), z.unknown()).optional(),
    worst_files: z.array(
      z.object({
        file_path: z.string(),
        score: z.number().nullable(),
        max_ccn: z.number().nullable().optional(),
        max_nesting: z.number().nullable().optional(),
        nloc: z.number().nullable().optional(),
        duplication_pct: z.number().nullable().optional(),
        has_test_file: z.boolean().nullable().optional()
      })
    ).optional(),
    findings: z.array(
      z.object({
        biomarker_type: z.string().optional(),
        severity: z.string().optional(),
        file_path: z.string().optional(),
        function_name: z.string().nullable().optional(),
        health_impact: z.number().optional(),
        reason: z.string().optional()
      })
    ).optional(),
    refactoring_markdown: z.string().optional(),
    raw_note: z.string().optional()
  }),
  execute: async (input) => {
    const repoPath = await assertRepoPath(input.repo_path);
    const worstN = input.worst_n ?? 15;
    const findingsLimit = input.findings_limit ?? 40;
    if (input.refactoring_targets) {
      const { stdout: stdout2, stderr: stderr2, code: code2 } = await runRepowise(
        ["health", "--no-workspace", "--refactoring-targets", "--format", "md", repoPath],
        repoPath,
        { timeoutMs: 5 * 60 * 1e3 }
      );
      if (code2 !== 0) {
        throw new Error(`repowise health failed (exit ${code2}):
${stderr2 || stdout2}`.slice(0, 2e3));
      }
      const mdStart = stdout2.indexOf("#");
      return {
        refactoring_markdown: (mdStart >= 0 ? stdout2.slice(mdStart) : stdout2).slice(0, 12e3)
      };
    }
    const { stdout, stderr, code } = await runRepowise(
      ["health", "--no-workspace", "--format", "json", repoPath],
      repoPath,
      { timeoutMs: 5 * 60 * 1e3 }
    );
    if (code !== 0) {
      throw new Error(`repowise health failed (exit ${code}):
${stderr || stdout}`.slice(0, 2e3));
    }
    const data = parseJsonFromCli(stdout);
    const metrics = Array.isArray(data.metrics) ? data.metrics : [];
    const worst_files = [...metrics].sort((a, b) => Number(a.score ?? 99) - Number(b.score ?? 99)).slice(0, worstN).map((m) => ({
      file_path: String(m.file_path ?? ""),
      score: m.score == null ? null : Number(m.score),
      max_ccn: m.max_ccn == null ? null : Number(m.max_ccn),
      max_nesting: m.max_nesting == null ? null : Number(m.max_nesting),
      nloc: m.nloc == null ? null : Number(m.nloc),
      duplication_pct: m.duplication_pct == null ? null : Number(m.duplication_pct),
      has_test_file: typeof m.has_test_file === "boolean" ? m.has_test_file : null
    }));
    let findings;
    if (input.include_findings !== false) {
      const raw = Array.isArray(data.findings) ? data.findings : [];
      findings = raw.filter((f) => {
        const sev = String(f.severity ?? "").toLowerCase();
        return sev === "high" || sev === "medium";
      }).sort((a, b) => Number(b.health_impact ?? 0) - Number(a.health_impact ?? 0)).slice(0, findingsLimit).map((f) => ({
        biomarker_type: f.biomarker_type != null ? String(f.biomarker_type) : void 0,
        severity: f.severity != null ? String(f.severity) : void 0,
        file_path: f.file_path != null ? String(f.file_path) : void 0,
        function_name: f.function_name == null ? null : String(f.function_name),
        health_impact: f.health_impact == null ? void 0 : Number(f.health_impact),
        reason: f.reason != null ? String(f.reason) : void 0
      }));
    }
    return {
      kpis: data.kpis,
      worst_files,
      findings,
      raw_note: `${metrics.length} files scored; returning top ${worst_files.length} worst`
    };
  }
});
const repowiseRiskTool = createTool({
  id: "repowise-risk",
  description: "Score defect risk for a git revision range (e.g. main..HEAD, HEAD~20..HEAD, origin/main...HEAD). Returns score, percentile, level, and drivers. Prefer PR-sized ranges. Requires an indexed repo (repowise-index).",
  inputSchema: z.object({
    repo_path: z.string().describe("Absolute path to a local git checkout"),
    revspec: z.string().describe('Git revision range, e.g. "main..HEAD", "origin/dev...HEAD", "HEAD~10..HEAD"')
  }),
  outputSchema: z.object({
    ref: z.string().optional(),
    score: z.number().optional(),
    probability: z.number().optional(),
    level: z.string().optional(),
    risk_percentile: z.number().optional(),
    review_priority: z.string().optional(),
    is_fix: z.boolean().optional(),
    features: z.record(z.string(), z.unknown()).optional(),
    drivers: z.array(
      z.object({
        feature: z.string().optional(),
        value: z.number().optional(),
        contribution: z.number().optional(),
        label: z.string().optional()
      })
    ).optional(),
    summary: z.string()
  }),
  execute: async (input) => {
    const repoPath = await assertRepoPath(input.repo_path);
    const { stdout, stderr, code } = await runRepowise(
      ["risk", "--path", repoPath, "--format", "json", input.revspec],
      repoPath,
      { timeoutMs: 3 * 60 * 1e3 }
    );
    if (code !== 0) {
      throw new Error(`repowise risk failed (exit ${code}):
${stderr || stdout}`.slice(0, 2e3));
    }
    const data = parseJsonFromCli(stdout);
    const score = data.score == null ? void 0 : Number(data.score);
    const level = data.level != null ? String(data.level) : void 0;
    const pct = data.risk_percentile == null ? void 0 : Number(data.risk_percentile);
    const summary = [
      level ? `level=${level}` : null,
      score != null ? `score=${score}` : null,
      pct != null ? `percentile=${pct}` : null,
      data.review_priority != null ? `priority=${data.review_priority}` : null
    ].filter(Boolean).join(" \xB7 ");
    return {
      ref: data.ref != null ? String(data.ref) : input.revspec,
      score,
      probability: data.probability == null ? void 0 : Number(data.probability),
      level,
      risk_percentile: pct,
      review_priority: data.review_priority != null ? String(data.review_priority) : void 0,
      is_fix: typeof data.is_fix === "boolean" ? data.is_fix : void 0,
      features: data.features && typeof data.features === "object" ? data.features : void 0,
      drivers: Array.isArray(data.drivers) ? data.drivers.map((d) => ({
        feature: d.feature != null ? String(d.feature) : void 0,
        value: d.value == null ? void 0 : Number(d.value),
        contribution: d.contribution == null ? void 0 : Number(d.contribution),
        label: d.label != null ? String(d.label) : void 0
      })) : void 0,
      summary: summary || "risk scored"
    };
  }
});
const repowiseDeadCodeTool = createTool({
  id: "repowise-dead-code",
  description: "List cleanup-ready unused exports / dead code from a repowise index. Defaults to safe-only (higher confidence). Prefer this over full unreachable-file lists on Next.js/Mastra apps.",
  inputSchema: z.object({
    repo_path: z.string().describe("Absolute path to an indexed git checkout"),
    safe_only: z.boolean().optional().describe("Only high-confidence cleanup-ready findings (default true)"),
    limit: z.number().int().min(1).max(100).optional().describe("Max findings to return (default 40)")
  }),
  outputSchema: z.object({
    total_reported: z.number(),
    returned: z.number(),
    findings: z.array(
      z.object({
        kind: z.string().optional(),
        file_path: z.string().optional(),
        symbol: z.string().optional(),
        confidence: z.number().optional(),
        reason: z.string().optional(),
        cleanup_ready: z.boolean().optional()
      })
    ),
    summary: z.string()
  }),
  execute: async (input) => {
    const repoPath = await assertRepoPath(input.repo_path);
    const safeOnly = input.safe_only !== false;
    const limit = input.limit ?? 40;
    const args = ["dead-code", "--no-workspace", "--format", "json"];
    if (safeOnly) args.push("--safe-only");
    args.push(repoPath);
    const { stdout, stderr, code } = await runRepowise(args, repoPath, {
      timeoutMs: 5 * 60 * 1e3
    });
    if (code !== 0) {
      throw new Error(`repowise dead-code failed (exit ${code}):
${stderr || stdout}`.slice(0, 2e3));
    }
    const parsed = parseJsonFromCli(stdout);
    const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed.findings) ? parsed.findings : [];
    const findings = items.slice(0, limit).map((f) => ({
      kind: f.kind != null ? String(f.kind) : void 0,
      file_path: f.file_path != null ? String(f.file_path) : f.path != null ? String(f.path) : void 0,
      symbol: f.symbol_name != null ? String(f.symbol_name) : f.symbol != null ? String(f.symbol) : f.name != null ? String(f.name) : f.export_name != null ? String(f.export_name) : void 0,
      confidence: f.confidence == null ? void 0 : Number(f.confidence),
      reason: f.reason != null ? String(f.reason) : f.message != null ? String(f.message) : void 0,
      cleanup_ready: typeof f.safe_to_delete === "boolean" ? f.safe_to_delete : typeof f.cleanup_ready === "boolean" ? f.cleanup_ready : String(f.reason ?? "").includes("cleanup-ready") || void 0
    }));
    return {
      total_reported: items.length,
      returned: findings.length,
      findings,
      summary: `${items.length} findings${safeOnly ? " (safe-only)" : ""}; returning ${findings.length}`
    };
  }
});

export { repowiseDeadCodeTool, repowiseHealthTool, repowiseIndexTool, repowiseRiskTool };
