import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadEscapes } from "@/lib/drydock/escapes";

export default async function EscapesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const escapes = await loadEscapes(session.organizationId);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-display text-[26px] tracking-[-0.23px] text-ink">Escapes</p>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ash">
          Production defects the suite should have caught. An escape is a suite failure, never a
          person&apos;s. Ground truth for calibrating the Certificate.
        </p>
      </div>

      {escapes.length === 0 ? (
        <div className="rounded-[24px] border border-dove/50 bg-pure-white px-6 py-10 text-center shadow-[var(--shadow)]">
          <p className="font-display text-[22px] text-ink">No escapes on the record.</p>
          <p className="mt-2 text-[14px] text-ash">
            When a production defect lands, replay it against the suite: was there a test, was it
            green, was it skipped, did it never exist.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {escapes.map((row) => (
            <li
              key={row.id}
              className="rounded-[20px] border border-dove/50 bg-pure-white p-5 shadow-[var(--shadow)]"
            >
              <p className="text-[16px] font-medium text-ink">{row.title}</p>
              <p className="mt-1 text-[14px] text-ash">
                {row.status.toLowerCase()}
                {row.releaseName ? ` · ${row.releaseName}` : ""} · {row.createdAt.slice(0, 10)}
              </p>
              {row.summary ? (
                <p className="mt-2 text-[14px] text-ink">{row.summary}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
