import {
  getAvailableMockAuthors,
  getAvailableMockRepos,
  getMockCodeAnalysisSnapshot,
} from "@/lib/store/mock/code-analysis-snapshot";
import type { CodeAnalysisData } from "@/lib/store/types";

export {
  getAvailableMockAuthors,
  getAvailableMockRepos,
  getMockCodeAnalysisSnapshot,
} from "@/lib/store/mock/code-analysis-snapshot";

export const mockCodeAnalysis: CodeAnalysisData = {
  snapshot: getMockCodeAnalysisSnapshot(),
  availableRepos: getAvailableMockRepos(),
  availableAuthors: getAvailableMockAuthors(),
  aiRiskPctByTeam: { WEB: 8, MOB: 4, DATA: 5, INFRA: 3 },
  defaultAiRiskPct: 6,
};
