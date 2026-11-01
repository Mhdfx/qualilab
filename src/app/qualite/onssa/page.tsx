import Link from "next/link";
import { AlertTriangle, Download, FileSpreadsheet, FlaskConical, Landmark, ShieldAlert } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { formatDecimal } from "@/lib/labels";
import { ONSSA_COUNT_BY, ONSSA_OFFICIAL_CONTROL } from "@/lib/lab-proposals";
import {
  ONSSA_EXPORT_PATH,
  ONSSA_MAPPING_PATH,
  ONSSA_REPORT_PATH,
  onssaCountBasisLabel,
} from "@/lib/onssa-access";
import { ONSSA_DOMAIN_LABELS } from "@/lib/onssa-canevas";
import { onssaMonth, previousOnssaMonth } from "@/lib/onssa-report";
import { MAX_ONSSA_SAMPLES, loadOnssaMonth } from "@/lib/onssa-report-server";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Rapport ONSSA" };

const n = (value: number) => formatDecimal(value, 0);

/**
 * Lot 3E, N3 — « Rapport ONSSA » (RETOUR-LABO-28-10.md §3.2 and §5): a
 * month's figures as the canevas counts them, what is left out and why, and
 * the Excel in the canevas' layout. The Direction, the administrator and the
 * validateur. Rules: `onssa-report.ts` (hypothèses, à confirmer par R-22).
 */
export default async function OnssaReportPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string | string[] }>;
}) {
  // Belt and braces with the layout guard: a page must be safe on its own.
  const session = await requireRole("VALIDATEUR", "DIRECTION", "ADMIN");
  const asked = (await searchParams).mois;
  const requested = typeof asked === "string" ? asked : null;
  const month = onssaMonth(requested) ?? onssaMonth(previousOnssaMonth(new Date()));
  if (!month) throw new Error("Mois du rapport ONSSA introuvable.");
  const invalidMonth = requested !== null && onssaMonth(requested) === null;

  const { report, pendingSamples, tooMany } = await loadOnssaMonth(month);
  const exportHref = `${ONSSA_EXPORT_PATH}?mois=${month.month}`;
  const isAdmin = session.role === "ADMIN";
  const unmappedCount = report.unmapped.samples.length + report.unmapped.parameters.length;
  const synthesisColumns = [
    { label: ONSSA_DOMAIN_LABELS.ALIMENTAIRE, figures: report.synthesis.ALIMENTAIRE },
    { label: ONSSA_DOMAIN_LABELS.EAU, figures: report.synthesis.EAU },
    { label: "Chimie alimentaire", figures: report.synthesis.CHIMIE },
  ];

  return (
    <div>
      <PageHeader
        badge="Système Qualité"
        title="Rapport ONSSA"
        subtitle={`Rapport mensuel d'activité — ${month.label}. Les chiffres du canevas ONSSA, et l'Excel à reporter dans le canevas officiel.`}
        action={
          tooMany ? undefined : (
            <a
              href={exportHref}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Télécharger l&apos;Excel
            </a>
          )
        }
      />

      <Card className="mb-6 p-5">
        <form method="get" action={ONSSA_REPORT_PATH} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="onssa-mois" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Mois
            </label>
            <input
              id="onssa-mois"
              name="mois"
              type="month"
              defaultValue={month.month}
              required
              aria-describedby={invalidMonth ? "onssa-mois-erreur" : undefined}
              className="input-field w-48 px-3"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Afficher
          </button>
          <p className="basis-full text-xs text-slate-500">
            Échantillons comptés par {onssaCountBasisLabel(ONSSA_COUNT_BY)}, une fois leur validation administrative
            signée. Règles proposées en attendant la réponse du laboratoire (relance R-22) : voir la feuille « Notes » de
            l&apos;Excel.
          </p>
          {invalidMonth && (
            <p id="onssa-mois-erreur" role="alert" className="basis-full text-sm text-rose-700">
              Le mois demandé n&apos;existe pas : {month.label} est affiché.
            </p>
          )}
        </form>
      </Card>

      {tooMany && (
        <p role="alert" className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Plus de {n(MAX_ONSSA_SAMPLES)}{" "}échantillons ce mois-ci : les chiffres ci-dessous sont incomplets et
          l&apos;Excel n&apos;est pas proposé.
        </p>
      )}

      {pendingSamples !== null && pendingSamples > 0 && (
        <p className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {pendingSamples === 1
              ? "1 échantillon reçu ce mois-ci attend encore sa validation : il n'est pas compté."
              : `${n(pendingSamples)} échantillons reçus ce mois-ci attendent encore leur validation : ils ne sont pas comptés.`}{" "}
            Générez le rapport une fois la validation terminée.
          </span>
        </p>
      )}

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Échantillons déclarés" value={n(report.declaredSamples)} icon={FlaskConical} accent="brand" />
          <StatCard label="Analyses réalisées" value={n(report.total.realisees)} icon={FileSpreadsheet} accent="blue" />
          <StatCard label="Analyses non conformes" value={n(report.total.nonConformes)} icon={ShieldAlert} accent="amber" />
          <StatCard
            label={ONSSA_OFFICIAL_CONTROL ? "Contrôle officiel / autocontrôle" : "Autocontrôle"}
            value={ONSSA_OFFICIAL_CONTROL ? `${n(report.officialAnalyses)} / ${n(report.selfAnalyses)}` : n(report.selfAnalyses)}
            icon={Landmark}
            accent="violet"
          />
        </div>
      </section>

      <Card className="mb-6 p-5">
        <h2 className="text-base font-semibold text-slate-900">Par groupe de produits</h2>
        {report.groups.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            Aucun groupe de produits n&apos;est défini.{" "}
            {isAdmin ? (
              <Link href={ONSSA_MAPPING_PATH} className="font-semibold text-brand hover:underline">
                Créer les groupes dans « Correspondances ONSSA »
              </Link>
            ) : (
              "L'administrateur les crée dans « Correspondances ONSSA »."
            )}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Analyses par groupe de produits, {month.label}</caption>
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="pb-2 pr-3 font-medium">Groupe</th>
                  <th scope="col" className="pb-2 pr-3 text-right font-medium">Échantillons</th>
                  {ONSSA_OFFICIAL_CONTROL && (
                    <th scope="col" className="pb-2 pr-3 text-right font-medium">Contrôle officiel</th>
                  )}
                  <th scope="col" className="pb-2 pr-3 text-right font-medium">Autocontrôle</th>
                  <th scope="col" className="pb-2 pr-3 text-right font-medium">Analyses</th>
                  <th scope="col" className="pb-2 text-right font-medium">Non conformes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.groups.map((block) => (
                  <tr key={block.group.id}>
                    <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-800">
                      {block.group.name}
                      <span className="block text-xs font-normal text-slate-500">
                        {ONSSA_DOMAIN_LABELS[block.group.domain]}
                        {block.group.active ? "" : " · archivé"}
                      </span>
                    </th>
                    <td className="py-2 pr-3 text-right tabular-nums">{n(block.samples)}</td>
                    {ONSSA_OFFICIAL_CONTROL && (
                      <td className="py-2 pr-3 text-right tabular-nums">{n(block.officialAnalyses)}</td>
                    )}
                    <td className="py-2 pr-3 text-right tabular-nums">{n(block.selfAnalyses)}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{n(block.total.realisees)}</td>
                    <td className="py-2 text-right tabular-nums">{n(block.total.nonConformes)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold text-slate-900">
                  <th scope="row" className="pt-2 pr-3 text-left">Total</th>
                  <td className="pt-2 pr-3 text-right tabular-nums">{n(report.declaredSamples)}</td>
                  {ONSSA_OFFICIAL_CONTROL && <td className="pt-2 pr-3 text-right tabular-nums">{n(report.officialAnalyses)}</td>}
                  <td className="pt-2 pr-3 text-right tabular-nums">{n(report.selfAnalyses)}</td>
                  <td className="pt-2 pr-3 text-right tabular-nums">{n(report.total.realisees)}</td>
                  <td className="pt-2 text-right tabular-nums">{n(report.total.nonConformes)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="text-base font-semibold text-slate-900">Synthèse</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Synthèse du mois, {month.label}</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="pb-2 pr-3 font-medium"><span className="sr-only">Domaine</span></th>
                <th scope="col" className="pb-2 pr-3 text-right font-medium">Échantillons</th>
                <th scope="col" className="pb-2 pr-3 text-right font-medium">Analyses</th>
                <th scope="col" className="pb-2 pr-3 text-right font-medium">Conformes</th>
                <th scope="col" className="pb-2 text-right font-medium">Non conformes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {synthesisColumns.map(({ label, figures }) => (
                <tr key={label}>
                  <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-800">{label}</th>
                  <td className="py-2 pr-3 text-right tabular-nums">{n(figures.samples)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{n(figures.analyses)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{n(figures.analyses - figures.nonConformes)}</td>
                  <td className="py-2 text-right tabular-nums">{n(figures.nonConformes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Non déclaré</h2>
        {unmappedCount === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            Toutes les analyses validées du mois ont un groupe de produits et une colonne du canevas.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600">
              Ces analyses ne figurent pas dans le rapport : sans groupe de produits ou sans colonne du canevas.{" "}
              {isAdmin ? (
                <Link href={ONSSA_MAPPING_PATH} className="font-semibold text-brand hover:underline">
                  Les classer dans « Correspondances ONSSA »
                </Link>
              ) : (
                "L'administrateur les classe dans « Correspondances ONSSA »."
              )}
            </p>
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              {report.unmapped.samples.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Échantillons sans groupe de produits</h3>
                  <ul className="mt-2 divide-y divide-slate-100 text-sm">
                    {report.unmapped.samples.map((entry) => (
                      <li key={entry.label} className="flex justify-between gap-3 py-1.5">
                        <span className="text-slate-700">{entry.label}</span>
                        <span className="shrink-0 tabular-nums text-slate-500">
                          {n(entry.samples)} éch. · {n(entry.analyses)} analyse{entry.analyses > 1 ? "s" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {report.unmapped.parameters.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Paramètres sans colonne du canevas</h3>
                  <ul className="mt-2 divide-y divide-slate-100 text-sm">
                    {report.unmapped.parameters.map((entry) => (
                      <li key={entry.name} className="flex justify-between gap-3 py-1.5">
                        <span className="text-slate-700">{entry.name}</span>
                        <span className="shrink-0 tabular-nums text-slate-500">
                          {n(entry.analyses)} analyse{entry.analyses > 1 ? "s" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
