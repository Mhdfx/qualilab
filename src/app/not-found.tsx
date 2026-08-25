import Link from "next/link";
import { SearchX, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <SearchX className="h-6 w-6 text-slate-400" aria-hidden="true" />
        </div>

        <h1 className="mt-4 text-lg font-semibold text-slate-900">
          Page introuvable
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">
          Cette page n&apos;existe pas, ou l&apos;élément recherché a été
          supprimé.
        </p>

        <Link
          href="/"
          className="mt-5 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          Retour à mon espace
        </Link>
      </div>
    </div>
  );
}
