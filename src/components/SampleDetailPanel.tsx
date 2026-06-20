import type { SampleRow } from "./SampleTable";
import { formatDateTime } from "@/lib/labels";
import { SampleStatusTimeline } from "./SampleStatusTimeline";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";

type SampleDetailPanelProps = {
  sample: SampleRow | null;
  onClose: () => void;
};

export function SampleDetailPanel({ sample, onClose }: SampleDetailPanelProps) {
  if (!sample) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:justify-end sm:p-6">
      <div
        className="safe-bottom max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 sm:max-h-full sm:h-full sm:max-w-md sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-brand-light/50 to-white px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Détail prélèvement
            </p>
            <p className="font-mono text-lg font-bold text-brand">{sample.code}</p>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100"
          >
            Fermer
          </button>
        </div>
        <div className="space-y-5 px-4 py-5 sm:px-6">
          <SampleStatusTimeline status={sample.status} />

          <div className="flex flex-wrap gap-2">
            <StatusBadge status={sample.status} />
            <TypeBadge type={sample.type} />
          </div>

          <div className="rounded-xl bg-slate-50 p-4 space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Client</p>
              <p className="mt-0.5 font-medium text-slate-800">{sample.client.name}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Lieu</p>
              <p className="mt-0.5 text-slate-700">{sample.lieu}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Date</p>
                <p className="mt-0.5 text-sm text-slate-700">{formatDateTime(sample.sampledAt)}</p>
              </div>
              {sample.user && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Préleveur
                  </p>
                  <p className="mt-0.5 text-sm text-slate-700">{sample.user.name}</p>
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Paramètres demandés
            </p>
            <div className="flex flex-wrap gap-2">
              {sample.parameters.map((p) => (
                <span
                  key={p.parameter.name}
                  className="rounded-full bg-brand-light px-3 py-1 text-xs font-medium text-brand"
                >
                  {p.parameter.name}
                </span>
              ))}
            </div>
          </div>

          {sample.notes && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Notes</p>
              <p className="mt-1 text-sm text-slate-600">{sample.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
