"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ASSIGNABLE_ROLES, ROLE_LABELS } from "@/lib/roles";
import type { UserRole } from "@/generated/prisma/client";

export function TeamInviteForm({ canInvite }: { canInvite: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("VIEWER");
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canInvite) {
    return (
      <p className="text-sm text-muted">
        Only organization admins can invite teammates. Contact your admin for access.
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invite failed");
      setHint(data.invitation?.signupHint ?? "Invitation created");
      setEmail("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@company.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            className="flex h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-primary"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-error-soft">{error}</p>}
      {hint && (
        <p className="rounded-lg bg-success-muted px-3 py-2 text-xs text-success-soft">
          Invite created. Share signup path: <code className="text-primary">{hint}</code>
        </p>
      )}
      <Button type="submit" size="sm" disabled={loading}>
        {loading ? "Sending…" : "Send invitation"}
      </Button>
    </form>
  );
}
