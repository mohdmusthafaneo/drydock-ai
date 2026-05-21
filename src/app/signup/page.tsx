import { AuthForm } from "@/components/auth/auth-form";
import type { WorkspaceMode } from "@/lib/workspace-mode";

function parseSignupMode(mode?: string): WorkspaceMode {
  if (mode === "mvp") return "MVP";
  return "ENTERPRISE";
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  return <AuthForm mode="signup" initialWorkspaceMode={parseSignupMode(mode)} />;
}
