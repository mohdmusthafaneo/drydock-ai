-- Phase 3: convert String JSON columns to Postgres jsonb.
-- Invalid is pre-production; invalid/empty values fall back to {} or [].

-- TelemetryMetric
ALTER TABLE "TelemetryMetric" ALTER COLUMN "labelsJson" DROP DEFAULT;
ALTER TABLE "TelemetryMetric" ALTER COLUMN "labelsJson" TYPE JSONB USING (
  CASE
    WHEN btrim("labelsJson") = '' THEN '{}'::jsonb
    WHEN "labelsJson"::text ~ '^\s*[\[\{]' THEN "labelsJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "TelemetryMetric" ALTER COLUMN "labelsJson" SET DEFAULT '{}'::jsonb;

-- TelemetryEvent
ALTER TABLE "TelemetryEvent" ALTER COLUMN "normalizedJson" DROP DEFAULT;
ALTER TABLE "TelemetryEvent" ALTER COLUMN "normalizedJson" TYPE JSONB USING (
  CASE
    WHEN btrim("normalizedJson") = '' THEN '{}'::jsonb
    WHEN "normalizedJson"::text ~ '^\s*[\[\{]' THEN "normalizedJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "TelemetryEvent" ALTER COLUMN "normalizedJson" SET DEFAULT '{}'::jsonb;

ALTER TABLE "TelemetryEvent" ALTER COLUMN "payloadJson" DROP DEFAULT;
ALTER TABLE "TelemetryEvent" ALTER COLUMN "payloadJson" TYPE JSONB USING (
  CASE
    WHEN btrim("payloadJson") = '' THEN '{}'::jsonb
    WHEN "payloadJson"::text ~ '^\s*[\[\{]' THEN "payloadJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "TelemetryEvent" ALTER COLUMN "payloadJson" SET DEFAULT '{}'::jsonb;

-- WebhookEvent (required, no default)
ALTER TABLE "WebhookEvent" ALTER COLUMN "payloadJson" TYPE JSONB USING (
  CASE
    WHEN btrim("payloadJson") = '' THEN '{}'::jsonb
    WHEN "payloadJson"::text ~ '^\s*[\[\{]' THEN "payloadJson"::jsonb
    ELSE '{}'::jsonb
  END
);

-- GovernancePolicy
ALTER TABLE "GovernancePolicy" ALTER COLUMN "deploymentThresholds" DROP DEFAULT;
ALTER TABLE "GovernancePolicy" ALTER COLUMN "deploymentThresholds" TYPE JSONB USING (
  CASE
    WHEN btrim("deploymentThresholds") = '' THEN '{}'::jsonb
    WHEN "deploymentThresholds"::text ~ '^\s*[\[\{]' THEN "deploymentThresholds"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "GovernancePolicy" ALTER COLUMN "deploymentThresholds" SET DEFAULT '{}'::jsonb;

ALTER TABLE "GovernancePolicy" ALTER COLUMN "releaseRulesJson" DROP DEFAULT;
ALTER TABLE "GovernancePolicy" ALTER COLUMN "releaseRulesJson" TYPE JSONB USING (
  CASE
    WHEN btrim("releaseRulesJson") = '' THEN '{}'::jsonb
    WHEN "releaseRulesJson"::text ~ '^\s*[\[\{]' THEN "releaseRulesJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "GovernancePolicy" ALTER COLUMN "releaseRulesJson" SET DEFAULT '{}'::jsonb;

ALTER TABLE "GovernancePolicy" ALTER COLUMN "approvalRequirements" DROP DEFAULT;
ALTER TABLE "GovernancePolicy" ALTER COLUMN "approvalRequirements" TYPE JSONB USING (
  CASE
    WHEN btrim("approvalRequirements") = '' THEN '{}'::jsonb
    WHEN "approvalRequirements"::text ~ '^\s*[\[\{]' THEN "approvalRequirements"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "GovernancePolicy" ALTER COLUMN "approvalRequirements" SET DEFAULT '{}'::jsonb;

ALTER TABLE "GovernancePolicy" ALTER COLUMN "escalationChainsJson" DROP DEFAULT;
ALTER TABLE "GovernancePolicy" ALTER COLUMN "escalationChainsJson" TYPE JSONB USING (
  CASE
    WHEN btrim("escalationChainsJson") = '' THEN '{}'::jsonb
    WHEN "escalationChainsJson"::text ~ '^\s*[\[\{]' THEN "escalationChainsJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "GovernancePolicy" ALTER COLUMN "escalationChainsJson" SET DEFAULT '{}'::jsonb;

ALTER TABLE "GovernancePolicy" ALTER COLUMN "projectOverridesJson" DROP DEFAULT;
ALTER TABLE "GovernancePolicy" ALTER COLUMN "projectOverridesJson" TYPE JSONB USING (
  CASE
    WHEN btrim("projectOverridesJson") = '' THEN '{}'::jsonb
    WHEN "projectOverridesJson"::text ~ '^\s*[\[\{]' THEN "projectOverridesJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "GovernancePolicy" ALTER COLUMN "projectOverridesJson" SET DEFAULT '{}'::jsonb;

-- ComplianceRuleState
ALTER TABLE "ComplianceRuleState" ALTER COLUMN "thresholdsJson" DROP DEFAULT;
ALTER TABLE "ComplianceRuleState" ALTER COLUMN "thresholdsJson" TYPE JSONB USING (
  CASE
    WHEN btrim("thresholdsJson") = '' THEN '{}'::jsonb
    WHEN "thresholdsJson"::text ~ '^\s*[\[\{]' THEN "thresholdsJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "ComplianceRuleState" ALTER COLUMN "thresholdsJson" SET DEFAULT '{}'::jsonb;

-- ComplianceFinding
ALTER TABLE "ComplianceFinding" ALTER COLUMN "detailJson" DROP DEFAULT;
ALTER TABLE "ComplianceFinding" ALTER COLUMN "detailJson" TYPE JSONB USING (
  CASE
    WHEN btrim("detailJson") = '' THEN '{}'::jsonb
    WHEN "detailJson"::text ~ '^\s*[\[\{]' THEN "detailJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "ComplianceFinding" ALTER COLUMN "detailJson" SET DEFAULT '{}'::jsonb;

-- ProblemPrediction
ALTER TABLE "ProblemPrediction" ALTER COLUMN "signalsJson" DROP DEFAULT;
ALTER TABLE "ProblemPrediction" ALTER COLUMN "signalsJson" TYPE JSONB USING (
  CASE
    WHEN btrim("signalsJson") = '' THEN '{}'::jsonb
    WHEN "signalsJson"::text ~ '^\s*[\[\{]' THEN "signalsJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "ProblemPrediction" ALTER COLUMN "signalsJson" SET DEFAULT '{}'::jsonb;

-- DeliveryWorkflow
ALTER TABLE "DeliveryWorkflow" ALTER COLUMN "stepsCompletedJson" DROP DEFAULT;
ALTER TABLE "DeliveryWorkflow" ALTER COLUMN "stepsCompletedJson" TYPE JSONB USING (
  CASE
    WHEN btrim("stepsCompletedJson") = '' THEN '[]'::jsonb
    WHEN "stepsCompletedJson"::text ~ '^\s*[\[\{]' THEN "stepsCompletedJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "DeliveryWorkflow" ALTER COLUMN "stepsCompletedJson" SET DEFAULT '[]'::jsonb;

-- AgentRegistry
ALTER TABLE "AgentRegistry" ALTER COLUMN "adapterConfigJson" DROP DEFAULT;
ALTER TABLE "AgentRegistry" ALTER COLUMN "adapterConfigJson" TYPE JSONB USING (
  CASE
    WHEN btrim("adapterConfigJson") = '' THEN '{}'::jsonb
    WHEN "adapterConfigJson"::text ~ '^\s*[\[\{]' THEN "adapterConfigJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "AgentRegistry" ALTER COLUMN "adapterConfigJson" SET DEFAULT '{}'::jsonb;

ALTER TABLE "AgentRegistry" ALTER COLUMN "runtimeConfigJson" DROP DEFAULT;
ALTER TABLE "AgentRegistry" ALTER COLUMN "runtimeConfigJson" TYPE JSONB USING (
  CASE
    WHEN btrim("runtimeConfigJson") = '' THEN '{}'::jsonb
    WHEN "runtimeConfigJson"::text ~ '^\s*[\[\{]' THEN "runtimeConfigJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "AgentRegistry" ALTER COLUMN "runtimeConfigJson" SET DEFAULT '{}'::jsonb;

ALTER TABLE "AgentRegistry" ALTER COLUMN "permissionsJson" DROP DEFAULT;
ALTER TABLE "AgentRegistry" ALTER COLUMN "permissionsJson" TYPE JSONB USING (
  CASE
    WHEN btrim("permissionsJson") = '' THEN '{}'::jsonb
    WHEN "permissionsJson"::text ~ '^\s*[\[\{]' THEN "permissionsJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "AgentRegistry" ALTER COLUMN "permissionsJson" SET DEFAULT '{}'::jsonb;

-- AgentWakeupRequest
ALTER TABLE "AgentWakeupRequest" ALTER COLUMN "payloadJson" DROP DEFAULT;
ALTER TABLE "AgentWakeupRequest" ALTER COLUMN "payloadJson" TYPE JSONB USING (
  CASE
    WHEN btrim("payloadJson") = '' THEN '{}'::jsonb
    WHEN "payloadJson"::text ~ '^\s*[\[\{]' THEN "payloadJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "AgentWakeupRequest" ALTER COLUMN "payloadJson" SET DEFAULT '{}'::jsonb;

-- AgentHeartbeatRun
ALTER TABLE "AgentHeartbeatRun" ALTER COLUMN "contextSnapshotJson" DROP DEFAULT;
ALTER TABLE "AgentHeartbeatRun" ALTER COLUMN "contextSnapshotJson" TYPE JSONB USING (
  CASE
    WHEN btrim("contextSnapshotJson") = '' THEN '{}'::jsonb
    WHEN "contextSnapshotJson"::text ~ '^\s*[\[\{]' THEN "contextSnapshotJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "AgentHeartbeatRun" ALTER COLUMN "contextSnapshotJson" SET DEFAULT '{}'::jsonb;

ALTER TABLE "AgentHeartbeatRun" ALTER COLUMN "tokenUsageJson" DROP DEFAULT;
ALTER TABLE "AgentHeartbeatRun" ALTER COLUMN "tokenUsageJson" TYPE JSONB USING (
  CASE
    WHEN btrim("tokenUsageJson") = '' THEN '{}'::jsonb
    WHEN "tokenUsageJson"::text ~ '^\s*[\[\{]' THEN "tokenUsageJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "AgentHeartbeatRun" ALTER COLUMN "tokenUsageJson" SET DEFAULT '{}'::jsonb;

ALTER TABLE "AgentHeartbeatRun" ALTER COLUMN "logsJson" DROP DEFAULT;
ALTER TABLE "AgentHeartbeatRun" ALTER COLUMN "logsJson" TYPE JSONB USING (
  CASE
    WHEN btrim("logsJson") = '' THEN '[]'::jsonb
    WHEN "logsJson"::text ~ '^\s*[\[\{]' THEN "logsJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "AgentHeartbeatRun" ALTER COLUMN "logsJson" SET DEFAULT '[]'::jsonb;

-- Incident
ALTER TABLE "Incident" ALTER COLUMN "affectedServicesJson" DROP DEFAULT;
ALTER TABLE "Incident" ALTER COLUMN "affectedServicesJson" TYPE JSONB USING (
  CASE
    WHEN btrim("affectedServicesJson") = '' THEN '[]'::jsonb
    WHEN "affectedServicesJson"::text ~ '^\s*[\[\{]' THEN "affectedServicesJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "Incident" ALTER COLUMN "affectedServicesJson" SET DEFAULT '[]'::jsonb;

-- IncidentCodeLink
ALTER TABLE "IncidentCodeLink" ALTER COLUMN "peopleJson" DROP DEFAULT;
ALTER TABLE "IncidentCodeLink" ALTER COLUMN "peopleJson" TYPE JSONB USING (
  CASE
    WHEN btrim("peopleJson") = '' THEN '[]'::jsonb
    WHEN "peopleJson"::text ~ '^\s*[\[\{]' THEN "peopleJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "IncidentCodeLink" ALTER COLUMN "peopleJson" SET DEFAULT '[]'::jsonb;

-- Release
ALTER TABLE "Release" ALTER COLUMN "metadataJson" DROP DEFAULT;
ALTER TABLE "Release" ALTER COLUMN "metadataJson" TYPE JSONB USING (
  CASE
    WHEN btrim("metadataJson") = '' THEN '{}'::jsonb
    WHEN "metadataJson"::text ~ '^\s*[\[\{]' THEN "metadataJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "Release" ALTER COLUMN "metadataJson" SET DEFAULT '{}'::jsonb;

ALTER TABLE "Release" ALTER COLUMN "qaSignalsJson" DROP DEFAULT;
ALTER TABLE "Release" ALTER COLUMN "qaSignalsJson" TYPE JSONB USING (
  CASE
    WHEN btrim("qaSignalsJson") = '' THEN '[]'::jsonb
    WHEN "qaSignalsJson"::text ~ '^\s*[\[\{]' THEN "qaSignalsJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "Release" ALTER COLUMN "qaSignalsJson" SET DEFAULT '[]'::jsonb;

ALTER TABLE "Release" ALTER COLUMN "telemetryJson" DROP DEFAULT;
ALTER TABLE "Release" ALTER COLUMN "telemetryJson" TYPE JSONB USING (
  CASE
    WHEN btrim("telemetryJson") = '' THEN '{}'::jsonb
    WHEN "telemetryJson"::text ~ '^\s*[\[\{]' THEN "telemetryJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "Release" ALTER COLUMN "telemetryJson" SET DEFAULT '{}'::jsonb;

ALTER TABLE "Release" ALTER COLUMN "testGapsJson" DROP DEFAULT;
ALTER TABLE "Release" ALTER COLUMN "testGapsJson" TYPE JSONB USING (
  CASE
    WHEN btrim("testGapsJson") = '' THEN '[]'::jsonb
    WHEN "testGapsJson"::text ~ '^\s*[\[\{]' THEN "testGapsJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "Release" ALTER COLUMN "testGapsJson" SET DEFAULT '[]'::jsonb;

ALTER TABLE "Release" ALTER COLUMN "assessmentSnapshotJson" DROP DEFAULT;
ALTER TABLE "Release" ALTER COLUMN "assessmentSnapshotJson" TYPE JSONB USING (
  CASE
    WHEN btrim("assessmentSnapshotJson") = '' THEN '{}'::jsonb
    WHEN "assessmentSnapshotJson"::text ~ '^\s*[\[\{]' THEN "assessmentSnapshotJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "Release" ALTER COLUMN "assessmentSnapshotJson" SET DEFAULT '{}'::jsonb;

ALTER TABLE "Release" ALTER COLUMN "postDeployComparisonJson" DROP DEFAULT;
ALTER TABLE "Release" ALTER COLUMN "postDeployComparisonJson" TYPE JSONB USING (
  CASE
    WHEN btrim("postDeployComparisonJson") = '' THEN '{}'::jsonb
    WHEN "postDeployComparisonJson"::text ~ '^\s*[\[\{]' THEN "postDeployComparisonJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "Release" ALTER COLUMN "postDeployComparisonJson" SET DEFAULT '{}'::jsonb;

-- AcceleratorProject
ALTER TABLE "AcceleratorProject" ALTER COLUMN "featuresJson" DROP DEFAULT;
ALTER TABLE "AcceleratorProject" ALTER COLUMN "featuresJson" TYPE JSONB USING (
  CASE
    WHEN btrim("featuresJson") = '' THEN '[]'::jsonb
    WHEN "featuresJson"::text ~ '^\s*[\[\{]' THEN "featuresJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "AcceleratorProject" ALTER COLUMN "featuresJson" SET DEFAULT '[]'::jsonb;

ALTER TABLE "AcceleratorProject" ALTER COLUMN "jiraEpicsJson" DROP DEFAULT;
ALTER TABLE "AcceleratorProject" ALTER COLUMN "jiraEpicsJson" TYPE JSONB USING (
  CASE
    WHEN btrim("jiraEpicsJson") = '' THEN '[]'::jsonb
    WHEN "jiraEpicsJson"::text ~ '^\s*[\[\{]' THEN "jiraEpicsJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "AcceleratorProject" ALTER COLUMN "jiraEpicsJson" SET DEFAULT '[]'::jsonb;

ALTER TABLE "AcceleratorProject" ALTER COLUMN "roadmapJson" DROP DEFAULT;
ALTER TABLE "AcceleratorProject" ALTER COLUMN "roadmapJson" TYPE JSONB USING (
  CASE
    WHEN btrim("roadmapJson") = '' THEN '[]'::jsonb
    WHEN "roadmapJson"::text ~ '^\s*[\[\{]' THEN "roadmapJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "AcceleratorProject" ALTER COLUMN "roadmapJson" SET DEFAULT '[]'::jsonb;

-- OrganizationProfile
ALTER TABLE "OrganizationProfile" ALTER COLUMN "toolsJson" DROP DEFAULT;
ALTER TABLE "OrganizationProfile" ALTER COLUMN "toolsJson" TYPE JSONB USING (
  CASE
    WHEN btrim("toolsJson") = '' THEN '[]'::jsonb
    WHEN "toolsJson"::text ~ '^\s*[\[\{]' THEN "toolsJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "OrganizationProfile" ALTER COLUMN "toolsJson" SET DEFAULT '[]'::jsonb;

ALTER TABLE "OrganizationProfile" ALTER COLUMN "workflowsJson" DROP DEFAULT;
ALTER TABLE "OrganizationProfile" ALTER COLUMN "workflowsJson" TYPE JSONB USING (
  CASE
    WHEN btrim("workflowsJson") = '' THEN '[]'::jsonb
    WHEN "workflowsJson"::text ~ '^\s*[\[\{]' THEN "workflowsJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "OrganizationProfile" ALTER COLUMN "workflowsJson" SET DEFAULT '[]'::jsonb;

ALTER TABLE "OrganizationProfile" ALTER COLUMN "toolchainMappingJson" DROP DEFAULT;
ALTER TABLE "OrganizationProfile" ALTER COLUMN "toolchainMappingJson" TYPE JSONB USING (
  CASE
    WHEN btrim("toolchainMappingJson") = '' THEN '{}'::jsonb
    WHEN "toolchainMappingJson"::text ~ '^\s*[\[\{]' THEN "toolchainMappingJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "OrganizationProfile" ALTER COLUMN "toolchainMappingJson" SET DEFAULT '{}'::jsonb;

-- JiraCalibrationProfile
ALTER TABLE "JiraCalibrationProfile" ALTER COLUMN "observedJson" DROP DEFAULT;
ALTER TABLE "JiraCalibrationProfile" ALTER COLUMN "observedJson" TYPE JSONB USING (
  CASE
    WHEN btrim("observedJson") = '' THEN '{}'::jsonb
    WHEN "observedJson"::text ~ '^\s*[\[\{]' THEN "observedJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "JiraCalibrationProfile" ALTER COLUMN "observedJson" SET DEFAULT '{}'::jsonb;

ALTER TABLE "JiraCalibrationProfile" ALTER COLUMN "profileJson" DROP DEFAULT;
ALTER TABLE "JiraCalibrationProfile" ALTER COLUMN "profileJson" TYPE JSONB USING (
  CASE
    WHEN btrim("profileJson") = '' THEN '{}'::jsonb
    WHEN "profileJson"::text ~ '^\s*[\[\{]' THEN "profileJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "JiraCalibrationProfile" ALTER COLUMN "profileJson" SET DEFAULT '{}'::jsonb;

-- DeliveryDNA
ALTER TABLE "DeliveryDNA" ALTER COLUMN "escalationMatrix" DROP DEFAULT;
ALTER TABLE "DeliveryDNA" ALTER COLUMN "escalationMatrix" TYPE JSONB USING (
  CASE
    WHEN btrim("escalationMatrix") = '' THEN '{}'::jsonb
    WHEN "escalationMatrix"::text ~ '^\s*[\[\{]' THEN "escalationMatrix"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "DeliveryDNA" ALTER COLUMN "escalationMatrix" SET DEFAULT '{}'::jsonb;

-- Integration
ALTER TABLE "Integration" ALTER COLUMN "metadataJson" DROP DEFAULT;
ALTER TABLE "Integration" ALTER COLUMN "metadataJson" TYPE JSONB USING (
  CASE
    WHEN btrim("metadataJson") = '' THEN '{}'::jsonb
    WHEN "metadataJson"::text ~ '^\s*[\[\{]' THEN "metadataJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "Integration" ALTER COLUMN "metadataJson" SET DEFAULT '{}'::jsonb;

-- Recommendation
ALTER TABLE "Recommendation" ALTER COLUMN "affectedSystems" DROP DEFAULT;
ALTER TABLE "Recommendation" ALTER COLUMN "affectedSystems" TYPE JSONB USING (
  CASE
    WHEN btrim("affectedSystems") = '' THEN '[]'::jsonb
    WHEN "affectedSystems"::text ~ '^\s*[\[\{]' THEN "affectedSystems"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "Recommendation" ALTER COLUMN "affectedSystems" SET DEFAULT '[]'::jsonb;

-- Approval
ALTER TABLE "Approval" ALTER COLUMN "payloadJson" DROP DEFAULT;
ALTER TABLE "Approval" ALTER COLUMN "payloadJson" TYPE JSONB USING (
  CASE
    WHEN btrim("payloadJson") = '' THEN '{}'::jsonb
    WHEN "payloadJson"::text ~ '^\s*[\[\{]' THEN "payloadJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "Approval" ALTER COLUMN "payloadJson" SET DEFAULT '{}'::jsonb;

-- AuditLog
ALTER TABLE "AuditLog" ALTER COLUMN "metadataJson" DROP DEFAULT;
ALTER TABLE "AuditLog" ALTER COLUMN "metadataJson" TYPE JSONB USING (
  CASE
    WHEN btrim("metadataJson") = '' THEN '{}'::jsonb
    WHEN "metadataJson"::text ~ '^\s*[\[\{]' THEN "metadataJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "AuditLog" ALTER COLUMN "metadataJson" SET DEFAULT '{}'::jsonb;

-- ActivityEvent
ALTER TABLE "ActivityEvent" ALTER COLUMN "metadataJson" DROP DEFAULT;
ALTER TABLE "ActivityEvent" ALTER COLUMN "metadataJson" TYPE JSONB USING (
  CASE
    WHEN btrim("metadataJson") = '' THEN '{}'::jsonb
    WHEN "metadataJson"::text ~ '^\s*[\[\{]' THEN "metadataJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "ActivityEvent" ALTER COLUMN "metadataJson" SET DEFAULT '{}'::jsonb;

-- CodeAnalysisRun
ALTER TABLE "CodeAnalysisRun" ALTER COLUMN "repoFullNamesJson" DROP DEFAULT;
ALTER TABLE "CodeAnalysisRun" ALTER COLUMN "repoFullNamesJson" TYPE JSONB USING (
  CASE
    WHEN btrim("repoFullNamesJson") = '' THEN '[]'::jsonb
    WHEN "repoFullNamesJson"::text ~ '^\s*[\[\{]' THEN "repoFullNamesJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "CodeAnalysisRun" ALTER COLUMN "repoFullNamesJson" SET DEFAULT '[]'::jsonb;

-- CodeAnalysisCommit
ALTER TABLE "CodeAnalysisCommit" ALTER COLUMN "signalsJson" DROP DEFAULT;
ALTER TABLE "CodeAnalysisCommit" ALTER COLUMN "signalsJson" TYPE JSONB USING (
  CASE
    WHEN btrim("signalsJson") = '' THEN '[]'::jsonb
    WHEN "signalsJson"::text ~ '^\s*[\[\{]' THEN "signalsJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "CodeAnalysisCommit" ALTER COLUMN "signalsJson" SET DEFAULT '[]'::jsonb;

ALTER TABLE "CodeAnalysisCommit" ALTER COLUMN "jiraKeysJson" DROP DEFAULT;
ALTER TABLE "CodeAnalysisCommit" ALTER COLUMN "jiraKeysJson" TYPE JSONB USING (
  CASE
    WHEN btrim("jiraKeysJson") = '' THEN '[]'::jsonb
    WHEN "jiraKeysJson"::text ~ '^\s*[\[\{]' THEN "jiraKeysJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "CodeAnalysisCommit" ALTER COLUMN "jiraKeysJson" SET DEFAULT '[]'::jsonb;

-- CodeAnalysisPullRequest
ALTER TABLE "CodeAnalysisPullRequest" ALTER COLUMN "reviewersJson" DROP DEFAULT;
ALTER TABLE "CodeAnalysisPullRequest" ALTER COLUMN "reviewersJson" TYPE JSONB USING (
  CASE
    WHEN btrim("reviewersJson") = '' THEN '[]'::jsonb
    WHEN "reviewersJson"::text ~ '^\s*[\[\{]' THEN "reviewersJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "CodeAnalysisPullRequest" ALTER COLUMN "reviewersJson" SET DEFAULT '[]'::jsonb;

ALTER TABLE "CodeAnalysisPullRequest" ALTER COLUMN "filesJson" DROP DEFAULT;
ALTER TABLE "CodeAnalysisPullRequest" ALTER COLUMN "filesJson" TYPE JSONB USING (
  CASE
    WHEN btrim("filesJson") = '' THEN '[]'::jsonb
    WHEN "filesJson"::text ~ '^\s*[\[\{]' THEN "filesJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "CodeAnalysisPullRequest" ALTER COLUMN "filesJson" SET DEFAULT '[]'::jsonb;

ALTER TABLE "CodeAnalysisPullRequest" ALTER COLUMN "toolsJson" DROP DEFAULT;
ALTER TABLE "CodeAnalysisPullRequest" ALTER COLUMN "toolsJson" TYPE JSONB USING (
  CASE
    WHEN btrim("toolsJson") = '' THEN '[]'::jsonb
    WHEN "toolsJson"::text ~ '^\s*[\[\{]' THEN "toolsJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "CodeAnalysisPullRequest" ALTER COLUMN "toolsJson" SET DEFAULT '[]'::jsonb;

ALTER TABLE "CodeAnalysisPullRequest" ALTER COLUMN "jiraKeysJson" DROP DEFAULT;
ALTER TABLE "CodeAnalysisPullRequest" ALTER COLUMN "jiraKeysJson" TYPE JSONB USING (
  CASE
    WHEN btrim("jiraKeysJson") = '' THEN '[]'::jsonb
    WHEN "jiraKeysJson"::text ~ '^\s*[\[\{]' THEN "jiraKeysJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "CodeAnalysisPullRequest" ALTER COLUMN "jiraKeysJson" SET DEFAULT '[]'::jsonb;

ALTER TABLE "CodeAnalysisPullRequest" ALTER COLUMN "qualityFlagsJson" DROP DEFAULT;
ALTER TABLE "CodeAnalysisPullRequest" ALTER COLUMN "qualityFlagsJson" TYPE JSONB USING (
  CASE
    WHEN btrim("qualityFlagsJson") = '' THEN '[]'::jsonb
    WHEN "qualityFlagsJson"::text ~ '^\s*[\[\{]' THEN "qualityFlagsJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "CodeAnalysisPullRequest" ALTER COLUMN "qualityFlagsJson" SET DEFAULT '[]'::jsonb;

-- DeliveryAnalysisSnapshot
ALTER TABLE "DeliveryAnalysisSnapshot" ALTER COLUMN "projectKeysJson" DROP DEFAULT;
ALTER TABLE "DeliveryAnalysisSnapshot" ALTER COLUMN "projectKeysJson" TYPE JSONB USING (
  CASE
    WHEN btrim("projectKeysJson") = '' THEN '[]'::jsonb
    WHEN "projectKeysJson"::text ~ '^\s*[\[\{]' THEN "projectKeysJson"::jsonb
    ELSE '[]'::jsonb
  END
);
ALTER TABLE "DeliveryAnalysisSnapshot" ALTER COLUMN "projectKeysJson" SET DEFAULT '[]'::jsonb;

ALTER TABLE "DeliveryAnalysisSnapshot" ALTER COLUMN "snapshotJson" TYPE JSONB USING (
  CASE
    WHEN btrim("snapshotJson") = '' THEN '{}'::jsonb
    WHEN "snapshotJson"::text ~ '^\s*[\[\{]' THEN "snapshotJson"::jsonb
    ELSE '{}'::jsonb
  END
);

-- ExecutiveBriefingSnapshot
ALTER TABLE "ExecutiveBriefingSnapshot" ALTER COLUMN "headlineJson" TYPE JSONB USING (
  CASE
    WHEN btrim("headlineJson") = '' THEN '{}'::jsonb
    WHEN "headlineJson"::text ~ '^\s*[\[\{]' THEN "headlineJson"::jsonb
    ELSE '{}'::jsonb
  END
);

-- AgentChatMessage
ALTER TABLE "AgentChatMessage" ALTER COLUMN "reasoningJson" DROP DEFAULT;
ALTER TABLE "AgentChatMessage" ALTER COLUMN "reasoningJson" TYPE JSONB USING (
  CASE
    WHEN btrim("reasoningJson") = '' THEN '{}'::jsonb
    WHEN "reasoningJson"::text ~ '^\s*[\[\{]' THEN "reasoningJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "AgentChatMessage" ALTER COLUMN "reasoningJson" SET DEFAULT '{}'::jsonb;

-- AgentChatStreamChunk
ALTER TABLE "AgentChatStreamChunk" ALTER COLUMN "payloadJson" DROP DEFAULT;
ALTER TABLE "AgentChatStreamChunk" ALTER COLUMN "payloadJson" TYPE JSONB USING (
  CASE
    WHEN btrim("payloadJson") = '' THEN '{}'::jsonb
    WHEN "payloadJson"::text ~ '^\s*[\[\{]' THEN "payloadJson"::jsonb
    ELSE '{}'::jsonb
  END
);
ALTER TABLE "AgentChatStreamChunk" ALTER COLUMN "payloadJson" SET DEFAULT '{}'::jsonb;
