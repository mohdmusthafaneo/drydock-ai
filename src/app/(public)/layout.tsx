import Link from "next/link";

export default function PublicConnectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <Link href="/" className="text-lg font-semibold text-brand">
          AIDOS
        </Link>
        <p className="mt-1 text-xs text-muted">Integration setup</p>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
