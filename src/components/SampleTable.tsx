import type { SampleStatus, SampleType } from "@/generated/prisma/client";
import { formatDateTime } from "@/lib/labels";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";

export type SampleRow = {
  id: string;
  code: string;
  lieu: string;
  type: SampleType;
  status: SampleStatus;
  sampledAt: string;
  notes: string | null;
  client: { name: string };
  user?: { name: string };
  parameters: { parameter: { name: string } }[];
};

type SampleTableProps = {
  samples: SampleRow[];
  showPreleveur?: boolean;
  onSelect?: (sample: SampleRow) => void;
  selectedId?: string | null;
};

function SampleCard({
  sample,
  showPreleveur,
  onSelect,
  selected,
}: {
  sample: SampleRow;
  showPreleveur?: boolean;
  onSelect?: (sample: SampleRow) => void;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(sample)}
      disabled={!onSelect}
      className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition-all ${
        selected
          ? "border-brand/40 bg-brand/5 shadow-md ring-1 ring-brand/20"
          : "border-slate-200/80 hover:border-slate-300 hover:shadow-md"
      } ${onSelect ? "active:scale-[0.99]" : ""}`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="font-mono text-base font-bold text-brand">{sample.code}</p>
        <StatusBadge status={sample.status} />
      </div>
      <p className="font-medium text-slate-900">{sample.client.name}</p>
      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{sample.lieu}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TypeBadge type={sample.type} />
        <span className="text-xs text-slate-400">{formatDateTime(sample.sampledAt)}</span>
      </div>
      {showPreleveur && sample.user && (
        <p className="mt-2 text-xs text-slate-500">Préleveur : {sample.user.name}</p>
      )}
    </button>
  );
}

export function SampleTable({
  samples,
  showPreleveur = false,
  onSelect,
  selectedId,
}: SampleTableProps) {
  if (samples.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-light">
          <div className="h-5 w-5 rounded-full border-2 border-brand/30" />
        </div>
        <p className="font-medium text-slate-600">Aucun prélèvement pour le moment</p>
        <p className="mt-1 text-sm text-slate-400">
          Les nouveaux prélèvements apparaîtront ici automatiquement.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {samples.map((sample) => (
          <SampleCard
            key={sample.id}
            sample={sample}
            showPreleveur={showPreleveur}
            onSelect={onSelect}
            selected={selectedId === sample.id}
          />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-brand-light/30 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3.5 font-semibold">Code</th>
                <th className="px-5 py-3.5 font-semibold">Client</th>
                <th className="px-5 py-3.5 font-semibold">Lieu</th>
                <th className="px-5 py-3.5 font-semibold">Type</th>
                {showPreleveur && (
                  <th className="px-5 py-3.5 font-semibold">Préleveur</th>
                )}
                <th className="px-5 py-3.5 font-semibold">Date</th>
                <th className="px-5 py-3.5 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {samples.map((sample) => (
                <tr
                  key={sample.id}
                  onClick={() => onSelect?.(sample)}
                  className={`transition-colors ${
                    onSelect ? "cursor-pointer hover:bg-brand-light/40" : ""
                  } ${selectedId === sample.id ? "bg-brand-light/60" : ""}`}
                >
                  <td className="px-5 py-4">
                    <span className="font-mono font-semibold text-brand">{sample.code}</span>
                  </td>
                  <td className="px-5 py-4 font-medium text-slate-800">
                    {sample.client.name}
                  </td>
                  <td className="max-w-[200px] truncate px-5 py-4 text-slate-600">
                    {sample.lieu}
                  </td>
                  <td className="px-5 py-4">
                    <TypeBadge type={sample.type} />
                  </td>
                  {showPreleveur && (
                    <td className="px-5 py-4 text-slate-600">
                      {sample.user?.name ?? "—"}
                    </td>
                  )}
                  <td className="px-5 py-4 text-slate-500">
                    {formatDateTime(sample.sampledAt)}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={sample.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
