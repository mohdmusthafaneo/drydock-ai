import Link from "next/link";
import { NewProjectForm } from "@/components/accelerator/new-project-form";

export default function NewAcceleratorPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/accelerator"
          className="text-sm text-[#c4b5fd] hover:underline"
        >
          ← Back to Launchpad
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Start a new MVP</h1>
        <p className="mt-1 text-slate-400">
          Describe your idea — we will generate PRD, architecture, epics, and launch
          plans.
        </p>
      </div>
      <NewProjectForm />
    </div>
  );
}
